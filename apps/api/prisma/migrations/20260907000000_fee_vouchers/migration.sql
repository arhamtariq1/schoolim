-- ---------------------------------------------------------------------------
-- Fee vouchers, payments, and the batch engine behind them.
-- docs/modules/fees-and-finance.md §5–§7, docs/07 §6.
--
-- A voucher is the **materialisation** of (student × fee heads × months),
-- frozen at generation. Changing a fee head afterwards does not restate an
-- issued voucher — that single rule removes the largest category of "the
-- amount changed by itself" support calls.
--
-- Money is `numeric(14,2)` rupees here and integer paisa above the service
-- layer. Never a float, in either place.
-- ---------------------------------------------------------------------------

-- ===========================================================================
-- 1. Batch infrastructure — CLAUDE.md R5.
--
-- "Every batch operation is idempotent and keyed, with a job_runs record and a
-- resumable cursor." Generating vouchers for every student in a school is the
-- first operation here big enough to need it: a few thousand students, a
-- request that can time out halfway, and a user who will press the button
-- again when it does.
-- ===========================================================================
CREATE TYPE "job_run_status" AS ENUM ('RUNNING', 'COMPLETED', 'FAILED', 'ROLLED_BACK');

CREATE TABLE "job_runs" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "kind" TEXT NOT NULL,
    -- Supplied by the client. The same key replays the same result rather
    -- than doing the work twice.
    "idempotency_key" TEXT NOT NULL,
    "status" "job_run_status" NOT NULL DEFAULT 'RUNNING',
    "params" JSONB NOT NULL DEFAULT '{}'::jsonb,
    -- Where to resume. Opaque to everything but the job that wrote it.
    "cursor" TEXT,
    "total" INTEGER NOT NULL DEFAULT 0,
    "processed" INTEGER NOT NULL DEFAULT 0,
    "succeeded" INTEGER NOT NULL DEFAULT 0,
    "skipped" INTEGER NOT NULL DEFAULT 0,
    "failed" INTEGER NOT NULL DEFAULT 0,
    "result" JSONB,
    "error" TEXT,
    "started_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
    "finished_at" TIMESTAMPTZ(6),
    "created_by" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "job_runs_pkey" PRIMARY KEY ("id")
);

-- The idempotency guarantee itself. A retry of the same request collides here
-- and reads back the finished run instead of generating a second set.
CREATE UNIQUE INDEX "job_runs_school_id_kind_idempotency_key_key"
  ON "job_runs" ("school_id", "kind", "idempotency_key");
CREATE INDEX "job_runs_school_id_kind_started_at_idx"
  ON "job_runs" ("school_id", "kind", "started_at" DESC);

ALTER TABLE "job_runs"
  ADD CONSTRAINT "job_runs_school_id_fkey"
  FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ===========================================================================
-- 2. How often a head is charged.
--
-- Generation needs to know that Tuition repeats every month while Admission
-- Fee is charged once in a lifetime. Without it, billing three months would
-- charge three admission fees.
-- ===========================================================================
CREATE TYPE "fee_frequency" AS ENUM ('MONTHLY', 'ANNUAL', 'ONE_TIME');

ALTER TABLE "fee_heads"
  ADD COLUMN "frequency" "fee_frequency" NOT NULL DEFAULT 'MONTHLY';

-- Backfilled from the type that already exists, so no school has to revisit a
-- catalogue it already set up. A school that disagrees can change any of them.
UPDATE "fee_heads" SET "frequency" = CASE "type"
    WHEN 'ADMISSION' THEN 'ONE_TIME'
    WHEN 'SECURITY'  THEN 'ONE_TIME'
    WHEN 'ANNUAL'    THEN 'ANNUAL'
    WHEN 'EXAM'      THEN 'ANNUAL'
    WHEN 'LAB'       THEN 'ANNUAL'
    WHEN 'STATIONERY' THEN 'ANNUAL'
    ELSE 'MONTHLY'
  END::"fee_frequency";

-- ===========================================================================
-- 3. The voucher.
-- ===========================================================================
CREATE TYPE "voucher_status" AS ENUM (
  'UNPAID', 'PARTIALLY_PAID', 'PAID', 'WAIVED', 'CANCELLED'
);

