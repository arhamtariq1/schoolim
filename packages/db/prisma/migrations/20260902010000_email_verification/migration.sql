-- ---------------------------------------------------------------------------
-- Email verification at signup. ADR-0012.
--
-- ADR-0010 shipped self-serve signup and listed this as the gap it knowingly
-- left: "a typo in the owner's address means an account nobody can recover".
-- That is not a theoretical problem. The owner's address is the only route back
-- into a self-serve tenant — there is no operator to phone — so an address that
-- was never proved is a school one forgotten password away from being lost.
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- A timestamp, not a boolean.
--
-- "When did they confirm?" is the question asked in a dispute, and `true`
-- cannot answer it. It costs the same to store.
-- ---------------------------------------------------------------------------
ALTER TABLE "users" ADD COLUMN "email_verified_at" TIMESTAMPTZ(6);

COMMENT ON COLUMN "users"."email_verified_at" IS
  'When this person proved they can read mail at users.email. Cleared if the address changes — the proof was about the old one.';

-- ---------------------------------------------------------------------------
-- Existing accounts are grandfathered as verified.
--
-- Every user row that exists today was created by an operator through the
-- platform console, who had already spoken to the person and handed over a
-- temporary password out of band. That is a stronger proof of control than an
-- email round trip, and marking them unverified would put a "confirm your
-- email" banner in front of schools that never received one to confirm.
--
-- The seeded demo accounts are included deliberately: a demo that opens on a
-- nag banner is a worse demo.
-- ---------------------------------------------------------------------------
UPDATE "users" SET "email_verified_at" = "created_at" WHERE "email_verified_at" IS NULL;

-- ---------------------------------------------------------------------------
-- email_verifications — the same shape as password_resets, plus one column.
--
-- `email` is the address the token was **sent to**, copied rather than joined.
-- Somebody can change their address between a link being sent and clicked, and
-- a token checked against whatever the user row says at redemption time would
-- happily verify an address nobody ever proved control of.
-- ---------------------------------------------------------------------------
CREATE TABLE "email_verifications" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "token_hash" TEXT NOT NULL,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "consumed_at" TIMESTAMPTZ(6),
    "sent_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),

    CONSTRAINT "email_verifications_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "email_verifications_token_hash_key" ON "email_verifications" ("token_hash");
CREATE INDEX "email_verifications_school_id_user_id_idx" ON "email_verifications" ("school_id", "user_id");
CREATE INDEX "email_verifications_school_id_expires_at_idx" ON "email_verifications" ("school_id", "expires_at");

ALTER TABLE "email_verifications"
  ADD CONSTRAINT "email_verifications_school_id_fkey"
  FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "email_verifications"
  ADD CONSTRAINT "email_verifications_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ===========================================================================
-- Layer 3. CLAUDE.md: school_id NOT NULL, RLS enabled AND forced with the
-- tenant_isolation policy, a school_id-leading index, and registration in
-- TENANT_MODELS. The first three are above and here; the fourth is in
-- tenant-models.ts, and the structural gate fails the build if any is missing.
--
-- Read through the admin connection before a tenant context exists — the link
-- in the email arrives with no session — so RLS is not what makes this table
-- work. It is what makes it safe if it is ever read any other way.
-- ===========================================================================
ALTER TABLE "email_verifications" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "email_verifications" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "email_verifications"
  USING ("school_id" = current_school_id())
  WITH CHECK ("school_id" = current_school_id());

GRANT SELECT, INSERT, UPDATE, DELETE ON "email_verifications" TO ilm_app;

COMMENT ON TABLE "email_verifications" IS
  'Single-use, 24-hour tokens proving control of an email address. ADR-0012.';
