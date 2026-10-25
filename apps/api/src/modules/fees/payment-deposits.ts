/**
 * How much of each fee payment was a security deposit.
 *
 * A deposit is booked against the voucher that billed it (`security_deposits.
 * voucher_id`), not against a payment, because a voucher can be paid in
 * parts. To say what a *receipt* contained, the deposit is spread over the
 * allocations to that voucher **deposit first**, in the order they were made:
 *
 *     voucher: Security Deposit 15,000 + Tuition 5,000, paid 12,000 then 8,000
 *     first receipt  → 12,000 of deposit
 *     second receipt →  3,000 of deposit, 5,000 of tuition
 *
 * Integer arithmetic only, and the shares of one voucher always add up to its
 * deposit exactly — so a sum over receipts equals the deposits held, with
 * nothing lost to rounding.
 *
 * Only `CONFIRMED` payments count, and only deposits that exist (a deposit is
 * booked when its voucher is paid in full — `VouchersService.holdDeposit`).
 *
 * One definition, used by Finance › Revenue and by the dashboard's collected
 * figure and revenue trend, so the two screens cannot disagree. A common table
 * expression for a `WITH` clause; it binds no parameters.
 */
export const PAYMENT_DEPOSIT_CTE = `
  payment_deposit AS (
    SELECT x.payment_id, SUM(x.share) AS deposit
      FROM (
        SELECT a.payment_id,
               LEAST(
                 a.amount,
                 GREATEST(
                   d.amount - COALESCE(SUM(a.amount) OVER (
                     PARTITION BY a.voucher_id
                     ORDER BY a.created_at, a.id
                     ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING
                   ), 0),
                   0
                 )
               ) AS share
          FROM fee_payment_allocations a
          JOIN fee_payments p ON p.id = a.payment_id AND p.status = 'CONFIRMED'
          JOIN security_deposits d ON d.voucher_id = a.voucher_id
      ) x
     GROUP BY x.payment_id
  )`;
