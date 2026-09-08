-- ---------------------------------------------------------------------------
-- Attendance — docs/modules/attendance-and-exams.md Part A.
--
-- Two subjects, one engine: students and staff. Separate tables rather than one
-- polymorphic one, because the statuses genuinely differ (a student is never on
-- "casual leave") and a nullable-FK-either-way table cannot express "exactly
-- one subject" to the database.
-- ---------------------------------------------------------------------------

-- ===========================================================================
-- 1. What counts as a school day.
--
-- Needed before any percentage can be honest. "Attendance 92%" means nothing
-- until the denominator is defined, and the denominator is: weekdays this
-- school runs, minus holidays, minus days the child was not yet enrolled.
--
-- Configuration rather than a constant, because Pakistani schools differ —
-- most run Monday to Saturday, some Monday to Friday, and a few close Friday
-- afternoons. A weekday list in the code is the school-specific branching
-- CLAUDE.md R1 forbids.
-- ===========================================================================
ALTER TABLE "schools"
  -- ISO day numbers: 1 = Monday … 7 = Sunday. Defaults to Monday–Saturday.
  ADD COLUMN "working_days" SMALLINT[] NOT NULL DEFAULT ARRAY[1,2,3,4,5,6]::SMALLINT[],
  -- How far back a teacher may mark without the `attendance.record.unlock`
  -- permission. Marking last March in December is a correction, not a record.
  ADD COLUMN "attendance_backdate_days" SMALLINT NOT NULL DEFAULT 7;

ALTER TABLE "schools" ADD CONSTRAINT "schools_working_days_valid"
  CHECK (
    array_length("working_days", 1) BETWEEN 1 AND 7
    AND "working_days" <@ ARRAY[1,2,3,4,5,6,7]::SMALLINT[]
  );

ALTER TABLE "schools" ADD CONSTRAINT "schools_attendance_backdate_days_sane"
  CHECK ("attendance_backdate_days" BETWEEN 0 AND 365);

-- ===========================================================================
-- 2. Statuses.
--
-- Deliberately two enums. A student marked CASUAL_LEAVE, or a janitor marked
-- EXCUSED, is a category error the database should refuse rather than a report
-- should explain.
-- ===========================================================================
CREATE TYPE "attendance_status" AS ENUM (
  'PRESENT', 'ABSENT', 'LATE', 'LEAVE', 'HALF_DAY', 'EXCUSED'
);

CREATE TYPE "staff_attendance_status" AS ENUM (
  'PRESENT', 'ABSENT', 'LATE', 'SICK_LEAVE', 'CASUAL_LEAVE', 'HALF_DAY'
);

-- ===========================================================================
-- 3. Student attendance.
--
-- Partitioned by month **from the first migration**, per docs §7: 500 students
-- × 200 days is 100k rows per school per year, and a hundred schools make that
-- 10M. Adding partitioning to a live table of that size means rewriting it
-- under a lock; adding it now costs nothing.
--
-- `period` is present and defaults to 0 for the DAILY mode every school starts
-- in. It is in the unique key so that PERIOD_WISE marking — docs §2 says build
-- it as a flag, not an engine — is a setting later rather than a migration
-- against a table with millions of rows.
-- ===========================================================================
CREATE TABLE "attendance_records" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "school_id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "session_id" UUID NOT NULL,
    "class_level_id" UUID NOT NULL,
    -- Denormalised from the enrolment so the daily register does not join, and
    -- so that moving a child between sections does not rewrite their history.
    "section_id" UUID,
    "date" DATE NOT NULL,
    "period" SMALLINT NOT NULL DEFAULT 0,
    "status" "attendance_status" NOT NULL,
    "note" TEXT,
    "marked_by" UUID,
    "marked_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    -- The partition key has to be in every unique constraint, `date` included.
    CONSTRAINT "attendance_records_pkey" PRIMARY KEY ("id", "date")
) PARTITION BY RANGE ("date");

-- The guarantee against double-marking. Submitting the same section twice
-- updates rather than duplicating, because this index refuses the second row.
CREATE UNIQUE INDEX "attendance_records_school_student_date_period_key"
  ON "attendance_records" ("school_id", "student_id", "date", "period");

-- The marking screen and the daily register: one section, one day.
CREATE INDEX "attendance_records_school_section_date_idx"
  ON "attendance_records" ("school_id", "section_id", "date");
-- The class report: one class, one month.
CREATE INDEX "attendance_records_school_class_date_idx"
  ON "attendance_records" ("school_id", "class_level_id", "date");
-- "Who was absent today", across the school.
CREATE INDEX "attendance_records_school_date_status_idx"
  ON "attendance_records" ("school_id", "date", "status");

ALTER TABLE "attendance_records"
  ADD CONSTRAINT "attendance_records_school_id_fkey"
  FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "attendance_records"
  ADD CONSTRAINT "attendance_records_student_id_fkey"
  FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "attendance_records"
  ADD CONSTRAINT "attendance_records_session_id_fkey"
  FOREIGN KEY ("session_id") REFERENCES "academic_sessions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "attendance_records"
  ADD CONSTRAINT "attendance_records_class_level_id_fkey"
  FOREIGN KEY ("class_level_id") REFERENCES "class_levels"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "attendance_records"
  ADD CONSTRAINT "attendance_records_section_id_fkey"
  FOREIGN KEY ("section_id") REFERENCES "sections"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "attendance_records" ADD CONSTRAINT "attendance_records_period_sane"
  CHECK ("period" >= 0 AND "period" <= 12);

