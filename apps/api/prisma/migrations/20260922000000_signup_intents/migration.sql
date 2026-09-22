-- ---------------------------------------------------------------------------
-- Signup intents — credentials → OTP → school, before a tenant exists.
--
-- No school_id: the school is created only after the email OTP succeeds.
-- Application role gets nothing; only the admin connection (signup endpoints)
-- may read or write. Retention: expire within 24h; completed rows are deleted
-- once the school exists, or swept with expires_at.
-- ---------------------------------------------------------------------------
CREATE TABLE "signup_intents" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "terms_version" TEXT NOT NULL,
    "otp_hash" TEXT,
    "otp_expires_at" TIMESTAMPTZ(6),
    "otp_sent_at" TIMESTAMPTZ(6),
    "otp_attempts" INTEGER NOT NULL DEFAULT 0,
    "email_verified_at" TIMESTAMPTZ(6),
    "session_token_hash" TEXT NOT NULL,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "completed_at" TIMESTAMPTZ(6),
    "ip" TEXT,
    "user_agent" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "signup_intents_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "signup_intents_session_token_hash_key"
  ON "signup_intents"("session_token_hash");
CREATE INDEX "signup_intents_email_idx" ON "signup_intents"("email");
CREATE INDEX "signup_intents_expires_at_idx" ON "signup_intents"("expires_at");

REVOKE ALL ON "signup_intents" FROM ilm_app;

COMMENT ON TABLE "signup_intents" IS
  'In-progress self-serve signup. No school_id — tenant created on complete. App role has no grant.';
