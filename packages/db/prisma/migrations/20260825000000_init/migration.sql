-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "platform_role" AS ENUM ('SUPER_ADMIN', 'SUPPORT', 'BILLING');

-- CreateEnum
CREATE TYPE "school_status" AS ENUM ('TRIAL', 'ACTIVE', 'PAST_DUE', 'SUSPENDED', 'CHURNED');

-- CreateEnum
CREATE TYPE "billing_mode" AS ENUM ('PER_CAMPUS', 'CONSOLIDATED');

-- CreateEnum
CREATE TYPE "user_status" AS ENUM ('INVITED', 'ACTIVE', 'DISABLED');

-- CreateEnum
CREATE TYPE "school_role" AS ENUM ('OWNER', 'PRINCIPAL', 'ADMIN', 'ACCOUNTANT', 'RECEPTION', 'TEACHER', 'COORDINATOR', 'STUDENT', 'PARENT');

-- CreateEnum
CREATE TYPE "actor_type" AS ENUM ('USER', 'PLATFORM', 'SYSTEM');

-- CreateTable
CREATE TABLE "platform_users" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "mfa_secret" TEXT,
    "mfa_enabled_at" TIMESTAMPTZ(6),
    "role" "platform_role" NOT NULL,
    "token_version" INTEGER NOT NULL DEFAULT 0,
    "last_login_at" TIMESTAMPTZ(6),
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "platform_users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "school_groups" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "legal_name" TEXT,
    "logo_url" TEXT,
    "billing_mode" "billing_mode" NOT NULL DEFAULT 'PER_CAMPUS',
    "status" "school_status" NOT NULL DEFAULT 'TRIAL',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "school_groups_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "schools" (
    "id" UUID NOT NULL,
    "school_group_id" UUID,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "legal_name" TEXT,
    "logo_url" TEXT,
    "primary_color" TEXT,
    "timezone" TEXT NOT NULL DEFAULT 'Asia/Karachi',
    "locale" TEXT NOT NULL DEFAULT 'en',
    "currency" TEXT NOT NULL DEFAULT 'PKR',
    "country" TEXT NOT NULL DEFAULT 'PK',
    "city" TEXT,
    "address" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "status" "school_status" NOT NULL DEFAULT 'TRIAL',
    "onboarded_at" TIMESTAMPTZ(6),
    "trial_ends_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "schools_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "school_domains" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "domain" TEXT NOT NULL,
    "is_primary" BOOLEAN NOT NULL DEFAULT false,
    "verified_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "school_domains_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "identity_id" UUID,
    "email" TEXT NOT NULL,
    "phone" TEXT,
    "name" TEXT NOT NULL,
    "password_hash" TEXT,
    "avatar_url" TEXT,
    "status" "user_status" NOT NULL DEFAULT 'INVITED',
    "must_change_password" BOOLEAN NOT NULL DEFAULT false,
    "token_version" INTEGER NOT NULL DEFAULT 0,
    "locale" TEXT,
    "last_login_at" TIMESTAMPTZ(6),
    "failed_login_count" INTEGER NOT NULL DEFAULT 0,
    "locked_until" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_roles" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "role" "school_role" NOT NULL,
    "scope" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sessions" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "family_id" UUID NOT NULL,
    "refresh_token_hash" TEXT NOT NULL,
    "ip" TEXT,
    "user_agent" TEXT,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "last_used_at" TIMESTAMPTZ(6),
    "revoked_at" TIMESTAMPTZ(6),
    "revoked_reason" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invitations" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "role" "school_role" NOT NULL,
    "token_hash" TEXT NOT NULL,
    "invited_by" UUID,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "accepted_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "invitations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "password_resets" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "token_hash" TEXT NOT NULL,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "used_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "password_resets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "actor_user_id" UUID,
    "actor_type" "actor_type" NOT NULL DEFAULT 'USER',
    "actor_platform_user_id" UUID,
    "action" TEXT NOT NULL,
    "entity_type" TEXT NOT NULL,
    "entity_id" TEXT,
    "before" JSONB,
    "after" JSONB,
    "ip" TEXT,
    "user_agent" TEXT,
    "request_id" TEXT,
    "at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id","at")
) PARTITION BY RANGE ("at");