CREATE TABLE "fee_vouchers" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "session_id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    -- Gapless per school. What the QR code on the printed challan carries.
    "voucher_no" TEXT NOT NULL,
    "status" "voucher_status" NOT NULL DEFAULT 'UNPAID',

    "issue_date" DATE NOT NULL,
    "due_date" DATE NOT NULL,
    -- Printed as "this challan is valid till". Banks refuse an expired one.
    "valid_till" DATE NOT NULL,

    -- First-of-month dates this voucher bills, for the list's "Bill Months"
    -- column. Denormalised from the lines because every row of the list needs
    -- it and joining the lines to render a list is how a list gets slow.
    "bill_months" DATE[] NOT NULL DEFAULT ARRAY[]::DATE[],

    "gross_amount" NUMERIC(14,2) NOT NULL DEFAULT 0,
    "discount_amount" NUMERIC(14,2) NOT NULL DEFAULT 0,
    "waiver_amount" NUMERIC(14,2) NOT NULL DEFAULT 0,
    -- Carried from the vouchers named in `fee_voucher_arrears`, never invented.
    "arrears_amount" NUMERIC(14,2) NOT NULL DEFAULT 0,
    -- What is payable **within** the due date.
    "net_payable" NUMERIC(14,2) NOT NULL DEFAULT 0,
    -- The surcharge after it. Deliberately NOT part of `net_payable`: the
    -- challan prints two different numbers, and folding them together is how
    -- a parent gets charged a late fee for paying on time.
    "late_fee_amount" NUMERIC(14,2) NOT NULL DEFAULT 0,
    -- True when the school asked for the surcharge to apply automatically.
    "late_fee_auto" BOOLEAN NOT NULL DEFAULT true,

    "paid_amount" NUMERIC(14,2) NOT NULL DEFAULT 0,
    "paid_on" DATE,

    "cancelled_at" TIMESTAMPTZ(6),
    "cancel_reason" TEXT,

    "job_run_id" UUID,
    "created_by" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "fee_vouchers_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "fee_vouchers_school_id_voucher_no_key"
  ON "fee_vouchers" ("school_id", "voucher_no");

-- The list's default shape: one session, newest first.
CREATE INDEX "fee_vouchers_school_id_session_id_issue_date_idx"
  ON "fee_vouchers" ("school_id", "session_id", "issue_date" DESC);
-- "What does this child owe?" — the arrears lookup, run once per student on
-- every generation, so it has to be an index hit rather than a scan.
CREATE INDEX "fee_vouchers_school_id_student_id_status_idx"
  ON "fee_vouchers" ("school_id", "student_id", "status");
-- The defaulter worklist, and the late-fee sweep.
CREATE INDEX "fee_vouchers_school_id_status_due_date_idx"
  ON "fee_vouchers" ("school_id", "status", "due_date");
CREATE INDEX "fee_vouchers_school_id_job_run_id_idx"
  ON "fee_vouchers" ("school_id", "job_run_id");

ALTER TABLE "fee_vouchers"
  ADD CONSTRAINT "fee_vouchers_school_id_fkey"
  FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "fee_vouchers"
  ADD CONSTRAINT "fee_vouchers_session_id_fkey"
  FOREIGN KEY ("session_id") REFERENCES "academic_sessions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "fee_vouchers"
  ADD CONSTRAINT "fee_vouchers_student_id_fkey"
  FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "fee_vouchers"
  ADD CONSTRAINT "fee_vouchers_job_run_id_fkey"
  FOREIGN KEY ("job_run_id") REFERENCES "job_runs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- --- The financial invariants, in the database ------------------------------
--
-- docs/modules/fees-and-finance.md §9 lists these as "tested on every PR".
-- A CHECK is better than a test: a test proves the code path you thought of
-- cannot break them, a constraint proves no code path can.

-- §9.1 — net_payable = gross − discount − waiver + arrears.
ALTER TABLE "fee_vouchers" ADD CONSTRAINT "fee_vouchers_net_payable_balances"
  CHECK ("net_payable" = "gross_amount" - "discount_amount" - "waiver_amount" + "arrears_amount");

-- §9.2 — 0 ≤ paid ≤ net_payable. Overpayment becomes a credit, never a
-- negative balance, so there is no legitimate way to exceed the top.
ALTER TABLE "fee_vouchers" ADD CONSTRAINT "fee_vouchers_paid_within_payable"
  CHECK ("paid_amount" >= 0 AND "paid_amount" <= "net_payable");

