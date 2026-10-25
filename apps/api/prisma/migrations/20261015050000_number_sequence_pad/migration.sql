-- How many digits a number is padded to, beside the prefix it already has.
--
-- Existing voucher counters have been printing FV-000001 all along, so those rows
-- are given exactly that prefix and width and keep producing the same numbers.
-- Every other row (the GR counter) keeps the four digits it always had.
--
-- Reverse: ALTER TABLE "number_sequences" DROP COLUMN "pad";
--          (and UPDATE number_sequences SET prefix = '' WHERE kind = 'voucher').

ALTER TABLE "number_sequences" ADD COLUMN "pad" INTEGER NOT NULL DEFAULT 4;

UPDATE "number_sequences" SET "prefix" = 'FV-', "pad" = 6 WHERE "kind" = 'voucher';
