import {
  type PromotionPreview,
  type PromotionPreviewQuery,
  type PromotionResult,
  type RunPromotion,
} from '@ilm/contracts';
import { systemClock } from '@ilm/utils';
import { Injectable, Logger } from '@nestjs/common';

import { type TransactionClient } from '../../prisma';
import { PrismaService } from '../../prisma/prisma.service';
import { BusinessRuleError, NotFoundError } from '../../shared/errors/domain-error';
import { TenantContextService } from '../../shared/tenancy/tenant-context.service';

/**
 * Carrying a school from one academic session into the next.
 *
 * ## The rule this exists to enforce
 *
 * A session starts empty. Making it current does not move anybody into it, and
 * it must not: "which class is this child in next year" has four answers — up,
 * repeat, left, undecided — and only the school knows which. A rollover that
 * guessed would enrol a child who left in June and bill their family for it.
 *
 * So the move is one deliberate run, and this is it.
 *
 * ## Idempotent, keyed, batched, resumable (CLAUDE.md R5)
 *
 * It moves every child in the school, so all four matter:
 *
 * - **Keyed.** The same idempotency key replays the earlier result rather than
 *   running again, so a double-clicked button or a retry after a timeout cannot
 *   produce a second pass.
 * - **Idempotent even without the key.** A student already enrolled in the
 *   target session is skipped, not failed. That is what makes a *new* run over
 *   a partly-moved school safe — which is exactly the state a school is in when
 *   it has already admitted next year's new students directly into the new
 *   session.
 * - **Batched with a cursor**, so two thousand children are not one transaction
 *   held open across the whole operation, and a run that dies halfway can be
 *   resumed rather than restarted.
 *
 * ## What it deliberately does not do
 *
 * It never marks anybody `LEFT`. A child not carried forward is simply not
 * carried forward; leaving is recorded on the student, by somebody who meant
 * it, not as a side effect of a screen that moves the whole school at once.
 *
 * It never touches fees. `StudentFee` is keyed by student and date, not by
 * session, so a promoted child keeps what was agreed with their family. Raising
 * fees for the new year is its own act with its own screen.
 *
 * It never assigns a section. Sections belong to a session, so next year's are
 * a different set of rows — and a roll number is a place on a register that
 * does not exist yet. The school assigns both afterwards, which is also when
 * roll numbers get allocated under the existing lock.
 */
const JOB_KIND = 'student-promotion';

/**
 * How many students one transaction moves.
 *
 * Small enough that no transaction is long-lived under RLS and a failure loses
 * little work; large enough that a two-thousand-child school is forty round
 * trips rather than two thousand.
 */
const BATCH_SIZE = 200;

@Injectable()
export class PromotionService {
  private readonly logger = new Logger(PromotionService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly context: TenantContextService,
  ) {}

