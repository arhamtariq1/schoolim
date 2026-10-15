-- Which classes a teacher takes.
--
-- This is the data a TEACHER's scoped grants compile into (docs/08 §5, ADR-0016).
-- Zero rows for a teacher means NO access to any class — the opposite default to
-- fee_head_class_levels, because a missing row here must fail closed.
--
-- Reversal (forward-only migrations; this is the manual rollback):
--   DROP TABLE "staff_class_assignments";

CREATE TABLE "staff_class_assignments" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "staff_id" UUID NOT NULL,
    "class_level_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),

    CONSTRAINT "staff_class_assignments_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "staff_class_assignments_school_id_staff_id_class_level_id_key"
  ON "staff_class_assignments" ("school_id", "staff_id", "class_level_id");
CREATE INDEX "staff_class_assignments_school_id_staff_id_idx"
  ON "staff_class_assignments" ("school_id", "staff_id");
CREATE INDEX "staff_class_assignments_school_id_class_level_id_idx"
  ON "staff_class_assignments" ("school_id", "class_level_id");

ALTER TABLE "staff_class_assignments"
  ADD CONSTRAINT "staff_class_assignments_school_id_fkey"
  FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "staff_class_assignments"
  ADD CONSTRAINT "staff_class_assignments_staff_id_fkey"
  FOREIGN KEY ("staff_id") REFERENCES "staff"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "staff_class_assignments"
  ADD CONSTRAINT "staff_class_assignments_class_level_id_fkey"
  FOREIGN KEY ("class_level_id") REFERENCES "class_levels"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "staff_class_assignments" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "staff_class_assignments" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "staff_class_assignments"
  USING ("school_id" = current_school_id())
  WITH CHECK ("school_id" = current_school_id());

GRANT SELECT, INSERT, UPDATE, DELETE ON "staff_class_assignments" TO ilm_app;

COMMENT ON TABLE "staff_class_assignments" IS
  'Classes a teacher takes. Access grant, not history: deleted when the teacher is removed or changes role. No rows = no access.';
