-- ---------------------------------------------------------------------------
-- "Admission number" becomes the school's Student ID.
--
-- A school issues two numbers and they are not the same thing:
--
--   GR No       the General Register entry. The legal record of a child having
--               attended. Permanent, never reused, outlives them leaving.
--   Student ID  the school's own identifier for a pupil. Printed on the ID
--               card and the fee voucher, carries the intake year.
--
-- There is no third "admission number", so the column is renamed rather than a
-- new one added — nothing in the product should offer a number a school does
-- not actually keep.
--
-- ## Why the column is `student_code` and not `student_id`
--
-- `student_id` already exists, on enrolments, guardian links and everything
-- else that points at a student, where it means the internal UUID. Reusing that
-- name for a human-facing string would leave two different meanings for one
-- identifier in the same schema, and a join written against the wrong one is a
-- bug that reads as correct. The **label** is "Student ID"; the column is not.
-- ---------------------------------------------------------------------------
ALTER TABLE "students" RENAME COLUMN "admission_no" TO "student_code";

ALTER INDEX "students_school_id_admission_no_key" RENAME TO "students_school_id_student_code_key";
ALTER INDEX "students_school_id_admission_no_idx" RENAME TO "students_school_id_student_code_idx";

-- The counter follows the name it allocates for. Leaving it as 'admission'
-- would mean the one place a reader looks to understand numbering still calls
-- it something the product no longer has.
UPDATE "number_sequences" SET "kind" = 'student', "updated_at" = now()
WHERE "kind" = 'admission';

COMMENT ON COLUMN "students"."student_code" IS
  'The school''s Student ID. Human-facing; the internal identifier is students.id.';
