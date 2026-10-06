-- School levels offered (primary, secondary, etc.) — set at onboarding, editable in settings.
ALTER TABLE "schools"
  ADD COLUMN "school_levels" text[] NOT NULL DEFAULT ARRAY[]::text[];

GRANT UPDATE ("school_levels") ON "schools" TO ilm_app;

-- Onboarding may persist street address (column existed; grant came from settings migration).
GRANT UPDATE ("address") ON "schools" TO ilm_app;
