-- ---------------------------------------------------------------------------
-- Platform staff sessions.
--
-- A separate table from "sessions" rather than a nullable "school_id" on it.
-- "sessions"."school_id" is NOT NULL and carries the tenant_isolation policy;
-- relaxing it so three staff accounts could share the table would put a hole in
-- the mechanism that isolates every school, permanently, to save one table.
--
-- Retention (CLAUDE.md, docs/17 s4): a row is deleted when it expires or is
-- revoked. `expires_at` is indexed so the sweeper is a range scan, and deleting
-- the platform user cascades. Nothing here outlives the session it represents.
-- ---------------------------------------------------------------------------
CREATE TABLE "platform_sessions" (
    "id" UUID NOT NULL,
    "platform_user_id" UUID NOT NULL,
    "family_id" UUID NOT NULL,
    "refresh_token_hash" TEXT NOT NULL,
    "ip" TEXT,
    "user_agent" TEXT,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "last_used_at" TIMESTAMPTZ(6),
    "revoked_at" TIMESTAMPTZ(6),
    "revoked_reason" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "platform_sessions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "platform_sessions_refresh_token_hash_key"
  ON "platform_sessions"("refresh_token_hash");
CREATE INDEX "platform_sessions_platform_user_id_idx"
  ON "platform_sessions"("platform_user_id");
CREATE INDEX "platform_sessions_expires_at_idx" ON "platform_sessions"("expires_at");

ALTER TABLE "platform_sessions"
  ADD CONSTRAINT "platform_sessions_platform_user_id_fkey"
  FOREIGN KEY ("platform_user_id") REFERENCES "platform_users"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- The application role gets nothing. This table is reachable only through the
-- owner connection the platform console uses. Stated explicitly rather than
-- left to default privileges, so a future GRANT cannot widen it by accident.
REVOKE ALL ON "platform_sessions" FROM ilm_app;

COMMENT ON TABLE "platform_sessions" IS
  'Platform staff refresh tokens. No school_id: belongs to no tenant. The application role holds no grant.';
