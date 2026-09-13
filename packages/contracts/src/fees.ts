import { z } from 'zod';

import {
  basisPointsSchema,
  idSchema,
  positiveMinorUnitsSchema,
  textSchema,
} from './primitives';
import { feeFrequencySchema } from './vouchers';

/**
 * Fee contracts — the catalogue, and what a child was agreed to pay.
 *
 * docs/modules/fees-and-finance.md §2. This covers the bottom two layers of
 * that module and nothing above them: no plans, no billing periods, no voucher
 * generation. Those need a session axis and a batch engine; a school needs
 * "what do we charge" and "what did we agree with this family" first.
 *
 * **Every amount here is integer paisa** and every field carrying one ends in
 * `Minor` (CLAUDE.md). The database stores `numeric(14,2)` rupees; the
 * conversion happens once, in the service, and never leaks past it.
 */

/**
 * What kind of charge a head is.
 *
 * It groups the catalogue and makes a school recognise its own list at a
 * glance. `SECURITY` additionally means refundable — never income
 * (docs/modules/fees-and-finance.md §2). Nothing depends on that distinction
 * yet, and it is in the data from the first row precisely because it cannot be
 * reconstructed later.
 */
export const FEE_HEAD_TYPES = [
  'ADMISSION',
  'TUITION',
  'ANNUAL',
  'LAB',
  'STATIONERY',
  'SECURITY',
  'TRANSPORT',
  'EXAM',
  'CUSTOM',
] as const;

export const feeHeadTypeSchema = z.enum(FEE_HEAD_TYPES);
export type FeeHeadType = z.infer<typeof feeHeadTypeSchema>;

/** Labels, so a dropdown and a table cannot disagree about what to call a type. */
export const FEE_HEAD_TYPE_LABELS: Readonly<Record<FeeHeadType, string>> = {
  ADMISSION: 'Admission',
  TUITION: 'Tuition',
  ANNUAL: 'Annual',
  LAB: 'Lab',
  STATIONERY: 'Stationery',
  SECURITY: 'Security deposit',
  TRANSPORT: 'Transport',
  EXAM: 'Exam',
  CUSTOM: 'Custom',
};

export const feeHeadSchema = z.object({
  id: idSchema,
  type: feeHeadTypeSchema,
  name: z.string(),
  /** Integer paisa. The standard amount a new admission starts from. */
  defaultAmountMinor: positiveMinorUnitsSchema,
  sortOrder: z.int(),
  isActive: z.boolean(),
  /**
   * How often it is charged.
   *
   * Voucher generation depends on it: billing three months at once must
   * produce three tuition lines and exactly one admission fee.
   */
  frequency: feeFrequencySchema,
  /**
   * How many children are billed against this head.
   *
   * Travels with the row because the list needs it to decide whether "Delete"
   * is even offered — asking per row would be N+1 queries to render a table.
   */
  studentCount: z.int().min(0),
});

export type FeeHead = z.infer<typeof feeHeadSchema>;

export const createFeeHeadSchema = z
  .object({
    type: feeHeadTypeSchema.default('CUSTOM'),
    name: textSchema(80),
    defaultAmountMinor: positiveMinorUnitsSchema,
    sortOrder: z.int().min(0).max(9999).optional(),
  })
  .strict();

export type CreateFeeHead = z.infer<typeof createFeeHeadSchema>;

/**
 * Updating a head.
 *
 * Changing `defaultAmountMinor` changes what the *next* admission starts from
 * and nothing else — every existing child keeps the amount copied onto their
 * own row at admission. That is the module's founding rule (§1) and the reason
 * this endpoint is safe to expose without a confirmation step.
 */
export const updateFeeHeadSchema = createFeeHeadSchema
  .partial()
  .extend({ isActive: z.boolean().optional() })
  .strict();

export type UpdateFeeHead = z.infer<typeof updateFeeHeadSchema>;

/**
 * One line of a student's fee structure.
 *
 * `discountedAmountMinor` is the amount **payable**, not a reduction — that is
 * how a school states it ("we agreed 10,000 instead of 25,000"), and storing
 * the sentence people actually say removes a subtraction that can be got wrong
 * in either direction.
 */
