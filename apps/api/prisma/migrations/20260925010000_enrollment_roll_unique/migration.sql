-- One roll number per section, per session.
--
-- A roll number is a child's position on one register — "Grade 4 — A,
-- 2026-2027, number 7". Two children holding number 7 on the same register is
-- not a cosmetic problem: the roll is what a teacher calls out, what goes on a
-- leave application, and what an exam slip is printed with.
--
-- The service allocates it under a `FOR UPDATE` lock on the section row, so two
-- receptionists admitting into the same section at the same instant are
-- serialised and never race. This index is the backstop for that lock, and for
-- whatever assigns a roll next year without knowing the lock exists.
--
-- Partial, on two counts:
--
--   * `section_id IS NOT NULL` — a child in no section has no register to hold
--     a position on, and so is given no roll. Postgres treats NULLs as distinct
--     in a unique index anyway, so those rows would never conflict; saying so
--     explicitly keeps the index small and its intent readable.
--   * `roll_no IS NOT NULL` — same reasoning, and it keeps every unassigned
--     enrolment out of the index entirely.
--
-- `school_id` leads, as every tenant-scoped index in this database does: RLS
-- confines the rows, and the index has to be useful for one school's queries
-- rather than for a scan across all of them.
CREATE UNIQUE INDEX "enrollments_roll_unique"
  ON "enrollments" ("school_id", "session_id", "section_id", "roll_no")
  WHERE "section_id" IS NOT NULL AND "roll_no" IS NOT NULL;
