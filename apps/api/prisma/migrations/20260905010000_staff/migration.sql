-- ---------------------------------------------------------------------------
-- Staff — docs/07 §4.
--
-- The load-bearing decision here is that `user_id` is **nullable**, because a
-- staff record and a portal account are different things:
--
--   * a janitor or a security guard is an employee with leave and a salary and
--     no reason to sign in to anything;
--   * a head or an admin needs both;
--   * and the owner who signed the school up has an account before anybody has
--     written down their employment details.
--
-- Collapsing the two would mean inventing logins for people who will never use
-- one, or leaving half the payroll unrecorded. `staff_role` is therefore its
-- own enum, about what someone *does*, and stays separate from `school_role`,
-- which is about what the portal *permits*.
-- ---------------------------------------------------------------------------

CREATE TYPE "staff_role" AS ENUM (
  'HEAD',
  'ADMIN',
  'OFFICE_STAFF',
  'TEACHER',
  'SECURITY_GUARD',
  'JANITOR'
);

CREATE TYPE "staff_status" AS ENUM ('ACTIVE', 'LEFT');

CREATE TABLE "staff" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "employee_no" TEXT NOT NULL,
    "user_id" UUID,
    "name" TEXT NOT NULL,
    "email" TEXT,
    "phone" TEXT,
    "gender" "gender",
    "role" "staff_role" NOT NULL,
    "casual_leaves" INTEGER NOT NULL DEFAULT 0,
    "sick_leaves" INTEGER NOT NULL DEFAULT 0,
    "basic_salary" NUMERIC(14,2) NOT NULL DEFAULT 0,
    "status" "staff_status" NOT NULL DEFAULT 'ACTIVE',
    "joined_on" DATE,
    "left_on" DATE,
    "cnic" TEXT,
    "designation" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "staff_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "staff_school_id_employee_no_key" ON "staff" ("school_id", "employee_no");
CREATE INDEX "staff_school_id_status_name_idx" ON "staff" ("school_id", "status", "name");
CREATE INDEX "staff_school_id_role_idx" ON "staff" ("school_id", "role");

-- One account belongs to at most one employee. Two staff rows sharing a login
-- is two people who can act as each other, and no audit trail can tell them
-- apart afterwards.
CREATE UNIQUE INDEX "staff_user_id_key" ON "staff" ("user_id");

ALTER TABLE "staff"
  ADD CONSTRAINT "staff_school_id_fkey"
  FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- SET NULL, not CASCADE: removing somebody's portal access must not delete the
-- record that they were employed.
ALTER TABLE "staff"
  ADD CONSTRAINT "staff_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "staff"
  ADD CONSTRAINT "staff_salary_non_negative" CHECK ("basic_salary" >= 0);

ALTER TABLE "staff"
  ADD CONSTRAINT "staff_leaves_non_negative"
  CHECK ("casual_leaves" >= 0 AND "sick_leaves" >= 0);

-- ===========================================================================
-- Layer 3. CLAUDE.md: school_id NOT NULL, RLS enabled AND forced with the
-- tenant_isolation policy, a school_id-leading index, and registration in
-- TENANT_MODELS.
-- ===========================================================================
ALTER TABLE "staff" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "staff" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "staff"
  USING ("school_id" = current_school_id())
  WITH CHECK ("school_id" = current_school_id());

GRANT SELECT, INSERT, UPDATE, DELETE ON "staff" TO ilm_app;

COMMENT ON TABLE "staff" IS
  'Employees. user_id is null for staff with no portal login — a janitor is on payroll and never signs in.';
COMMENT ON COLUMN "staff"."basic_salary" IS
  'Rupees, numeric(14,2). Integer paisa above the service layer — see CLAUDE.md.';
