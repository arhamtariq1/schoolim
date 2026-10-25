-- Marks: subjects, assessments (tests and exams) and per-student results.
--
-- Reversal (forward-only; manual rollback):
--   DROP TABLE "mark_entries"; DROP TABLE "assessments"; DROP TABLE "subjects";
--   DROP TYPE "assessment_type";

CREATE TYPE "assessment_type" AS ENUM ('CLASS_TEST', 'MONTHLY_TEST', 'SURPRISE_TEST', 'EXAM');

CREATE TABLE "subjects" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
    CONSTRAINT "subjects_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "assessments" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "session_id" UUID NOT NULL,
    "class_level_id" UUID NOT NULL,
    "subject_id" UUID NOT NULL,
    "type" "assessment_type" NOT NULL,
    "held_on" DATE NOT NULL,
    "total_marks" DECIMAL(6,2) NOT NULL,
    "created_by" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    CONSTRAINT "assessments_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "assessments_total_marks_positive" CHECK ("total_marks" > 0)
);

CREATE TABLE "mark_entries" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "assessment_id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "obtained" DECIMAL(6,2),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    CONSTRAINT "mark_entries_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "mark_entries_obtained_non_negative" CHECK ("obtained" IS NULL OR "obtained" >= 0)
);

CREATE UNIQUE INDEX "subjects_school_id_name_key" ON "subjects" ("school_id", "name");
CREATE INDEX "subjects_school_id_idx" ON "subjects" ("school_id");

CREATE UNIQUE INDEX "assessments_school_id_session_id_class_level_id_subject_id_type_held_on_key"
  ON "assessments" ("school_id", "session_id", "class_level_id", "subject_id", "type", "held_on");
CREATE INDEX "assessments_school_id_class_level_id_held_on_idx" ON "assessments" ("school_id", "class_level_id", "held_on");
CREATE INDEX "assessments_school_id_subject_id_idx" ON "assessments" ("school_id", "subject_id");
CREATE INDEX "assessments_school_id_session_id_idx" ON "assessments" ("school_id", "session_id");

CREATE UNIQUE INDEX "mark_entries_school_id_assessment_id_student_id_key" ON "mark_entries" ("school_id", "assessment_id", "student_id");
CREATE INDEX "mark_entries_school_id_student_id_idx" ON "mark_entries" ("school_id", "student_id");
CREATE INDEX "mark_entries_school_id_assessment_id_idx" ON "mark_entries" ("school_id", "assessment_id");

ALTER TABLE "subjects" ADD CONSTRAINT "subjects_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "assessments" ADD CONSTRAINT "assessments_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "assessments" ADD CONSTRAINT "assessments_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "academic_sessions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "assessments" ADD CONSTRAINT "assessments_class_level_id_fkey" FOREIGN KEY ("class_level_id") REFERENCES "class_levels"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "assessments" ADD CONSTRAINT "assessments_subject_id_fkey" FOREIGN KEY ("subject_id") REFERENCES "subjects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "mark_entries" ADD CONSTRAINT "mark_entries_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "mark_entries" ADD CONSTRAINT "mark_entries_assessment_id_fkey" FOREIGN KEY ("assessment_id") REFERENCES "assessments"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "mark_entries" ADD CONSTRAINT "mark_entries_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "subjects" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "subjects" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "subjects" USING ("school_id" = current_school_id()) WITH CHECK ("school_id" = current_school_id());
ALTER TABLE "assessments" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "assessments" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "assessments" USING ("school_id" = current_school_id()) WITH CHECK ("school_id" = current_school_id());
ALTER TABLE "mark_entries" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "mark_entries" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "mark_entries" USING ("school_id" = current_school_id()) WITH CHECK ("school_id" = current_school_id());

GRANT SELECT, INSERT, UPDATE, DELETE ON "subjects", "assessments", "mark_entries" TO ilm_app;

COMMENT ON TABLE "assessments" IS 'A test or exam for one class, subject and day. Unique per (session, class, subject, type, day).';
COMMENT ON TABLE "mark_entries" IS 'One childs result in one assessment; obtained NULL = absent. Anonymised with the student.';