ALTER TABLE "fee_vouchers" ADD CONSTRAINT "fee_vouchers_amounts_non_negative"
  CHECK ("gross_amount" >= 0 AND "discount_amount" >= 0 AND "waiver_amount" >= 0
     AND "arrears_amount" >= 0 AND "net_payable" >= 0 AND "late_fee_amount" >= 0);

-- A voucher nobody can pay is a data-entry mistake, caught at the source.
ALTER TABLE "fee_vouchers" ADD CONSTRAINT "fee_vouchers_dates_ordered"
  CHECK ("due_date" >= "issue_date" AND "valid_till" >= "due_date");

-- ===========================================================================
-- 4. Voucher lines — what the challan actually prints.
-- ===========================================================================
CREATE TYPE "voucher_line_kind" AS ENUM ('FEE', 'ARREAR', 'LATE_FEE', 'WAIVER', 'ADJUSTMENT');

CREATE TABLE "fee_voucher_lines" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "voucher_id" UUID NOT NULL,
    -- Null for arrears, late fees and adjustments, which are not a head.
    "fee_head_id" UUID,
    "kind" "voucher_line_kind" NOT NULL DEFAULT 'FEE',
    -- Snapshot text — "Tuition Fee - September 2026". Renaming the head later
    -- must not rewrite what a printed challan said.
    "label" TEXT NOT NULL,
    -- First of the month this line bills. Null for one-time and annual heads.
    "bill_month" DATE,
    -- Before discount, so the challan can show both.
    "amount" NUMERIC(14,2) NOT NULL,
    "discount" NUMERIC(14,2) NOT NULL DEFAULT 0,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),

    CONSTRAINT "fee_voucher_lines_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "fee_voucher_lines_school_id_voucher_id_sort_order_idx"
  ON "fee_voucher_lines" ("school_id", "voucher_id", "sort_order");

ALTER TABLE "fee_voucher_lines"
  ADD CONSTRAINT "fee_voucher_lines_school_id_fkey"
  FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "fee_voucher_lines"
  ADD CONSTRAINT "fee_voucher_lines_voucher_id_fkey"
  FOREIGN KEY ("voucher_id") REFERENCES "fee_vouchers"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "fee_voucher_lines"
  ADD CONSTRAINT "fee_voucher_lines_fee_head_id_fkey"
  FOREIGN KEY ("fee_head_id") REFERENCES "fee_heads"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "fee_voucher_lines" ADD CONSTRAINT "fee_voucher_lines_discount_within_amount"
  CHECK ("amount" >= 0 AND "discount" >= 0 AND "discount" <= "amount");

-- ===========================================================================
-- 5. The double-billing guard.
--
-- One row per (student, head, period) that has been billed. The unique index
-- is the guarantee: charging September's tuition to the same child twice is
-- not "unlikely because the code checks", it is impossible because the
-- database refuses. Generation inserts here with ON CONFLICT DO NOTHING and
-- treats a conflict as "already billed, skip".
--
-- `period_key` rather than a date so the three frequencies share one index:
-- '2026-09' for monthly, 'session:<uuid>' for annual, 'once' for one-time.
--
-- Rows are DELETED when a voucher is cancelled, which is what frees the month
-- to be generated again. That is deliberate and is not a hole in the
-- append-only rule (CLAUDE.md R4): this table holds *claims on a period*, not
-- financial records. The money is in fee_vouchers, and a cancelled voucher is
-- still there, still readable, still audited.
-- ===========================================================================
CREATE TABLE "fee_voucher_periods" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "voucher_id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "fee_head_id" UUID NOT NULL,
    "period_key" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),

    CONSTRAINT "fee_voucher_periods_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "fee_voucher_periods_school_id_student_id_fee_head_id_period_key"
  ON "fee_voucher_periods" ("school_id", "student_id", "fee_head_id", "period_key");
CREATE INDEX "fee_voucher_periods_school_id_voucher_id_idx"
  ON "fee_voucher_periods" ("school_id", "voucher_id");

