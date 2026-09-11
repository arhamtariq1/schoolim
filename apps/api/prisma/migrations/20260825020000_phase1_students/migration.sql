-- CreateEnum
CREATE TYPE "session_status" AS ENUM ('PLANNED', 'ACTIVE', 'CLOSED');

-- CreateEnum
CREATE TYPE "student_status" AS ENUM ('ACTIVE', 'INACTIVE', 'GRADUATED', 'LEFT', 'STRUCK_OFF');

-- CreateEnum
CREATE TYPE "gender" AS ENUM ('MALE', 'FEMALE', 'OTHER');

-- CreateEnum
CREATE TYPE "guardian_relation" AS ENUM ('FATHER', 'MOTHER', 'GUARDIAN');

-- CreateEnum
CREATE TYPE "enrollment_status" AS ENUM ('ENROLLED', 'PROMOTED', 'REPEATED', 'TRANSFERRED', 'LEFT');

-- CreateTable
CREATE TABLE "academic_sessions" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "start_date" DATE NOT NULL,
    "end_date" DATE NOT NULL,
    "status" "session_status" NOT NULL DEFAULT 'PLANNED',
    "is_current" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "academic_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "class_levels" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "numeric_order" INTEGER NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "class_levels_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sections" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "session_id" UUID NOT NULL,
    "class_level_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "capacity" INTEGER,
    "room" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "sections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "students" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "admission_no" TEXT NOT NULL,
    "first_name" TEXT NOT NULL,
    "last_name" TEXT NOT NULL,
    "gender" "gender",
    "date_of_birth" DATE,
    "photo_url" TEXT,
    "b_form_no" TEXT,
    "religion" TEXT,
    "blood_group" TEXT,
    "nationality" TEXT,
    "address" TEXT,
    "city" TEXT,
    "emergency_contact" TEXT,
    "status" "student_status" NOT NULL DEFAULT 'ACTIVE',
    "admitted_on" DATE,
    "left_on" DATE,
    "leaving_reason" TEXT,
    "user_id" UUID,
    "custom" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "students_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "guardians" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "relation" "guardian_relation" NOT NULL,
    "cnic" TEXT,
    "phone" TEXT,
    "whatsapp" TEXT,
    "email" TEXT,
    "occupation" TEXT,
    "address" TEXT,
    "user_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "guardians_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "student_guardians" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "guardian_id" UUID NOT NULL,
    "is_primary" BOOLEAN NOT NULL DEFAULT false,
    "is_fee_payer" BOOLEAN NOT NULL DEFAULT false,
    "can_pickup" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "student_guardians_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "enrollments" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "session_id" UUID NOT NULL,
    "class_level_id" UUID NOT NULL,
    "section_id" UUID,
    "roll_no" INTEGER,
    "status" "enrollment_status" NOT NULL DEFAULT 'ENROLLED',
    "enrolled_on" DATE,
    "ended_on" DATE,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "enrollments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "academic_sessions_school_id_status_idx" ON "academic_sessions"("school_id", "status");

-- CreateIndex
CREATE INDEX "academic_sessions_school_id_is_current_idx" ON "academic_sessions"("school_id", "is_current");

-- CreateIndex
CREATE UNIQUE INDEX "academic_sessions_school_id_name_key" ON "academic_sessions"("school_id", "name");

-- CreateIndex
CREATE INDEX "class_levels_school_id_numeric_order_idx" ON "class_levels"("school_id", "numeric_order");

-- CreateIndex
CREATE UNIQUE INDEX "class_levels_school_id_name_key" ON "class_levels"("school_id", "name");

-- CreateIndex
CREATE INDEX "sections_school_id_session_id_idx" ON "sections"("school_id", "session_id");

-- CreateIndex
CREATE INDEX "sections_school_id_class_level_id_idx" ON "sections"("school_id", "class_level_id");

-- CreateIndex
CREATE UNIQUE INDEX "sections_school_id_session_id_class_level_id_name_key" ON "sections"("school_id", "session_id", "class_level_id", "name");

-- CreateIndex
CREATE INDEX "students_school_id_status_last_name_idx" ON "students"("school_id", "status", "last_name");

-- CreateIndex
CREATE INDEX "students_school_id_admission_no_idx" ON "students"("school_id", "admission_no");

-- CreateIndex
CREATE UNIQUE INDEX "students_school_id_admission_no_key" ON "students"("school_id", "admission_no");

-- CreateIndex
CREATE INDEX "guardians_school_id_name_idx" ON "guardians"("school_id", "name");

-- CreateIndex
CREATE INDEX "guardians_school_id_phone_idx" ON "guardians"("school_id", "phone");

-- CreateIndex
CREATE INDEX "student_guardians_school_id_student_id_idx" ON "student_guardians"("school_id", "student_id");

-- CreateIndex
CREATE INDEX "student_guardians_school_id_guardian_id_idx" ON "student_guardians"("school_id", "guardian_id");

-- CreateIndex
CREATE UNIQUE INDEX "student_guardians_school_id_student_id_guardian_id_key" ON "student_guardians"("school_id", "student_id", "guardian_id");

-- CreateIndex
CREATE INDEX "enrollments_school_id_session_id_section_id_idx" ON "enrollments"("school_id", "session_id", "section_id");

-- CreateIndex
CREATE INDEX "enrollments_school_id_student_id_idx" ON "enrollments"("school_id", "student_id");

-- CreateIndex
CREATE UNIQUE INDEX "enrollments_school_id_session_id_student_id_key" ON "enrollments"("school_id", "session_id", "student_id");

