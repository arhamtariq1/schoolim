import { z } from 'zod';

import { paymentMethodSchema } from './expenses';
import { listQuery } from './pagination';
import {
  calendarDateSchema,
  idSchema,
  idempotencyKeySchema,
  minorUnitsSchema,
  monthKeySchema,
  positiveMinorUnitsSchema,
  reasonSchema,
} from './primitives';

/**
 * Fee vouchers — docs/modules/fees-and-finance.md §5–§7.
 *
 * A voucher is the **materialisation** of (student × fee heads × months),
 * frozen at generation. Every amount here is integer paisa and every field
 * carrying one ends in `Minor`.
 *
 * ## The one number that is not what it looks like
 *
 * `netPayableMinor` is what is due **within** the due date. The late fee sits
 * outside it, in `lateFeeMinor`, because a Pakistani challan prints "amount
 * payable within due date" and "amount payable after due date" as two separate
 * boxes. Folding them into one total is how a parent who paid on time gets
 * charged a surcharge.
 */

// --- Fee head frequency -----------------------------------------------------

/**
 * How often a head is charged.
 *
 * Generation depends on it: billing three months at once must produce three
 * tuition lines and exactly one admission fee.
 */
export const FEE_FREQUENCIES = ['MONTHLY', 'ANNUAL', 'ONE_TIME'] as const;
export const feeFrequencySchema = z.enum(FEE_FREQUENCIES);
export type FeeFrequency = z.infer<typeof feeFrequencySchema>;

export const FEE_FREQUENCY_LABELS: Readonly<Record<FeeFrequency, string>> = {
  MONTHLY: 'Every month',
  ANNUAL: 'Once a session',
  ONE_TIME: 'Once only',
};

// --- Status -----------------------------------------------------------------

export const VOUCHER_STATUSES = [
  'UNPAID',
  'PARTIALLY_PAID',
  'PAID',
  'WAIVED',
  'CANCELLED',
] as const;
export const voucherStatusSchema = z.enum(VOUCHER_STATUSES);
export type VoucherStatus = z.infer<typeof voucherStatusSchema>;

export const VOUCHER_STATUS_LABELS: Readonly<Record<VoucherStatus, string>> = {
  UNPAID: 'Unpaid',
  PARTIALLY_PAID: 'Part paid',
  PAID: 'Paid',
  WAIVED: 'Waived',
  CANCELLED: 'Cancelled',
};

export const VOUCHER_LINE_KINDS = ['FEE', 'ARREAR', 'LATE_FEE', 'WAIVER', 'ADJUSTMENT'] as const;
export const voucherLineKindSchema = z.enum(VOUCHER_LINE_KINDS);
export type VoucherLineKind = z.infer<typeof voucherLineKindSchema>;

// --- The voucher ------------------------------------------------------------

export const voucherLineSchema = z.object({
  id: idSchema,
  feeHeadId: idSchema.nullable(),
  kind: voucherLineKindSchema,
  /** Snapshot text — "Tuition Fee - September 2026". */
  label: z.string(),
  /** First of the month billed. Null for annual and one-time heads. */
  billMonth: calendarDateSchema.nullable(),
  amountMinor: minorUnitsSchema,
  discountMinor: minorUnitsSchema,
  sortOrder: z.int(),
});

export type VoucherLine = z.infer<typeof voucherLineSchema>;

/** One row of the voucher list. Deliberately flat — a list renders fast. */
export const voucherSummarySchema = z.object({
  id: idSchema,
  voucherNo: z.string(),
  status: voucherStatusSchema,
  studentId: idSchema,
  studentName: z.string(),
  /** The number the office actually recognises a child by. */
  grNo: z.string().nullable(),
  fatherName: z.string().nullable(),
  className: z.string().nullable(),
  sectionName: z.string().nullable(),
  sessionId: idSchema,
  sessionName: z.string(),
  issueDate: calendarDateSchema,
  dueDate: calendarDateSchema,
  validTill: calendarDateSchema,
  billMonths: z.array(calendarDateSchema),
  grossMinor: minorUnitsSchema,
  discountMinor: minorUnitsSchema,
  waiverMinor: minorUnitsSchema,
  /**
   * Balances carried from earlier vouchers, for printing.
   *
   * Deliberately **not** inside `netPayableMinor`. September's debt appearing
   * both on its own voucher and inside October's is how a school's outstanding
   * total reads 15,000 for a parent who owes 10,000.
   */
  arrearsMinor: minorUnitsSchema,
  /** What this voucher charges of its own, within the due date. */
  netPayableMinor: minorUnitsSchema,
  /** `netPayable + arrears` — the figure the challan asks for. */
  totalPayableMinor: minorUnitsSchema,
  /** The surcharge after the due date — added on top, not included above. */
  lateFeeMinor: minorUnitsSchema,
  paidMinor: minorUnitsSchema,
  /** Outstanding on this voucher alone. Summing these double-counts nothing. */
  balanceMinor: minorUnitsSchema,
  paidOn: calendarDateSchema.nullable(),
});

