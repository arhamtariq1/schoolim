-- ---------------------------------------------------------------------------
-- A student's fee becomes a timeline, not a single figure.
--
-- `student_fees` held exactly one row per (student, head): the amount agreed at
-- admission, overwritten in place whenever it changed. That made two ordinary
-- requests impossible to answer:
--
--   "put every Class V tuition up by 500 from the 1st of next month"
--   "what was this child paying in April, and who changed it?"
--
-- Overwriting also silently rewrote history. A school that raised fees in
-- September had no record that August was ever cheaper, so a voucher reprinted
-- for August would have come out at the new price — a document that disagrees
-- with the receipt the parent is holding.
--
-- So a row is now "this amount, from this date", and the amount in force on any
-- given day is the newest row not in the future. Old rows are kept; nothing is
-- overwritten.
--
-- Vouchers are unaffected by design: they already **copy** the amount at
-- generation (see the note on `student_fees.amount`), so a fee rise never
-- reaches a challan that has already been issued.
-- ---------------------------------------------------------------------------

ALTER TABLE "student_fees"
  ADD COLUMN "effective_from" DATE;

-- Backfill before the NOT NULL. `created_at` is when the fee was agreed — at
-- admission for most rows — which is exactly the date this column means.
UPDATE "student_fees" SET "effective_from" = "created_at"::date WHERE "effective_from" IS NULL;

ALTER TABLE "student_fees"
  ALTER COLUMN "effective_from" SET NOT NULL,
  ALTER COLUMN "effective_from" SET DEFAULT CURRENT_DATE;

-- One amount per head per day. Two rows for the same head on the same date is
-- not history, it is a race — the second write of a double-clicked Submit —
-- and the constraint turns it into an upsert rather than a duplicate.
ALTER TABLE "student_fees" DROP CONSTRAINT IF EXISTS "student_fees_school_id_student_id_fee_head_id_key";
DROP INDEX IF EXISTS "student_fees_school_id_student_id_fee_head_id_key";

CREATE UNIQUE INDEX "student_fees_school_id_student_id_fee_head_id_effective_from_key"
  ON "student_fees" ("school_id", "student_id", "fee_head_id", "effective_from");

-- The lookup every voucher run makes: for these students, for this month, the
-- newest row not in the future. `DESC` on the date is what lets Postgres walk
-- backwards from the billing date and stop at the first hit per head, so the
-- cost is one index seek per (student, head) rather than a sort of the history.
CREATE INDEX "student_fees_school_id_student_id_fee_head_id_effective_from_idx"
  ON "student_fees" ("school_id", "student_id", "fee_head_id", "effective_from" DESC);

-- No new CHECK on the amount here: `student_fees_amount_non_negative` and
-- `student_fees_discount_within_bounds` already say exactly this, from the
-- migration that created the table. A second copy under a different name is not
-- extra safety — it is two things to keep in step and a confusing error message
-- when the wrong one fires.

COMMENT ON COLUMN "student_fees"."effective_from" IS
  'The day this amount starts applying. The amount in force on any date is the newest row with effective_from <= that date.';
