import {
  type ApplyFeeIncrement,
  type FeeHistory,
  type FeeIncrementList,
  type FeeIncrementListQuery,
  type FeeIncrementResult,
  type FeeIncrementRow,
  type FeeIncrementSkipReason,
} from '@ilm/contracts';
import {
  DEFAULT_TIMEZONE,
  fromDecimalString,
  minorUnits,
  systemClock,
  toDecimalString,
  today as todayIn,
} from '@ilm/utils';
import { Injectable } from '@nestjs/common';

import { type TransactionClient } from '../../prisma';
import { PrismaService } from '../../prisma/prisma.service';
import { BusinessRuleError, NotFoundError } from '../../shared/errors/domain-error';
import { TenantContextService } from '../../shared/tenancy/tenant-context.service';

/**
 * Raising and lowering fees, for one child or five hundred.
 *
 * ## The two queries this screen costs
 *
 * A page load is **one** round trip for the rows and **one** for the count, and
 * that is the whole budget. The obvious implementation — fetch the students,
 * then fetch each one's current fee — is an N+1 that turns a fifty-row page
 * into fifty-one queries, which is precisely the shape that gets expensive on a
 * metered host.
 *
 * Instead the current amount comes back with the student, via `DISTINCT ON`:
 *
 *     SELECT DISTINCT ON (student_id) … FROM student_fees
 *     WHERE effective_from <= today ORDER BY student_id, effective_from DESC
 *
 * Postgres walks the `(school, student, head, effective_from DESC)` index
 * backwards and stops at the first row per student, so "the amount in force
 * today" costs an index seek rather than a scan of the history.
 *
 * ## Why applying is a transaction over a bounded set
 *
 * The apply path writes one row per student, capped at 500 by the contract, in
 * a single `createMany`. Not a loop of upserts: five hundred round trips inside
 * one transaction is five hundred chances to be holding a lock when something
 * times out.
 */
