-- Which fee heads attract the school's late fee.
--
-- Until now the surcharge was rated on the whole challan. A school wants it on
-- tuition but not on a one-time lab or admission charge, so each head carries
-- its own switch. Per head, per school: `fee_heads` is already tenant-isolated
-- by row-level security, so one school's choice cannot reach another's.

ALTER TABLE "fee_heads"
  ADD COLUMN "late_fee_applies" BOOLEAN NOT NULL DEFAULT false;

-- Keep today's behaviour for schools that already charge a late fee: every
-- head they have now stays late-fee bearing until the Admin narrows it.
UPDATE "fee_heads" h
   SET "late_fee_applies" = true
  FROM "schools" s
 WHERE s."id" = h."school_id"
   AND (s."late_fee_percent" > 0 OR s."late_fee_flat" > 0);

COMMENT ON COLUMN "fee_heads"."late_fee_applies" IS
  'True when the school late fee is charged on this head. New heads default to false.';
