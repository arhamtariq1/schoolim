-- ---------------------------------------------------------------------------
-- First-login profile gate.
--
-- New self-serve owners land with no profile yet and must complete
-- `/profile/create` before the rest of the portal unlocks. Existing accounts
-- are grandfathered: they already work, and forcing them through a form they
-- never asked for would be a worse onboarding than leaving them alone.
-- ---------------------------------------------------------------------------

ALTER TABLE "users" ADD COLUMN "profile_completed_at" TIMESTAMPTZ(6);
ALTER TABLE "users" ADD COLUMN "designation" TEXT;

COMMENT ON COLUMN "users"."profile_completed_at" IS
  'When this person finished the first-login profile form. Null means the portal must keep them on /profile/create.';

COMMENT ON COLUMN "users"."designation" IS
  'Optional job title on the profile card (e.g. Principal, Accountant).';

-- Existing accounts are grandfathered as completed.
UPDATE "users"
SET "profile_completed_at" = "created_at"
WHERE "profile_completed_at" IS NULL;
