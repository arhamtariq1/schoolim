-- Days after the due date before a late fee applies.
--
-- Schools often print "due the 10th, late from the 15th". That gap is
-- configuration, not a constant in code (CLAUDE.md R1). Default 0 keeps today's
-- behaviour: pay after the due date and the surcharge is owed.

ALTER TABLE "schools"
  ADD COLUMN "late_fee_grace_days" SMALLINT NOT NULL DEFAULT 0;

ALTER TABLE "schools" ADD CONSTRAINT "schools_late_fee_grace_days_sane"
  CHECK ("late_fee_grace_days" >= 0 AND "late_fee_grace_days" <= 90);

COMMENT ON COLUMN "schools"."late_fee_grace_days" IS
  'Days after due date before late fee applies. Zero means the day after due.';

-- Column-level grant: ilm_app may set its own late-fee rule, nothing else.
GRANT UPDATE (late_fee_grace_days) ON "schools" TO ilm_app;
