-- A school's logo, in its own table.
--
-- ## Why a table and not a column on `schools`
--
-- `schools` is read on nearly every request — the tenant resolver, the late-fee
-- rate, the timezone. A `bytea` column there is bytes that travel with all of
-- it the first time somebody writes `select: { ... }` without thinking, and the
-- symptom is a portal that gets slower for no visible reason. In its own table
-- the bytes are loaded when, and only when, the logo is asked for.
--
-- ## Why the bytes are in Postgres at all
--
-- Object storage is not chosen yet, and an upload button that does nothing is
-- worse than no upload button. A school logo is a few tens of kilobytes, the
-- size is capped in the contract, and one row per school is not a workload.
--
-- Moving to S3 or R2 later is a change to `SchoolLogoService` and nothing else:
-- the URL the portal uses — `/api/v1/schools/logo` — is already an endpoint
-- rather than a storage path, so no markup, no email and no PDF has a vendor's
-- hostname baked into it.
CREATE TABLE "school_logos" (
  "id"         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- One logo per school, so the school is the key rather than a row it points
  -- at. An upload replaces; there is no version history to keep.
  "school_id"  uuid NOT NULL UNIQUE REFERENCES "schools"("id") ON DELETE CASCADE,
  "bytes"      bytea NOT NULL,
  "mime_type"  text NOT NULL,
  -- What the browser sends back as `If-None-Match`, so a logo on every page of
  -- the portal is one request per change rather than one per navigation.
  "etag"       text NOT NULL,
  "byte_size"  integer NOT NULL,
  "created_by" uuid,
  "created_at" timestamptz(6) NOT NULL DEFAULT now(),
  "updated_at" timestamptz(6) NOT NULL DEFAULT now(),

  -- Belt and braces against the contract's own cap: 512 KB, whatever a client
  -- claims. A `bytea` with no ceiling is a table that grows until somebody
  -- notices.
  CONSTRAINT "school_logos_size_within_limit"
    CHECK ("byte_size" > 0 AND "byte_size" <= 524288),
  -- Raster only, and only the three formats every browser renders. No SVG:
  -- an SVG is a script that happens to draw, and this one is served back to
  -- every user of the school.
  CONSTRAINT "school_logos_mime_allowed"
    CHECK ("mime_type" IN ('image/png', 'image/jpeg', 'image/webp'))
);

CREATE INDEX "school_logos_school_id_idx" ON "school_logos" ("school_id");

ALTER TABLE "school_logos" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "school_logos" FORCE ROW LEVEL SECURITY;

CREATE POLICY "tenant_isolation" ON "school_logos"
  USING ("school_id" = current_school_id())
  WITH CHECK ("school_id" = current_school_id());

GRANT SELECT, INSERT, UPDATE, DELETE ON "school_logos" TO ilm_app;
