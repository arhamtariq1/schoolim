-- Which classes a fee head applies to.
--
-- Zero rows for a head means every class (the historical default). One or more
-- rows is an allow-list used when the admission form builds a child's starting
-- fee structure.

CREATE TABLE "fee_head_class_levels" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "fee_head_id" UUID NOT NULL,
    "class_level_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),

    CONSTRAINT "fee_head_class_levels_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "fee_head_class_levels_school_id_fee_head_id_class_level_id_key"
  ON "fee_head_class_levels" ("school_id", "fee_head_id", "class_level_id");
CREATE INDEX "fee_head_class_levels_school_id_fee_head_id_idx"
  ON "fee_head_class_levels" ("school_id", "fee_head_id");
CREATE INDEX "fee_head_class_levels_school_id_class_level_id_idx"
  ON "fee_head_class_levels" ("school_id", "class_level_id");

ALTER TABLE "fee_head_class_levels"
  ADD CONSTRAINT "fee_head_class_levels_school_id_fkey"
  FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "fee_head_class_levels"
  ADD CONSTRAINT "fee_head_class_levels_fee_head_id_fkey"
  FOREIGN KEY ("fee_head_id") REFERENCES "fee_heads"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "fee_head_class_levels"
  ADD CONSTRAINT "fee_head_class_levels_class_level_id_fkey"
  FOREIGN KEY ("class_level_id") REFERENCES "class_levels"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "fee_head_class_levels" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "fee_head_class_levels" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "fee_head_class_levels"
  USING ("school_id" = current_school_id())
  WITH CHECK ("school_id" = current_school_id());

GRANT SELECT, INSERT, UPDATE, DELETE ON "fee_head_class_levels" TO ilm_app;

COMMENT ON TABLE "fee_head_class_levels" IS
  'Allow-list of classes for a fee head. Empty for a head means all classes.';