@Injectable()
export class FeeIncrementsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly context: TenantContextService,
  ) {}

  /**
   * The list, and what each child pays for the chosen head today.
   *
   * `pendingFrom` is the other half of the answer: a school that has already
   * scheduled October's rise needs to see it, or it applies a second one.
   */
  async list(query: FeeIncrementListQuery): Promise<FeeIncrementList> {
    return this.prisma.tenant(async (tx) => {
      const [head, today] = await Promise.all([
        this.resolveHead(tx, query.feeHeadId),
        schoolToday(tx),
      ]);

      const where = {
        deletedAt: null,
        ...(query.status === undefined ? {} : { status: query.status }),
        ...(query.gender === undefined ? {} : { gender: query.gender }),
        ...(query.q === undefined
          ? {}
          : {
              OR: [
                { firstName: { contains: query.q, mode: 'insensitive' as const } },
                { lastName: { contains: query.q, mode: 'insensitive' as const } },
                { grNo: { contains: query.q, mode: 'insensitive' as const } },
                { studentCode: { contains: query.q, mode: 'insensitive' as const } },
              ],
            }),
        ...(query.classLevelId === undefined && query.sectionId === undefined && query.sessionId === undefined
          ? {}
          : {
              enrollments: {
                some: {
                  status: 'ENROLLED' as const,
                  ...(query.sessionId === undefined ? {} : { sessionId: query.sessionId }),
                  ...(query.classLevelId === undefined ? {} : { classLevelId: query.classLevelId }),
                  ...(query.sectionId === undefined ? {} : { sectionId: query.sectionId }),
                },
              },
            }),
      };

      const [students, total] = await Promise.all([
        tx.student.findMany({
          where,
          orderBy: orderFor(query.sort, query.order),
          skip: query.offset,
          take: query.limit,
          select: {
            id: true,
            grNo: true,
            studentCode: true,
            firstName: true,
            lastName: true,
            gender: true,
            status: true,
            admittedOn: true,
            guardians: {
              where: { guardian: { relation: 'FATHER' } },
              take: 1,
              select: { guardian: { select: { name: true, phone: true } } },
            },
            enrollments: {
              orderBy: { createdAt: 'desc' },
              take: 1,
              select: {
                classLevel: { select: { name: true } },
                section: { select: { name: true } },
              },
            },
          },
        }),
        tx.student.count({ where }),
      ]);

      // The GR range is applied here rather than in SQL because GR numbers are
      // text that schools read as numbers: '0013' sorts after '009' as a string
      // and before it as a number, and a range that disagrees with the eye is
      // worse than no range. Only ever narrows the page already fetched.
      const ranged = withinGrRange(students, query.grFrom, query.grTo);

      const amounts =
        ranged.length === 0
          ? new Map<string, CurrentAmount>()
          : await this.currentAmounts(
              tx,
              ranged.map((student) => student.id),
              head.id,
              today,
            );

      const rows: FeeIncrementRow[] = ranged.map((student) => {
        const amount = amounts.get(student.id);
        const father = student.guardians[0]?.guardian ?? null;
        const enrolment = student.enrollments[0] ?? null;

        return {
          studentId: student.id,
          grNo: student.grNo,
          studentCode: student.studentCode,
          name: `${student.firstName} ${student.lastName}`.trim(),
          fatherName: father?.name ?? null,
          gender: student.gender,
          className: enrolment?.classLevel.name ?? null,
          sectionName: enrolment?.section?.name ?? null,
          contact: father?.phone ?? null,
          status: student.status,
          admittedOn: student.admittedOn === null ? null : isoDate(student.admittedOn),
          currentFeeMinor: amount === undefined ? null : minorUnits(amount.currentMinor),
          currentPayableMinor:
            amount === undefined
              ? null
              : minorUnits(amount.discountedMinor ?? amount.currentMinor),
          discountReason: amount?.discountReason ?? null,
          pendingFrom: amount?.pendingFrom ?? null,
          pendingFeeMinor:
            amount?.pendingMinor === undefined ? null : minorUnits(amount.pendingMinor),
          pendingPayableMinor:
            amount?.pendingMinor === undefined
              ? null
              : minorUnits(amount.pendingDiscountedMinor ?? amount.pendingMinor),
        };
      });

      return { rows, total, feeHead: { id: head.id, name: head.name } };
    });
  }

  /**
   * Apply the change.
   *
   * Every student is decided before anything is written, and the whole set goes
   * in as one `createMany`. A partially applied increment — three hundred
   * children raised and two hundred not — is the worst outcome available here,
   * because nothing on the screen would show which were which.
   */
  async apply(input: ApplyFeeIncrement): Promise<FeeIncrementResult> {
    const actorId = this.context.userId;

    return this.prisma.tenant(async (tx) => {
      // Replay, not silence: a retried request returns the answer the first one
      // gave, so the screen reports what actually happened (R5).
      const prior = await tx.jobRun.findFirst({
        where: { kind: JOB_KIND, idempotencyKey: input.idempotencyKey },
        select: { status: true, result: true },
      });

      if (prior !== null && prior.status === 'COMPLETED') {
        const stored = prior.result as unknown as Omit<FeeIncrementResult, 'replayed'>;
        return { ...stored, replayed: true };
      }

      const head = await tx.feeHead.findFirst({
        where: { id: input.feeHeadId },
        select: { id: true, name: true },
      });
      if (head === null) {
        throw new NotFoundError('That fee head no longer exists.');
      }

      const students = await tx.student.findMany({
        where: { id: { in: input.studentIds }, deletedAt: null },
        select: {
          id: true,
          grNo: true,
          firstName: true,
          lastName: true,
          admittedOn: true,
        },
      });

      const amounts = await this.currentAmounts(
        tx,
        students.map((student) => student.id),
        head.id,
        // The amount being changed is the one in force **on the day the change
        // starts**, not today. Raising October's fee by 500 must build on
        // whatever October was already going to cost, including a rise
        // scheduled before it.
        input.effectiveFrom,
      );

      const found = new Map(students.map((student) => [student.id, student]));
      const skips: FeeIncrementResult['skips'] = [];
      const writes: {
        schoolId: string;
        studentId: string;
        feeHeadId: string;
        effectiveFrom: Date;
        amount: string;
        discountedAmount: string | null;
        discountReason: string | null;
      }[] = [];

      const sign = input.direction === 'INCREASE' ? 1 : -1;
      const schoolId = this.context.schoolId;

      for (const studentId of input.studentIds) {
        const student = found.get(studentId);
        if (student === undefined) {
          skips.push({ studentId, name: '', grNo: '', reason: 'NOT_FOUND' });
          continue;
        }

        const label = {
          studentId,
          name: `${student.firstName} ${student.lastName}`.trim(),
          grNo: student.grNo,
        };
        const skip = (reason: FeeIncrementSkipReason) => {
          skips.push({ ...label, reason });
        };

        // Admission is checked first, and the order is the whole point.
        //
        // A date before the child joined has no agreed amount on it either, so
        // testing the amount first would report NO_AGREED_AMOUNT and send the
        // operator off to check the child's fee record — when what is actually
        // wrong is the date they typed into the box.
        if (student.admittedOn !== null && isoDate(student.admittedOn) > input.effectiveFrom) {
          skip('BEFORE_ADMISSION');
          continue;
        }

        const current = amounts.get(studentId);
        if (current === undefined) {
          // Nothing agreed for this head. 0 + 500 would be a fee invented by
          // arithmetic rather than one the school ever agreed to.
          skip('NO_AGREED_AMOUNT');
          continue;
        }

        const nextMinor = current.currentMinor + sign * input.amountMinor;
        if (nextMinor < 0) {
          skip('WOULD_GO_NEGATIVE');
          continue;
        }

        // This child already has a fee decision dated that exact day.
        //
        // There is no appending to it — one row per head per date, by index —
        // and overwriting it would edit an amount the school already agreed,
        // which is not what "increase by 500" asked for. Note this check tests
        // the *date* alone: comparing amounts as well would never fire, because
        // `current` is that very row and `nextMinor` is it plus the increment.
        //
        // The way out is the history dialog: delete the row and re-apply. That
        // is visible, audited, and leaves the operator in control, where a
        // silent stack or a silent no-op would leave them guessing.
        if (current.effectiveFrom === input.effectiveFrom) {
          skip('ALREADY_APPLIED');
          continue;
        }

        // The discount moves with the fee. A child on 5,000 less a 1,500
        // sibling discount who goes to 5,500 still has the 1,500 discount —
        // dropping it would quietly bill the family 1,500 more than agreed,
        // and carrying the *discounted amount* unchanged would shrink the
        // discount instead.
        const discountMinor =
          current.discountedMinor === undefined
            ? undefined
            : current.currentMinor - current.discountedMinor;

        writes.push({
          schoolId,
          studentId,
          feeHeadId: head.id,
          effectiveFrom: new Date(`${input.effectiveFrom}T00:00:00.000Z`),
          amount: toDecimalString(minorUnits(nextMinor)),
          discountedAmount:
            discountMinor === undefined
              ? null
              : toDecimalString(minorUnits(Math.max(0, nextMinor - discountMinor))),
          discountReason: current.discountReason ?? null,
        });
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

      if (writes.length > 0) {
        // No `skipDuplicates` here, deliberately.
        //
        // Every row that could legitimately collide was already skipped above
        // with a reason the operator can read, so a unique violation at this
        // point means exactly one thing: somebody else changed one of these
        // fees in the seconds since this batch read them.
        //
        // Swallowing that would report "applied 200" while writing 199 — the
        // count would be a claim about intent dressed up as a fact, and no
        // screen would show which child missed out. Letting it throw rolls the
        // whole transaction back instead, so the batch is all-or-nothing and
        // the operator is told to reload rather than left to find out at the
        // counter.
        try {
          await tx.studentFee.createMany({ data: writes });
        } catch (error) {
          if (isUniqueViolation(error)) {
            throw new BusinessRuleError(
              'FEES_INCREMENT_RACED',
              'Somebody else changed one of these fees a moment ago. Nothing was applied — reload the list and try again.',
            );
          }
          throw error;
        }
      }

      const result: Omit<FeeIncrementResult, 'replayed'> = {
        applied: writes.length,
        skipped: skips.length,
        skips,
      };

      await tx.jobRun.update({
        where: { id: run.id },
        data: { status: 'COMPLETED', result: result as never, finishedAt: systemClock.now() },
      });

      return { ...result, replayed: false };
    });
  }

  /** One child's whole fee timeline, newest first. */
  async history(studentId: string): Promise<FeeHistory> {
    return this.prisma.tenant(async (tx) => {
      const [student, today] = await Promise.all([
        tx.student.findFirst({
        where: { id: studentId, deletedAt: null },
          select: { id: true, grNo: true, firstName: true, lastName: true },
        }),
        schoolToday(tx),
      ]);
      if (student === null) {
        throw new NotFoundError('That student is not in this school.');
      }

      const rows = await tx.studentFee.findMany({
        where: { studentId },
        orderBy: [{ effectiveFrom: 'desc' }, { feeHeadId: 'asc' }],
        select: {
          id: true,
          effectiveFrom: true,
          amount: true,
          discountedAmount: true,
          discountReason: true,
          feeHead: { select: { id: true, name: true, type: true } },
        },
      });

      // "Current" is per head, not per list: a child has one live tuition row
      // and one live transport row at the same time.
      const seen = new Set<string>();

      return {
        studentId: student.id,
        studentName: `${student.firstName} ${student.lastName}`.trim(),
        grNo: student.grNo,
        entries: rows.map((row) => {
          const on = isoDate(row.effectiveFrom);
          const isScheduled = on > today;
          const isCurrent = !isScheduled && !seen.has(row.feeHead.id);
          if (!isScheduled) {
            seen.add(row.feeHead.id);
          }

          const amountMinor = fromDecimalString(row.amount.toFixed(2));
          return {
            id: row.id,
            effectiveFrom: on,
            amountMinor: minorUnits(amountMinor),
            payableMinor: minorUnits(
              row.discountedAmount === null
                ? amountMinor
                : fromDecimalString(row.discountedAmount.toFixed(2)),
            ),
            discountReason: row.discountReason,
            feeHeadId: row.feeHead.id,
            feeHeadName: row.feeHead.name,
            feeHeadType: row.feeHead.type.toLowerCase(),
            isCurrent,
            isScheduled,
          };
        }),
      };
    });
  }

  /**
   * Remove one row from a timeline.
   *
   * The last row for a head is refused. A child holding a head with no amount
   * cannot be billed for it, and the voucher run would skip them silently —
   * a family that stops being invoiced and nobody notices until the year ends.
   */
  async removeHistoryEntry(id: string): Promise<void> {
    await this.prisma.tenant(async (tx) => {
      const row = await tx.studentFee.findFirst({
        where: { id },
        select: { id: true, studentId: true, feeHeadId: true },
      });
      if (row === null) {
        throw new NotFoundError('That fee record no longer exists.');
      }

      const remaining = await tx.studentFee.count({
        where: { studentId: row.studentId, feeHeadId: row.feeHeadId },
      });

      if (remaining <= 1) {
        throw new BusinessRuleError(
          'FEES_LAST_AMOUNT',
          'This is the only amount agreed for that fee. Remove the fee from the student instead, or set a different amount first.',
        );
      }

      await tx.studentFee.delete({ where: { id } });
    });
  }

  // --- internals ------------------------------------------------------------

  private async resolveHead(
    tx: TransactionClient,
    feeHeadId: string | undefined,
  ): Promise<{ id: string; name: string }> {
    if (feeHeadId !== undefined) {
      const chosen = await tx.feeHead.findFirst({
        where: { id: feeHeadId },
        select: { id: true, name: true },
      });
      if (chosen === null) {
        throw new NotFoundError('That fee head no longer exists.');
      }
      return chosen;
    }

    // Tuition by default: it is the fee a school means when it says "fees", and
    // the one an increment screen is opened to change.
    const tuition = await tx.feeHead.findFirst({
      where: { type: 'TUITION', isActive: true },
      orderBy: { sortOrder: 'asc' },
      select: { id: true, name: true },
    });
    if (tuition === null) {
      throw new BusinessRuleError(
        'FEES_NO_TUITION_HEAD',
        'This school has no active tuition fee to increase. Add one under Settings › Fees first.',
      );
    }
    return tuition;
  }

  /**
   * The amount in force for each student on a given day, plus any rise already
   * scheduled after it.
   *
   * One query for the whole page. `DISTINCT ON` is the reason: it returns the
   * newest qualifying row per student directly, so the history never leaves the
   * database.
   */
  private async currentAmounts(
    tx: TransactionClient,
    studentIds: readonly string[],
    feeHeadId: string,
    on: string,
  ): Promise<Map<string, CurrentAmount>> {
    if (studentIds.length === 0) {
      return new Map();
    }

    const rows = await tx.$queryRaw<
      {
        student_id: string;
        effective_from: Date;
        amount: string;
        discounted_amount: string | null;
        discount_reason: string | null;
        pending_from: Date | null;
        pending_amount: string | null;
        pending_discounted_amount: string | null;
      }[]
    >`
      WITH live AS (
        SELECT DISTINCT ON (student_id)
               student_id, effective_from, amount, discounted_amount, discount_reason
          FROM student_fees
         WHERE student_id = ANY(${studentIds}::uuid[])
           AND fee_head_id = ${feeHeadId}::uuid
           AND effective_from <= ${on}::date
         ORDER BY student_id, effective_from DESC
      ),
      scheduled AS (
        SELECT DISTINCT ON (student_id)
               student_id,
               effective_from AS pending_from,
               amount AS pending_amount,
               discounted_amount AS pending_discounted_amount
          FROM student_fees
         WHERE student_id = ANY(${studentIds}::uuid[])
           AND fee_head_id = ${feeHeadId}::uuid
           AND effective_from > ${on}::date
         ORDER BY student_id, effective_from ASC
      )
      SELECT live.student_id,
             live.effective_from,
             live.amount::text,
             live.discounted_amount::text,
             live.discount_reason,
             scheduled.pending_from,
             scheduled.pending_amount::text,
             scheduled.pending_discounted_amount::text
        FROM live
        LEFT JOIN scheduled USING (student_id)
    `;

    return new Map(
      rows.map((row) => [
        row.student_id,
        {
          effectiveFrom: isoDate(row.effective_from),
          currentMinor: fromDecimalString(row.amount),
          discountedMinor:
            row.discounted_amount === null ? undefined : fromDecimalString(row.discounted_amount),
          discountReason: row.discount_reason ?? undefined,
          pendingFrom: row.pending_from === null ? null : isoDate(row.pending_from),
          pendingMinor: row.pending_amount === null ? undefined : fromDecimalString(row.pending_amount),
          pendingDiscountedMinor:
            row.pending_discounted_amount === null
              ? undefined
              : fromDecimalString(row.pending_discounted_amount),
        },
      ]),
    );
  }
}