export type VoucherSummary = z.infer<typeof voucherSummarySchema>;

/** Everything needed to print a challan, in one response. */
export const voucherDetailSchema = voucherSummarySchema.extend({
  lateFeeAuto: z.boolean(),
  cancelReason: z.string().nullable(),
  lines: z.array(voucherLineSchema),
  /** The prior vouchers this one carries, so arrears can be explained. */
  arrears: z.array(
    z.object({
      sourceVoucherId: idSchema,
      sourceVoucherNo: z.string(),
      sourceBillMonths: z.array(calendarDateSchema),
      amountMinor: minorUnitsSchema,
    }),
  ),
  payments: z.array(
    z.object({
      id: idSchema,
      receiptNo: z.string(),
      amountMinor: minorUnitsSchema,
      method: paymentMethodSchema,
      paidOn: calendarDateSchema,
      reference: z.string().nullable(),
      reversed: z.boolean(),
    }),
  ),
});

export type VoucherDetail = z.infer<typeof voucherDetailSchema>;

// --- Generation -------------------------------------------------------------

/**
 * Who to bill.
 *
 * A discriminated union rather than three optional fields, so "class-wise with
 * no class chosen" cannot be represented at all — the type system refuses it
 * before a request is ever built.
 */
export const voucherScopeSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('STUDENT'), studentId: idSchema }).strict(),
  z
    .object({
      kind: z.literal('CLASS'),
      classLevelId: idSchema,
      /** Narrow to one section, or leave out for the whole class. */
      sectionId: idSchema.optional(),
    })
    .strict(),
  z.object({ kind: z.literal('ALL') }).strict(),
]);

export type VoucherScope = z.infer<typeof voucherScopeSchema>;

/**
 * One head chosen on the generate screen.
 *
 * `amountMinor` is **optional and an override**. Left out — the normal case —
 * each student is billed their own agreed amount from `student_fees`, which is
 * the whole point: thirty children in a class do not pay the same tuition.
 * Supplied, it overrides every student in the scope, which is what the
 * reference screen does when somebody types a figure into the Amount cell.
 */
export const voucherHeadSelectionSchema = z
  .object({
    feeHeadId: idSchema,
    amountMinor: positiveMinorUnitsSchema.optional(),
  })
  .strict();

export type VoucherHeadSelection = z.infer<typeof voucherHeadSelectionSchema>;

const generationBase = {
  sessionId: idSchema,
  scope: voucherScopeSchema,
  heads: z.array(voucherHeadSelectionSchema).min(1).max(50),
  /** `YYYY-MM`. Monthly heads produce one line per month; others ignore it. */
  billMonths: z.array(monthKeySchema).min(1).max(12),
  issueDate: calendarDateSchema,
  dueDate: calendarDateSchema,
  validTill: calendarDateSchema,
  /** Roll unpaid balances from earlier vouchers into this one. */
  includeArrears: z.boolean().default(true),
  /** The "Automatically Applied Defaulter Fee" checkbox. */
  applyLateFee: z.boolean().default(true),
};

/**
 * Preview. Same code path as generation, never a separate estimate — docs
 * §5 calls that non-negotiable, and an estimate that disagrees with the result
 * is worse than no preview at all.
 */
export const previewVouchersSchema = z.object(generationBase).strict();
export type PreviewVouchers = z.infer<typeof previewVouchersSchema>;

/**
 * Generation. Identical to preview plus an idempotency key: pressing the
 * button twice, or a request that times out and gets retried, must produce one
 * set of vouchers.
 */
export const generateVouchersSchema = z
  .object({ ...generationBase, idempotencyKey: idempotencyKeySchema })
  .strict();

export type GenerateVouchers = z.infer<typeof generateVouchersSchema>;