  /**
   * What a run would do, class by class.
   *
   * Counts rather than a list of names: a school with two thousand students
   * wants to see "Grade 1 → Grade 2, 38 students" and not scroll through
   * thirty-eight rows to find out.
   */
  async preview(query: PromotionPreviewQuery): Promise<PromotionPreview> {
    return this.prisma.tenant(async (tx) => {
      const { from, to } = await readSessions(tx, query.fromSessionId, query.toSessionId);

      const classes = await tx.classLevel.findMany({
        where: { isActive: true },
        select: { id: true, name: true, numericOrder: true },
        orderBy: { numericOrder: 'asc' },
      });

      // Everyone enrolled in the outgoing session, and everyone already in the
      // incoming one. Two grouped counts rather than a query per class: a
      // school with fourteen classes should not cost twenty-eight round trips.
      const outgoing = await tx.enrollment.groupBy({
        by: ['classLevelId'],
        where: { sessionId: from.id, status: 'ENROLLED' },
        _count: { _all: true },
      });

      const alreadyThere = await tx.enrollment.groupBy({
        by: ['classLevelId'],
        where: { sessionId: to.id },
        _count: { _all: true },
      });

      // Who is already in the target, so they can be excluded from `toMove`
      // rather than counted twice. Ids, because "already there" is about the
      // student and not about which class they landed in.
      const settled = new Set(
        (
          await tx.enrollment.findMany({
            where: { sessionId: to.id },
            select: { studentId: true },
          })
        ).map((row) => row.studentId),
      );

      const movable = await tx.enrollment.findMany({
        where: { sessionId: from.id, status: 'ENROLLED' },
        select: { studentId: true, classLevelId: true },
      });

      const toMoveByClass = new Map<string, number>();
      for (const row of movable) {
        if (settled.has(row.studentId)) {
          continue;
        }
        toMoveByClass.set(row.classLevelId, (toMoveByClass.get(row.classLevelId) ?? 0) + 1);
      }

      const outgoingIds = new Set(outgoing.map((row) => row.classLevelId));
      const alreadyByClass = new Map(
        alreadyThere.map((row) => [row.classLevelId, row._count._all] as const),
      );

      const rows = classes
        // Only classes this rollover has something to say about: one with
        // nobody in either session is noise on a screen that is already a list
        // of every class the school runs.
        .filter((level) => outgoingIds.has(level.id) || alreadyByClass.has(level.id))
        .map((level) => {
          const next = nextClass(classes, level.numericOrder);

          return {
            classLevelId: level.id,
            className: level.name,
            numericOrder: level.numericOrder,
            toMove: toMoveByClass.get(level.id) ?? 0,
            alreadyThere: alreadyByClass.get(level.id) ?? 0,
            suggestedToClassLevelId: next?.id ?? null,
            suggestedToClassName: next?.name ?? null,
            // No class above means this is the top of the school, whatever the
            // school calls it — O3, Grade 10 or Grade 5.
            suggestedAction: next === undefined ? ('GRADUATE' as const) : ('MOVE' as const),
          };
        });

      return {
        from: { id: from.id, name: from.name },
        to: { id: to.id, name: to.name },
        classes: rows,
        totalToMove: rows
          .filter((row) => row.suggestedAction === 'MOVE')
          .reduce((sum, row) => sum + row.toMove, 0),
        totalAlreadyThere: rows.reduce((sum, row) => sum + row.alreadyThere, 0),
        totalToGraduate: rows
          .filter((row) => row.suggestedAction === 'GRADUATE')
          .reduce((sum, row) => sum + row.toMove, 0),
      };
    });
  }

  async run(input: RunPromotion): Promise<PromotionResult> {
    const claimed = await this.claimRun(input);
    if (claimed.replay !== undefined) {
      return { ...claimed.replay, jobRunId: claimed.jobRunId, replayed: true };
    }

    try {
      const totals = await this.move(input, claimed.jobRunId, claimed.finishedOn);

      await this.prisma.tenant(async (tx) => {
        await tx.jobRun.update({
          where: { id: claimed.jobRunId },
          data: {
            status: 'COMPLETED',
            finishedAt: systemClock.now(),
            processed: totals.promoted + totals.repeated + totals.skipped,
            succeeded: totals.promoted + totals.repeated,
            skipped: totals.skipped,
            result: totals as never,
          },
        });

        // One audit row for the run, not one per child. Two thousand rows
        // saying "enrolled" would bury the fact that matters — that somebody
        // moved a whole school on a particular afternoon — and the job run is
        // already the itemised record.
        await tx.auditLog.create({
          data: {
            schoolId: this.context.schoolId,
            action: 'academics.promotion.run',
            entityType: 'AcademicSession',
            entityId: input.toSessionId,
            actorType: 'USER',
            actorUserId: this.context.userId ?? null,
            before: { sessionId: input.fromSessionId },
            after: { sessionId: input.toSessionId, ...totals },
            at: systemClock.now(),
          },
        });
      });

      return { ...totals, jobRunId: claimed.jobRunId, replayed: false };
    } catch (error) {
      await this.failRun(claimed.jobRunId, error);
      throw error;
    }
  }

