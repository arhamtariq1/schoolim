import { z } from 'zod';

import { listQuery } from './pagination';
import {
  calendarDateSchema,
  idSchema,
  idempotencyKeySchema,
  minorUnitsSchema,
  nonZeroMinorUnitsSchema,
} from './primitives';
import { genderSchema, studentStatusSchema } from './students';

/**
 * Putting fees up — or down — for one child or five hundred.
 *
 * ## Why this is not "edit the amount"
 *
 * A fee change has a **date it starts**. A school deciding in September that
 * tuition rises in October is not saying September was wrong; it is saying next
 * month costs more. Writing the new figure over the old one loses that
 * distinction, and with it the ability to reprint an August voucher that agrees
 * with the receipt a parent is holding.
 *
 * So an increment writes a new row on the child's fee timeline —
 * `student_fees`, keyed by `effective_from` — and leaves every earlier row
 * alone. Vouchers already issued are untouched by construction: they copied
 * their amounts at generation.
 *
 * ## Why the amount is a delta and not a target
 *
 * The screen says "increase by 500", not "set to 4,800", because a class of
 * thirty children on thirty different agreed fees is the normal case. One
 * target figure would flatten them all onto the same amount, quietly undoing
 * every sibling discount and every individually negotiated rate in the class —
 * a mistake nobody would notice until the vouchers went out.
 */

/** Which way the money moves. Spelled out so a negative amount is never how. */
export const feeChangeDirectionSchema = z.enum(['INCREASE', 'DECREASE']);
export type FeeChangeDirection = z.infer<typeof feeChangeDirectionSchema>;

/**
 * The list behind the screen: who can be incremented, and what they pay now.
 *
 * `grFrom`/`grTo` back the "Roll No Range" box — a school picks "GR 1 to 200"
 * far more often than it ticks two hundred boxes.
 */
export const feeIncrementListQuerySchema = listQuery(
  ['name', 'grNo', 'className', 'currentFee'] as const,
  {
    status: studentStatusSchema.optional(),
    sessionId: idSchema.optional(),
    classLevelId: idSchema.optional(),
    sectionId: idSchema.optional(),
    gender: genderSchema.optional(),
    /** GR number range, inclusive. Compared numerically, not as text. */
    grFrom: z.string().trim().min(1).max(32).optional(),
    grTo: z.string().trim().min(1).max(32).optional(),
    /**
     * Which head's amount the rows show and the increment applies to.
     *
     * Defaults to the school's tuition head on the server. Explicit here
     * because a school that charges transport separately will want to raise
     * that on its own without touching tuition.
     */
    feeHeadId: idSchema.optional(),
  },
  'grNo',
);

export type FeeIncrementListQuery = z.infer<typeof feeIncrementListQuerySchema>;

/** One row of the increment table. */
export const feeIncrementRowSchema = z.object({
  studentId: idSchema,
  grNo: z.string(),
  studentCode: z.string(),
  name: z.string(),
  fatherName: z.string().nullable(),
  gender: genderSchema.nullable(),
  className: z.string().nullable(),
  sectionName: z.string().nullable(),
  contact: z.string().nullable(),
  status: studentStatusSchema,
  admittedOn: calendarDateSchema.nullable(),
  /**
   * What this child pays for the chosen head **today**.
   *
   * Null means no agreed amount for it at all — a child who was never given
   * that head. Incrementing them is refused rather than guessed at: 0 + 500 is
   * a fee invented by arithmetic, not one the school agreed.
   */
  currentFeeMinor: minorUnitsSchema.nullable(),
  /**
   * What the family is actually billed today — the agreed amount less any
   * concession.
   *
   * Equal to `currentFeeMinor` for most children, and the whole point of the
   * column for the rest. A screen showing only the gross figure would read
   * 6,000 for a child whose voucher says 4,500, and the first person to notice
   * the difference would be the parent holding both.
   */
  currentPayableMinor: minorUnitsSchema.nullable(),
  /** Why they pay less, when they do. Shown beside the figure, not hidden. */
  discountReason: z.string().nullable(),
  /** A rise already dated in the future, so the screen does not apply two. */
  pendingFrom: calendarDateSchema.nullable(),
  pendingFeeMinor: minorUnitsSchema.nullable(),
  /** The scheduled figure net of the concession it carries forward. */
  pendingPayableMinor: minorUnitsSchema.nullable(),
});

export type FeeIncrementRow = z.infer<typeof feeIncrementRowSchema>;