const JOB_KIND = 'fee_increment';

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: string }).code === 'P2002'
  );
}

/**
 * The school's own date, not the server's.
 *
 * A school in Karachi opening this screen at 02:00 is still on yesterday in UTC.
 * Deciding "which amount is in force today" from the server's clock would show
 * one figure and bill another, one night in every timezone east of Greenwich.
 */
async function schoolToday(tx: TransactionClient): Promise<string> {
  const school = await tx.school.findFirst({ select: { timezone: true } });
  return todayIn(systemClock, school?.timezone ?? DEFAULT_TIMEZONE);
}

interface CurrentAmount {
  readonly effectiveFrom: string;
  readonly currentMinor: number;
  readonly discountedMinor: number | undefined;
  readonly discountReason: string | undefined;
  readonly pendingFrom: string | null;
  readonly pendingMinor: number | undefined;
  readonly pendingDiscountedMinor: number | undefined;
}

/** Sorting is an allow-list from the contract, so this maps rather than interpolates. */
function orderFor(sort: string, order: 'asc' | 'desc') {
  switch (sort) {
    case 'name':
      return [{ firstName: order }, { lastName: order }];
    case 'className':
      return [{ grNo: order }];
    case 'currentFee':
      // The fee lives in another table and varies by date, so it cannot be an
      // ORDER BY here without joining the whole history. GR order is the
      // stable, predictable fallback; the column header says so.
      return [{ grNo: order }];
    case 'studentCode':
      return [{ studentCode: order }];
    default:
      return [{ grNo: order }];
  }
}

