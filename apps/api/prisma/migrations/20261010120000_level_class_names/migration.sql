-- Custom O-Level / A-Level class labels per school (defaults applied in app when empty).
ALTER TABLE "schools"
  ADD COLUMN "o_level_class_names" text[] NOT NULL DEFAULT ARRAY[]::text[],
  ADD COLUMN "a_level_class_names" text[] NOT NULL DEFAULT ARRAY[]::text[];

GRANT UPDATE ("o_level_class_names", "a_level_class_names") ON "schools" TO ilm_app;
