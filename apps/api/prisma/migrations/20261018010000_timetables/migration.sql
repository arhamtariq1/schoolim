-- Timetables (ADR-0017): weekly class periods and dated tests and exams.
--
-- `timetables` is one schedule for a class (or one section of it) in a session,
-- either CLASS (weekly periods) or ASSESSMENT (dated papers), DRAFT until the
-- office publishes it. `timetable_entries` are its periods or papers: a weekday
-- or a date, a start and end time, optionally a subject, a teacher and a room.
--
-- The calendar reads these tables; there is deliberately no calendar copy.
--
-- Both tables carry school_id, RLS enabled and forced with the tenant_isolation
-- policy, and an index whose leading column is school_id.
--
-- Erasure (docs/17 s4): not personal data. Kept for the life of the school and
-- deleted with the tenant (ON DELETE CASCADE from schools). A removed teacher
-- leaves an entry unassigned (SET NULL) rather than deleting the period.
--
-- Reversal (forward-only; manual rollback):
--   DROP TABLE "timetable_entries"; DROP TABLE "timetables";
--   DROP TYPE "timetable_status"; DROP TYPE "timetable_kind";

CREATE TYPE "timetable_kind" AS ENUM ('CLASS', 'ASSESSMENT');
CREATE TYPE "timetable_status" AS ENUM ('DRAFT', 'PUBLISHED');

CREATE TABLE "timetables" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "session_id" UUID NOT NULL,
    "class_level_id" UUID NOT NULL,
    "section_id" UUID,
    "kind" "timetable_kind" NOT NULL,
    "assessment_type_id" UUID,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "status" "timetable_status" NOT NULL DEFAULT 'DRAFT',
    "starts_on" DATE,
    "ends_on" DATE,
    "published_at" TIMESTAMPTZ(6),
    "created_by" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    CONSTRAINT "timetables_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "timetables_title_length" CHECK (char_length("title") BETWEEN 3 AND 120),
    CONSTRAINT "timetables_description_length" CHECK ("description" IS NULL OR char_length("description") <= 1000),
    -- An assessment timetable names its type; a class timetable has none.
    CONSTRAINT "timetables_assessment_type_matches_kind"
      CHECK (("kind" = 'ASSESSMENT') = ("assessment_type_id" IS NOT NULL)),
    -- Published means a publication time, and only published does.
    CONSTRAINT "timetables_published_at_matches_status"
      CHECK (("status" = 'PUBLISHED') = ("published_at" IS NOT NULL)),
    CONSTRAINT "timetables_dates_in_order"
      CHECK ("starts_on" IS NULL OR "ends_on" IS NULL OR "ends_on" >= "starts_on")
);

CREATE INDEX "timetables_school_id_session_id_class_level_id_idx"
  ON "timetables" ("school_id", "session_id", "class_level_id");
CREATE INDEX "timetables_school_id_status_updated_at_idx"
  ON "timetables" ("school_id", "status", "updated_at");
CREATE INDEX "timetables_school_id_kind_idx" ON "timetables" ("school_id", "kind");

ALTER TABLE "timetables" ADD CONSTRAINT "timetables_school_id_fkey"
  FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "timetables" ADD CONSTRAINT "timetables_session_id_fkey"
  FOREIGN KEY ("session_id") REFERENCES "academic_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "timetables" ADD CONSTRAINT "timetables_class_level_id_fkey"
  FOREIGN KEY ("class_level_id") REFERENCES "class_levels"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "timetables" ADD CONSTRAINT "timetables_section_id_fkey"
  FOREIGN KEY ("section_id") REFERENCES "sections"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "timetables" ADD CONSTRAINT "timetables_assessment_type_id_fkey"
  FOREIGN KEY ("assessment_type_id") REFERENCES "assessment_types"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "timetable_entries" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "timetable_id" UUID NOT NULL,
    "subject_id" UUID,
    "teacher_id" UUID,
    "room" TEXT,
    "day_of_week" SMALLINT,
    "on_date" DATE,
    "start_time" TEXT NOT NULL,
    "end_time" TEXT NOT NULL,
    "notes" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
    CONSTRAINT "timetable_entries_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "timetable_entries_day_of_week_range" CHECK ("day_of_week" IS NULL OR "day_of_week" BETWEEN 1 AND 7),
    -- A weekly period or a dated paper: exactly one of the two.
    CONSTRAINT "timetable_entries_weekday_or_date" CHECK (("day_of_week" IS NULL) <> ("on_date" IS NULL)),
    CONSTRAINT "timetable_entries_time_format"
      CHECK (
        "start_time" ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
        AND "end_time" ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
      ),
    CONSTRAINT "timetable_entries_time_order" CHECK ("end_time" > "start_time"),
    CONSTRAINT "timetable_entries_room_length" CHECK ("room" IS NULL OR char_length("room") <= 60),
    CONSTRAINT "timetable_entries_notes_length" CHECK ("notes" IS NULL OR char_length("notes") <= 500)
);

CREATE INDEX "timetable_entries_school_id_timetable_id_idx" ON "timetable_entries" ("school_id", "timetable_id");
CREATE INDEX "timetable_entries_school_id_teacher_id_day_of_week_idx"
  ON "timetable_entries" ("school_id", "teacher_id", "day_of_week");
CREATE INDEX "timetable_entries_school_id_teacher_id_on_date_idx"
  ON "timetable_entries" ("school_id", "teacher_id", "on_date");
CREATE INDEX "timetable_entries_school_id_on_date_idx" ON "timetable_entries" ("school_id", "on_date");

ALTER TABLE "timetable_entries" ADD CONSTRAINT "timetable_entries_school_id_fkey"
  FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "timetable_entries" ADD CONSTRAINT "timetable_entries_timetable_id_fkey"
  FOREIGN KEY ("timetable_id") REFERENCES "timetables"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "timetable_entries" ADD CONSTRAINT "timetable_entries_subject_id_fkey"
  FOREIGN KEY ("subject_id") REFERENCES "subjects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "timetable_entries" ADD CONSTRAINT "timetable_entries_teacher_id_fkey"
  FOREIGN KEY ("teacher_id") REFERENCES "staff"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- --- Tenant isolation ---------------------------------------------------------

ALTER TABLE "timetables" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "timetables" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "timetables"
  USING ("school_id" = current_school_id()) WITH CHECK ("school_id" = current_school_id());

ALTER TABLE "timetable_entries" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "timetable_entries" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "timetable_entries"
  USING ("school_id" = current_school_id()) WITH CHECK ("school_id" = current_school_id());

-- Editing a timetable replaces its entries, so both tables are ordinary
-- read-write tables for the application role.
GRANT SELECT, INSERT, UPDATE, DELETE ON "timetables", "timetable_entries" TO ilm_app;

COMMENT ON TABLE "timetables" IS 'A class or assessment schedule, DRAFT or PUBLISHED. The calendar reads it. ADR-0017.';
COMMENT ON TABLE "timetable_entries" IS 'One weekly period or one dated paper of a timetable.';
