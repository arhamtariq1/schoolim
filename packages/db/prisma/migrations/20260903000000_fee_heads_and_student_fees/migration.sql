-- ---------------------------------------------------------------------------
-- Fees, first slice: the catalogue, and what each child actually pays.
--
-- docs/modules/fees-and-finance.md §2. This is deliberately the bottom two
-- layers of that module's four and nothing above them — no fee plans, no
-- billing periods, no voucher generation. A school cannot use any of those
-- until it can first answer "what do we charge?" and "what did we agree with
-- this family?", and those two questions are worth shipping on their own.
--
-- Money is `numeric(14,2)` here and integer paisa above the service layer
-- (CLAUDE.md). The columns are named `amount`, not `amount_minor`, precisely so
-- that nobody reads a rupee value as paisa: the rename happens at the same
-- boundary as the conversion.
-- ---------------------------------------------------------------------------

CREATE TYPE "fee_head_type" AS ENUM (
  'ADMISSION',
  'TUITION',
  'ANNUAL',
  'LAB',
  'STATIONERY',
  'SECURITY',
  'TRANSPORT',
  'EXAM',
  'CUSTOM'
);

-- ---------------------------------------------------------------------------
-- fee_heads — one row per thing a school charges for.
-- ---------------------------------------------------------------------------
CREATE TABLE "fee_heads" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "type" "fee_head_type" NOT NULL DEFAULT 'CUSTOM',
    "name" TEXT NOT NULL,
    "default_amount" NUMERIC(14,2) NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "fee_heads_pkey" PRIMARY KEY ("id")
);

-- Two heads called "Tuition Fee" is a school arguing with itself about which
-- one a voucher meant.
CREATE UNIQUE INDEX "fee_heads_school_id_name_key" ON "fee_heads" ("school_id", "name");
CREATE INDEX "fee_heads_school_id_is_active_sort_order_idx"
  ON "fee_heads" ("school_id", "is_active", "sort_order");

ALTER TABLE "fee_heads"
  ADD CONSTRAINT "fee_heads_school_id_fkey"
  FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- A fee cannot be negative. The application checks it too, but the application
-- is not the last line of defence for a number that ends up on an invoice.
ALTER TABLE "fee_heads"
  ADD CONSTRAINT "fee_heads_default_amount_non_negative" CHECK ("default_amount" >= 0);

-- ---------------------------------------------------------------------------
-- student_fees — what one child pays for one head.
--
-- `amount` is copied from the head at admission rather than joined to it, which
-- is the single most important line in this migration. The module's founding
-- rule is that changing a fee does not retroactively change what was already
-- agreed (§1): a school that raises tuition in April must not silently restate
-- what every existing child owed in March. A join would do exactly that, and
-- the damage would be invisible until a parent queried a receipt.
--
-- `discounted_amount` is the amount *payable*, not a delta. That is how a
-- school says it out loud — "we agreed 10,000 instead of 25,000" — and storing
-- the sentence people actually use removes a subtraction that can be got wrong
-- in either direction.
-- ---------------------------------------------------------------------------
CREATE TABLE "student_fees" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "fee_head_id" UUID NOT NULL,
    "amount" NUMERIC(14,2) NOT NULL,
    "discounted_amount" NUMERIC(14,2),
    "discount_reason" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "student_fees_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "student_fees_school_id_student_id_fee_head_id_key"
  ON "student_fees" ("school_id", "student_id", "fee_head_id");
CREATE INDEX "student_fees_school_id_student_id_idx"
  ON "student_fees" ("school_id", "student_id");
CREATE INDEX "student_fees_school_id_fee_head_id_idx"
  ON "student_fees" ("school_id", "fee_head_id");

ALTER TABLE "student_fees"
  ADD CONSTRAINT "student_fees_school_id_fkey"
  FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "student_fees"
  ADD CONSTRAINT "student_fees_student_id_fkey"
  FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- RESTRICT, not CASCADE: deleting a head that children are billed against must
-- fail loudly rather than quietly erase what they were agreed to pay. The
-- product deactivates heads instead, and the service says so.
ALTER TABLE "student_fees"
  ADD CONSTRAINT "student_fees_fee_head_id_fkey"
  FOREIGN KEY ("fee_head_id") REFERENCES "fee_heads"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "student_fees"
  ADD CONSTRAINT "student_fees_amount_non_negative" CHECK ("amount" >= 0);

-- A "discount" that raises the price is a data-entry error, not a discount, and
-- it is worth catching in the one place that cannot be bypassed. The screenshot
-- that prompted this feature had a 6,000 fee "discounted" to 20,000.
ALTER TABLE "student_fees"
  ADD CONSTRAINT "student_fees_discount_within_bounds"
  CHECK ("discounted_amount" IS NULL
         OR ("discounted_amount" >= 0 AND "discounted_amount" <= "amount"));

-- ===========================================================================
-- Layer 3. CLAUDE.md: school_id NOT NULL, RLS enabled AND forced with the
-- tenant_isolation policy, a school_id-leading index, and registration in
-- TENANT_MODELS. The first three are above and here; the fourth is in
-- tenant-models.ts, and the structural gate fails the build if any is missing.
-- ===========================================================================

ALTER TABLE "fee_heads" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "fee_heads" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "fee_heads"
  USING ("school_id" = current_school_id())
  WITH CHECK ("school_id" = current_school_id());

ALTER TABLE "student_fees" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "student_fees" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "student_fees"
  USING ("school_id" = current_school_id())
  WITH CHECK ("school_id" = current_school_id());

GRANT SELECT, INSERT, UPDATE, DELETE ON "fee_heads", "student_fees" TO ilm_app;

COMMENT ON TABLE "fee_heads" IS
  'The catalogue behind Settings > Fees. A head in use is deactivated, never deleted.';
COMMENT ON COLUMN "fee_heads"."default_amount" IS
  'Rupees, numeric(14,2). Integer paisa above the service layer — see CLAUDE.md.';
COMMENT ON TABLE "student_fees" IS
  'What one child was agreed to pay for one head, fixed at admission. Amount is copied, never joined: changing a fee must not restate history.';
COMMENT ON COLUMN "student_fees"."discounted_amount" IS
  'The amount payable when a discount was agreed, not a delta. Null means no discount.';
