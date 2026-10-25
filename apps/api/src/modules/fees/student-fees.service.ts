import { type FeeTotals, type StudentFee, type StudentFeeLine } from '@ilm/contracts';
import {
  DEFAULT_TIMEZONE,
  fromDecimalString,
  minorUnits,
  systemClock,
  toDecimalString,
  today as todayIn,
  type MinorUnits,
} from '@ilm/utils';
import { Injectable } from '@nestjs/common';

import { type TransactionClient } from '../../prisma';
import { PrismaService } from '../../prisma/prisma.service';
import { BusinessRuleError, NotFoundError } from '../../shared/errors/domain-error';

/**
 * One student's fee structure.
 *
 * The rupee/paisa boundary is here and in `FeeHeadsService`, and nowhere else
 * — see the long note there for why the conversion goes through
 * `fromDecimalString` rather than `* 100`.
 */
@Injectable()
export class StudentFeesService {
  constructor(private readonly prisma: PrismaService) {}

  async forStudent(studentId: string): Promise<{ fees: StudentFee[]; totals: FeeTotals }> {
    return this.prisma.tenant(async (tx) => {
      const student = await tx.student.findUnique({
        where: { id: studentId },
        select: { id: true },
      });
      if (student === null) {
        throw new NotFoundError('student');
      }

      return readStructure(tx, studentId);
    });
  }

  /**
   * Save the structure as the person edited it.
   *
   * ## The timeline is kept
   *
   * `student_fees` is a timeline: one row per head per change, each with the
   * day it starts (fee increments add rows; see `FeeIncrementsService`). This
   * used to delete every row and re-insert the lines dated today, which threw
   * away every scheduled increment and made every earlier month unbillable —
   * September's tuition, edited on 25 October, was skipped as "starts later".
   *
   * So the edit applies to the row that is **in force**, per head:
   *
   * - a head that is no longer listed is removed from the student, history and
   *   all (vouchers already issued copied their amounts and are untouched);
   * - a head whose amount or discount changed has its in-force row corrected
   *   in place, keeping its start date and any later scheduled rise;
   * - a head that is new starts on the first of the current month in the
   *   school's own calendar, so this month can still be billed but months the
   *   child was never charged for are not invented.
   */
  async replace(
    studentId: string,
    lines: readonly StudentFeeLine[],
  ): Promise<{ fees: StudentFee[]; totals: FeeTotals }> {
    return this.prisma.tenant(async (tx) => {
      const student = await tx.student.findUnique({
        where: { id: studentId },
        select: { id: true },
      });
      if (student === null) {
        throw new NotFoundError('student');
      }

      await assertHeadsExist(tx, lines);

      const today = await schoolToday(tx);
      const existing = await tx.studentFee.findMany({
        where: { studentId },
        orderBy: { effectiveFrom: 'asc' },
        select: { id: true, feeHeadId: true, effectiveFrom: true },
      });
      const inForce = inForceByHead(existing, today);
      const kept = new Set(lines.map((line) => line.feeHeadId));

      const removedHeads = [...new Set(existing.map((row) => row.feeHeadId))].filter(
        (head) => !kept.has(head),
      );
      if (removedHeads.length > 0) {
        await tx.studentFee.deleteMany({ where: { studentId, feeHeadId: { in: removedHeads } } });
      }

      for (const line of lines) {
        const current = inForce.get(line.feeHeadId);
        if (current === undefined) {
          await tx.studentFee.create({
            data: toRow(
              studentId,
              line,
              new Date(`${today.slice(0, 7)}-01T00:00:00.000Z`),
            ) as never,
          });
          continue;
        }
        await tx.studentFee.update({
          where: { id: current.id },
          data: {
            amount: toDecimalString(minorUnits(line.amountMinor)),
            discountedAmount:
              line.discountedAmountMinor === undefined
                ? null
                : toDecimalString(minorUnits(line.discountedAmountMinor)),
            discountReason:
              line.discountReason === undefined || line.discountReason === ''
                ? null
                : line.discountReason,
          },
        });
      }

      return readStructure(tx, studentId);
    });
  }
}

/**
 * The row each head is charged at today: the latest one already started, or —
 * for a child whose fees begin later (next term's intake) — the first to come.
 */
function inForceByHead<T extends { feeHeadId: string; effectiveFrom: Date }>(
  rows: readonly T[],
  today: string,
): Map<string, T> {
  const chosen = new Map<string, T>();
  // `rows` is oldest first: a started row replaces any earlier one, and a
  // future row is only taken when nothing has started.
  for (const row of rows) {
    const started = row.effectiveFrom.toISOString().slice(0, 10) <= today;
    if (started || !chosen.has(row.feeHeadId)) {
      chosen.set(row.feeHeadId, row);
    }
  }
  return chosen;
}

/** "Today" on the school's wall calendar, not the server's. */
async function schoolToday(tx: TransactionClient): Promise<string> {
  const school = await tx.school.findFirst({ select: { timezone: true } });
  return todayIn(systemClock, school?.timezone ?? DEFAULT_TIMEZONE);
}

/**
 * Shared by `replace` here and by admission in `StudentsService`.
 *
 * Exported as a free function rather than a method so the admission path can
 * reuse it **inside its own transaction** — a student and their fees must be
 * one atomic write, so admission cannot call a service that opens a second one.
 */