-- ===========================================================================
-- 4. Staff attendance.
--
-- Not partitioned, and that is a considered difference rather than an
-- oversight: a school has forty staff against two thousand children, so this
-- table is roughly fifty times smaller and will not reach the size where
-- partitioning pays for its complexity. If a chain ever changes that, adding it
-- then is a migration over thousands of rows, not millions.
-- ===========================================================================
CREATE TABLE "staff_attendance_records" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "school_id" UUID NOT NULL,
    "staff_id" UUID NOT NULL,
    "date" DATE NOT NULL,
    "status" "staff_attendance_status" NOT NULL,
    -- Optional, for the schools that track hours. Biometric import (docs §4)
    -- fills these later through the same table.
    "checked_in_at" TIMESTAMPTZ(6),
    "checked_out_at" TIMESTAMPTZ(6),
    "note" TEXT,
    "marked_by" UUID,
    "marked_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "staff_attendance_records_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "staff_attendance_records_school_staff_date_key"
  ON "staff_attendance_records" ("school_id", "staff_id", "date");
CREATE INDEX "staff_attendance_records_school_date_idx"
  ON "staff_attendance_records" ("school_id", "date");
CREATE INDEX "staff_attendance_records_school_staff_date_idx"
  ON "staff_attendance_records" ("school_id", "staff_id", "date" DESC);

ALTER TABLE "staff_attendance_records"
  ADD CONSTRAINT "staff_attendance_records_school_id_fkey"
  FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "staff_attendance_records"
  ADD CONSTRAINT "staff_attendance_records_staff_id_fkey"
  FOREIGN KEY ("staff_id") REFERENCES "staff"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Checking out before checking in is a typo, and it silently poisons any hours
-- report built on top of it.
ALTER TABLE "staff_attendance_records" ADD CONSTRAINT "staff_attendance_records_times_ordered"
  CHECK (
    "checked_in_at" IS NULL OR "checked_out_at" IS NULL
    OR "checked_out_at" >= "checked_in_at"
  );

-- ===========================================================================
-- 5. Partitions, each secured on its own.
--
-- RLS on a partitioned parent does NOT protect a partition queried directly —
-- the lesson `20260825010000_rls_on_audit_partitions` was written to fix. The
-- helper below is generic and is what the monthly maintenance job must call,
-- so a partition created next year cannot be created unprotected.
-- ===========================================================================
CREATE OR REPLACE FUNCTION secure_tenant_partition(partition_name text) RETURNS void
  LANGUAGE plpgsql
  AS $$
BEGIN
  EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', partition_name);
  EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', partition_name);

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = partition_name AND policyname = 'tenant_isolation'
  ) THEN
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON %I USING (school_id = current_school_id()) WITH CHECK (school_id = current_school_id())',
      partition_name
    );
  END IF;
END
$$;

COMMENT ON FUNCTION secure_tenant_partition(text) IS
  'Enable, force and police RLS on one partition. Every partition of a tenant table must be passed through this, including ones created by the maintenance job.';

-- Creates the month partition for a date if it does not exist, and secures it.
CREATE OR REPLACE FUNCTION ensure_attendance_partition(for_date date) RETURNS text
  LANGUAGE plpgsql
  AS $$
DECLARE
  month_start date := date_trunc('month', for_date)::date;
  part_name   text := 'attendance_records_' || to_char(month_start, 'YYYY_MM');
BEGIN
  EXECUTE format(
    'CREATE TABLE IF NOT EXISTS %I PARTITION OF attendance_records FOR VALUES FROM (%L) TO (%L)',
    part_name,
    month_start,
    (month_start + interval '1 month')::date
  );
  PERFORM secure_tenant_partition(part_name);
  RETURN part_name;
END
$$;

-- A DEFAULT partition so an insert can never fail for want of one. The
-- maintenance job creates months ahead of time; this is the safety net, and it
-- is secured like any other.
CREATE TABLE "attendance_records_default" PARTITION OF "attendance_records" DEFAULT;
SELECT secure_tenant_partition('attendance_records_default');

-- Twelve months back and twelve ahead. Back as well as forward because a
-- school onboarding mid-year imports the register it already kept on paper.
DO $$
DECLARE
  m date;
BEGIN
  FOR i IN -12..12 LOOP
    m := (date_trunc('month', now())::date + (i || ' month')::interval)::date;
    PERFORM ensure_attendance_partition(m);
  END LOOP;
END
$$;

-- ===========================================================================
-- 6. Layer 3. CLAUDE.md: school_id NOT NULL, RLS enabled AND forced with the
-- tenant_isolation policy, a school_id-leading index, and registration in
-- TENANT_MODELS.
-- ===========================================================================
ALTER TABLE "attendance_records" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "attendance_records" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "attendance_records"
  USING ("school_id" = current_school_id())
  WITH CHECK ("school_id" = current_school_id());

ALTER TABLE "staff_attendance_records" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "staff_attendance_records" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "staff_attendance_records"
  USING ("school_id" = current_school_id())
  WITH CHECK ("school_id" = current_school_id());

GRANT SELECT, INSERT, UPDATE, DELETE ON
  "attendance_records", "staff_attendance_records" TO ilm_app;

COMMENT ON TABLE "attendance_records" IS
  'One mark for one student on one day. Range-partitioned by month; every partition carries its own RLS.';
COMMENT ON COLUMN "attendance_records"."section_id" IS
  'Denormalised at marking time, so moving a child between sections does not rewrite the register behind them.';
COMMENT ON TABLE "staff_attendance_records" IS
  'The same engine as student attendance, different subject and a different set of statuses.';
