-- Where an uploaded file actually lives.
--
-- ## Why the provider is on the row and not in configuration
--
-- A deployment that turns Cloudinary on still has every logo uploaded before
-- it, and one that turns it off still has every logo uploaded during. If
-- reading dispatched on the *configured* driver, either change would blank
-- every school's letterhead at once — and quietly, because nothing errors when
-- an image 404s. So each row records the provider that wrote it, and reading
-- follows the row. See ADR-0013.
--
-- ## Why `bytes` becomes nullable
--
-- It was the storage. Now it is one of two storages: rows written by the
-- database driver carry bytes and no key; rows written by a remote driver carry
-- a key and a URL and no bytes. The check constraint below is what stops a row
-- being neither — which would be an asset that exists in the table and nowhere
-- else, rendering as a broken image with nothing to explain it.
--
-- ## Retention (CLAUDE.md, docs/17 s4)
--
-- Unchanged: erased with the school by `ON DELETE CASCADE`. Remote objects are
-- deleted by the application when the row goes, and their keys are derived from
-- the school id, so a sweep of a deleted tenant's files needs no index of them.

ALTER TABLE "school_logos"
  ALTER COLUMN "bytes" DROP NOT NULL;

ALTER TABLE "school_logos"
  -- Defaulted to 'database', which is what every existing row is: they were
  -- written when Postgres was the only storage there was.
  ADD COLUMN "storage_provider" text NOT NULL DEFAULT 'database',
  -- The driver's own address for the bytes. Opaque to SQL.
  ADD COLUMN "storage_key" text,
  -- The delivery URL, so serving an image costs no round trip to the provider.
  ADD COLUMN "storage_url" text;

-- Backfill before the constraint goes on, or the ALTER fails on the first row.
UPDATE "school_logos"
   SET "storage_key" = 'db:' || "school_id"::text || ':' ||
                       CASE WHEN "kind" = 'BANK' THEN 'BANK_LOGO' ELSE 'SCHOOL_LOGO' END
 WHERE "storage_key" IS NULL;

ALTER TABLE "school_logos"
  ALTER COLUMN "storage_key" SET NOT NULL;

-- Either the bytes are here, or they are somewhere a URL points at. Never
-- neither: that is an asset the product believes it has and cannot serve.
ALTER TABLE "school_logos"
  ADD CONSTRAINT "school_logos_bytes_or_remote"
    CHECK (
      ("storage_provider" = 'database' AND "bytes" IS NOT NULL)
      OR ("storage_provider" <> 'database' AND "storage_url" IS NOT NULL)
    );
