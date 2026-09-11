import { type FeeTotals, type StudentFee, type StudentFeeLine } from '@ilm/contracts';
import { fromDecimalString, minorUnits, toDecimalString, type MinorUnits } from '@ilm/utils';
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
        throw new NotFoundError('Student');
      }

      return readStructure(tx, studentId);
    });
  }

  /**
   * Replace the whole structure.
   *
   * Delete-then-insert inside one transaction rather than a diff. A fee
   * structure is a handful of rows that a person edits as a unit, and a diff
   * would buy nothing except a class of bug where a removed line survives
   * because the comparison missed it.
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
        throw new NotFoundError('Student');
      }

      await assertHeadsExist(tx, lines);

      await tx.studentFee.deleteMany({ where: { studentId } });
      if (lines.length > 0) {
        await tx.studentFee.createMany({
          data: lines.map((line) => toRow(studentId, line)) as never,
        });
      }

      return readStructure(tx, studentId);
    });
  }
}

/**
 * Shared by `replace` here and by admission in `StudentsService`.
 *
 * Exported as a free function rather than a method so the admission path can
 * reuse it **inside its own transaction** — a student and their fees must be
 * one atomic write, so admission cannot call a service that opens a second one.
 */
export function toRow(studentId: string, line: StudentFeeLine) {
  return {
    studentId,
    feeHeadId: line.feeHeadId,
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
  const rows = await tx.studentFee.findMany({
    where: { studentId },
    orderBy: [{ feeHead: { sortOrder: 'asc' } }, { feeHead: { name: 'asc' } }],
    select: {
      feeHeadId: true,
      amount: true,
      discountedAmount: true,
      discountReason: true,
      feeHead: { select: { name: true, type: true } },
    },
  });

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
): Promise<{ feeHeadId: string; amountMinor: MinorUnits }[]> {
  const rows = await tx.feeHead.findMany({
    where: { isActive: true },
    orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    select: { id: true, defaultAmount: true },
  });

  return rows.map((row) => ({
    feeHeadId: row.id,
    amountMinor: fromDecimalString(row.defaultAmount.toFixed(2)),
  }));
}