export const studentFeeLineSchema = z
  .object({
    feeHeadId: idSchema,
    amountMinor: positiveMinorUnitsSchema,
    discountedAmountMinor: positiveMinorUnitsSchema.optional(),
    discountReason: z.string().trim().max(200).optional(),
  })
  .strict()
  .refine(
    (line) =>
      line.discountedAmountMinor === undefined || line.discountedAmountMinor <= line.amountMinor,
    {
      message: 'A discount cannot be more than the fee itself.',
      path: ['discountedAmountMinor'],
    },
  );

export type StudentFeeLine = z.infer<typeof studentFeeLineSchema>;

/** A student's fee structure as the portal reads it back, with names attached. */
export const studentFeeSchema = z.object({
  feeHeadId: idSchema,
  name: z.string(),
  type: feeHeadTypeSchema,
  amountMinor: positiveMinorUnitsSchema,
  discountedAmountMinor: positiveMinorUnitsSchema.nullable(),
  discountReason: z.string().nullable(),
  /** `discounted ?? amount`, resolved server-side so no caller re-derives it. */
  payableMinor: positiveMinorUnitsSchema,
});

export type StudentFee = z.infer<typeof studentFeeSchema>;

/**
 * Replace a student's whole fee structure.
 *
 * A whole-structure PUT rather than per-line PATCHes: the thing a person
 * changes is "this child's fees", they change two lines at once as often as
 * one, and a partial update leaves no single audit row that says what the
 * structure became.
 */
export const setStudentFeesSchema = z
  .object({ lines: z.array(studentFeeLineSchema).max(50) })
  .strict();

export type SetStudentFees = z.infer<typeof setStudentFeesSchema>;

/**
 * What a fee structure adds up to.
 *
 * Computed on the server and sent, rather than summed in the browser. Two
 * places that add money up are two places that can disagree, and the one on
 * screen is the one a parent is quoted.
 */
export const feeTotalsSchema = z.object({
  grossMinor: positiveMinorUnitsSchema,
  discountMinor: positiveMinorUnitsSchema,
  payableMinor: positiveMinorUnitsSchema,
});

export type FeeTotals = z.infer<typeof feeTotalsSchema>;

// --- The late fee -----------------------------------------------------------

/**
 * What a school adds when a challan is paid after its due date.
 *
 * ## Why this is not a fee head
 *
 * Every other charge in this file is something a student is *assigned* — a
 * tuition, a lab fee, a transport charge — and billed for whether or not
 * anything else happens. A late fee is not assigned to anybody. It is a
 * consequence of a date passing, computed per voucher at the moment it is
 * printed or paid, and it applies to a family that has never been late exactly
 * as much as it applies to one that always is: not at all, until they are.
 *
 * Putting `LATE_FEE` in the fee-head catalogue would let somebody add it to a
 * child's permanent fee structure, where it would be billed every month
 * regardless of when that family paid — which is the opposite of a late fee. So
 * it lives here, once per school, and appears on a voucher as a
 * `LATE_FEE` line rather than as a head anybody can assign.
 *
 * ## Percent *and* flat, not either
 *
 * Schools charge both shapes and some charge both at once — "2% or 200,
 * whichever we said" is a real policy. They are added, so a school that wants
 * only one leaves the other at zero, which is also the default: a school that
 * has never configured this charges nothing, and the challan says so.
 */
export const lateFeePolicySchema = z.object({
  /**
   * A percentage of what was payable within the due date, in basis points.
   *
   * 10,000 is 100%, so 2% is 200. Basis points rather than a decimal because
   * money must not meet a float on the wire (ADR-0007) — and because "2.5%" is
   * exactly representable as 250 and not as 0.025.
   */
  percentBasisPoints: basisPointsSchema,
  /** A fixed amount, added on top of the percentage. */
  flatMinor: positiveMinorUnitsSchema,
});

export type LateFeePolicy = z.infer<typeof lateFeePolicySchema>;

/**
 * Changing the policy.
 *
 * It applies to vouchers generated or edited **from now on**. A voucher already
 * issued keeps the late fee printed on the challan a parent is holding: the
 * figure on paper and the figure in the system have to agree, and silently
 * re-rating last month's challans is how they stop.
 */
export const updateLateFeePolicySchema = lateFeePolicySchema.strict();

export type UpdateLateFeePolicy = z.infer<typeof updateLateFeePolicySchema>;
