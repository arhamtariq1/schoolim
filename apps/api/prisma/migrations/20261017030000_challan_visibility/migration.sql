-- What a printed challan shows, beyond the school logo.
--
-- Three switches on the existing per-school settings row: the bank marks at the
-- foot, the issue and due dates, and the student's register details (GR number,
-- class, section, session). All default to true, which is what every challan
-- prints today, so no school's challan changes until somebody unticks one.
--
-- `school_voucher_settings` is already tenant-isolated (RLS, school_id index,
-- TENANT_MODELS); these are columns on it, not a new table.
--
-- Erasure: unchanged — the row is deleted with the school (ON DELETE CASCADE).
--
-- Reversal (forward-only; manual rollback):
--   ALTER TABLE "school_voucher_settings"
--     DROP COLUMN "show_bank_logos",
--     DROP COLUMN "show_dates",
--     DROP COLUMN "show_student_details";

ALTER TABLE "school_voucher_settings"
  ADD COLUMN "show_bank_logos" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "show_dates" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "show_student_details" BOOLEAN NOT NULL DEFAULT true;