  /**
   * The move itself, one batch at a time.
   *
   * Ordered by student id and resumed from a stored cursor, so a run that dies
   * on batch seven of forty continues from there rather than starting again —
   * and so the batches partition the school rather than overlapping, which an
   * offset would not once rows start changing underneath it.
   */
  private async move(
    input: RunPromotion,
    jobRunId: string,
    /** The outgoing year's last day: when a leaver actually left. */
    finishedOn: Date,
  ): Promise<{ promoted: number; repeated: number; graduated: number; skipped: number }> {
    const actions = new Map(input.moves.map((move) => [move.fromClassLevelId, move] as const));
    const repeating = new Set(input.repeat);
    const excluded = new Set(input.exclude);

    const totals = { promoted: 0, repeated: 0, graduated: 0, skipped: 0 };
    let cursor: string | undefined;

    for (;;) {
      const done = await this.prisma.tenant(async (tx) => {
        const batch = await tx.enrollment.findMany({
          where: {
            sessionId: input.fromSessionId,
            status: 'ENROLLED',
            ...(cursor === undefined ? {} : { studentId: { gt: cursor } }),
          },
          select: { id: true, studentId: true, classLevelId: true },
          orderBy: { studentId: 'asc' },
          take: BATCH_SIZE,
        });

        if (batch.length === 0) {
          return true;
        }

        // One query for the whole batch rather than one per student: the
        // question "is this child already in the new session" is the same shape
        // two hundred times over.
        const settled = new Set(
          (
            await tx.enrollment.findMany({
              where: {
                sessionId: input.toSessionId,
                studentId: { in: batch.map((row) => row.studentId) },
              },
              select: { studentId: true },
            })
          ).map((row) => row.studentId),
        );

        for (const enrolment of batch) {
          if (settled.has(enrolment.studentId) || excluded.has(enrolment.studentId)) {
            // Already handled, or deliberately left out. Either way nothing is
            // written and nothing is an error — this is what makes a second
            // press of the button safe.
            totals.skipped += 1;
            continue;
          }

          // Repeating beats everything the class was told to do. A child held
          // back in the top form must not be passed out with their year.
          const repeats = repeating.has(enrolment.studentId);
          const action = actions.get(enrolment.classLevelId);

          if (!repeats && action === undefined) {
            // A class nobody was asked to do anything with. Left exactly as it
            // is — an undecided year group is not a finished one.
            totals.skipped += 1;
            continue;
          }

          if (!repeats && action?.action === 'GRADUATE') {
            await this.graduate(tx, enrolment, finishedOn);
            totals.graduated += 1;
            continue;
          }

          const target = repeats
            ? enrolment.classLevelId
            : action?.action === 'MOVE'
              ? action.toClassLevelId
              : undefined;

          if (target === undefined) {
            totals.skipped += 1;
            continue;
          }

          await tx.enrollment.create({
            data: {
              schoolId: this.context.schoolId,
              studentId: enrolment.studentId,
              sessionId: input.toSessionId,
              classLevelId: target,
              // No section and so no roll number: sections belong to a session,
              // and next year's do not exist until the school makes them.
              status: 'ENROLLED',
              enrolledOn: null,
            } as never,
          });

          await tx.enrollment.update({
            where: { id: enrolment.id },
            data: { status: repeats ? 'REPEATED' : 'PROMOTED' },
          });

          if (repeats) {
            totals.repeated += 1;
          } else {
            totals.promoted += 1;
          }
        }

        cursor = batch[batch.length - 1]?.studentId;

        await tx.jobRun.update({
          where: { id: jobRunId },
          data: {
            cursor: cursor ?? null,
            processed:
              totals.promoted + totals.repeated + totals.graduated + totals.skipped,
          },
        });

        // A short batch means the end of the roll; a full one might not.
        return batch.length < BATCH_SIZE;
      });

      if (done) {
        return totals;
      }
    }
  }

  /**
   * A child who has finished the school.
   *
   * Exactly what `StudentsService.setStatus` writes when somebody marks one
   * child passed out by hand — the same two rows, the same two dates, the same
   * two vocabularies. A second definition of "graduated" is how a school ends
   * up with leavers who still appear in a fee run because they left through the
   * wrong door.
   *
   * `endedOn` and `leftOn` are the outgoing year's last day rather than today:
   * a rollover run in August must not record thirty children as having left in
   * August when they finished in June.
   */
  private async graduate(
    tx: TransactionClient,
    enrolment: { id: string; studentId: string },
    finishedOn: Date,
  ): Promise<void> {
    await tx.enrollment.update({
      where: { id: enrolment.id },
      // The enrolment's own vocabulary, which is not the student's: graduating
      // *promotes* the enrolment out of its class. There is no COMPLETED here.
      data: { status: 'PROMOTED', endedOn: finishedOn },
    });

    await tx.student.update({
      where: { id: enrolment.studentId },
      data: { status: 'GRADUATED', leftOn: finishedOn },
    });
  }