export const feeIncrementListSchema = z.object({
  rows: z.array(feeIncrementRowSchema),
  total: z.int().min(0),
  /** The head these amounts are for, so the column header can name it. */
  feeHead: z.object({ id: idSchema, name: z.string() }),
});

export type FeeIncrementList = z.infer<typeof feeIncrementListSchema>;

/**
 * Applying a change.
 *
 * Idempotent and keyed (R5): the Submit button is a batch that writes hundreds
 * of rows, and a retried request must not raise fees twice.
 */
export const applyFeeIncrementSchema = z
  .object({
    /**
     * At most 500 at a time.
     *
     * Not a technical limit — it is the largest number a person can be said to
     * have meant. Past it the request is almost certainly "select all" on a
     * filter nobody checked, and a school that has just raised every fee in the
     * building by mistake has a very bad morning.
     */
    studentIds: z.array(idSchema).min(1).max(500),
    feeHeadId: idSchema,
    direction: feeChangeDirectionSchema,
    /** How much to move it by. Never zero or negative; the direction says which way. */
    amountMinor: nonZeroMinorUnitsSchema,
    /**
     * The day the new amount starts.
     *
     * May be in the future — that is the normal case, "from the 1st" — and may
     * be in the past, for a rise agreed in April and entered in June. It may
     * not predate the child's admission.
     */
    effectiveFrom: calendarDateSchema,
    idempotencyKey: idempotencyKeySchema,
  })
  .strict();

export type ApplyFeeIncrement = z.infer<typeof applyFeeIncrementSchema>;

/** Why a student in the selection was not changed. */
export const feeIncrementSkipReasonSchema = z.enum([
  /** No agreed amount for this head, so there is nothing to increase. */
  'NO_AGREED_AMOUNT',
  /** A decrease that would take the fee below zero. */
  'WOULD_GO_NEGATIVE',
  /** `effectiveFrom` is before the child was admitted. */
  'BEFORE_ADMISSION',
  /**
   * Already has a fee change dated that exact day.
   *
   * One amount per head per date, so there is nothing to append and nothing
   * safe to overwrite. Clear the existing row from the child's history first if
   * the date really is the one wanted.
   */
  'ALREADY_APPLIED',
  /** Not in this school, or removed between opening the screen and pressing Submit. */
  'NOT_FOUND',
]);

export type FeeIncrementSkipReason = z.infer<typeof feeIncrementSkipReasonSchema>;

export const feeIncrementResultSchema = z.object({
  applied: z.int().min(0),
  skipped: z.int().min(0),
  skips: z.array(
    z.object({
      studentId: idSchema,
      name: z.string(),
      grNo: z.string(),
      reason: feeIncrementSkipReasonSchema,
    }),
  ),
  /** True when a replay of an earlier request returned the stored answer. */
  replayed: z.boolean(),
});

export type FeeIncrementResult = z.infer<typeof feeIncrementResultSchema>;

/** One row of "Fee History of …". */
export const feeHistoryEntrySchema = z.object({
  id: idSchema,
  effectiveFrom: calendarDateSchema,
  amountMinor: minorUnitsSchema,
  /** What they actually pay, when a discount was agreed. */
  payableMinor: minorUnitsSchema,
  discountReason: z.string().nullable(),
  feeHeadId: idSchema,
  feeHeadName: z.string(),
  /** `tuition`, `admission`… the tag beside each row. */
  feeHeadType: z.string(),
  /** False once a later row has taken over. Only one row is current per head. */
  isCurrent: z.boolean(),
  /** True while the date is still ahead: a scheduled rise, not a past one. */
  isScheduled: z.boolean(),
});

export type FeeHistoryEntry = z.infer<typeof feeHistoryEntrySchema>;

export const feeHistorySchema = z.object({
  studentId: idSchema,
  studentName: z.string(),
  grNo: z.string(),
  entries: z.array(feeHistoryEntrySchema),
});

export type FeeHistory = z.infer<typeof feeHistorySchema>;

/**
 * Removing a row from the timeline.
 *
 * Allowed, and deliberately so: an increment entered with the wrong date or the
 * wrong figure is a typo, not a financial event, and a school must be able to
 * take it back. What it cannot do is change what has already been billed —
 * vouchers copied their amounts at generation and are untouched either way.
 *
 * The last remaining row for a head is refused: a child with a head and no
 * amount cannot be billed at all, and the voucher run would silently skip them.
 */
export const deleteFeeHistoryEntrySchema = z.object({ id: idSchema }).strict();