/** Why a student in the scope will not get a voucher. */
export const SKIP_REASONS = [
  'ALREADY_BILLED',
  'NO_FEE_AGREED',
  'NOT_ENROLLED',
  'ZERO_AMOUNT',
] as const;
export const skipReasonSchema = z.enum(SKIP_REASONS);
export type SkipReason = z.infer<typeof skipReasonSchema>;

export const SKIP_REASON_LABELS: Readonly<Record<SkipReason, string>> = {
  ALREADY_BILLED: 'Already billed for these months',
  NO_FEE_AGREED: 'No agreed amount for the chosen fees',
  NOT_ENROLLED: 'Not enrolled in this session',
  ZERO_AMOUNT: 'Nothing to charge',
};

/**
 * What generation would do, before it does it.
 *
 * Counts and totals for the whole scope, plus a handful of sample rows so the
 * numbers can be sanity-checked against a real child rather than trusted.
 */
export const voucherPreviewSchema = z.object({
  willCreate: z.int().min(0),
  willSkip: z.int().min(0),
  skipsByReason: z.array(z.object({ reason: skipReasonSchema, count: z.int().min(0) })),
  grossMinor: minorUnitsSchema,
  discountMinor: minorUnitsSchema,
  arrearsMinor: minorUnitsSchema,
  netPayableMinor: minorUnitsSchema,
  /** Per-head totals across the scope — what the right-hand table shows. */
  headTotals: z.array(
    z.object({
      feeHeadId: idSchema,
      name: z.string(),
      frequency: feeFrequencySchema,
      studentCount: z.int().min(0),
      amountMinor: minorUnitsSchema,
    }),
  ),
  samples: z.array(
    z.object({
      studentId: idSchema,
      studentName: z.string(),
      grNo: z.string().nullable(),
      netPayableMinor: minorUnitsSchema,
      arrearsMinor: minorUnitsSchema,
      lines: z.array(
        z.object({
          label: z.string(),
          amountMinor: minorUnitsSchema,
          discountMinor: minorUnitsSchema,
        }),
      ),
    }),
  ),
  warnings: z.array(z.string()),
});

export type VoucherPreview = z.infer<typeof voucherPreviewSchema>;

export const generationResultSchema = z.object({
  jobRunId: idSchema,
  /** True when this key had already run — nothing new was written. */
  replayed: z.boolean(),
  created: z.int().min(0),
  skipped: z.int().min(0),
  netPayableMinor: minorUnitsSchema,
});

export type GenerationResult = z.infer<typeof generationResultSchema>;

// --- The list ---------------------------------------------------------------

export const voucherListQuerySchema = listQuery(
  ['issueDate', 'dueDate', 'voucherNo', 'amount', 'studentName'] as const,
  {
    sessionId: idSchema.optional(),
    classLevelId: idSchema.optional(),
    sectionId: idSchema.optional(),
    studentId: idSchema.optional(),
    status: voucherStatusSchema.optional(),
    /** GR number, exact-ish — the office searches by this constantly. */
    grNo: z.string().trim().max(40).optional(),
    /** Issue-date window, inclusive at both ends. */
    from: calendarDateSchema.optional(),
    to: calendarDateSchema.optional(),
    /** Only vouchers still owing something. Drives the defaulter view. */
    outstandingOnly: z.stringbool().optional(),
  },
  'issueDate',
);

export type VoucherListQuery = z.infer<typeof voucherListQuerySchema>;

/** Totals over the whole filter, not the page. */
export const voucherTotalsSchema = z.object({
  count: z.int().min(0),
  netPayableMinor: minorUnitsSchema,
  paidMinor: minorUnitsSchema,
  outstandingMinor: minorUnitsSchema,
});

export type VoucherTotals = z.infer<typeof voucherTotalsSchema>;

// --- Editing, cancelling, paying --------------------------------------------

