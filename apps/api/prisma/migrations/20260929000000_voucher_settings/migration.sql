-- How a school's fee challan is laid out, and which payment channels it carries.
--
-- ## Why a table rather than columns on `schools`
--
-- `schools` is read on nearly every request — the tenant resolver, the late-fee
-- rate, the timezone — and this is read on exactly one screen and one print
-- run. Eight more columns there would travel with every one of those reads the
-- first time somebody writes `select` without thinking, and each would need its
-- own entry in the column-level UPDATE grant that keeps a tenant away from its
-- own plan and status.
--
-- ## Why the consumer numbers are derived rather than stored
--
-- A Kuickpay consumer number is the school's company prefix followed by the
-- child's register number, and a 1LINK number is an institution id followed by
-- that. Storing one per voucher would mean half a million rows carrying a value
-- that is a function of two settings and a GR number — and a row that disagrees
-- with the settings the moment a school corrects its prefix. They are computed
-- where the challan is rendered, from the two fields below.
--
-- ## Retention (CLAUDE.md, docs/17 §4)
--
-- Erased with the school. It holds no personal data — a company prefix, an
-- institution id and some printed wording — so it needs no anonymisation path
-- of its own, and `ON DELETE CASCADE` is the whole of it.
CREATE TABLE "school_voucher_settings" (
  "id"        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- One per school: this is configuration, not a collection.
  "school_id" uuid NOT NULL UNIQUE REFERENCES "schools"("id") ON DELETE CASCADE,

  -- --- What the challan shows -------------------------------------------
  "show_logo"        boolean NOT NULL DEFAULT true,
  -- Printed under the signature line. A school's own instruction to parents:
  -- "Fees after the due date attract a surcharge", a bank account number, an
  -- office timing. Empty prints nothing rather than an empty box.
  "footer_note"      text,
  -- The three copies, so a school that calls them something else can say so.
  "copy_labels"      text[] NOT NULL DEFAULT ARRAY['School Copy', 'Bank Copy', 'Student Copy'],

  -- --- Kuickpay ----------------------------------------------------------
  "kuickpay_enabled" boolean NOT NULL DEFAULT false,
  -- The company prefix Kuickpay issues to the school. The consumer number
  -- printed on a challan is this followed by the child's zero-padded GR.
  "kuickpay_prefix"  text,
  -- The network the school's parents may pay at. Kuickpay's list changes
  -- without asking us, so it is text a school edits rather than a constant
  -- somebody has to ship a release to correct.
  "kuickpay_channels" text[] NOT NULL DEFAULT ARRAY[]::text[],

  -- --- 1LINK -------------------------------------------------------------
  "onelink_enabled"  boolean NOT NULL DEFAULT false,
  -- Prefixed to the Kuickpay consumer number, which is how the two appear on
  -- every challan that carries both.
  "onelink_institution_id" text,

  "created_at" timestamptz(6) NOT NULL DEFAULT now(),
  "updated_at" timestamptz(6) NOT NULL DEFAULT now(),

  -- Digits only, and bounded. These are interpolated into a number printed on
  -- a document a bank scans; a prefix with a space in it is a challan nobody
  -- can pay.
  CONSTRAINT "school_voucher_settings_kuickpay_prefix_digits"
    CHECK ("kuickpay_prefix" IS NULL OR "kuickpay_prefix" ~ '^[0-9]{2,12}$'),
  CONSTRAINT "school_voucher_settings_onelink_id_digits"
    CHECK ("onelink_institution_id" IS NULL OR "onelink_institution_id" ~ '^[0-9]{3,12}$'),
  -- A channel cannot be on without the number that makes it payable. The API
  -- says so in a sentence; this says so in a way a second writer cannot miss.
  CONSTRAINT "school_voucher_settings_kuickpay_needs_prefix"
    CHECK (NOT "kuickpay_enabled" OR "kuickpay_prefix" IS NOT NULL),
  CONSTRAINT "school_voucher_settings_onelink_needs_id"
    CHECK (NOT "onelink_enabled" OR "onelink_institution_id" IS NOT NULL),
  -- 1LINK prints the Kuickpay consumer number behind its institution id, so it
  -- has nothing to print without Kuickpay configured.
  CONSTRAINT "school_voucher_settings_onelink_needs_kuickpay"
    CHECK (NOT "onelink_enabled" OR "kuickpay_enabled"),
  CONSTRAINT "school_voucher_settings_three_copies"
    CHECK (cardinality("copy_labels") = 3)
);

CREATE INDEX "school_voucher_settings_school_id_idx"
  ON "school_voucher_settings" ("school_id");

ALTER TABLE "school_voucher_settings" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "school_voucher_settings" FORCE ROW LEVEL SECURITY;

CREATE POLICY "tenant_isolation" ON "school_voucher_settings"
  USING ("school_id" = current_school_id())
  WITH CHECK ("school_id" = current_school_id());

GRANT SELECT, INSERT, UPDATE, DELETE ON "school_voucher_settings" TO ilm_app;
