-- Three copies or four, and the bank a challan is deposited at.
--
-- ## Why the copy count is a number and not two templates
--
-- Some schools print three copies across a page and some print four. That is
-- the same document with a different number of copies on the sheet, not two
-- documents — so it is one integer, and the layout is a function of it.
-- CLAUDE.md R1: the difference between two schools is configuration.
--
-- ## Why the bank logo joins `school_logos` rather than getting a table
--
-- It is the same thing: some bytes a school uploaded, served back behind its
-- session with an ETag. The table already does sniffing, size limits and
-- content-addressed caching; a second table would be a second opinion about
-- what an image is. A `kind` discriminator is the whole of the difference.
--
-- ## Retention (CLAUDE.md, docs/17 s4)
--
-- Both are erased with the school. A bank's mark and name are not personal
-- data, and `ON DELETE CASCADE` on `school_logos` already covers the bytes.

-- --- Images a school owns, by kind ---------------------------------------
CREATE TYPE "school_image_kind" AS ENUM ('SCHOOL', 'BANK');

-- Defaulted, so every row that exists today is the school's own mark, which is
-- what it was before this column existed.
ALTER TABLE "school_logos"
  ADD COLUMN "kind" "school_image_kind" NOT NULL DEFAULT 'SCHOOL';

-- One per school *per kind*. The old constraint said one per school full stop,
-- which is what stopped a bank logo existing beside it.
ALTER TABLE "school_logos" DROP CONSTRAINT "school_logos_school_id_key";
ALTER TABLE "school_logos"
  ADD CONSTRAINT "school_logos_school_id_kind_key" UNIQUE ("school_id", "kind");

-- --- How many copies, and whose counter ----------------------------------
ALTER TABLE "school_voucher_settings"
  ADD COLUMN "copy_count" integer NOT NULL DEFAULT 3,
  -- Printed beside the bank's mark at the foot of every copy. Null prints
  -- neither, which is a school that collects at its own office.
  ADD COLUMN "bank_name" text;

ALTER TABLE "school_voucher_settings"
  ADD CONSTRAINT "school_voucher_settings_copy_count_allowed"
    CHECK ("copy_count" IN (3, 4));

-- The labels and the count cannot disagree: a fourth copy with no name is a
-- blank heading on a printed document, and three names with a count of four is
-- a copy nobody can tell apart from the one above it.
ALTER TABLE "school_voucher_settings"
  DROP CONSTRAINT "school_voucher_settings_three_copies";
ALTER TABLE "school_voucher_settings"
  ADD CONSTRAINT "school_voucher_settings_labels_match_count"
    CHECK (cardinality("copy_labels") = "copy_count");
