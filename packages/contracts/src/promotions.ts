import { z } from 'zod';

import { idSchema } from './primitives';

/**
 * Moving a school from one academic session to the next.
 *
 * ## Why students do not move by themselves
 *
 * Making a session current does not carry anybody into it, and it must not.
 * "Which class is this child in next year" has four possible answers — they go
 * up, they repeat, they leave, or they are still being decided — and only the
 * school knows which. A rollover that guessed would silently enrol a child who
 * left in June, or move a child up who was held back, and the first anyone
 * would notice is a fee voucher addressed to a family that is no longer there.
 *
 * So a session begins empty and is filled by this run, deliberately, once. The
 * `Enrollment` model has said so since it was written: its statuses are
 * `PROMOTED`, `REPEATED`, `TRANSFERRED` and `LEFT`, and its comment reads "the
 * row year rollover writes".
 *
 * ## What the run will not do
 *
 * It never marks anybody as having left. A child not carried forward is simply
 * not carried forward — their old enrolment is untouched, and leaving is a
 * decision a school records on the student, not a side effect of a mis-ticked
 * box on a screen that moves two thousand children at once.
 *
 * It also never touches fees. `StudentFee` is keyed by student and date, not by
 * session, so a promoted child keeps the amount already agreed with their
 * family. Raising fees for the new year is its own deliberate act, with its own
 * screen, for the same reason this one exists.
 */

/** What happens to one class's worth of children. */
export const classMoveSchema = z.object({
  fromClassLevelId: idSchema,
  /**
   * Where they go. Null means "not carried forward" — the top class of a
   * school, or a class being retired.
   */
  toClassLevelId: idSchema.nullable(),
});

export type ClassMove = z.infer<typeof classMoveSchema>;

export const promotionPreviewQuerySchema = z.object({
  fromSessionId: idSchema,
  toSessionId: idSchema,
});

export type PromotionPreviewQuery = z.infer<typeof promotionPreviewQuerySchema>;

/** One row of the preview: a class, and what the run would do with it. */
export const promotionClassSchema = z.object({
  classLevelId: idSchema,
  className: z.string(),
  numericOrder: z.int(),
  /** Enrolled in the outgoing session, and not yet in the incoming one. */
  toMove: z.int().min(0),
  /**
   * Already enrolled in the incoming session.
   *
   * New admissions taken directly into next year, and anybody a previous run
   * already moved. Counted and shown rather than hidden, because "15 students
   * but the run says 13" is the question this screen exists to answer.
   */
  alreadyThere: z.int().min(0),
  /** The class above this one, by `numericOrder`. Null at the top. */
  suggestedToClassLevelId: idSchema.nullable(),
  suggestedToClassName: z.string().nullable(),
});

export type PromotionClass = z.infer<typeof promotionClassSchema>;

export const promotionPreviewSchema = z.object({
  from: z.object({ id: idSchema, name: z.string() }),
  to: z.object({ id: idSchema, name: z.string() }),
  classes: z.array(promotionClassSchema),
  /** Across every class, so the button can say what it is about to do. */
  totalToMove: z.int().min(0),
  totalAlreadyThere: z.int().min(0),
});

export type PromotionPreview = z.infer<typeof promotionPreviewSchema>;

export const runPromotionSchema = z
  .object({
    /**
     * The same key replays the same run rather than doing it twice.
     *
     * This moves every child in the school. A double-clicked button, or a
     * retry after a timeout, must not produce a second attempt — CLAUDE.md R5.
     */
    idempotencyKey: z.uuid(),
    fromSessionId: idSchema,
    toSessionId: idSchema,
    /**
     * One entry per class being moved. A class the school leaves out is a class
     * nobody is carried forward from, which is how "just move Grade 1 for now"
     * is expressed.
     */
    moves: z.array(classMoveSchema).max(100),
    /**
     * Children who stay where they are: enrolled in the new session, in the
     * same class. Their old enrolment is marked `REPEATED` rather than
     * `PROMOTED`, because a register that cannot tell those apart cannot
     * answer "how many did we hold back".
     */
    repeat: z.array(idSchema).max(5_000).default([]),
    /** Children not carried forward at all. Nothing about them is changed. */
    exclude: z.array(idSchema).max(5_000).default([]),
  })
  .strict()
  .refine((value) => value.fromSessionId !== value.toSessionId, {
    message: 'Choose two different sessions.',
    path: ['toSessionId'],
  })
  .refine(
    (value) => {
      const repeating = new Set(value.repeat);
      return !value.exclude.some((id) => repeating.has(id));
    },
    {
      // Otherwise the run has to pick one, and whichever it picks is wrong half
      // the time. Better refused than guessed.
      message: 'A student cannot both repeat the year and be left out of it.',
      path: ['exclude'],
    },
  );

export type RunPromotion = z.infer<typeof runPromotionSchema>;

export const promotionResultSchema = z.object({
  jobRunId: idSchema,
  /** Enrolled into the new session by this run. */
  promoted: z.int().min(0),
  repeated: z.int().min(0),
  /**
   * Already in the new session, so nothing was done for them.
   *
   * The count that makes a second run safe to press: it says "these were
   * already handled" rather than failing on a unique constraint.
   */
  skipped: z.int().min(0),
  /** True when this key had already run and the result is the earlier one. */
  replayed: z.boolean(),
});

export type PromotionResult = z.infer<typeof promotionResultSchema>;
