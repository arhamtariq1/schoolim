-- Requests and concerns (ADR-0016), and the notifications that point at them.
--
-- `requests` is a ticket: category, subject, description, an optional child, a
-- priority, a status and an assignee. `request_events` is its timeline —
-- raised, message, status change, assignment — and is APPEND-ONLY for the
-- application role (SELECT, INSERT), so who said or changed what cannot be
-- edited. `request_attachments` holds pictures through the storage port
-- (ADR-0013), always the private asset kind. `notifications` backs the header
-- bell, which was hard-coded sample data.
--
-- Every table carries school_id, RLS enabled and forced with the
-- tenant_isolation policy, and an index whose leading column is school_id.
--
-- Erasure (docs/17 s4):
--   requests, request_events    life of the relationship + 1 year; redacted when
--                               a per-student erasure runs on the child they name
--                               (a runbook on the owner connection — the app role
--                               cannot UPDATE events); deleted with the tenant.
--   request_attachments         life of the relationship + 1 year; with its request.
--   notifications               90 days after read; with the user; with the tenant.
--
-- Reversal (forward-only; manual rollback):
--   DROP TABLE "notifications"; DROP TABLE "request_attachments";
--   DROP TABLE "request_events"; DROP TABLE "requests";
--   DROP TYPE "request_event_kind"; DROP TYPE "request_status";
--   DROP TYPE "request_priority"; DROP TYPE "request_category";

CREATE TYPE "request_category" AS ENUM (
  'LEAVE', 'FEE', 'ACADEMIC', 'DOCUMENT', 'TRANSPORT', 'COMPLAINT', 'CONCERN', 'OTHER'
);
CREATE TYPE "request_priority" AS ENUM ('LOW', 'NORMAL', 'HIGH', 'URGENT');
CREATE TYPE "request_status" AS ENUM ('PENDING', 'IN_PROGRESS', 'RESOLVED', 'REJECTED', 'REOPENED');
CREATE TYPE "request_event_kind" AS ENUM ('CREATED', 'MESSAGE', 'STATUS_CHANGED', 'ASSIGNED');

-- --- requests -----------------------------------------------------------------

CREATE TABLE "requests" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "request_no" TEXT NOT NULL,
    "created_by" UUID NOT NULL,
    "requester_role" TEXT NOT NULL,
    "category" "request_category" NOT NULL,
    "priority" "request_priority" NOT NULL DEFAULT 'NORMAL',
    "status" "request_status" NOT NULL DEFAULT 'PENDING',
    "subject" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "student_id" UUID,
    "assigned_to" UUID,
    "resolved_at" TIMESTAMPTZ(6),
    "last_activity_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
    "idempotency_key" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    CONSTRAINT "requests_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "requests_subject_length" CHECK (char_length("subject") BETWEEN 3 AND 120),
    CONSTRAINT "requests_description_length" CHECK (char_length("description") BETWEEN 1 AND 4000),
    -- Resolved means a resolution time, and only resolved does. Reopening clears
    -- it, so a request that comes back is not still "resolved at" anything.
    CONSTRAINT "requests_resolved_at_matches_status"
      CHECK (("status" = 'RESOLVED') = ("resolved_at" IS NOT NULL))
);

CREATE UNIQUE INDEX "requests_school_id_request_no_key" ON "requests" ("school_id", "request_no");
-- NULLs are distinct in a unique index, so requests without a key never collide.
CREATE UNIQUE INDEX "requests_school_id_created_by_idempotency_key_key"
  ON "requests" ("school_id", "created_by", "idempotency_key");
CREATE INDEX "requests_school_id_status_last_activity_at_idx"
  ON "requests" ("school_id", "status", "last_activity_at");
CREATE INDEX "requests_school_id_created_by_last_activity_at_idx"
  ON "requests" ("school_id", "created_by", "last_activity_at");
CREATE INDEX "requests_school_id_assigned_to_idx" ON "requests" ("school_id", "assigned_to");
CREATE INDEX "requests_school_id_student_id_idx" ON "requests" ("school_id", "student_id");

ALTER TABLE "requests" ADD CONSTRAINT "requests_school_id_fkey"
  FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;
-- NO ACTION, not RESTRICT: checked at the end of the statement, so deleting a
-- whole school (which cascades to its users and its requests) still works,
-- while a lone user who has raised a request cannot be hard-deleted. Users are
-- soft-deleted; that is the path.
ALTER TABLE "requests" ADD CONSTRAINT "requests_created_by_fkey"
  FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE CASCADE;
ALTER TABLE "requests" ADD CONSTRAINT "requests_assigned_to_fkey"
  FOREIGN KEY ("assigned_to") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "requests" ADD CONSTRAINT "requests_student_id_fkey"
  FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- --- request_events (append-only) ---------------------------------------------

CREATE TABLE "request_events" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "request_id" UUID NOT NULL,
    "kind" "request_event_kind" NOT NULL,
    "actor_id" UUID NOT NULL,
    "body" TEXT,
    "from_status" "request_status",
    "to_status" "request_status",
    "assignee_id" UUID,
    "idempotency_key" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
    CONSTRAINT "request_events_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "request_events_body_length" CHECK ("body" IS NULL OR char_length("body") <= 4000),
    -- A message says something.
    CONSTRAINT "request_events_message_has_body"
      CHECK ("kind" <> 'MESSAGE' OR ("body" IS NOT NULL AND char_length("body") >= 1)),
    -- A status change names both ends of the move; nothing else carries either.
    CONSTRAINT "request_events_status_change_shape"
      CHECK (
        ("kind" = 'STATUS_CHANGED' AND "from_status" IS NOT NULL AND "to_status" IS NOT NULL)
        OR ("kind" <> 'STATUS_CHANGED' AND "from_status" IS NULL AND "to_status" IS NULL)
      )
);

