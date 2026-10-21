-- Push notification devices (Firebase Cloud Messaging).
--
-- One row per browser or phone that agreed to be pushed to. The token is a
-- credential to push to that device: it is never returned by any endpoint.
--
-- Erasure (docs/17 s4): deleted on sign-out, when FCM reports the token dead,
-- 60 days after it was last seen, and with the user or the tenant (cascade).
--
-- Reversal: DROP TABLE "device_tokens";

CREATE TABLE "device_tokens" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "token" TEXT NOT NULL,
    "platform" TEXT NOT NULL DEFAULT 'web',
    "user_agent" TEXT,
    "last_seen_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
    CONSTRAINT "device_tokens_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "device_tokens_token_length" CHECK (char_length("token") BETWEEN 20 AND 4096)
);

CREATE UNIQUE INDEX "device_tokens_school_id_token_key" ON "device_tokens" ("school_id", "token");
CREATE INDEX "device_tokens_school_id_user_id_idx" ON "device_tokens" ("school_id", "user_id");

ALTER TABLE "device_tokens" ADD CONSTRAINT "device_tokens_school_id_fkey"
  FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "device_tokens" ADD CONSTRAINT "device_tokens_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "device_tokens" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "device_tokens" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "device_tokens"
  USING ("school_id" = current_school_id()) WITH CHECK ("school_id" = current_school_id());

GRANT SELECT, INSERT, UPDATE, DELETE ON "device_tokens" TO ilm_app;

COMMENT ON TABLE "device_tokens" IS 'A device that agreed to receive push notifications for one user. The token is a credential: never returned by the API.';