-- CreateIndex
CREATE UNIQUE INDEX "platform_users_email_key" ON "platform_users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "school_groups_slug_key" ON "school_groups"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "schools_slug_key" ON "schools"("slug");

-- CreateIndex
CREATE INDEX "schools_school_group_id_idx" ON "schools"("school_group_id");

-- CreateIndex
CREATE INDEX "schools_status_idx" ON "schools"("status");

-- CreateIndex
CREATE UNIQUE INDEX "school_domains_domain_key" ON "school_domains"("domain");

-- CreateIndex
CREATE INDEX "school_domains_school_id_idx" ON "school_domains"("school_id");

-- CreateIndex
CREATE INDEX "users_school_id_status_idx" ON "users"("school_id", "status");

-- CreateIndex
CREATE INDEX "users_school_id_email_idx" ON "users"("school_id", "email");

-- CreateIndex
CREATE INDEX "users_school_id_phone_idx" ON "users"("school_id", "phone");

-- CreateIndex
CREATE UNIQUE INDEX "users_school_id_email_key" ON "users"("school_id", "email");

-- CreateIndex
CREATE INDEX "user_roles_school_id_user_id_idx" ON "user_roles"("school_id", "user_id");

-- CreateIndex
CREATE UNIQUE INDEX "user_roles_school_id_user_id_role_key" ON "user_roles"("school_id", "user_id", "role");

-- CreateIndex
CREATE UNIQUE INDEX "sessions_refresh_token_hash_key" ON "sessions"("refresh_token_hash");

-- CreateIndex
CREATE INDEX "sessions_school_id_user_id_idx" ON "sessions"("school_id", "user_id");

-- CreateIndex
CREATE INDEX "sessions_school_id_family_id_idx" ON "sessions"("school_id", "family_id");