-- AddForeignKey
ALTER TABLE "academic_sessions" ADD CONSTRAINT "academic_sessions_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "class_levels" ADD CONSTRAINT "class_levels_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sections" ADD CONSTRAINT "sections_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sections" ADD CONSTRAINT "sections_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "academic_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sections" ADD CONSTRAINT "sections_class_level_id_fkey" FOREIGN KEY ("class_level_id") REFERENCES "class_levels"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "students" ADD CONSTRAINT "students_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "guardians" ADD CONSTRAINT "guardians_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_guardians" ADD CONSTRAINT "student_guardians_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_guardians" ADD CONSTRAINT "student_guardians_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_guardians" ADD CONSTRAINT "student_guardians_guardian_id_fkey" FOREIGN KEY ("guardian_id") REFERENCES "guardians"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "enrollments" ADD CONSTRAINT "enrollments_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "enrollments" ADD CONSTRAINT "enrollments_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "enrollments" ADD CONSTRAINT "enrollments_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "academic_sessions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "enrollments" ADD CONSTRAINT "enrollments_class_level_id_fkey" FOREIGN KEY ("class_level_id") REFERENCES "class_levels"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "enrollments" ADD CONSTRAINT "enrollments_section_id_fkey" FOREIGN KEY ("section_id") REFERENCES "sections"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- ===========================================================================
-- Hand-written below this line. Layer 3 for the Phase 1 tables.
--
-- CLAUDE.md: a tenant-scoped table ships with school_id NOT NULL, RLS enabled
-- AND forced with the tenant_isolation policy, a school_id-leading index, and
-- registration in TENANT_MODELS. The first three are here; the fourth is in
-- tenant-models.ts, and the structural gate fails the build if any is missing.
-- ===========================================================================

-- academic_sessions
ALTER TABLE "academic_sessions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "academic_sessions" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "academic_sessions"
  USING ("school_id" = current_school_id())
  WITH CHECK ("school_id" = current_school_id());

-- class_levels
ALTER TABLE "class_levels" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "class_levels" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "class_levels"
  USING ("school_id" = current_school_id())
  WITH CHECK ("school_id" = current_school_id());

-- sections
ALTER TABLE "sections" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "sections" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "sections"
  USING ("school_id" = current_school_id())
  WITH CHECK ("school_id" = current_school_id());

-- students
ALTER TABLE "students" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "students" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "students"
  USING ("school_id" = current_school_id())
  WITH CHECK ("school_id" = current_school_id());

-- guardians
ALTER TABLE "guardians" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "guardians" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "guardians"
  USING ("school_id" = current_school_id())
  WITH CHECK ("school_id" = current_school_id());

-- student_guardians
ALTER TABLE "student_guardians" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "student_guardians" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "student_guardians"
  USING ("school_id" = current_school_id())
  WITH CHECK ("school_id" = current_school_id());

-- enrollments
ALTER TABLE "enrollments" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "enrollments" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "enrollments"
  USING ("school_id" = current_school_id())
  WITH CHECK ("school_id" = current_school_id());

-- ---------------------------------------------------------------------------
-- Exactly one current session per school.
--
-- Prisma cannot express a partial unique index, and this rule genuinely needs
-- one: without it, two rows with is_current = true means every query that asks
-- "the current session" silently picks one at random, and half the product
-- reads a different year from the other half.
-- ---------------------------------------------------------------------------
CREATE UNIQUE INDEX academic_sessions_one_current_per_school
  ON "academic_sessions" ("school_id")
  WHERE "is_current";

-- ---------------------------------------------------------------------------
-- A roll number is unique within a section, when it is set at all.
--
-- Partial, because roll numbers are assigned after admission and a NULL must
-- not collide with another NULL.
-- ---------------------------------------------------------------------------
CREATE UNIQUE INDEX enrollments_roll_no_per_section
  ON "enrollments" ("school_id", "section_id", "roll_no")
  WHERE "section_id" IS NOT NULL AND "roll_no" IS NOT NULL;

-- ---------------------------------------------------------------------------
-- One primary guardian per student.
--
-- Reception rings "the parent"; there has to be exactly one answer to who that
-- is, and the database is the only place that can guarantee it.
-- ---------------------------------------------------------------------------
CREATE UNIQUE INDEX student_guardians_one_primary_per_student
  ON "student_guardians" ("school_id", "student_id")
  WHERE "is_primary";

-- ---------------------------------------------------------------------------
-- Fuzzy student search.
--
-- Reception searches by half-remembered names over the phone, so this is a
-- trigram index rather than a prefix one: "ahmd" must find "Ahmed".
-- ---------------------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX students_name_trgm
  ON "students" USING gin (("first_name" || ' ' || "last_name") gin_trgm_ops);

-- ---------------------------------------------------------------------------
-- Grants. Same shape as the Phase 0 tables: the application role gets ordinary
-- DML, and nothing on the platform tables.
-- ---------------------------------------------------------------------------
GRANT SELECT, INSERT, UPDATE, DELETE ON
  "academic_sessions", "class_levels", "sections",
  "students", "guardians", "student_guardians", "enrollments"
  TO ilm_app;

COMMENT ON TABLE "students" IS
  'The person. Which class they are in is an enrollment, because that changes yearly and the history is the transcript.';
COMMENT ON TABLE "enrollments" IS
  'One row per student per session. UNIQUE(school_id, session_id, student_id) is what stops a student being enrolled twice and billed twice.';
