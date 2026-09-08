-- ---------------------------------------------------------------------------
-- Global sign-in (ADR-0009) and self-serve signup (ADR-0010).
--
-- Two tables and two indexes. The indexes are the interesting part.
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- Sign-in at the apex looks a person up before any tenant exists.
--
-- Every other index in this schema leads with school_id, because every other
-- query is tenant-scoped and one that is not is a bug. This is the exception,
-- and it is deliberate: `WHERE email = $1` across all schools is the query that
-- makes "just email and password" possible, it runs on an endpoint anyone on
-- the internet can call, and without an index it is a sequential scan over
-- every user row on the platform — which is a denial-of-service primitive, not
-- a slow page.
--
-- It grants no visibility: the application role still cannot read `users` for a
-- school it is not scoped to, because RLS is unchanged. Only the admin
-- connection in AuthService runs this query, and it is the one place in the
-- product allowed to.
-- ---------------------------------------------------------------------------
CREATE INDEX "users_email_idx" ON "users" ("email");
CREATE INDEX "users_phone_idx" ON "users" ("phone");

-- ---------------------------------------------------------------------------
-- auth_handoffs — a verified password on one host, a session on another.
--
-- The session cookie is host-only (COOKIE_DOMAIN deliberately unset, docs/04),
-- so the apex can verify a password but physically cannot issue the cookie for
-- {slug}.<domain>. This row is the bridge: minted at the apex, redeemed once on
-- the school's own address, seconds later.
--
-- Why a table rather than a signed token that needs no storage: single use has
-- to be enforceable. `UPDATE ... WHERE consumed_at IS NULL RETURNING` is atomic
-- and unambiguous; a stateless token replayed inside its window is two sessions
-- from one password, and the URL that carries it lands in browser history, in
-- referrer headers and in whatever the person pastes into a chat.
-- ---------------------------------------------------------------------------
CREATE TABLE "auth_handoffs" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "token_hash" TEXT NOT NULL,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "consumed_at" TIMESTAMPTZ(6),
    "ip" TEXT,
    "user_agent" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),

    CONSTRAINT "auth_handoffs_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "auth_handoffs_token_hash_key" ON "auth_handoffs" ("token_hash");
CREATE INDEX "auth_handoffs_school_id_expires_at_idx" ON "auth_handoffs" ("school_id", "expires_at");

ALTER TABLE "auth_handoffs"
  ADD CONSTRAINT "auth_handoffs_school_id_fkey"
  FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "auth_handoffs"
  ADD CONSTRAINT "auth_handoffs_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- school_agreements — docs/17 §3, brought forward from Phase 5 by ADR-0010.
--
-- Sales-led onboarding had an operator who could attest afterwards to what a
-- school had agreed to. Self-serve signup has nobody. If the tick box is not
-- recorded at the moment it is ticked, "did this school accept the DPA, and
-- which version?" becomes permanently unanswerable — and it is the question
-- that matters most on the day it is asked.
--
-- The accepter's name and email are stored, not joined. The user row can be
-- renamed, reassigned, or erased under the retention policy; the acceptance has
-- to outlive all three and still say who signed it.
-- ---------------------------------------------------------------------------
CREATE TYPE "agreement_document" AS ENUM ('TERMS_OF_SERVICE', 'DPA');

CREATE TABLE "school_agreements" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "document_type" "agreement_document" NOT NULL,
    "version" TEXT NOT NULL,
    "accepted_at" TIMESTAMPTZ(6) NOT NULL,
    "accepted_by_user_id" UUID,
    "accepted_by_name" TEXT NOT NULL,
    "accepted_by_email" TEXT NOT NULL,
    "ip" TEXT,
    "user_agent" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),

    CONSTRAINT "school_agreements_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "school_agreements_school_id_document_type_version_key"
  ON "school_agreements" ("school_id", "document_type", "version");
CREATE INDEX "school_agreements_school_id_accepted_at_idx"
  ON "school_agreements" ("school_id", "accepted_at");

ALTER TABLE "school_agreements"
  ADD CONSTRAINT "school_agreements_school_id_fkey"
  FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ===========================================================================
-- Layer 3. CLAUDE.md: school_id NOT NULL, RLS enabled AND forced with the
-- tenant_isolation policy, a school_id-leading index, and registration in
-- TENANT_MODELS. The first three are above and here; the fourth is in
-- tenant-models.ts, and the structural gate fails the build if any is missing.
--
-- Both of these are read through the admin connection before a tenant context
-- exists — the same way `users` is read at sign-in — so RLS is not what makes
-- them work. It is what makes them safe if they are ever read any other way.
-- ===========================================================================

ALTER TABLE "auth_handoffs" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "auth_handoffs" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "auth_handoffs"
  USING ("school_id" = current_school_id())
  WITH CHECK ("school_id" = current_school_id());

ALTER TABLE "school_agreements" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "school_agreements" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "school_agreements"
  USING ("school_id" = current_school_id())
  WITH CHECK ("school_id" = current_school_id());

-- ---------------------------------------------------------------------------
-- Grants. Ordinary DML for the application role, with one exception.
--
-- No DELETE on school_agreements. It is evidence of a contract, not
-- operational data: the only thing that should ever remove a row is the
-- retention job running as the owner, seven years after the contract ends
-- (docs/17 §4). An application bug must not be able to make a school's
-- acceptance disappear.
-- ---------------------------------------------------------------------------
GRANT SELECT, INSERT, UPDATE, DELETE ON "auth_handoffs" TO ilm_app;
GRANT SELECT, INSERT ON "school_agreements" TO ilm_app;

COMMENT ON TABLE "auth_handoffs" IS
  'Single-use bridge from a password verified at the apex to a session cookie issued on the school host. ADR-0009.';
COMMENT ON TABLE "school_agreements" IS
  'Versioned terms acceptance. Append-only to the application role; erased with the school 7 years after the contract ends.';
COMMENT ON INDEX "users_email_idx" IS
  'Global sign-in only. The one deliberately un-scoped lookup in the product; see ADR-0009.';
