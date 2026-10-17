-- Several bank marks per school.
--
-- A school that banks with more than one bank accepts payment at any of them
-- and prints every mark in one row at the foot of the challan. The row is the
-- same image record as before — same table, same RLS policy, same cascade from
-- `schools` — distinguished by a slot number. A school's own mark only ever
-- uses slot 0.
--
-- Existing rows become slot 0, and slot 0's storage key is unchanged, so every
-- logo already uploaded keeps serving without being re-uploaded.
--
-- Erasure: unchanged. Rows are deleted with the school (ON DELETE CASCADE) and
-- individually by the school removing a slot.
--
-- Reversal (forward-only; manual rollback):
--   DELETE FROM "school_logos" WHERE "slot" > 0;
--   ALTER TABLE "school_logos" DROP CONSTRAINT "school_logos_school_id_kind_slot_key";
--   ALTER TABLE "school_logos" ADD CONSTRAINT "school_logos_school_id_kind_key" UNIQUE ("school_id", "kind");
--   ALTER TABLE "school_logos" DROP COLUMN "slot";

ALTER TABLE "school_logos"
  ADD COLUMN "slot" SMALLINT NOT NULL DEFAULT 0,
  ADD CONSTRAINT "school_logos_slot_range" CHECK ("slot" BETWEEN 0 AND 3),
  -- Only a bank mark has more than one slot.
  ADD CONSTRAINT "school_logos_school_slot_zero" CHECK ("kind" = 'BANK' OR "slot" = 0);

ALTER TABLE "school_logos" DROP CONSTRAINT "school_logos_school_id_kind_key";
ALTER TABLE "school_logos"
  ADD CONSTRAINT "school_logos_school_id_kind_slot_key" UNIQUE ("school_id", "kind", "slot");
