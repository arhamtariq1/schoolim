import { randomBytes } from 'node:crypto';

import {
  type GenerateVouchers,
  type GenerationResult,
  type PreviewVouchers,
  type SkipReason,
  type VoucherPreview,
  type VoucherScope,
} from '@ilm/contracts';
import { type TransactionClient } from '@ilm/db';
import {
  fromDecimalString,
  minorUnits,
  percentageOfMoney,
  systemClock,
  toDecimalString,
  type MinorUnits,
} from '@ilm/utils';
import { Injectable, Logger } from '@nestjs/common';

import { BusinessRuleError, NotFoundError } from '../../shared/errors/domain-error';
import { PrismaService } from '../../shared/prisma/prisma.service';

import {
  type PlannedLine,
  type StudentPlan,
  buildStudentPlan,
  loadArrearSources,
  loadHeadCatalogue,
  type HeadCatalogue,
} from './voucher-planner';

/**
 * Generating vouchers — the batch engine, docs/modules/fees-and-finance §5.
 *
 * ## Preview and generate are the same function
 *
 * `preview()` and `generate()` both call {@link planChunk}. That is not a tidy
 * refactor, it is the requirement: docs §5 calls the preview step
 * non-negotiable, and a preview computed a second way is a preview that
 * eventually disagrees with what generation actually does. The only difference
 * between the two is that one of them writes.
 *
 * ## Why this is chunked
 *
 * "All students wise" on a school four years in is several thousand children,
 * each needing their own agreed amounts and their own arrears. Doing that in
 * one transaction holds locks for the whole run and loses everything if the
 * request times out. So: {@link CHUNK_SIZE} students per transaction, a cursor
 * persisted after each one, and a `job_runs` row that makes the whole thing
 * resumable and idempotent — CLAUDE.md R5.
 *
 * ## What actually prevents double-billing
 *
 * Not the code. `fee_voucher_periods` has a unique index on
 * `(school_id, student_id, fee_head_id, period_key)`, and generation inserts
 * into it with `ON CONFLICT DO NOTHING`. A second run for September collides
 * there and reports the student as skipped. Even two runs racing each other
 * produce one charge, because the guarantee is a constraint rather than a
 * check-then-write.
 */
