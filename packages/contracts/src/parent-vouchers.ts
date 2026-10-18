import { z } from 'zod';

import { idSchema } from './primitives';
import { bankLogoSchema } from './school-logo';
import { voucherSettingsSchema } from './voucher-settings';
import { challanSchema, voucherSummarySchema } from './vouchers';

/**
 * Fee vouchers, as a parent sees them (the Fee Vouchers page).
 *
 * A voucher's own status is what the ledger says: UNPAID, PARTIALLY_PAID, PAID,
 * WAIVED. A parent also needs the one the ledger cannot say — **overdue** — so
 * the status they read is derived: paid or waived stays that; otherwise past the
 * due date with something owing is Overdue; otherwise part-paid, otherwise unpaid.
 */
export const PARENT_VOUCHER_STATUSES = ['UNPAID', 'PARTIALLY_PAID', 'PAID', 'OVERDUE', 'WAIVED'] as const;
export const parentVoucherStatusSchema = z.enum(PARENT_VOUCHER_STATUSES);
export type ParentVoucherStatus = z.infer<typeof parentVoucherStatusSchema>;

export const PARENT_VOUCHER_STATUS_LABELS: Readonly<Record<ParentVoucherStatus, string>> = {
  UNPAID: 'Unpaid',
  PARTIALLY_PAID: 'Partially paid',
  PAID: 'Paid',
  OVERDUE: 'Overdue',
  WAIVED: 'Waived',
};

export const PARENT_VOUCHER_PAGE_SIZE = 20;

/** Newest first by default: the voucher the school issued most recently is on top. */
export const PARENT_VOUCHER_SORT_FIELDS = [
  'issueDate',
  'dueDate',
  'voucherNo',
  'amount',
  'studentName',
  'status',
] as const;

/** `month` is the fee month, `YYYY-MM`. Strict, so a misspelt filter is a 400. */
export const parentVoucherListQuerySchema = z
  .object({
    /** A voucher number or a child's name. */
    q: z.string().trim().max(80).optional(),
    studentId: idSchema.optional(),
    month: z
      .string()
      .regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'Use YYYY-MM.')
      .optional(),
    status: parentVoucherStatusSchema.optional(),
    sort: z.enum(PARENT_VOUCHER_SORT_FIELDS).default('issueDate'),
    order: z.enum(['asc', 'desc']).default('desc'),
    limit: z.coerce.number().int().min(1).max(100).default(PARENT_VOUCHER_PAGE_SIZE),
    offset: z.coerce.number().int().min(0).default(0),
  })
  .strict();
export type ParentVoucherListQuery = z.infer<typeof parentVoucherListQuerySchema>;

export const parentVoucherItemSchema = voucherSummarySchema.extend({
  /** What to show the parent; see the note at the top of this file. */
  paymentStatus: parentVoucherStatusSchema,
});
export type ParentVoucherItem = z.infer<typeof parentVoucherItemSchema>;

export interface ParentVoucherList {
  items: ParentVoucherItem[];
  total: number;
  /**
   * What the filtered vouchers add up to, in minor units — each voucher's own charge,
   * so an earlier balance carried onto a later voucher is never counted twice.
   */
  totals: { dueMinor: number; paidMinor: number; pendingMinor: number };
  /** The linked children, for the student filter — also when none has a voucher yet. */
  children: { id: string; name: string }[];
  /** Every fee month across the parent's vouchers, newest first, for the month filter. */
  months: string[];
}

/** One voucher with the letterhead the challan prints under, in a single response. */
export const parentChallanSchema = z.object({
  challan: challanSchema,
  paymentStatus: parentVoucherStatusSchema,
  school: z.object({
    name: z.string(),
    address: z.string().nullable(),
    phone: z.string().nullable(),
    logoVersion: z.string().nullable(),
    accentColor: z.string().nullable(),
  }),
  /** The school's own Voucher Settings: copies per sheet, what to show, the footer note. */
  settings: voucherSettingsSchema,
  bankLogos: z.array(bankLogoSchema),
});
export type ParentChallan = z.infer<typeof parentChallanSchema>;

