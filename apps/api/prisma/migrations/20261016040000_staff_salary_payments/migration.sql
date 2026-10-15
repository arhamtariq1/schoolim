-- Salary payments: one row per member of staff per month, once paid.
--
-- Financial records are append-only (docs/12 R4), and that is enforced here
-- rather than promised: the application role gets SELECT and INSERT only, so no
-- code path can update an amount or delete a payment. A correction would be a
-- reversing entry, which does not exist yet and is a separate decision.
--
-- Reversal (forward-only; manual rollback):
--   DROP TABLE "staff_salary_payments";

CREATE TABLE "staff_salary_payments" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "staff_id" UUID NOT NULL,
    -- First day of the month the salary is for.
    "month" DATE NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "paid_on" DATE NOT NULL,
    "recorded_by" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
    CONSTRAINT "staff_salary_payments_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "staff_salary_payments_amount_positive" CHECK ("amount" > 0),
    CONSTRAINT "staff_salary_payments_month_is_first" CHECK (date_trunc('month', "month") = "month")
);

CREATE UNIQUE INDEX "staff_salary_payments_one_per_month_key"
  ON "staff_salary_payments" ("school_id", "staff_id", "month");
CREATE INDEX "staff_salary_payments_school_id_staff_id_idx"
  ON "staff_salary_payments" ("school_id", "staff_id");

ALTER TABLE "staff_salary_payments"
  ADD CONSTRAINT "staff_salary_payments_school_id_fkey"
  FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "staff_salary_payments"
  ADD CONSTRAINT "staff_salary_payments_staff_id_fkey"
  FOREIGN KEY ("staff_id") REFERENCES "staff"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "staff_salary_payments" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "staff_salary_payments" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "staff_salary_payments"
  USING ("school_id" = current_school_id())
  WITH CHECK ("school_id" = current_school_id());

-- Deliberately no UPDATE and no DELETE.
GRANT SELECT, INSERT ON "staff_salary_payments" TO ilm_app;

COMMENT ON TABLE "staff_salary_payments" IS
  'Salary paid to staff, one row per month. Append-only: the app role cannot UPDATE or DELETE.';
