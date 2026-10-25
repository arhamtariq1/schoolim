-- Assessment types become a school-configured table instead of a fixed enum.
--
-- Existing assessments are carried over: every school gets the four generic
-- types, and each assessment is pointed at the one its enum value named.
--
-- Reversal (forward-only; manual rollback is a data migration, not a DROP):
--   recreate the enum, map assessment_types.name back, drop the column and table.

CREATE TABLE "assessment_types" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
    CONSTRAINT "assessment_types_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "assessment_types_school_id_name_key" ON "assessment_types" ("school_id", "name");
CREATE INDEX "assessment_types_school_id_idx" ON "assessment_types" ("school_id");

ALTER TABLE "assessment_types"
  ADD CONSTRAINT "assessment_types_school_id_fkey"
  FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "assessment_types" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "assessment_types" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "assessment_types"
  USING ("school_id" = current_school_id())
  WITH CHECK ("school_id" = current_school_id());
GRANT SELECT, INSERT, UPDATE, DELETE ON "assessment_types" TO ilm_app;

-- Only schools that already hold assessments need the carried-over types; the
-- rest are seeded on first use by the application.
INSERT INTO "assessment_types" ("id", "school_id", "name")
SELECT gen_random_uuid(), s.school_id, v.name
FROM (SELECT DISTINCT "school_id" FROM "assessments") s
CROSS JOIN (VALUES ('Class test'), ('Monthly test'), ('Surprise test'), ('Exam')) AS v(name);

ALTER TABLE "assessments" ADD COLUMN "assessment_type_id" UUID;

UPDATE "assessments" a
SET "assessment_type_id" = t."id"
FROM "assessment_types" t
WHERE t."school_id" = a."school_id"
  AND t."name" = CASE a."type"::text
    WHEN 'CLASS_TEST' THEN 'Class test'
    WHEN 'MONTHLY_TEST' THEN 'Monthly test'
    WHEN 'SURPRISE_TEST' THEN 'Surprise test'
    ELSE 'Exam'
  END;

ALTER TABLE "assessments" ALTER COLUMN "assessment_type_id" SET NOT NULL;

ALTER TABLE "assessments"
  ADD CONSTRAINT "assessments_assessment_type_id_fkey"
  FOREIGN KEY ("assessment_type_id") REFERENCES "assessment_types"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Dropping the column drops the old unique index that included it.
ALTER TABLE "assessments" DROP COLUMN "type";
DROP TYPE "assessment_type";

CREATE UNIQUE INDEX "assessments_one_per_day_key"
  ON "assessments" ("school_id", "session_id", "class_level_id", "subject_id", "assessment_type_id", "held_on");
CREATE INDEX "assessments_school_id_assessment_type_id_idx" ON "assessments" ("school_id", "assessment_type_id");

COMMENT ON TABLE "assessment_types" IS 'School-configured kinds of test or exam. A type in use cannot be deleted.';
