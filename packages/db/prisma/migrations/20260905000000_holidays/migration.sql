-- ---------------------------------------------------------------------------
-- The school calendar — docs/07 §3.
--
-- Stored as **ranges, not one row per day**. "Summer vacation, 1 June to 15
-- August" is one thing a school declares and one thing it later edits; 76 rows
-- would turn "move the end date" into a delete-and-recreate that loses the
-- name, the type and whatever notes went with it. A single day is simply
-- start_date = end_date.
--
-- Attached to a session because a calendar belongs to an academic year: the
-- same date next year is a separate decision, and a holiday that outlived its
-- session would quietly close the school again twelve months later.
-- ---------------------------------------------------------------------------

CREATE TYPE "holiday_type" AS ENUM ('HOLIDAY', 'VACATION', 'EVENT');

-- An in-service training day closes the school to students and not to staff.
-- Attendance has to know the difference or it marks the whole roll absent.
CREATE TYPE "holiday_audience" AS ENUM ('ALL', 'STUDENTS', 'STAFF');

CREATE TABLE "holidays" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "session_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "type" "holiday_type" NOT NULL DEFAULT 'HOLIDAY',
    "applies_to" "holiday_audience" NOT NULL DEFAULT 'ALL',
    "start_date" DATE NOT NULL,
    "end_date" DATE NOT NULL,
    "notes" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "holidays_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "holidays_school_id_session_id_start_date_idx"
  ON "holidays" ("school_id", "session_id", "start_date");

ALTER TABLE "holidays"
  ADD CONSTRAINT "holidays_school_id_fkey"
  FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "holidays"
  ADD CONSTRAINT "holidays_session_id_fkey"
  FOREIGN KEY ("session_id") REFERENCES "academic_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- A range that ends before it starts is not a range. The application checks it
-- too; this is the check that cannot be bypassed by a future caller.
ALTER TABLE "holidays"
  ADD CONSTRAINT "holidays_range_ordered" CHECK ("end_date" >= "start_date");

-- ===========================================================================
-- Layer 3. CLAUDE.md: school_id NOT NULL, RLS enabled AND forced with the
-- tenant_isolation policy, a school_id-leading index, and registration in
-- TENANT_MODELS.
-- ===========================================================================
ALTER TABLE "holidays" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "holidays" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "holidays"
  USING ("school_id" = current_school_id())
  WITH CHECK ("school_id" = current_school_id());

GRANT SELECT, INSERT, UPDATE, DELETE ON "holidays" TO ilm_app;

COMMENT ON TABLE "holidays" IS
  'Non-teaching days as inclusive ranges, per session. start_date = end_date for a single day.';