CREATE UNIQUE INDEX "request_events_school_id_actor_id_idempotency_key_key"
  ON "request_events" ("school_id", "actor_id", "idempotency_key");
CREATE INDEX "request_events_school_id_request_id_created_at_idx"
  ON "request_events" ("school_id", "request_id", "created_at");

ALTER TABLE "request_events" ADD CONSTRAINT "request_events_school_id_fkey"
  FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "request_events" ADD CONSTRAINT "request_events_request_id_fkey"
  FOREIGN KEY ("request_id") REFERENCES "requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "request_events" ADD CONSTRAINT "request_events_actor_id_fkey"
  FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE CASCADE;
ALTER TABLE "request_events" ADD CONSTRAINT "request_events_assignee_id_fkey"
  FOREIGN KEY ("assignee_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- --- request_attachments (append-only) ----------------------------------------

CREATE TABLE "request_attachments" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "request_id" UUID NOT NULL,
    "event_id" UUID NOT NULL,
    "uploaded_by" UUID NOT NULL,
    "file_name" TEXT NOT NULL,
    "mime_type" TEXT NOT NULL,
    "byte_size" INTEGER NOT NULL,
    "etag" TEXT NOT NULL,
    "bytes" BYTEA,
    "storage_provider" TEXT NOT NULL DEFAULT 'database',
    "storage_key" TEXT NOT NULL,
    "storage_url" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
    CONSTRAINT "request_attachments_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "request_attachments_file_name_length" CHECK (char_length("file_name") BETWEEN 1 AND 120),
    CONSTRAINT "request_attachments_mime_type_known"
      CHECK ("mime_type" IN ('image/png', 'image/jpeg', 'image/webp')),
    -- Mirrors the catalogue's ceiling for the kind (512 KB).
    CONSTRAINT "request_attachments_byte_size_range" CHECK ("byte_size" BETWEEN 1 AND 524288),
    -- Same rule as school_logos: the bytes are here, or they are somewhere with
    -- an address.
    CONSTRAINT "request_attachments_bytes_or_remote"
      CHECK (
        ("storage_provider" = 'database' AND "bytes" IS NOT NULL)
        OR ("storage_provider" <> 'database' AND "storage_url" IS NOT NULL)
      )
);

CREATE INDEX "request_attachments_school_id_request_id_idx"
  ON "request_attachments" ("school_id", "request_id");
CREATE INDEX "request_attachments_school_id_event_id_idx"
  ON "request_attachments" ("school_id", "event_id");

ALTER TABLE "request_attachments" ADD CONSTRAINT "request_attachments_school_id_fkey"
  FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "request_attachments" ADD CONSTRAINT "request_attachments_request_id_fkey"
  FOREIGN KEY ("request_id") REFERENCES "requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "request_attachments" ADD CONSTRAINT "request_attachments_event_id_fkey"
  FOREIGN KEY ("event_id") REFERENCES "request_events"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "request_attachments" ADD CONSTRAINT "request_attachments_uploaded_by_fkey"
  FOREIGN KEY ("uploaded_by") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- --- notifications ------------------------------------------------------------

CREATE TABLE "notifications" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "kind" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT,
    "entity_type" TEXT,
    "entity_id" UUID,
    "read_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "notifications_title_length" CHECK (char_length("title") BETWEEN 1 AND 200),
    CONSTRAINT "notifications_body_length" CHECK ("body" IS NULL OR char_length("body") <= 400),
    -- A pointer names what it points at completely, or not at all.
    CONSTRAINT "notifications_entity_pair" CHECK (("entity_type" IS NULL) = ("entity_id" IS NULL))
);

CREATE INDEX "notifications_school_id_user_id_created_at_idx"
  ON "notifications" ("school_id", "user_id", "created_at");
CREATE INDEX "notifications_school_id_user_id_read_at_idx"
  ON "notifications" ("school_id", "user_id", "read_at");

ALTER TABLE "notifications" ADD CONSTRAINT "notifications_school_id_fkey"
  FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- --- Tenant isolation ---------------------------------------------------------

ALTER TABLE "requests" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "requests" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "requests"
  USING ("school_id" = current_school_id()) WITH CHECK ("school_id" = current_school_id());

ALTER TABLE "request_events" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "request_events" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "request_events"
  USING ("school_id" = current_school_id()) WITH CHECK ("school_id" = current_school_id());

ALTER TABLE "request_attachments" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "request_attachments" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "request_attachments"
  USING ("school_id" = current_school_id()) WITH CHECK ("school_id" = current_school_id());

ALTER TABLE "notifications" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "notifications" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "notifications"
  USING ("school_id" = current_school_id()) WITH CHECK ("school_id" = current_school_id());

-- --- Grants -------------------------------------------------------------------

-- A request changes state, so it is updated; it is never deleted by the app.
GRANT SELECT, INSERT, UPDATE ON "requests" TO ilm_app;
-- The timeline and its pictures are history: written once.
GRANT SELECT, INSERT ON "request_events", "request_attachments" TO ilm_app;
-- A notification is marked read, and purged on its schedule.
GRANT SELECT, INSERT, UPDATE, DELETE ON "notifications" TO ilm_app;

COMMENT ON TABLE "requests" IS 'A parent or teacher concern raised with the school. State machine in @ilm/contracts. ADR-0016.';
COMMENT ON TABLE "request_events" IS 'Append-only timeline of a request: raised, message, status change, assignment.';
COMMENT ON TABLE "request_attachments" IS 'Pictures on a request or reply. Private asset kind; bytes stay in the database. Append-only.';
COMMENT ON TABLE "notifications" IS 'The header bell. A pointer to something that happened, for one user. Purged 90 days after read.';
