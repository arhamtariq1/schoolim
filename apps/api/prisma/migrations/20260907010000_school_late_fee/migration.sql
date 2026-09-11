-- ---------------------------------------------------------------------------
-- The late-fee rule, as school configuration.
--
-- A Pakistani challan prints "amount payable within due date" and "amount
-- payable after due date", and the gap between them is the school's surcharge.
-- Every school sets it differently: some charge a flat 200, some 5%, some
-- both, some nothing at all.
--
-- So it is two columns here rather than a number in the code. A rate written
-- into a service is the school-specific branching CLAUDE.md R1 forbids — it
-- works for the first school and becomes an `if` for the second.
--
-- Both default to zero, which means the surcharge boxes print the same figure
-- until a school says otherwise. That is the honest default: inventing a late
-- fee nobody agreed to is worse than showing none.
-- ---------------------------------------------------------------------------

ALTER TABLE "schools"
  ADD COLUMN "late_fee_percent" NUMERIC(5,2) NOT NULL DEFAULT 0,
  ADD COLUMN "late_fee_flat" NUMERIC(14,2) NOT NULL DEFAULT 0;

-- A "surcharge" that reduces the bill is a discount somebody typed into the
-- wrong box, and 100% of the fee again is a typo, not a policy.
ALTER TABLE "schools" ADD CONSTRAINT "schools_late_fee_percent_sane"
  CHECK ("late_fee_percent" >= 0 AND "late_fee_percent" <= 100);
ALTER TABLE "schools" ADD CONSTRAINT "schools_late_fee_flat_non_negative"
  CHECK ("late_fee_flat" >= 0);

COMMENT ON COLUMN "schools"."late_fee_percent" IS
  'Surcharge on the payable amount once the due date passes. Zero means none.';
COMMENT ON COLUMN "schools"."late_fee_flat" IS
  'Flat surcharge added alongside the percentage. Zero means none.';