/**
 * Editing an issued voucher.
 *
 * ## Two different things, with two different rules
 *
 * **Dates and the late-fee switch** can move while a voucher is live. Pushing a
 * due date out is the single most common thing an office does to a challan —
 * a family asks for a week — and it changes nothing about what is owed.
 *
 * **The lines** change what is owed, and may be edited only while *nothing has
 * been received*: status `UNPAID` with a zero paid amount and no waiver against
 * it. That is the line R4 draws. Once a rupee has arrived, a receipt exists
 * that names a total, and editing the voucher makes the two disagree — so from
 * that moment the ways to change the number are a further payment, a waiver, or
 * a cancellation, each of which leaves a record of itself.
 *
 * This is deliberately not "the voucher is frozen at generation". A voucher
 * raised this morning with the lab fee left off is a mistake, not a financial
 * record, and cancelling and regenerating to fix it burns a voucher number and
 * loses the challan the parent may already be holding.
 *
 * ## What is not here, and why
 *
 * **No status field.** Status is derived from the payment ledger: a voucher is
 * PAID because payments add up to it, not because somebody chose PAID from a
 * list. A dropdown here would create money with no receipt behind it, and
 * `WAIVED` set this way would bypass the waiver's reason and its ledger entry —
 * which is exactly the "Fee Waived Off as a direct edit" that docs §4.3 names
 * as how numbers stop reconciling. Pay, Waive and Cancel are the real paths and
 * each already exists.
 *
 * **No payment date.** That belongs to the payment that was received, not to
 * the voucher it settled; it is set when the money is recorded.
 */
export const updateVoucherSchema = z
  .object({
    issueDate: calendarDateSchema.optional(),
    dueDate: calendarDateSchema.optional(),
    validTill: calendarDateSchema.optional(),
    applyLateFee: z.boolean().optional(),

    /**
     * Fee lines to take off, by id.
     *
     * Only `FEE` lines. An arrear is another voucher's unpaid balance being
     * carried, and deleting it here would quietly forgive that voucher without
     * touching it; a waiver and a late fee are records of decisions already
     * made.
     */
    removeLineIds: z.array(idSchema).max(50).optional(),

    /**
     * Fee heads to add — the "add the lab fee I forgot" case.
     *
     * `amountMinor` is optional and almost always omitted: left out, the
     * student's own agreed amount for that head is used, with their discount,
     * exactly as generation would have. Supplied, it overrides for this voucher
     * only and does not touch what the family has agreed to pay in future.
     *
     * A monthly head produces one line per month the voucher bills, an annual
     * head one per session and a one-time head one ever — the same rule as
     * generation, so adding tuition to a three-month challan cannot produce one
     * month's charge or three admission fees.
     */
    addHeads: z
      .array(
        z
          .object({
            feeHeadId: idSchema,
            amountMinor: positiveMinorUnitsSchema.optional(),
          })
          .strict(),
      )
      .max(20)
      .optional(),
  })
  .strict();

export type UpdateVoucher = z.infer<typeof updateVoucherSchema>;

export const cancelVoucherSchema = z.object({ reason: reasonSchema }).strict();
export type CancelVoucher = z.infer<typeof cancelVoucherSchema>;

/**
 * Recording a payment.
 *
 * `amountMinor` is optional: left out it settles the balance in full, which is
 * what the Pay button does. Supplied, it is a part payment.
 */
export const recordPaymentSchema = z
  .object({
    amountMinor: positiveMinorUnitsSchema.optional(),
    method: paymentMethodSchema.default('CASH'),
    paidOn: calendarDateSchema,
    reference: z.string().trim().max(80).optional(),
    idempotencyKey: idempotencyKeySchema,
  })
  .strict();

export type RecordPayment = z.infer<typeof recordPaymentSchema>;

/**
 * Waiving what is left.
 *
 * A waiver is a negative line and a reason, never a quiet edit of the amount —
 * docs §4.3: "The old portal had Fee Waived Off as a direct edit. That is how
 * numbers stop reconciling."
 */
export const waiveVoucherSchema = z
  .object({
    amountMinor: positiveMinorUnitsSchema.optional(),
    reason: reasonSchema,
  })
  .strict();

export type WaiveVoucher = z.infer<typeof waiveVoucherSchema>;

/** The student typeahead behind the "GR No / Name" box. */
export const studentLookupQuerySchema = z
  .object({
    q: z.string().trim().min(1).max(80),
    sessionId: idSchema.optional(),
    limit: z.coerce.number().int().min(1).max(20).default(10),
  })
  .strict();

export type StudentLookupQuery = z.infer<typeof studentLookupQuerySchema>;

export const studentLookupResultSchema = z.object({
  id: idSchema,
  name: z.string(),
  grNo: z.string().nullable(),
  fatherName: z.string().nullable(),
  className: z.string().nullable(),
  sectionName: z.string().nullable(),
  /** What this child still owes across every open voucher. */
  outstandingMinor: minorUnitsSchema,
});

export type StudentLookupResult = z.infer<typeof studentLookupResultSchema>;