/**
 * One agreed amount, as a row.
 *
 * `effectiveFrom` is passed in rather than left to the column's `now()`
 * default, and that default was a real bug: an agreement began on the day
 * somebody **typed** the record, not the day the child joined.
 *
 * It broke in both directions. A school entering last year's register got fees
 * starting today, so none of that history could be billed. A school admitting
 * next term's intake in advance got fees starting today, so those children
 * would be billed for every month between now and the day they actually arrive.
 * The second one takes money off a family for months their child was not there.
 */
export function toRow(studentId: string, line: StudentFeeLine, effectiveFrom?: Date) {
  return {
    studentId,
    feeHeadId: line.feeHeadId,
    ...(effectiveFrom === undefined ? {} : { effectiveFrom }),
    amount: toDecimalString(minorUnits(line.amountMinor)),
    ...(line.discountedAmountMinor === undefined
      ? {}
      : { discountedAmount: toDecimalString(minorUnits(line.discountedAmountMinor)) }),
    ...(line.discountReason === undefined || line.discountReason === ''
      ? {}
      : { discountReason: line.discountReason }),
  };
}

/**
 * Every referenced head must exist, be this school's, and be active.
 *
 * The foreign key already stops a head from another school — RLS means a
 * cross-tenant id simply does not resolve — so this exists to turn that into a
 * sentence rather than a constraint violation, and to catch the subtler case:
 * a head deactivated between the form loading and the form being submitted.
 */
export async function assertHeadsExist(
  tx: TransactionClient,
  lines: readonly StudentFeeLine[],
): Promise<void> {
  if (lines.length === 0) {
    return;
  }

  const ids = [...new Set(lines.map((line) => line.feeHeadId))];
  if (ids.length !== lines.length) {
    throw new BusinessRuleError(
      'BUSINESS_RULE_VIOLATION',
      'The same fee appears twice. Each fee can only be charged once per student.',
    );
  }

  const found = await tx.feeHead.findMany({
    where: { id: { in: ids } },
    select: { id: true, name: true, isActive: true },
  });

  if (found.length !== ids.length) {
    throw new BusinessRuleError(
      'BUSINESS_RULE_VIOLATION',
      'One of these fees no longer exists. Reload the page and try again.',
    );
  }

  const inactive = found.filter((head) => !head.isActive);
  if (inactive.length > 0) {
    throw new BusinessRuleError(
      'BUSINESS_RULE_VIOLATION',
      `"${inactive[0]?.name ?? ''}" has been turned off since this page loaded. Reload and try again.`,
    );
  }
}

/**
 * Read the structure back with names attached and the totals summed.
 *
 * Totals are computed here rather than in the browser because two places that
 * add money up are two places that can disagree, and the one on screen is the
 * one a parent gets quoted.
 */
export async function readStructure(
  tx: TransactionClient,
  studentId: string,
): Promise<{ fees: StudentFee[]; totals: FeeTotals }> {
  const all = await tx.studentFee.findMany({
    where: { studentId },
    orderBy: { effectiveFrom: 'asc' },
    select: {
      feeHeadId: true,
      effectiveFrom: true,
      amount: true,
      discountedAmount: true,
      discountReason: true,
      feeHead: { select: { name: true, type: true, sortOrder: true } },
    },
  });

  // One row per head — the amount charged today — not the whole timeline.
  // Summing every row double-counted a fee the moment it was increased.
  const today = await schoolToday(tx);
  const rows = [...inForceByHead(all, today).values()].sort(
    (a, b) =>
      a.feeHead.sortOrder - b.feeHead.sortOrder || a.feeHead.name.localeCompare(b.feeHead.name),
  );

  let gross = 0;
  let payable = 0;

  const fees: StudentFee[] = rows.map((row) => {
    const amountMinor = fromDecimalString(row.amount.toFixed(2));
    const discountedAmountMinor =
      row.discountedAmount === null ? null : fromDecimalString(row.discountedAmount.toFixed(2));
    const payableMinor = discountedAmountMinor ?? amountMinor;

    gross += amountMinor;
    payable += payableMinor;

    return {
      feeHeadId: row.feeHeadId,
      name: row.feeHead.name,
      type: row.feeHead.type,
      amountMinor,
      discountedAmountMinor,
      discountReason: row.discountReason,
      payableMinor,
    };
  });

  return {
    fees,
    totals: {
      grossMinor: minorUnits(gross),
      discountMinor: minorUnits(gross - payable),
      payableMinor: minorUnits(payable),
    } satisfies { grossMinor: MinorUnits; discountMinor: MinorUnits; payableMinor: MinorUnits },
  };
}

/**
 * The active catalogue as bare fee lines, inside a caller's transaction.
 *
 * A transaction-scoped twin of `FeeHeadsService.defaultLines`. Admission needs
 * this *inside* its own transaction — the student and the fees are one atomic
 * write — and calling a service that opens a second transaction from inside the
 * first is how a deadlock gets written by accident.
 */
export async function defaultFeeLines(
  tx: TransactionClient,
  classLevelId?: string,
): Promise<{ feeHeadId: string; amountMinor: MinorUnits }[]> {
  const rows = await tx.feeHead.findMany({
    where: { isActive: true },
    orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    select: {
      id: true,
      defaultAmount: true,
      classLevels: { select: { classLevelId: true } },
    },
  });

  return rows
    .filter((row) => {
      if (classLevelId === undefined || row.classLevels.length === 0) {
        return true;
      }
      return row.classLevels.some((link) => link.classLevelId === classLevelId);
    })
    .map((row) => ({
      feeHeadId: row.id,
      amountMinor: fromDecimalString(row.defaultAmount.toFixed(2)),
    }));
}
