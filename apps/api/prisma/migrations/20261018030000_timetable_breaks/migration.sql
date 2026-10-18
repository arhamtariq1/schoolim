-- A break between periods on a class timetable (lunch, recess).
--
-- A break is a row with no subject, teacher or room; `notes` may name it.
-- Not personal data; erased with its timetable (docs/17 s4).
--
-- Reversal: ALTER TABLE "timetable_entries" DROP CONSTRAINT "timetable_entries_break_is_bare_chk";
--           ALTER TABLE "timetable_entries" DROP COLUMN "is_break";

ALTER TABLE "timetable_entries" ADD COLUMN "is_break" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "timetable_entries"
  ADD CONSTRAINT "timetable_entries_break_is_bare_chk"
  CHECK (NOT "is_break" OR ("subject_id" IS NULL AND "teacher_id" IS NULL AND "room" IS NULL));