@Injectable()
export class VoucherGenerationService {
  private readonly logger = new Logger(VoucherGenerationService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * What generation would do, without doing it.
   *
   * Reads the whole scope rather than sampling: a preview that extrapolates
   * from the first fifty students is exactly wrong for the school whose
   * discounts are concentrated in one class.
   */
  async preview(input: PreviewVouchers): Promise<VoucherPreview> {
    const context = await this.loadContext(
      input.sessionId,
      input.heads.map((h) => h.feeHeadId),
    );

    let willCreate = 0;
    let gross = 0;
    let discount = 0;
    let arrears = 0;
    const skips = new Map<SkipReason, number>();
    const headTotals = new Map<string, { students: number; amount: number }>();
    const samples: VoucherPreview['samples'] = [];

    for await (const plan of this.eachPlan(input, context)) {
      if (plan.skip !== undefined) {
        skips.set(plan.skip, (skips.get(plan.skip) ?? 0) + 1);
        continue;
      }

      willCreate += 1;
      for (const line of plan.lines) {
        gross += line.amountMinor;
        discount += line.discountMinor;
        const running = headTotals.get(line.feeHeadId) ?? { students: 0, amount: 0 };
        running.amount += line.amountMinor - line.discountMinor;
        headTotals.set(line.feeHeadId, running);
      }
      // Counted once per student per head, not once per line: a student billed
      // three months of tuition is one student, not three.
      for (const headId of new Set(plan.lines.map((line) => line.feeHeadId))) {
        const running = headTotals.get(headId);
        if (running !== undefined) {
          running.students += 1;
        }
      }
      arrears += plan.arrearsMinor;

      if (samples.length < SAMPLE_COUNT) {
        samples.push({
          studentId: plan.studentId,
          studentName: plan.studentName,
          grNo: plan.grNo,
          netPayableMinor: minorUnits(plan.ownPayableMinor + plan.arrearsMinor),
          arrearsMinor: minorUnits(plan.arrearsMinor),
          lines: plan.lines.map((line) => ({
            label: line.label,
            amountMinor: minorUnits(line.amountMinor),
            discountMinor: minorUnits(line.discountMinor),
          })),
        });
      }
    }

    const willSkip = [...skips.values()].reduce((sum, n) => sum + n, 0);

    return {
      willCreate,
      willSkip,
      skipsByReason: [...skips.entries()].map(([reason, count]) => ({ reason, count })),
      grossMinor: minorUnits(gross),
      discountMinor: minorUnits(discount),
      arrearsMinor: minorUnits(arrears),
      netPayableMinor: minorUnits(gross - discount + arrears),
      headTotals: [...headTotals.entries()].map(([feeHeadId, totals]) => {
        const head = context.heads.get(feeHeadId);
        return {
          feeHeadId,
          name: head?.name ?? 'Unknown fee',
          frequency: head?.frequency ?? 'MONTHLY',
          studentCount: totals.students,
          amountMinor: minorUnits(totals.amount),
        };
      }),
      samples,
      warnings: buildWarnings(willCreate, skips),
    };
  }

  /**
   * Write the vouchers.
   *
   * The idempotency key is claimed first, in its own transaction. A second
   * request carrying the same key finds a finished run and replays its result
   * rather than generating a second set of challans — which is what happens
   * when somebody presses a slow button twice.
   */
  async generate(input: GenerateVouchers, actorId: string | undefined): Promise<GenerationResult> {
    const existing = await this.claimRun(input, actorId);
    if (existing.replay !== undefined) {
      return { ...existing.replay, jobRunId: existing.jobRunId, replayed: true };
    }

    const context = await this.loadContext(
      input.sessionId,
      input.heads.map((h) => h.feeHeadId),
    );

    let created = 0;
    let skipped = 0;
    let netPayable = 0;

    try {
      for await (const batch of this.eachBatch(input, context)) {
        const written = await this.writeBatch(input, context, batch, actorId, existing.jobRunId);
        created += written.created;
        skipped += written.skipped;
        netPayable += written.netPayableMinor;

        // Persisted after every chunk, so a run that dies at student 1,800 of
        // 2,000 resumes there instead of starting again.
        await this.prisma.tenant(async (tx) => {
          await tx.jobRun.update({
            where: { id: existing.jobRunId },
            data: {
              cursor: batch.at(-1)?.studentId ?? null,
              processed: { increment: batch.length },
              succeeded: { increment: written.created },
              skipped: { increment: written.skipped },
            },
          });
        });
      }
    } catch (error) {
      await this.failRun(existing.jobRunId, error);
      throw error;
    }

    const result = { created, skipped, netPayableMinor: minorUnits(netPayable) };

    await this.prisma.tenant(async (tx) => {
      await tx.jobRun.update({
        where: { id: existing.jobRunId },
        data: { status: 'COMPLETED', finishedAt: systemClock.now(), result },
      });
    });

    return { ...result, jobRunId: existing.jobRunId, replayed: false };
  }

  // --- The shared path ------------------------------------------------------

  /** Everything a plan needs that does not change per student. */
  private async loadContext(sessionId: string, headIds: string[]): Promise<GenerationContext> {
    return this.prisma.tenant(async (tx) => {
      const session = await tx.academicSession.findUnique({
        where: { id: sessionId },
        select: { id: true, name: true },
      });
      if (session === null) {
        throw new NotFoundError('That session does not exist.');
      }

      const heads = await loadHeadCatalogue(tx, headIds);
      if (heads.size !== new Set(headIds).size) {
        throw new NotFoundError('One of the chosen fees no longer exists.');
      }

      const school = await tx.school.findFirstOrThrow({
        select: { lateFeePercent: true, lateFeeFlat: true },
      });

      return {
        sessionId: session.id,
        heads,
        // A numeric(5,2) percent parsed as a decimal IS its basis points:
        // 5.00 becomes 500. No float, no rounding, no second unit to confuse.
        lateFeeBasisPoints: fromDecimalString(school.lateFeePercent.toFixed(2)),
        lateFeeFlatMinor: fromDecimalString(school.lateFeeFlat.toFixed(2)),
      };
    });
  }

  /** Plans, one student at a time, across every chunk. */
  private async *eachPlan(
    input: PreviewVouchers,
    context: GenerationContext,
  ): AsyncGenerator<StudentPlan> {
    for await (const batch of this.eachBatch(input, context)) {
      yield* batch;
    }
  }

  /**
   * Plans in chunks of {@link CHUNK_SIZE}, keyed off a student-id cursor.
   *
   * Ordering by `id` rather than by name is what makes the cursor safe: a name
   * can change mid-run and a student would then be visited twice or not at all.
   */
  private async *eachBatch(
    input: PreviewVouchers,
    context: GenerationContext,
  ): AsyncGenerator<StudentPlan[]> {
    let cursor: string | undefined;

    for (;;) {
      const batch = await this.prisma.tenant(async (tx) => {
        const students = await tx.student.findMany({
          where: {
            ...studentScopeWhere(input.scope, context.sessionId),
            ...(cursor === undefined ? {} : { id: { gt: cursor } }),
          },
          orderBy: { id: 'asc' },
          take: CHUNK_SIZE,
          select: {
            id: true,
            firstName: true,
            lastName: true,
            grNo: true,
            fees: {
              where: { feeHeadId: { in: [...context.heads.keys()] } },
              select: { feeHeadId: true, amount: true, discountedAmount: true },
            },
          },
        });

        if (students.length === 0) {
          return [];
        }

        const studentIds = students.map((student) => student.id);
        const alreadyBilled = await tx.feeVoucherPeriod.findMany({
          where: { studentId: { in: studentIds } },
          select: { studentId: true, feeHeadId: true, periodKey: true },
        });

        const arrearsByStudent = input.includeArrears
          ? await loadArrearSources(tx, studentIds, input.issueDate)
          : new Map<string, { voucherId: string; voucherNo: string; balanceMinor: number }[]>();

        return students.map((student) =>
          buildStudentPlan({
            student,
            heads: context.heads,
            overrides: new Map(
              input.heads
                .filter((head) => head.amountMinor !== undefined)
                .map((head) => [head.feeHeadId, head.amountMinor as number]),
            ),
            billMonths: input.billMonths,
            sessionId: context.sessionId,
            alreadyBilled,
            arrears: arrearsByStudent.get(student.id) ?? [],
          }),
        );
      });

      if (batch.length === 0) {
        return;
      }

      yield batch;
      cursor = batch.at(-1)?.studentId;
      if (batch.length < CHUNK_SIZE) {
        return;
      }
    }
  }

  /**
   * One chunk, one transaction — and a handful of statements, not a handful
   * per student.
   *
   * ## Why this is batched rather than a loop
   *
   * It began as a per-student loop of roughly seven queries. Two hundred
   * students is then fourteen hundred round trips, which against a hosted
   * database is minutes and blew Prisma's transaction timeout part-way
   * through — the failure mode being a school billed halfway and a run that
   * cannot say where it stopped. Grouping the work makes the cost of a chunk
   * independent of how many children are in it.
   *
   * ## Why the ids are generated here
   *
   * `createMany` does not hand ids back, and the lines, the period claims and
   * the arrears references all need to point at their voucher. So the ids are
   * made first, in the order the vouchers will be written.
   *
   * ## What still guarantees no double-billing
   *
   * The claims are inserted with `skipDuplicates` and then read back. A voucher
   * that won none of its periods is deleted before the transaction ends; one
   * that won only some has its amounts corrected. In the ordinary case — no
   * other run competing — nothing is corrected and nothing is deleted.
   */
  private async writeBatch(
    input: GenerateVouchers,
    context: GenerationContext,
    batch: StudentPlan[],
    actorId: string | undefined,
    jobRunId: string,
  ): Promise<{ created: number; skipped: number; netPayableMinor: number }> {
    const billable = batch.filter((plan) => plan.skip === undefined);
    if (billable.length === 0) {
      return { created: 0, skipped: batch.length, netPayableMinor: 0 };
    }

    return this.prisma.tenant(
      async (tx) => {
        const firstNumber = await allocateVoucherNumbers(tx, billable.length);

        const drafts = billable.map((plan, index) => ({
          id: uuidV7(),
          plan,
          voucherNo: `FV-${String(firstNumber + index).padStart(6, '0')}`,
        }));

        // 1. The vouchers, with the amounts the plan expects.
        await tx.feeVoucher.createMany({
          data: drafts.map((draft) => ({
            id: draft.id,
            sessionId: input.sessionId,
            studentId: draft.plan.studentId,
            voucherNo: draft.voucherNo,
            issueDate: new Date(input.issueDate),
            dueDate: new Date(input.dueDate),
            validTill: new Date(input.validTill),
            billMonths: monthsOf(draft.plan.lines),
            ...amountsFor(draft.plan, draft.plan.lines, input.applyLateFee, context),
            lateFeeAuto: input.applyLateFee,
            jobRunId,
            ...(actorId === undefined ? {} : { createdBy: actorId }),
          })) as never,
        });

        // 2. Claim the periods. A collision is silently skipped rather than
        //    aborting the chunk — one student already billed for September must
        //    not cost the other 199 their vouchers.
        await tx.feeVoucherPeriod.createMany({
          data: drafts.flatMap((draft) =>
            draft.plan.lines.map((line) => ({
              voucherId: draft.id,
              studentId: draft.plan.studentId,
              feeHeadId: line.feeHeadId,
              periodKey: line.periodKey,
            })),
          ) as never,
          skipDuplicates: true,
        });

        // 3. Read back what this run actually won.
        const claims = await tx.feeVoucherPeriod.findMany({
          where: { voucherId: { in: drafts.map((draft) => draft.id) } },
          select: { voucherId: true, feeHeadId: true, periodKey: true },
        });

        const wonByVoucher = new Map<string, Set<string>>();
        for (const claim of claims) {
          const set = wonByVoucher.get(claim.voucherId) ?? new Set<string>();
          set.add(`${claim.feeHeadId}:${claim.periodKey}`);
          wonByVoucher.set(claim.voucherId, set);
        }

        const kept: { id: string; plan: StudentPlan; lines: PlannedLine[] }[] = [];
        const abandoned: string[] = [];
        const corrected: typeof kept = [];

        for (const draft of drafts) {
          const won = wonByVoucher.get(draft.id) ?? new Set<string>();
          const lines = draft.plan.lines.filter((line) => won.has(line.claimKey));
          const total = payableOf(lines) + draft.plan.arrearsMinor;

          if (lines.length === 0 || total <= 0) {
            abandoned.push(draft.id);
            continue;
          }
          kept.push({ id: draft.id, plan: draft.plan, lines });
          if (lines.length !== draft.plan.lines.length) {
            corrected.push({ id: draft.id, plan: draft.plan, lines });
          }
        }

        // 4. Vouchers that won nothing never existed. The cascade takes their
        //    claims with them.
        if (abandoned.length > 0) {
          await tx.feeVoucher.deleteMany({ where: { id: { in: abandoned } } });
        }

        // 5. The printed lines.
        if (kept.length > 0) {
          await tx.feeVoucherLine.createMany({
            data: kept.flatMap((entry) =>
              entry.lines.map((line, index) => ({
                voucherId: entry.id,
                feeHeadId: line.feeHeadId,
                kind: 'FEE' as const,
                label: line.label,
                billMonth: line.billMonth,
                amount: toDecimalString(minorUnits(line.amountMinor)),
                discount: toDecimalString(minorUnits(line.discountMinor)),
                sortOrder: index,
              })),
            ) as never,
          });

          const arrears = kept.flatMap((entry) =>
            entry.plan.arrears.map((arrear) => ({
              voucherId: entry.id,
              sourceVoucherId: arrear.voucherId,
              amount: toDecimalString(minorUnits(arrear.balanceMinor)),
            })),
          );
          if (arrears.length > 0) {
            await tx.feeVoucherArrear.createMany({ data: arrears as never });
          }
        }

        // 6. The rare path: somebody else took some of these periods between
        //    the plan and this write, so the amounts written in step 1 are too
        //    high. Corrected one at a time because it is a handful at most.
        for (const entry of corrected) {
          await tx.feeVoucher.update({
            where: { id: entry.id },
            data: {
              billMonths: monthsOf(entry.lines),
              ...amountsFor(entry.plan, entry.lines, input.applyLateFee, context),
            },
          });
        }

        const netPayableMinor = kept.reduce(
          (sum, entry) => sum + payableOf(entry.lines) + entry.plan.arrearsMinor,
          0,
        );

        return {
          created: kept.length,
          skipped: batch.length - kept.length,
          netPayableMinor,
        };
      },
      // Prisma's five-second default is sized for a request touching a few
      // rows. A chunk here writes two hundred vouchers and their lines, and
      // timing out part-way is how a run half-bills a school.
      { timeout: BATCH_TIMEOUT_MS, maxWait: BATCH_MAX_WAIT_MS },
    );
  }

  // --- The job run ----------------------------------------------------------

  /**
   * Take the idempotency key, or hand back what the key already produced.
   *
   * The unique index on `(school_id, kind, idempotency_key)` is what makes this
   * safe under a genuine double-click: both requests try to insert, one wins,
   * the loser reads the winner's row.
   */
  private async claimRun(
    input: GenerateVouchers,
    actorId: string | undefined,
  ): Promise<{ jobRunId: string; replay?: Omit<GenerationResult, 'jobRunId' | 'replayed'> }> {
    return this.prisma.tenant(async (tx) => {
      const prior = await tx.jobRun.findFirst({
        where: { kind: JOB_KIND, idempotencyKey: input.idempotencyKey },
        select: { id: true, status: true, result: true },
      });

      if (prior !== null) {
        if (prior.status === 'RUNNING') {
          throw new BusinessRuleError(
            'FEES_GENERATION_IN_PROGRESS',
            'That generation is still running. Give it a moment rather than starting it again.',
          );
        }
        if (prior.status === 'COMPLETED') {
          const result = prior.result as {
            created?: number;
            skipped?: number;
            netPayableMinor?: number;
          } | null;
          return {
            jobRunId: prior.id,
            replay: {
              created: result?.created ?? 0,
              skipped: result?.skipped ?? 0,
              netPayableMinor: minorUnits(result?.netPayableMinor ?? 0),
            },
          };
        }
        throw new BusinessRuleError(
          'FEES_GENERATION_ALREADY_RUN',
          'That generation failed earlier. Start a new one rather than retrying this key.',
        );
      }

      const run = await tx.jobRun.create({
        data: {
          kind: JOB_KIND,
          idempotencyKey: input.idempotencyKey,
          params: input as never,
          ...(actorId === undefined ? {} : { createdBy: actorId }),
        } as never,
        select: { id: true },
      });

      return { jobRunId: run.id };
    });
  }

  private async failRun(jobRunId: string, error: unknown): Promise<void> {
    const message = error instanceof Error ? error.message : String(error);
    this.logger.error(`Voucher generation ${jobRunId} failed: ${message}`);
    try {
      await this.prisma.tenant(async (tx) => {
        await tx.jobRun.update({
          where: { id: jobRunId },
          data: { status: 'FAILED', finishedAt: systemClock.now(), error: message.slice(0, 500) },
        });
      });
    } catch {
      // The original failure is the one worth reporting; losing the bookkeeping
      // update on top of it must not replace the error the caller needs to see.
    }
  }
}

const JOB_KIND = 'fee-voucher-generation';

/**
 * Students per transaction.
 *
 * 200 is the figure docs §5 sets, and it is a balance: larger holds locks and
 * more memory, smaller multiplies round trips. At this size a thousand students
 * is five transactions.
 */
const CHUNK_SIZE = 200;

/** Sample vouchers shown in the preview, so the numbers can be checked. */
const SAMPLE_COUNT = 5;

/** A chunk of two hundred vouchers, against a database that may be far away. */
const BATCH_TIMEOUT_MS = 60_000;
/** Fail fast rather than queue behind a busy pool. */
const BATCH_MAX_WAIT_MS = 10_000;

/** Payable before arrears — gross less the discounts agreed per child. */
function payableOf(lines: readonly PlannedLine[]): number {
  return lines.reduce((sum, line) => sum + line.amountMinor - line.discountMinor, 0);
}

function monthsOf(lines: readonly PlannedLine[]): Date[] {
  const months = new Map<number, Date>();
  for (const line of lines) {
    if (line.billMonth !== null) {
      months.set(line.billMonth.getTime(), line.billMonth);
    }
  }
  return [...months.values()].sort((a, b) => a.getTime() - b.getTime());
}

/**
 * The money columns for one voucher.
 *
 * `netPayable` is the voucher's **own** charge. Arrears sit in their own column
 * and are printed alongside; folding them in here made the same debt appear on
 * two rows of the outstanding report and left a fully-paid voucher reading as
 * part paid.
 */
function amountsFor(
  plan: StudentPlan,
  lines: readonly PlannedLine[],
  applyLateFee: boolean,
  context: GenerationContext,
): Record<string, string> {
  const gross = lines.reduce((sum, line) => sum + line.amountMinor, 0);
  const discount = lines.reduce((sum, line) => sum + line.discountMinor, 0);
  const net = gross - discount;
  const total = net + plan.arrearsMinor;

  return {
    grossAmount: toDecimalString(minorUnits(gross)),
    discountAmount: toDecimalString(minorUnits(discount)),
    arrearsAmount: toDecimalString(minorUnits(plan.arrearsMinor)),
    netPayable: toDecimalString(minorUnits(net)),
    // Charged on the whole figure the parent is asked for, arrears included —
    // that is what "payable after due date" means on a challan.
    lateFeeAmount: toDecimalString(
      minorUnits(
        applyLateFee
          ? computeLateFee(total, context.lateFeeBasisPoints, context.lateFeeFlatMinor)
          : 0,
      ),
    ),
  };
}

/**
 * Take `count` voucher numbers at once.
 *
 * One statement for the whole chunk rather than one per voucher, and still
 * gapless: the sequence moves by `count` under the row lock the upsert takes,
 * so two concurrent runs cannot be handed overlapping ranges.
 */
async function allocateVoucherNumbers(tx: TransactionClient, count: number): Promise<number> {
  const rows = await tx.$queryRawUnsafe<{ first: number }[]>(
    `INSERT INTO number_sequences (id, school_id, kind, next_value, updated_at)
     VALUES (gen_random_uuid(), current_school_id(), 'voucher', $1::int + 1, now())
     ON CONFLICT (school_id, kind)
     DO UPDATE SET next_value = number_sequences.next_value + $1::int, updated_at = now()
     RETURNING next_value - $1::int AS first`,
    count,
  );

  const first = rows[0]?.first;
  if (first === undefined) {
    throw new BusinessRuleError(
      'INTERNAL_ERROR',
      'Could not allocate voucher numbers. Nothing was saved.',
    );
  }
  return first;
}

/**
 * A time-ordered UUID, matching the `uuid(7)` the columns default to.
 *
 * Generated here because `createMany` does not return ids and the lines, the
 * period claims and the arrears references all have to point at their voucher.
 * Version 7 rather than 4 so inserts stay at the right-hand edge of the index
 * instead of scattering across it — which is the difference between a batch
 * that appends and one that fragments the table.
 */
function uuidV7(): string {
  const bytes = randomBytes(16);
  const now = BigInt(Date.now());

  for (let index = 0; index < 6; index += 1) {
    bytes[index] = Number((now >> BigInt(8 * (5 - index))) & 0xffn);
  }
  // Version 7, variant 10xx.
  bytes[6] = ((bytes[6] ?? 0) & 0x0f) | 0x70;
  bytes[8] = ((bytes[8] ?? 0) & 0x3f) | 0x80;

  const hex = bytes.toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

interface GenerationContext {
  readonly sessionId: string;
  readonly heads: HeadCatalogue;
  readonly lateFeeBasisPoints: number;
  readonly lateFeeFlatMinor: MinorUnits;
}

/**
 * The surcharge once the due date passes.
 *
 * `percentageOfMoney` rather than arithmetic on a float: a percentage of money
 * computed as `net * percent / 100` routes the amount through a double and is
 * a paisa wrong on amounts nobody would think to test (ADR-0007).
 *
 * The rate arrives as basis points, which is exactly what a `numeric(5,2)`
 * percent becomes when parsed as a decimal: 5.00% is 500.
 */
export function computeLateFee(netMinor: number, basisPoints: number, flatMinor: number): number {
  if (basisPoints <= 0 && flatMinor <= 0) {
    return 0;
  }
  return percentageOfMoney(minorUnits(netMinor), basisPoints) + flatMinor;
}

/** Prisma `where` for a scope, without ever taking `schoolId` as a parameter. */
function studentScopeWhere(scope: VoucherScope, sessionId: string): Record<string, unknown> {
  const enrolled = {
    enrollments: {
      some: {
        sessionId,
        status: 'ENROLLED' as const,
        ...(scope.kind === 'CLASS'
          ? {
              classLevelId: scope.classLevelId,
              ...(scope.sectionId === undefined ? {} : { sectionId: scope.sectionId }),
            }
          : {}),
      },
    },
  };

  if (scope.kind === 'STUDENT') {
    return { id: scope.studentId, status: 'ACTIVE', deletedAt: null, ...enrolled };
  }

  // A child who has left is not billed, and neither is one whose record was
  // soft-deleted. Both would otherwise appear in a whole-school run.
  return { status: 'ACTIVE', deletedAt: null, ...enrolled };
}

function buildWarnings(willCreate: number, skips: Map<SkipReason, number>): string[] {
  const warnings: string[] = [];

  if (willCreate === 0) {
    warnings.push('Nothing will be generated. Every student in this scope was skipped.');
  }
  const noFee = skips.get('NO_FEE_AGREED') ?? 0;
  if (noFee > 0) {
    warnings.push(
      `${String(noFee)} ${noFee === 1 ? 'student has' : 'students have'} no agreed amount for the fees you chose, so they will be left out.`,
    );
  }
  const billed = skips.get('ALREADY_BILLED') ?? 0;
  if (billed > 0) {
    warnings.push(
      `${String(billed)} ${billed === 1 ? 'student was' : 'students were'} already billed for these months and will not be charged twice.`,
    );
  }

  return warnings;
}

export type { PlannedLine, StudentPlan };
