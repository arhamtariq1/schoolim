-- ---------------------------------------------------------------------------
-- `net_payable` becomes what a voucher charges of its **own**, with arrears
-- carried alongside rather than folded in.
--
-- ## The bug this fixes
--
-- September bills 5,000 and goes unpaid. October bills its own 5,000 and
-- carries September's, so `net_payable` was 10,000. The parent owes 10,000 in
-- total — but the school's outstanding figure summed both vouchers and read
-- 15,000, counting September once on its own row and again inside October's.
--
-- Worse, paying October in full allocated 5,000 to September (settling it,
-- correctly) and 5,000 to October — which then sat at 5,000 paid of 10,000 and
-- reported itself PARTIALLY_PAID. A parent who had paid everything was shown a
-- balance.
--
-- So: `net_payable = gross - discount - waiver`, and `arrears_amount` stays as
-- the figure the challan prints beneath it. The printed total is the sum of the
-- two; the school's outstanding is the sum of `net_payable - paid` alone, and
-- no rupee is counted twice.
-- ---------------------------------------------------------------------------

ALTER TABLE "fee_vouchers" DROP CONSTRAINT "fee_vouchers_net_payable_balances";

-- Existing rows carried arrears inside the figure. Take them back out before
-- the new constraint is asserted, or every one of them fails it.
UPDATE "fee_vouchers"
   SET "net_payable" = "gross_amount" - "discount_amount" - "waiver_amount"
 WHERE "net_payable" <> "gross_amount" - "discount_amount" - "waiver_amount";

-- Paid may now exceed the smaller payable on a voucher whose arrears portion
-- had already been settled through it. Clamp, so the `paid <= net_payable`
-- constraint still holds; the allocations remain the record of where the money
-- actually went.
UPDATE "fee_vouchers"
   SET "paid_amount" = "net_payable"
 WHERE "paid_amount" > "net_payable";

ALTER TABLE "fee_vouchers" ADD CONSTRAINT "fee_vouchers_net_payable_balances"
  CHECK ("net_payable" = "gross_amount" - "discount_amount" - "waiver_amount");

COMMENT ON COLUMN "fee_vouchers"."net_payable" IS
  'What this voucher charges of its own, within the due date. Arrears are carried in arrears_amount and printed alongside, never folded in here — that is what stops the same debt being counted on two rows.';
COMMENT ON COLUMN "fee_vouchers"."arrears_amount" IS
  'Balances carried from the vouchers named in fee_voucher_arrears, for printing. Settled by allocating a payment to those vouchers, not by adding to net_payable.';
