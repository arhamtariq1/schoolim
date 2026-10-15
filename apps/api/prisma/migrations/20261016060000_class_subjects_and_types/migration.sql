-- Which subjects and assessment types each class has.
--
-- Subjects and assessment types stay the school's own lists (so a name is
-- spelled once); these tables say which of them a class uses. Marks entry then
-- offers, and accepts, only what is assigned to the class being marked.
--
-- Existing assessments are carried over: every subject and type already used
-- for a class is assigned to it, so no class loses the ability to edit marks it
-- already has.
--
-- Reversal (forward-only; manual rollback):
--   DROP TABLE "class_assessment_types"; DROP TABLE "class_subjects";

CREATE TABLE "class_subjects" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "class_level_id" UUID NOT NULL,
    "subject_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
    CONSTRAINT "class_subjects_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "class_assessment_types" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "class_level_id" UUID NOT NULL,
    "assessment_type_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
    CONSTRAINT "class_assessment_types_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "class_subjects_one_per_class_key"
  ON "class_subjects" ("school_id", "class_level_id", "subject_id");
CREATE INDEX "class_subjects_school_id_class_level_id_idx" ON "class_subjects" ("school_id", "class_level_id");
CREATE INDEX "class_subjects_school_id_subject_id_idx" ON "class_subjects" ("school_id", "subject_id");

CREATE UNIQUE INDEX "class_assessment_types_one_per_class_key"
  ON "class_assessment_types" ("school_id", "class_level_id", "assessment_type_id");
CREATE INDEX "class_assessment_types_school_id_class_level_id_idx" ON "class_assessment_types" ("school_id", "class_level_id");
CREATE INDEX "class_assessment_types_school_id_assessment_type_id_idx" ON "class_assessment_types" ("school_id", "assessment_type_id");

ALTER TABLE "class_subjects" ADD CONSTRAINT "class_subjects_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "class_subjects" ADD CONSTRAINT "class_subjects_class_level_id_fkey" FOREIGN KEY ("class_level_id") REFERENCES "class_levels"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "class_subjects" ADD CONSTRAINT "class_subjects_subject_id_fkey" FOREIGN KEY ("subject_id") REFERENCES "subjects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "class_assessment_types" ADD CONSTRAINT "class_assessment_types_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "class_assessment_types" ADD CONSTRAINT "class_assessment_types_class_level_id_fkey" FOREIGN KEY ("class_level_id") REFERENCES "class_levels"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "class_assessment_types" ADD CONSTRAINT "class_assessment_types_assessment_type_id_fkey" FOREIGN KEY ("assessment_type_id") REFERENCES "assessment_types"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "class_subjects" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "class_subjects" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "class_subjects" USING ("school_id" = current_school_id()) WITH CHECK ("school_id" = current_school_id());
ALTER TABLE "class_assessment_types" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "class_assessment_types" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "class_assessment_types" USING ("school_id" = current_school_id()) WITH CHECK ("school_id" = current_school_id());

GRANT SELECT, INSERT, UPDATE, DELETE ON "class_subjects", "class_assessment_types" TO ilm_app;

-- Carry existing assessments over.
INSERT INTO "class_subjects" ("id", "school_id", "class_level_id", "subject_id")
SELECT gen_random_uuid(), "school_id", "class_level_id", "subject_id"
FROM "assessments" GROUP BY "school_id", "class_level_id", "subject_id";

INSERT INTO "class_assessment_types" ("id", "school_id", "class_level_id", "assessment_type_id")
SELECT gen_random_uuid(), "school_id", "class_level_id", "assessment_type_id"
FROM "assessments" GROUP BY "school_id", "class_level_id", "assessment_type_id";

COMMENT ON TABLE "class_subjects" IS 'Which subjects a class has. Marks for a class may only use these.';
COMMENT ON TABLE "class_assessment_types" IS 'Which assessment types a class has. Marks for a class may only use these.';
