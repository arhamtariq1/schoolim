-- ---------------------------------------------------------------------------
-- Expenses — docs/07 §7, docs/modules/fees-and-finance.md.
--
-- Categories are school-configurable rather than a fixed list: every school
-- groups its spending differently, and a hard-coded enum is exactly the
-- school-specific branching CLAUDE.md R1 exists to prevent.
--
-- Money is `numeric(14,2)` rupees, integer paisa above the service layer.
-- ---------------------------------------------------------------------------

CREATE TABLE "expense_categories" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "gl_code" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "expense_categories_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "expense_categories_school_id_name_key"
  ON "expense_categories" ("school_id", "name");
CREATE INDEX "expense_categories_school_id_is_active_sort_order_idx"
  ON "expense_categories" ("school_id", "is_active", "sort_order");

ALTER TABLE "expense_categories"
  ADD CONSTRAINT "expense_categories_school_id_fkey"
  FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TYPE "payment_method" AS ENUM ('CASH', 'BANK_TRANSFER', 'CHEQUE', 'CARD', 'OTHER');

CREATE TABLE "expenses" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "session_id" UUID NOT NULL,
    "category_id" UUID NOT NULL,
    "voucher_no" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "payee" TEXT,
    "amount" NUMERIC(14,2) NOT NULL,
    "method" "payment_method" NOT NULL DEFAULT 'CASH',
    "paid_on" DATE NOT NULL,
    "reference" TEXT,
    "created_by" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "expenses_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "expenses_school_id_voucher_no_key" ON "expenses" ("school_id", "voucher_no");

-- The list's default view: one session, newest first.
--
-- This index is the difference between a page load and a table scan. A school
-- four years in has tens of thousands of rows here, and every screen that opens
-- this list filters by session and sorts by date — so the index matches that
-- shape exactly rather than being a generic single-column afterthought.
CREATE INDEX "expenses_school_id_session_id_paid_on_idx"
  ON "expenses" ("school_id", "session_id", "paid_on" DESC);

CREATE INDEX "expenses_school_id_category_id_idx" ON "expenses" ("school_id", "category_id");

ALTER TABLE "expenses"
  ADD CONSTRAINT "expenses_school_id_fkey"
  FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- RESTRICT on both: deleting a session or a category that money was booked
-- against would silently drop spending out of every total that already
-- reported it. The services refuse first, with a sentence.
ALTER TABLE "expenses"
  ADD CONSTRAINT "expenses_session_id_fkey"
  FOREIGN KEY ("session_id") REFERENCES "academic_sessions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "expenses"
  ADD CONSTRAINT "expenses_category_id_fkey"
  FOREIGN KEY ("category_id") REFERENCES "expense_categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Spending is not negative. A refund is its own entry, not a minus sign here —
-- otherwise "total expenses" quietly means two different things.
ALTER TABLE "expenses"
  ADD CONSTRAINT "expenses_amount_non_negative" CHECK ("amount" >= 0);

-- ===========================================================================
-- Layer 3. CLAUDE.md: school_id NOT NULL, RLS enabled AND forced with the
-- tenant_isolation policy, a school_id-leading index, and registration in
-- TENANT_MODELS.
-- ===========================================================================
ALTER TABLE "expense_categories" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "expense_categories" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "expense_categories"
  USING ("school_id" = current_school_id())
  WITH CHECK ("school_id" = current_school_id());

ALTER TABLE "expenses" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "expenses" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "expenses"
  USING ("school_id" = current_school_id())
  WITH CHECK ("school_id" = current_school_id());

GRANT SELECT, INSERT, UPDATE, DELETE ON "expense_categories", "expenses" TO ilm_app;

COMMENT ON TABLE "expenses" IS
  'One outgoing payment. Attached to a session as well as a date, so per-year reporting is not a date range somebody has to get right by hand.';