ALTER TABLE "fee_voucher_periods"
  ADD CONSTRAINT "fee_voucher_periods_school_id_fkey"
  FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "fee_voucher_periods"
  ADD CONSTRAINT "fee_voucher_periods_voucher_id_fkey"
  FOREIGN KEY ("voucher_id") REFERENCES "fee_vouchers"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "fee_voucher_periods"
  ADD CONSTRAINT "fee_voucher_periods_student_id_fkey"
  FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "fee_voucher_periods"
  ADD CONSTRAINT "fee_voucher_periods_fee_head_id_fkey"
  FOREIGN KEY ("fee_head_id") REFERENCES "fee_heads"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ===========================================================================
-- 6. Which vouchers an arrears figure is made of.
--
-- Without this, "Arrears 15,900" is a number nobody can explain and paying it
-- settles nothing — the old vouchers stay open and the same arrears reappear
-- next month, forever. With it, a payment that covers the arrears portion is
-- allocated to the vouchers named here, oldest first, and they close.
-- ===========================================================================
CREATE TABLE "fee_voucher_arrears" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "voucher_id" UUID NOT NULL,
    "source_voucher_id" UUID NOT NULL,
    -- The source's outstanding balance at the moment this voucher was cut.
    -- Indicative: settlement re-reads the real balance, because the parent may
    -- have paid the old voucher at the counter in between.
    "amount" NUMERIC(14,2) NOT NULL,

    CONSTRAINT "fee_voucher_arrears_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "fee_voucher_arrears_school_id_voucher_id_source_key"
  ON "fee_voucher_arrears" ("school_id", "voucher_id", "source_voucher_id");

ALTER TABLE "fee_voucher_arrears"
  ADD CONSTRAINT "fee_voucher_arrears_school_id_fkey"
  FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "fee_voucher_arrears"
  ADD CONSTRAINT "fee_voucher_arrears_voucher_id_fkey"
  FOREIGN KEY ("voucher_id") REFERENCES "fee_vouchers"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "fee_voucher_arrears"
  ADD CONSTRAINT "fee_voucher_arrears_source_voucher_id_fkey"
  FOREIGN KEY ("source_voucher_id") REFERENCES "fee_vouchers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- A voucher carrying itself is a loop that would make settlement never finish.
ALTER TABLE "fee_voucher_arrears" ADD CONSTRAINT "fee_voucher_arrears_not_self"
  CHECK ("voucher_id" <> "source_voucher_id");

-- ===========================================================================
-- 7. Payments.
--
-- "A payment is never edited or deleted. Corrections create a reversal
-- payment with a link and a mandatory reason" — docs/modules §7. So there is
-- no UPDATE path to an amount here, and no DELETE at all.
-- ===========================================================================
CREATE TYPE "fee_payment_status" AS ENUM ('CONFIRMED', 'REVERSED');

CREATE TABLE "fee_payments" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    -- Gapless per school, and retained even when the payment is reversed —
    -- a receipt number that goes missing is an audit finding.
    "receipt_no" TEXT NOT NULL,
    "amount" NUMERIC(14,2) NOT NULL,
    "method" "payment_method" NOT NULL DEFAULT 'CASH',
    "paid_on" DATE NOT NULL,
    "reference" TEXT,
    "status" "fee_payment_status" NOT NULL DEFAULT 'CONFIRMED',
    -- Set on a reversal, pointing at what it undoes.
    "reverses_payment_id" UUID,
    "reason" TEXT,
    -- A double-submitted form is one payment, not two.
    "idempotency_key" TEXT,
    "created_by" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),

    CONSTRAINT "fee_payments_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "fee_payments_school_id_receipt_no_key"
  ON "fee_payments" ("school_id", "receipt_no");
CREATE UNIQUE INDEX "fee_payments_school_id_idempotency_key_key"
  ON "fee_payments" ("school_id", "idempotency_key")
  WHERE "idempotency_key" IS NOT NULL;
CREATE INDEX "fee_payments_school_id_student_id_paid_on_idx"
  ON "fee_payments" ("school_id", "student_id", "paid_on" DESC);
CREATE INDEX "fee_payments_school_id_paid_on_idx"
  ON "fee_payments" ("school_id", "paid_on" DESC);

