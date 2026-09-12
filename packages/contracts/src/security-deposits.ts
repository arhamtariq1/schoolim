import { z } from 'zod';

import { listQuery } from './pagination';
import {
  calendarDateSchema,
  idSchema,
  idempotencyKeySchema,
  minorUnitsSchema,
  monthKeySchema,
  nonZeroMinorUnitsSchema,
  reasonSchema,
} from './primitives';
import { studentStatusSchema } from './students';

/**
 * Deposits the school is holding, and giving them back.
 *
 * ## A deposit is not a fee
 *
 * A fee is income the moment it is collected. A deposit is the school holding a
 * parent's money and owing it back, less whatever the child broke. Counting the
 * two together overstates a year's collection by the whole float — the kind of
 * error an accountant finds once and never quite forgets.
 *
 * ## Refunding in pieces
 *
 * A child deposits 5,000 and breaks a window worth 2,000. The school refunds
 * 3,000 and keeps the rest. Later they break something else, or leave, and the
 * balance moves again. So a deposit is not "refunded / not refunded": it has an
 * amount, a list of repayments, and whatever is left.
 *
 *     left = deposited - sum(refunds)
 *
 * Each refund is its own row, append-only (R4). A running total on the deposit
 * would be an in-place edit of a money field, and it would lose the only thing
 * anybody asks afterwards: who returned what, when, and why.
 */

export const securityDepositListQuerySchema = listQuery(
  ['receivedOn', 'name', 'grNo', 'deposited', 'left'] as const,
  {
    status: studentStatusSchema.optional(),
    sessionId: idSchema.optional(),
    classLevelId: idSchema.optional(),
    /**
     * `held` — anything still owed back, which is the working list.
     * `settled` — fully refunded, kept for the record.
     */
    state: z.enum(['held', 'settled']).optional(),
  },
  'receivedOn',
);

export type SecurityDepositListQuery = z.infer<typeof securityDepositListQuerySchema>;

/** One repayment out of a deposit. */
export const securityRefundSchema = z.object({
  id: idSchema,
  amountMinor: minorUnitsSchema,
  reason: z.string(),
  refundedOn: calendarDateSchema,
});

export type SecurityRefund = z.infer<typeof securityRefundSchema>;

export const securityDepositRowSchema = z.object({
  id: idSchema,
  studentId: idSchema,
  grNo: z.string(),
  studentCode: z.string(),
  name: z.string(),
  fatherName: z.string().nullable(),
  className: z.string().nullable(),
  contact: z.string().nullable(),
  status: studentStatusSchema,

  /** The month it was taken in, for the column that groups by intake. */
  month: monthKeySchema,
  receivedOn: calendarDateSchema,
  /** The voucher it arrived on, when it arrived on one. Links the row out. */
  voucherId: idSchema.nullable(),
  voucherNo: z.string().nullable(),

  depositedMinor: minorUnitsSchema,
  refundedMinor: minorUnitsSchema,
  /** `deposited - refunded`. Never negative; the service refuses to let it be. */
  leftMinor: minorUnitsSchema,
  note: z.string().nullable(),
  /** Every repayment so far, so the eye icon needs no second request. */
  refunds: z.array(securityRefundSchema),
});

export type SecurityDepositRow = z.infer<typeof securityDepositRowSchema>;

export const securityDepositListSchema = z.object({
  rows: z.array(securityDepositRowSchema),
  total: z.int().min(0),
  /** Both totals span the filter, not the page. */
  totalDepositedMinor: minorUnitsSchema,
  totalLeftMinor: minorUnitsSchema,
});

export type SecurityDepositList = z.infer<typeof securityDepositListSchema>;

/** Recording a deposit taken at the counter. */
export const recordSecurityDepositSchema = z
  .object({
    studentId: idSchema,
    amountMinor: nonZeroMinorUnitsSchema,
    receivedOn: calendarDateSchema,
    /** The voucher it came in on, if it did. At most one deposit per voucher. */
    voucherId: idSchema.optional(),
    note: z.string().trim().max(500).optional(),
  })
  .strict();

export type RecordSecurityDeposit = z.infer<typeof recordSecurityDepositSchema>;

/**
 * Giving some of it back.
 *
 * `amountMinor` is what is being returned **now**, not the new balance. A
 * school thinking "refund 3,000 of the 5,000" should type 3,000; asking for the
 * remainder instead invites the arithmetic to be done twice, once wrongly.
 *
 * Keyed, because a double-clicked Confirm on a refund is money leaving twice.
 */
export const refundSecurityDepositSchema = z
  .object({
    amountMinor: nonZeroMinorUnitsSchema,
    reason: reasonSchema,
    refundedOn: calendarDateSchema,
    idempotencyKey: idempotencyKeySchema,
  })
  .strict();

export type RefundSecurityDeposit = z.infer<typeof refundSecurityDepositSchema>;
