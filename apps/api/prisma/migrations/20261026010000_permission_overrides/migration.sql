-- Access customisation (ADR-0025).
--
-- A school's change to what a role can do, and to what one person can do, on
-- top of the role defaults declared in code. Both tables hold permission names
-- as text: the list of permissions lives in `@ilm/contracts`, and a name the
-- code no longer knows is ignored when read.
--
-- Erasure (docs/17 s4):
--   role_permission_overrides — school configuration, no personal data. Deleted
--     with the tenant (cascade).
--   user_permission_overrides — says what one person may open, so it is about
--     them. Deleted with the user and with the tenant (cascade); a reset to the
--     role default deletes the rows. Who changed it, and when, stays in
--     audit_logs under that table's retention.
--
-- Reversal:
--   DROP TABLE "user_permission_overrides";
--   DROP TABLE "role_permission_overrides";
--   DROP TYPE "permission_effect";

CREATE TYPE "permission_effect" AS ENUM ('GRANT', 'REVOKE');

CREATE TABLE "role_permission_overrides" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "role" "school_role" NOT NULL,
    "permission" TEXT NOT NULL,
    "effect" "permission_effect" NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
    CONSTRAINT "role_permission_overrides_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "role_permission_overrides_permission_length" CHECK (char_length("permission") BETWEEN 1 AND 100)
);

CREATE UNIQUE INDEX "role_permission_overrides_school_id_role_permission_key"
  ON "role_permission_overrides" ("school_id", "role", "permission");

ALTER TABLE "role_permission_overrides" ADD CONSTRAINT "role_permission_overrides_school_id_fkey"
  FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "role_permission_overrides" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "role_permission_overrides" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "role_permission_overrides"
  USING ("school_id" = current_school_id()) WITH CHECK ("school_id" = current_school_id());

GRANT SELECT, INSERT, UPDATE, DELETE ON "role_permission_overrides" TO ilm_app;

COMMENT ON TABLE "role_permission_overrides" IS 'What a role can do at this school, changed from the default in code (ADR-0025).';

CREATE TABLE "user_permission_overrides" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "permission" TEXT NOT NULL,
    "effect" "permission_effect" NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
    CONSTRAINT "user_permission_overrides_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "user_permission_overrides_permission_length" CHECK (char_length("permission") BETWEEN 1 AND 100)
);

-- Leads with school_id and covers the per-request lookup by user.
CREATE UNIQUE INDEX "user_permission_overrides_school_id_user_id_permission_key"
  ON "user_permission_overrides" ("school_id", "user_id", "permission");

ALTER TABLE "user_permission_overrides" ADD CONSTRAINT "user_permission_overrides_school_id_fkey"
  FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "user_permission_overrides" ADD CONSTRAINT "user_permission_overrides_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "user_permission_overrides" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "user_permission_overrides" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "user_permission_overrides"
  USING ("school_id" = current_school_id()) WITH CHECK ("school_id" = current_school_id());

GRANT SELECT, INSERT, UPDATE, DELETE ON "user_permission_overrides" TO ilm_app;

COMMENT ON TABLE "user_permission_overrides" IS 'One person given more, or less, than their roles (ADR-0025). Applied after the role.';
