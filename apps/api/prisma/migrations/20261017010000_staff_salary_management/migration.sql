-- Staff salary management: one monthly salary record, many payments, controlled
-- adjustments.
--
-- Until now a month was a single full payment (one row, unique per staff per
-- month). Schools pay in parts and add bonuses and deductions, so:
--
--   staff_salary_periods      one row per staff member per month; the base
--                             salary is snapshotted when the row is made, so a
--                             later raise never rewrites an earlier month.
--   staff_salary_adjustments  bonus / allowance / deduction / manual, each with
--                             an amount, a reason and an actor. Append-only.
--   staff_salary_payments     now many per period (the one-per-month unique is
--                             dropped), with method, reference and notes.
--
-- All three stay append-only (docs/12 R4): the app role holds SELECT and INSERT
-- and nothing else, so a recorded payment or adjustment cannot be edited.
--
-- Reversal (forward-only; manual rollback):
--   DROP TABLE "staff_salary_adjustments";
--   ALTER TABLE "staff_salary_payments" DROP COLUMN "period_id", DROP COLUMN "method",
--     DROP COLUMN "reference", DROP COLUMN "notes", DROP COLUMN "idempotency_key";
--   DROP TABLE "staff_salary_periods";
--   CREATE UNIQUE INDEX "staff_salary_payments_one_per_month_key"
--     ON "staff_salary_payments" ("school_id", "staff_id", "month");

CREATE TABLE "staff_salary_periods" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "staff_id" UUID NOT NULL,
    -- First day of the month this salary is for.
    "month" DATE NOT NULL,
    -- The basic salary when this month became payable. Never rewritten.
    "base_salary" DECIMAL(14,2) NOT NULL,
    "created_by" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
    CONSTRAINT "staff_salary_periods_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "staff_salary_periods_base_nonneg" CHECK ("base_salary" >= 0),
    CONSTRAINT "staff_salary_periods_month_is_first" CHECK (date_trunc('month', "month") = "month")
);

CREATE UNIQUE INDEX "staff_salary_periods_one_per_month_key"
  ON "staff_salary_periods" ("school_id", "staff_id", "month");
CREATE INDEX "staff_salary_periods_school_id_month_idx"
  ON "staff_salary_periods" ("school_id", "month");

ALTER TABLE "staff_salary_periods"
  ADD CONSTRAINT "staff_salary_periods_school_id_fkey"
  FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "staff_salary_periods"
  ADD CONSTRAINT "staff_salary_periods_staff_id_fkey"
  FOREIGN KEY ("staff_id") REFERENCES "staff"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "staff_salary_periods" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "staff_salary_periods" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "staff_salary_periods"
  USING ("school_id" = current_school_id())
  WITH CHECK ("school_id" = current_school_id());

REVOKE ALL ON "staff_salary_periods" FROM ilm_app;
GRANT SELECT, INSERT ON "staff_salary_periods" TO ilm_app;

-- Adjustments ----------------------------------------------------------------

CREATE TABLE "staff_salary_adjustments" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "period_id" UUID NOT NULL,
    "kind" TEXT NOT NULL,
    -- Signed: bonuses and allowances add, deductions subtract.
    "amount" DECIMAL(14,2) NOT NULL,
    "reason" TEXT NOT NULL,
    "created_by" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
    CONSTRAINT "staff_salary_adjustments_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "staff_salary_adjustments_kind_known"
      CHECK ("kind" IN ('BONUS', 'ALLOWANCE', 'DEDUCTION', 'ADJUSTMENT')),
    CONSTRAINT "staff_salary_adjustments_amount_nonzero" CHECK ("amount" <> 0),
    CONSTRAINT "staff_salary_adjustments_reason_present" CHECK (length(btrim("reason")) > 0)
);

CREATE INDEX "staff_salary_adjustments_school_id_period_id_idx"
  ON "staff_salary_adjustments" ("school_id", "period_id");

ALTER TABLE "staff_salary_adjustments"
  ADD CONSTRAINT "staff_salary_adjustments_school_id_fkey"
  FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "staff_salary_adjustments"
  ADD CONSTRAINT "staff_salary_adjustments_period_id_fkey"
  FOREIGN KEY ("period_id") REFERENCES "staff_salary_periods"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "staff_salary_adjustments" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "staff_salary_adjustments" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "staff_salary_adjustments"
  USING ("school_id" = current_school_id())
  WITH CHECK ("school_id" = current_school_id());

REVOKE ALL ON "staff_salary_adjustments" FROM ilm_app;
GRANT SELECT, INSERT ON "staff_salary_adjustments" TO ilm_app;

-- Payments: many per month -----------------------------------------------------

DROP INDEX IF EXISTS "staff_salary_payments_one_per_month_key";

ALTER TABLE "staff_salary_payments"
  ADD COLUMN "period_id" UUID,
  ADD COLUMN "method" TEXT NOT NULL DEFAULT 'CASH',
  ADD COLUMN "reference" TEXT,
  ADD COLUMN "notes" TEXT,
  -- A key the browser makes once per open dialog: a double click or a retry
  -- after a dropped response lands on the same row instead of paying twice.
  ADD COLUMN "idempotency_key" TEXT;

ALTER TABLE "staff_salary_payments"
  ADD CONSTRAINT "staff_salary_payments_method_known"
  CHECK ("method" IN ('CASH', 'BANK_TRANSFER', 'OTHER'));

-- Every payment already on file becomes a fully paid month at the amount paid.
INSERT INTO "staff_salary_periods" ("id", "school_id", "staff_id", "month", "base_salary", "created_by")
SELECT gen_random_uuid(), "school_id", "staff_id", "month", SUM("amount"), NULL
  FROM "staff_salary_payments"
 GROUP BY "school_id", "staff_id", "month"
ON CONFLICT DO NOTHING;

UPDATE "staff_salary_payments" p
   SET "period_id" = s."id"
  FROM "staff_salary_periods" s
 WHERE s."school_id" = p."school_id"
   AND s."staff_id" = p."staff_id"
   AND s."month" = p."month";

ALTER TABLE "staff_salary_payments" ALTER COLUMN "period_id" SET NOT NULL;
ALTER TABLE "staff_salary_payments"
  ADD CONSTRAINT "staff_salary_payments_period_id_fkey"
  FOREIGN KEY ("period_id") REFERENCES "staff_salary_periods"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE INDEX "staff_salary_payments_school_id_period_id_idx"
  ON "staff_salary_payments" ("school_id", "period_id");
CREATE UNIQUE INDEX "staff_salary_payments_idempotency_key"
  ON "staff_salary_payments" ("school_id", "idempotency_key")
  WHERE "idempotency_key" IS NOT NULL;

COMMENT ON TABLE "staff_salary_periods" IS
  'One monthly salary record per staff member. Base salary is a snapshot; append-only.';
COMMENT ON TABLE "staff_salary_adjustments" IS
  'Signed bonus / allowance / deduction against a monthly salary. Append-only.';
