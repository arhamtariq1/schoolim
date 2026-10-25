-- Deposits that were paid on a voucher but never booked as held.
--
-- Until now, paying a voucher that carried a Security Deposit line settled the
-- voucher and stopped there: no `security_deposits` row was written, so the
-- money appeared on no deposit register and could never be refunded. The
-- payment path now books it when the voucher is paid in full
-- (VouchersService.holdDeposit); this records the ones paid before that.
--
-- Same rule as the code: a PAID voucher, the sum of its FEE lines on a SECURITY
-- head less each line's discount, received on the day of the latest confirmed
-- payment allocated to it. Vouchers that already have a deposit are skipped, so
-- the migration is safe to run against a database where one was entered by hand.
--
-- Data only: no schema change and no new table, so no new erasure question —
-- these rows follow the existing security_deposits retention (docs/17 s4).
--
-- Reversal: DELETE FROM "security_deposits" WHERE "note" LIKE 'Collected on voucher %'
--   AND "created_by" IS NULL AND NOT EXISTS (SELECT 1 FROM "security_deposit_refunds" r
--   WHERE r."deposit_id" = "security_deposits"."id");

INSERT INTO "security_deposits"
  ("id", "school_id", "student_id", "voucher_id", "amount", "received_on", "note", "created_at", "updated_at")
SELECT gen_random_uuid(),
       v."school_id",
       v."student_id",
       v."id",
       dep."amount",
       COALESCE(paid."paid_on", v."paid_on"::date, v."issue_date"),
       'Collected on voucher ' || v."voucher_no",
       now(),
       now()
  FROM "fee_vouchers" v
  JOIN LATERAL (
    SELECT SUM(l."amount" - l."discount") AS "amount"
      FROM "fee_voucher_lines" l
      JOIN "fee_heads" h ON h."id" = l."fee_head_id"
     WHERE l."voucher_id" = v."id"
       AND l."kind" = 'FEE'
       AND h."type" = 'SECURITY'
  ) dep ON dep."amount" > 0
  LEFT JOIN LATERAL (
    SELECT MAX(p."paid_on") AS "paid_on"
      FROM "fee_payment_allocations" a
      JOIN "fee_payments" p ON p."id" = a."payment_id"
     WHERE a."voucher_id" = v."id"
       AND p."status" = 'CONFIRMED'
  ) paid ON true
 WHERE v."status" = 'PAID'
   AND NOT EXISTS (
     SELECT 1 FROM "security_deposits" d WHERE d."voucher_id" = v."id"
   );