/**
 * A GR range, compared as numbers where both ends look numeric.
 *
 * Schools write GR numbers as '0013' and read them as thirteen. Compared as
 * text, '0013' falls between '001' and '002' and a range of 1–200 misses most
 * of the school. Where either bound is not a number — some schools prefix a
 * branch letter — it falls back to text comparison, which is at least what the
 * person typed.
 */
function withinGrRange<T extends { grNo: string }>(
  rows: readonly T[],
  from: string | undefined,
  to: string | undefined,
): T[] {
  if (from === undefined && to === undefined) {
    return [...rows];
  }

  const numeric = (value: string) => (/^\d+$/.test(value.trim()) ? Number(value.trim()) : undefined);
  const lowNum = from === undefined ? undefined : numeric(from);
  const highNum = to === undefined ? undefined : numeric(to);

  return rows.filter((row) => {
    const own = numeric(row.grNo);
    if (own !== undefined && (lowNum !== undefined || highNum !== undefined)) {
      if (lowNum !== undefined && own < lowNum) return false;
      if (highNum !== undefined && own > highNum) return false;
      return true;
    }
    if (from !== undefined && row.grNo < from) return false;
    if (to !== undefined && row.grNo > to) return false;
    return true;
  });
}

/** A `date` column as `YYYY-MM-DD`, read in UTC so the day never shifts. */
function isoDate(value: Date): string {
  return value.toISOString().slice(0, 10);
}
