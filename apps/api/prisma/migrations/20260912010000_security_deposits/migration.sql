-- ---------------------------------------------------------------------------
-- Security deposits, and refunding them in parts.
--
-- A deposit is not a fee. A fee is income the moment it is collected; a deposit
-- is the school holding a parent's money and owing it back, less whatever the
-- child broke. That is a liability, and the two must not share a table — a
-- deposit counted as income overstates a year's collection by the whole float.
--
-- ## Why refunds are their own rows
--
-- A deposit is refunded in pieces: 2,000 withheld for a broken window, the
-- remaining 3,000 returned when the child leaves. Storing a single
-- `refunded_amount` on the deposit and adding to it would be an in-place
-- update of a money field, which CLAUDE.md R4 forbids for exactly this reason
-- — the school loses the answer to "who returned what, when, and why".
--
-- So refunds are append-only rows and `left` is arithmetic:
--
--   left = deposit.amount - sum(refunds.amount)
--
-- ## The over-refund
--
-- The one thing that must be impossible is refunding more than was deposited.
-- A CHECK cannot see across rows, so the service takes the deposit row FOR
-- UPDATE and re-totals inside the transaction. The constraints below catch the
-- single-row half of it: no negative deposit, no negative or zero refund.
-- ---------------------------------------------------------------------------

CREATE TABLE "security_deposits" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    -- The voucher that collected it, when it came in on one. Null for a
    -- deposit taken at the counter outside the billing run.
    "voucher_id" UUID,
    -- Rupees, `numeric(14,2)`. Integer paisa above the service layer.
    "amount" NUMERIC(14,2) NOT NULL,
    "received_on" DATE NOT NULL,
    "note" TEXT,
    "created_by" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "security_deposits_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "security_deposits"
  ADD CONSTRAINT "security_deposits_amount_positive" CHECK ("amount" > 0);

ALTER TABLE "security_deposits"
  ADD CONSTRAINT "security_deposits_school_id_fkey"
  FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "security_deposits"
  ADD CONSTRAINT "security_deposits_student_id_fkey"
  FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- RESTRICT, not CASCADE: a voucher is cancellable, and a cancelled voucher must
-- not silently delete the record of money the school is holding.
ALTER TABLE "security_deposits"
  ADD CONSTRAINT "security_deposits_voucher_id_fkey"
  FOREIGN KEY ("voucher_id") REFERENCES "fee_vouchers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- The page's default view: this school, newest first.
CREATE INDEX "security_deposits_school_id_received_on_idx"
  ON "security_deposits" ("school_id", "received_on" DESC);

-- "What is this child's deposit?" — the student page and the refund dialog.
CREATE INDEX "security_deposits_school_id_student_id_idx"
  ON "security_deposits" ("school_id", "student_id");

-- One deposit per voucher. A retried payment must not book the float twice, and
-- a unique index is the only version of that which survives a race.
--
-- Not a partial index, and it does not need to be: PostgreSQL treats NULLs as
-- distinct, so this permits any number of counter deposits (voucher_id NULL)
-- while allowing at most one per actual voucher. A partial index would say the
-- same thing and be invisible to Prisma, which would then report it as drift on
-- every `migrate dev`.
CREATE UNIQUE INDEX "security_deposits_school_id_voucher_id_key"
  ON "security_deposits" ("school_id", "voucher_id");

CREATE TABLE "security_deposit_refunds" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "deposit_id" UUID NOT NULL,
    "amount" NUMERIC(14,2) NOT NULL,
    -- Why. "Broken window, Class V" is the difference between a refund and an
    -- unexplained withdrawal when somebody asks in two years.
    "reason" TEXT NOT NULL,
    "refunded_on" DATE NOT NULL,
    "created_by" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),

    CONSTRAINT "security_deposit_refunds_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "security_deposit_refunds"
  ADD CONSTRAINT "security_deposit_refunds_amount_positive" CHECK ("amount" > 0);

ALTER TABLE "security_deposit_refunds"
  ADD CONSTRAINT "security_deposit_refunds_reason_not_blank" CHECK (btrim("reason") <> '');

ALTER TABLE "security_deposit_refunds"
  ADD CONSTRAINT "security_deposit_refunds_school_id_fkey"
  FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "security_deposit_refunds"
  ADD CONSTRAINT "security_deposit_refunds_deposit_id_fkey"
  FOREIGN KEY ("deposit_id") REFERENCES "security_deposits"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Totalling a deposit's refunds is the hot path: the list shows `left` for every
-- row, and the refund dialog re-totals under a lock before it writes.
CREATE INDEX "security_deposit_refunds_school_id_deposit_id_idx"
  ON "security_deposit_refunds" ("school_id", "deposit_id");

ALTER TABLE "security_deposits" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "security_deposits" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "security_deposits"
  USING ("school_id" = current_school_id())
  WITH CHECK ("school_id" = current_school_id());

ALTER TABLE "security_deposit_refunds" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "security_deposit_refunds" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "security_deposit_refunds"
  USING ("school_id" = current_school_id())
  WITH CHECK ("school_id" = current_school_id());

GRANT SELECT, INSERT, UPDATE, DELETE ON "security_deposits" TO ilm_app;

-- A refund is a financial record: append-only (R4). Correcting one is another
-- row, not an edit, so the application role is granted no UPDATE or DELETE.
GRANT SELECT, INSERT ON "security_deposit_refunds" TO ilm_app;
REVOKE UPDATE, DELETE ON "security_deposit_refunds" FROM ilm_app;
