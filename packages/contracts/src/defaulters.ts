import { z } from 'zod';

import { listQuery } from './pagination';
import { calendarDateSchema, idSchema, minorUnitsSchema, monthKeySchema } from './primitives';
import { genderSchema, studentStatusSchema } from './students';
import { voucherStatusSchema } from './vouchers';

/**
 * Who has not paid, and for how long.
 *
 * ## What makes somebody a defaulter
 *
 * A student with at least one voucher whose **due date has passed** and which
 * is not settled. Three conditions, and each one matters:
 *
 * - `due_date < today` — not "unpaid". A voucher issued yesterday and due next
 *   week is not late, and a list that calls it late is a list a school stops
 *   trusting on day one.
 * - status is `UNPAID` or `PARTIALLY_PAID` — a part payment still leaves a
 *   balance, and a family who paid half is still owed for.
 * - never `WAIVED` or `CANCELLED` — those are decisions the school already
 *   made, and chasing them is chasing its own paperwork.
 *
 * ## Why the months come back with the list
 *
 * The screen shows every unpaid month on the row and expands to the vouchers
 * behind them. Fetching those per row would be one request per student on a
 * page of fifty. They are aggregated in the same query instead, so opening the
 * page — and expanding any row on it — costs exactly one round trip.
 */

/**
 * Filters.
 *
 * `months` is "show me anyone at least this far behind", which is how a school
 * decides who gets a phone call: three months owing is a different conversation
 * from one.
 *
 * `from`/`to` bound the **due dates** being chased, not the issue dates. "What
 * went unpaid last term" is a question about when the money was owed.
 */
export const defaulterListQuerySchema = listQuery(
  ['amount', 'months', 'name', 'grNo', 'className'] as const,
  {
    status: studentStatusSchema.optional(),
    sessionId: idSchema.optional(),
    classLevelId: idSchema.optional(),
    sectionId: idSchema.optional(),
    gender: genderSchema.optional(),
    /** At least this many unpaid months. */
    months: z.coerce.number().int().min(1).max(120).optional(),
    from: calendarDateSchema.optional(),
    to: calendarDateSchema.optional(),
  },
  'amount',
);

export type DefaulterListQuery = z.infer<typeof defaulterListQuerySchema>;

/** One overdue voucher, as the expanded row shows it. */
export const defaulterVoucherSchema = z.object({
  voucherId: idSchema,
  voucherNo: z.string(),
  /** The months this voucher billed. Usually one; three at the start of a term. */
  billMonths: z.array(monthKeySchema),
  issueDate: calendarDateSchema,
  dueDate: calendarDateSchema,
  validTill: calendarDateSchema,
  status: voucherStatusSchema,
  /** What is still owed on it — the payable less anything already received. */
  balanceMinor: minorUnitsSchema,
  /** What it was for in full, so a part payment is visible rather than implied. */
  netPayableMinor: minorUnitsSchema,
  paidMinor: minorUnitsSchema,
});

export type DefaulterVoucher = z.infer<typeof defaulterVoucherSchema>;

export const defaulterRowSchema = z.object({
  studentId: idSchema,
  grNo: z.string(),
  studentCode: z.string(),
  name: z.string(),
  fatherName: z.string().nullable(),
  gender: genderSchema.nullable(),
  className: z.string().nullable(),
  sectionName: z.string().nullable(),
  contact: z.string().nullable(),
  /**
   * The student's own status, not the debt's.
   *
   * A child who has left still owes what they owed — that is precisely the
   * balance a school most wants chasing — so `LEFT` rows belong on this list
   * and the column exists to say which they are.
   */
  status: studentStatusSchema,
  /** The sum still owed across every overdue voucher. */
  totalOwedMinor: minorUnitsSchema,
  /**
   * How many distinct months are behind.
   *
   * Zero is possible and honest: a voucher that carries nothing but arrears
   * bills no month of its own. The row still shows what is owed, and expanding
   * it shows the voucher — better than inventing a month to fill the column.
   */
  monthsOwed: z.int().min(0),
  /** Those months, oldest first, for the "Name of Month" column. */
  months: z.array(monthKeySchema),
  /** The overdue vouchers themselves, for the expanded row. */
  vouchers: z.array(defaulterVoucherSchema),
});

export type DefaulterRow = z.infer<typeof defaulterRowSchema>;

export const defaulterListSchema = z.object({
  rows: z.array(defaulterRowSchema),
  total: z.int().min(0),
  /**
   * Owed across the **whole filter**, not this page.
   *
   * A school reads this figure to decide what to do about it, so a total that
   * silently means "the fifty rows you happen to be looking at" is worse than
   * no total at all.
   */
  totalOwedMinor: minorUnitsSchema,
  /** The day the list was drawn, so "overdue" is reproducible in a screenshot. */
  asOf: calendarDateSchema,
});

export type DefaulterList = z.infer<typeof defaulterListSchema>;