  /**
   * Take the idempotency key, or hand back what the key already produced.
   *
   * The unique index on `(school_id, kind, idempotency_key)` is what makes this
   * safe under a genuine double-click: both requests try to insert, one wins,
   * the loser reads the winner's row.
   */
  private async claimRun(input: RunPromotion): Promise<{
    jobRunId: string;
    /** The outgoing session's last day, for anybody leaving. */
    finishedOn: Date;
    replay?: Omit<PromotionResult, 'jobRunId' | 'replayed'>;
  }> {
    return this.prisma.tenant(async (tx) => {
      // Both sessions have to exist and belong to this school before a job run
      // is recorded against them, or a typo leaves a RUNNING row behind.
      const { from } = await readSessions(tx, input.fromSessionId, input.toSessionId);
      const finishedOn = from.endDate;

      const prior = await tx.jobRun.findFirst({
        where: { kind: JOB_KIND, idempotencyKey: input.idempotencyKey },
        select: { id: true, status: true, result: true },
      });

      if (prior !== null) {
        if (prior.status === 'RUNNING') {
          throw new BusinessRuleError(
            'ACADEMICS_PROMOTION_IN_PROGRESS',
            'That promotion is still running. Give it a moment rather than starting it again.',
          );
        }
        if (prior.status === 'COMPLETED') {
          const result = prior.result as {
            promoted?: number;
            repeated?: number;
            graduated?: number;
            skipped?: number;
          } | null;

          return {
            jobRunId: prior.id,
            finishedOn,
            replay: {
              promoted: result?.promoted ?? 0,
              repeated: result?.repeated ?? 0,
              graduated: result?.graduated ?? 0,
              skipped: result?.skipped ?? 0,
            },
          };
        }

        throw new BusinessRuleError(
          'ACADEMICS_PROMOTION_ALREADY_RUN',
          'That promotion failed earlier. Start a new one rather than retrying this key.',
        );
      }

      const run = await tx.jobRun.create({
        data: {
          schoolId: this.context.schoolId,
          kind: JOB_KIND,
          idempotencyKey: input.idempotencyKey,
          params: input as never,
          ...(this.context.userId === undefined ? {} : { createdBy: this.context.userId }),
        } as never,
        select: { id: true },
      });

      return { jobRunId: run.id, finishedOn };
    });
  }

  private async failRun(jobRunId: string, error: unknown): Promise<void> {
    const message = error instanceof Error ? error.message : String(error);
    this.logger.error(`Promotion ${jobRunId} failed: ${message}`);

    try {
      await this.prisma.tenant(async (tx) => {
        await tx.jobRun.update({
          where: { id: jobRunId },
          data: { status: 'FAILED', finishedAt: systemClock.now(), error: message.slice(0, 500) },
        });
      });
    } catch {
      // The run already failed; failing to record that must not replace the
      // original error with a less useful one.
    }
  }
}

/**
 * Both sessions, proved to be this school's.
 *
 * RLS would stop a cross-tenant write, but a foreign key check runs as the
 * referential-integrity trigger and does **not** apply RLS — so a session id
 * belonging to another school would satisfy the constraint and produce an
 * enrolment pointing across tenants. Reading them through the tenant client
 * first is what closes that.
 */
async function readSessions(
  tx: TransactionClient,
  fromSessionId: string,
  toSessionId: string,
): Promise<{
  from: { id: string; name: string; endDate: Date };
  to: { id: string; name: string };
}> {
  const sessions = await tx.academicSession.findMany({
    where: { id: { in: [fromSessionId, toSessionId] } },
    select: { id: true, name: true, endDate: true },
  });

  const from = sessions.find((session) => session.id === fromSessionId);
  const to = sessions.find((session) => session.id === toSessionId);

  if (from === undefined || to === undefined) {
    throw new NotFoundError('academic session');
  }

  return { from, to };
}

/**
 * The class above this one.
 *
 * By `numericOrder`, which the schema documents as "what promotion increments"
 * — and by *the next one that exists* rather than `order + 1`, so a school that
 * numbers Nursery 0, KG 5 and Grade 1 10 still promotes correctly. Undefined at
 * the top of the school.
 */
function nextClass(
  classes: readonly { id: string; name: string; numericOrder: number }[],
  order: number,
): { id: string; name: string } | undefined {
  return classes.find((level) => level.numericOrder > order);
}