-- CreateIndex
CREATE INDEX "sessions_school_id_expires_at_idx" ON "sessions"("school_id", "expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "invitations_token_hash_key" ON "invitations"("token_hash");

-- CreateIndex
CREATE INDEX "invitations_school_id_email_idx" ON "invitations"("school_id", "email");

-- CreateIndex
CREATE INDEX "invitations_school_id_expires_at_idx" ON "invitations"("school_id", "expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "password_resets_token_hash_key" ON "password_resets"("token_hash");

-- CreateIndex
CREATE INDEX "password_resets_school_id_user_id_idx" ON "password_resets"("school_id", "user_id");

-- CreateIndex
CREATE INDEX "audit_logs_school_id_entity_type_entity_id_at_idx" ON "audit_logs"("school_id", "entity_type", "entity_id", "at" DESC);

-- CreateIndex
CREATE INDEX "audit_logs_school_id_actor_user_id_at_idx" ON "audit_logs"("school_id", "actor_user_id", "at" DESC);

-- CreateIndex
CREATE INDEX "audit_logs_school_id_at_idx" ON "audit_logs"("school_id", "at" DESC);

-- AddForeignKey
ALTER TABLE "schools" ADD CONSTRAINT "schools_school_group_id_fkey" FOREIGN KEY ("school_group_id") REFERENCES "school_groups"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "school_domains" ADD CONSTRAINT "school_domains_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_invited_by_fkey" FOREIGN KEY ("invited_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "password_resets" ADD CONSTRAINT "password_resets_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "password_resets" ADD CONSTRAINT "password_resets_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- ===========================================================================
-- Everything below is hand-written and is NOT generated by Prisma.
-- It is layer 3 of the three isolation layers in docs/04 section 2, and it is
-- written assuming layers 1 and 2 are broken.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- Tenant context
--
-- The application sets `app.school_id` transaction-locally with
-- set_config(..., true). Transaction-local is required, not stylistic: the
-- runtime connects through a transaction-mode pooler where a session-level
-- setting would leak from one tenant's request to the next one that happened
-- to reuse the connection.
--
-- `current_setting(..., true)` returns NULL rather than raising when the
-- setting is absent, and `school_id = NULL` is NULL, which is not true — so a
-- query with no tenant context matches NO rows. Failing closed is the point.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION current_school_id() RETURNS uuid
  LANGUAGE sql STABLE
  AS $$ SELECT NULLIF(current_setting('app.school_id', true), '')::uuid $$;

COMMENT ON FUNCTION current_school_id() IS
  'Tenant for the current transaction. NULL when unset, so policies match nothing.';

-- ---------------------------------------------------------------------------
-- audit_logs partitions
--
-- Created here rather than retrofitted, because converting a populated table
-- to a partitioned one means an exclusive lock and a full rewrite.
-- A DEFAULT partition catches anything outside the declared ranges so an
-- insert can never fail for want of a partition; the maintenance job adds the
-- next month ahead of time and this is only a safety net.
-- ---------------------------------------------------------------------------
CREATE TABLE "audit_logs_default" PARTITION OF "audit_logs" DEFAULT;

DO $$
DECLARE
  start_month date := date_trunc('month', now())::date;
  m           date;
BEGIN
  -- The current month plus twelve ahead.
  FOR i IN 0..12 LOOP
    m := (start_month + (i || ' month')::interval)::date;
    EXECUTE format(
      'CREATE TABLE IF NOT EXISTS %I PARTITION OF "audit_logs" FOR VALUES FROM (%L) TO (%L)',
      'audit_logs_' || to_char(m, 'YYYY_MM'),
      m,
      (m + interval '1 month')::date
    );
  END LOOP;
END
$$;

-- ---------------------------------------------------------------------------
-- Row-level security
--
-- FORCE as well as ENABLE: without FORCE the table owner bypasses its own
-- policies, and migrations run as the owner.
-- ---------------------------------------------------------------------------

-- `schools` is self-scoped: a tenant reads its own row and no other. The policy
-- is written against `id`, not `school_id`, which is why the CI gate knows this
-- table by name instead of inferring it.
ALTER TABLE "schools" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "schools" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "schools"
  USING ("id" = current_school_id())
  WITH CHECK ("id" = current_school_id());

-- Tenant-scoped tables. Same policy shape on every one of them.
ALTER TABLE "users" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "users" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "users"
  USING ("school_id" = current_school_id())
  WITH CHECK ("school_id" = current_school_id());

ALTER TABLE "user_roles" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "user_roles" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "user_roles"
  USING ("school_id" = current_school_id())
  WITH CHECK ("school_id" = current_school_id());

ALTER TABLE "sessions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "sessions" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "sessions"
  USING ("school_id" = current_school_id())
  WITH CHECK ("school_id" = current_school_id());

ALTER TABLE "invitations" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "invitations" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "invitations"
  USING ("school_id" = current_school_id())
  WITH CHECK ("school_id" = current_school_id());

ALTER TABLE "password_resets" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "password_resets" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "password_resets"
  USING ("school_id" = current_school_id())
  WITH CHECK ("school_id" = current_school_id());

-- Applies to every existing and future partition.
ALTER TABLE "audit_logs" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "audit_logs" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "audit_logs"
  USING ("school_id" = current_school_id())
  WITH CHECK ("school_id" = current_school_id());

-- ---------------------------------------------------------------------------
-- Grants
--
-- The application role is granted only what it needs, table by table. It is
-- deliberately given NOTHING on the platform tables: those are reachable only
-- through the owner connection used by migrations and the platform console.
-- ---------------------------------------------------------------------------
GRANT SELECT ON "schools" TO ilm_app;

GRANT SELECT, INSERT, UPDATE, DELETE ON
  "users", "user_roles", "sessions", "invitations", "password_resets"
  TO ilm_app;

-- docs/12 R8: audit_logs is append-only. No UPDATE, no DELETE, ever — which is
-- what makes an impersonation record impossible to quietly remove (docs/17 s5).
GRANT SELECT, INSERT ON "audit_logs" TO ilm_app;
REVOKE UPDATE, DELETE ON "audit_logs" FROM ilm_app;

-- Explicitly revoke the platform tables, in case a future default privilege
-- grants them by accident.
REVOKE ALL ON "platform_users", "school_groups", "school_domains" FROM ilm_app;

COMMENT ON TABLE "audit_logs" IS
  'Append-only. Partitioned by month on "at". The application role holds no UPDATE or DELETE grant.';
COMMENT ON TABLE "school_domains" IS
  'Deliberately NOT tenant-scoped: read during tenant resolution, before any context exists.';
