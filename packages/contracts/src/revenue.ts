import { z } from 'zod';

import { paymentMethodSchema } from './expenses';
import { listQuery } from './pagination';
import { calendarDateSchema, idSchema, minorUnitsSchema } from './primitives';

/**
 * Finance › Revenue: every fee payment the school received, and how much of it
 * the school actually earned.
 *
 * ## Received is not revenue
 *
 * A receipt can carry a security deposit. That money is the family's, held and
 * owed back (docs/modules/fees-and-finance.md §10), so it is shown on the row —
 * "of which deposit" — and subtracted:
 *
 *     revenue = received - deposit held
 *
 * The dashboard's "collected" figure and revenue trend use the same rule, from
 * the same SQL, so this page and the dashboard cannot disagree.
 *
 * ## One row per receipt
 *
 * A payment, not an allocation. One payment can settle September and October
 * together (arrears); the family handed over one sum and got one receipt, and
 * that is what this list shows — with the vouchers it settled beside it.
 */

export const revenueListQuerySchema = listQuery(
  ['paidOn', 'amount', 'receiptNo', 'name'] as const,
  {
    /** Inclusive range of the day the money arrived. */
    from: calendarDateSchema.optional(),
    to: calendarDateSchema.optional(),
    method: paymentMethodSchema.optional(),
    classLevelId: idSchema.optional(),
  },
  'paidOn',
);

export type RevenueListQuery = z.infer<typeof revenueListQuerySchema>;

export const revenueRowSchema = z.object({
  /** The payment (receipt) id. */
  id: idSchema,
  receiptNo: z.string(),
  paidOn: calendarDateSchema,
  method: paymentMethodSchema,
  reference: z.string().nullable(),
  studentId: idSchema,
  studentName: z.string(),
  grNo: z.string(),
  className: z.string().nullable(),
  /** The vouchers this payment settled, oldest first. */
  voucherNos: z.array(z.string()),
  /** What was handed over. */
  receivedMinor: minorUnitsSchema,
  /** The part of it that was a security deposit, held rather than earned. */
  depositMinor: minorUnitsSchema,
  /** `received - deposit`: what the school earned from this receipt. */
  revenueMinor: z.int(),
});

export type RevenueRow = z.infer<typeof revenueRowSchema>;

/** Summed over the **whole filter**, not the page. */
export const revenueTotalsSchema = z.object({
  count: z.int().min(0),
  receivedMinor: minorUnitsSchema,
  depositMinor: minorUnitsSchema,
  revenueMinor: z.int(),
});

export type RevenueTotals = z.infer<typeof revenueTotalsSchema>;
