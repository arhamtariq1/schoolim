-- Subscription plans and the platform audit log.
--
-- Platform tables: no school_id, no RLS, and the application role holds no
-- grant (same as platform_users). Only the console, on the admin connection,
-- reads or writes them. The public landing page reads plans through an API
-- endpoint, never directly.
--
-- Erasure (docs/17 s4): plans hold no personal data. Platform audit rows are
-- retained with the platform user they name (RESTRICT: a user with history
-- cannot be deleted, only deactivated).
--
-- Reversal: DROP TABLE "platform_audit_logs"; DROP TABLE "plans"; DROP TYPE "billing_cycle";

CREATE TYPE "billing_cycle" AS ENUM ('MONTHLY', 'YEARLY');

CREATE TABLE "plans" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "tagline" TEXT NOT NULL DEFAULT '',
    "price" DECIMAL(14,2) NOT NULL,
    "billing_cycle" "billing_cycle" NOT NULL DEFAULT 'MONTHLY',
    "student_cap" INTEGER,
    "features" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "is_public" BOOLEAN NOT NULL DEFAULT true,
    "is_recommended" BOOLEAN NOT NULL DEFAULT false,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "archived_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
    CONSTRAINT "plans_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "plans_price_nonnegative" CHECK ("price" >= 0),
    CONSTRAINT "plans_student_cap_positive" CHECK ("student_cap" IS NULL OR "student_cap" > 0)
);

CREATE UNIQUE INDEX "plans_code_key" ON "plans" ("code");
CREATE INDEX "plans_archived_at_sort_order_idx" ON "plans" ("archived_at", "sort_order");
-- At most one plan is the recommended one.
CREATE UNIQUE INDEX "plans_one_recommended" ON "plans" ("is_recommended") WHERE "is_recommended" AND "archived_at" IS NULL;

CREATE TABLE "platform_audit_logs" (
    "id" UUID NOT NULL,
    "actor_platform_user_id" UUID NOT NULL,
    "action" TEXT NOT NULL,
    "entity_type" TEXT NOT NULL,
    "entity_id" TEXT,
    "before" JSONB,
    "after" JSONB,
    "ip" TEXT,
    "at" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
    CONSTRAINT "platform_audit_logs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "platform_audit_logs_entity_type_entity_id_at_idx" ON "platform_audit_logs" ("entity_type", "entity_id", "at" DESC);
CREATE INDEX "platform_audit_logs_actor_platform_user_id_at_idx" ON "platform_audit_logs" ("actor_platform_user_id", "at" DESC);

ALTER TABLE "platform_audit_logs" ADD CONSTRAINT "platform_audit_logs_actor_fkey"
  FOREIGN KEY ("actor_platform_user_id") REFERENCES "platform_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

REVOKE ALL ON "plans", "platform_audit_logs" FROM ilm_app;

COMMENT ON TABLE "plans" IS 'Subscription plans. Configuration edited from the platform console; read by the public landing page.';
COMMENT ON TABLE "platform_audit_logs" IS 'Append-only record of every platform-console mutation.';

-- The plans the landing page showed before they became editable, so nothing
-- changes on the day this ships. Prices are placeholders pending decision D2.
INSERT INTO "plans" ("id", "code", "name", "tagline", "price", "student_cap", "features", "is_recommended", "sort_order") VALUES
  (gen_random_uuid(), 'starter', 'Starter', 'A single campus finding its feet', 4000.00, 300,
    ARRAY['Students, admissions and guardians','Fee heads, plans and monthly vouchers','Attendance and daily registers','Up to 10 staff accounts'], false, 10),
  (gen_random_uuid(), 'standard', 'Standard', 'An established school running its own accounts', 9000.00, 1000,
    ARRAY['Everything in Starter','Full finance: ledgers, expenses, day book','Exams, marks and result cards','SMS and WhatsApp notices','Unlimited staff accounts'], true, 20),
  (gen_random_uuid(), 'group', 'Group', 'Several campuses under one administration', 20000.00, NULL,
    ARRAY['Everything in Standard','Every campus, one login','Consolidated reporting across campuses','Priority support'], false, 30);
