-- Who teaches which subject in which class.
--
-- `class_subjects` already says a class has a subject; this says which teacher
-- takes it. One teacher can hold many rows, so a teacher can teach several
-- classes and several subjects. Nullable: a subject may be set up before anyone
-- is chosen for it.
--
-- Erasure (docs/17 s4): not personal data in itself. A removed staff member
-- leaves the subject unassigned (SET NULL); the row goes with its class.
--
-- Reversal: DROP INDEX "class_subjects_school_id_teacher_id_idx";
--           ALTER TABLE "class_subjects" DROP COLUMN "teacher_id";

ALTER TABLE "class_subjects" ADD COLUMN "teacher_id" UUID;

ALTER TABLE "class_subjects"
  ADD CONSTRAINT "class_subjects_teacher_id_fkey"
  FOREIGN KEY ("teacher_id") REFERENCES "staff"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "class_subjects_school_id_teacher_id_idx" ON "class_subjects"("school_id", "teacher_id");
