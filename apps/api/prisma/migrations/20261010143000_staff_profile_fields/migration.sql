-- Staff profile: address, photo, CV (optional); CNIC already exists.
ALTER TABLE "staff"
  ADD COLUMN IF NOT EXISTS "address" TEXT,
  ADD COLUMN IF NOT EXISTS "photo_url" TEXT,
  ADD COLUMN IF NOT EXISTS "cv_url" TEXT;

COMMENT ON COLUMN "staff"."address" IS 'Residential or mailing address on the employment record.';
COMMENT ON COLUMN "staff"."photo_url" IS 'Staff photograph URL or stored asset reference.';
COMMENT ON COLUMN "staff"."cv_url" IS 'CV / resume URL or stored asset reference.';