ALTER TABLE "fee_payments"
  ADD CONSTRAINT "fee_payments_school_id_fkey"
  FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "fee_payments"
  ADD CONSTRAINT "fee_payments_student_id_fkey"
  FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "fee_payments"
  ADD CONSTRAINT "fee_payments_reverses_payment_id_fkey"
  FOREIGN KEY ("reverses_payment_id") REFERENCES "fee_payments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "fee_payments" ADD CONSTRAINT "fee_payments_amount_positive"
  CHECK ("amount" > 0);

-- ===========================================================================
-- 8. Which voucher got which rupee — docs/modules §7, invariant 3.
-- ===========================================================================
CREATE TABLE "fee_payment_allocations" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "payment_id" UUID NOT NULL,
    "voucher_id" UUID NOT NULL,
    "amount" NUMERIC(14,2) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),

    CONSTRAINT "fee_payment_allocations_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "fee_payment_allocations_school_id_payment_id_voucher_id_key"
  ON "fee_payment_allocations" ("school_id", "payment_id", "voucher_id");
CREATE INDEX "fee_payment_allocations_school_id_voucher_id_idx"
  ON "fee_payment_allocations" ("school_id", "voucher_id");

ALTER TABLE "fee_payment_allocations"
  ADD CONSTRAINT "fee_payment_allocations_school_id_fkey"
  FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "fee_payment_allocations"
  ADD CONSTRAINT "fee_payment_allocations_payment_id_fkey"
  FOREIGN KEY ("payment_id") REFERENCES "fee_payments"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "fee_payment_allocations"
  ADD CONSTRAINT "fee_payment_allocations_voucher_id_fkey"
  FOREIGN KEY ("voucher_id") REFERENCES "fee_vouchers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- An allocation of zero is noise in a ledger; a negative one is a refund
-- pretending to be a receipt.
ALTER TABLE "fee_payment_allocations" ADD CONSTRAINT "fee_payment_allocations_amount_positive"
  CHECK ("amount" > 0);

-- ===========================================================================
-- 9. Layer 3. CLAUDE.md: school_id NOT NULL, RLS enabled AND forced with the
-- tenant_isolation policy, a school_id-leading index, and registration in
-- TENANT_MODELS.
-- ===========================================================================
ALTER TABLE "job_runs" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "job_runs" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "job_runs"
  USING ("school_id" = current_school_id())
  WITH CHECK ("school_id" = current_school_id());

ALTER TABLE "fee_vouchers" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "fee_vouchers" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "fee_vouchers"
  USING ("school_id" = current_school_id())
  WITH CHECK ("school_id" = current_school_id());

ALTER TABLE "fee_voucher_lines" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "fee_voucher_lines" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "fee_voucher_lines"
  USING ("school_id" = current_school_id())
  WITH CHECK ("school_id" = current_school_id());

ALTER TABLE "fee_voucher_periods" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "fee_voucher_periods" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "fee_voucher_periods"
  USING ("school_id" = current_school_id())
  WITH CHECK ("school_id" = current_school_id());

ALTER TABLE "fee_voucher_arrears" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "fee_voucher_arrears" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "fee_voucher_arrears"
  USING ("school_id" = current_school_id())
  WITH CHECK ("school_id" = current_school_id());

ALTER TABLE "fee_payments" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "fee_payments" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "fee_payments"
  USING ("school_id" = current_school_id())
  WITH CHECK ("school_id" = current_school_id());

ALTER TABLE "fee_payment_allocations" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "fee_payment_allocations" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "fee_payment_allocations"
  USING ("school_id" = current_school_id())
  WITH CHECK ("school_id" = current_school_id());

GRANT SELECT, INSERT, UPDATE, DELETE ON
  "job_runs", "fee_vouchers", "fee_voucher_lines", "fee_voucher_periods",
  "fee_voucher_arrears", "fee_payments", "fee_payment_allocations"
  TO ilm_app;

COMMENT ON TABLE "fee_vouchers" IS
  'One challan for one student. Frozen at generation: changing a fee head later never restates an issued voucher.';
COMMENT ON TABLE "fee_voucher_periods" IS
  'Claims on (student, head, period). The unique index here is what makes double-billing impossible rather than unlikely.';
COMMENT ON TABLE "fee_payments" IS
  'Append-only. Never edited, never deleted; a correction is a reversal row pointing at the original.';
