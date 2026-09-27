import { type SkipReason } from '@ilm/contracts';
import { fromDecimalString } from '@ilm/utils';

import { type TransactionClient } from '../../prisma';

/**
 * Working out what one child owes — the pure part of generation.
 *
 * Deliberately free of Prisma and of any writing. Everything here is a
 * function of data already loaded, which is what lets preview and generation
 * share it, and what lets it be tested without a database.
 *
 * ## The rule this file exists to hold
 *
 * **Every student has their own fees.** The amount for a head comes from that
 * child's `student_fees` row — their agreed amount, and their discount if the
 * school gave one. A class-wide run therefore produces thirty different
 * vouchers, not thirty copies of one. An explicit override on the generate
 * screen replaces that, and is the only thing that may.
 */

export interface PlannedLine {
  readonly feeHeadId: string;
  readonly label: string;
  /** First of the month billed. Null for annual and one-time heads. */
  readonly billMonth: Date | null;
  /** Before discount, so a challan can show the school's generosity. */
  readonly amountMinor: number;
  readonly discountMinor: number;
  /** `2026-09` monthly, `session:<uuid>` annual, `once` one-time. */
  readonly periodKey: string;
  /** `<feeHeadId>:<periodKey>` — how a claim is matched back to its line. */
  readonly claimKey: string;
}

export interface ArrearSource {
  readonly voucherId: string;
  readonly voucherNo: string;
  readonly balanceMinor: number;
}

export interface StudentPlan {
  readonly studentId: string;
  readonly studentName: string;
  readonly grNo: string | null;
  readonly lines: readonly PlannedLine[];
  readonly arrears: readonly ArrearSource[];
  readonly arrearsMinor: number;
  /** Gross minus discount, before arrears. */
  readonly ownPayableMinor: number;
  /** Set when this student gets no voucher, with the reason a person can read. */
  readonly skip?: SkipReason;
}

export interface HeadInfo {
  readonly id: string;
  readonly name: string;
  readonly frequency: 'MONTHLY' | 'ANNUAL' | 'ONE_TIME';
  readonly sortOrder: number;
}

export type HeadCatalogue = ReadonlyMap<string, HeadInfo>;

interface PlanInput {
  readonly student: {
    id: string;
    firstName: string;
    lastName: string;
    grNo: string;
    /**
     * Every agreed amount for this child, newest first.
     *
     * A timeline rather than one figure per head: a school that raises tuition
     * from October must bill September at the old price and October at the new
     * one, and a voucher covering both months carries both.
     */
    fees: {
      feeHeadId: string;
      effectiveFrom: Date;
      amount: { toFixed: (n: number) => string };
      discountedAmount: { toFixed: (n: number) => string } | null;
    }[];
  };
  readonly heads: HeadCatalogue;
  /** Head id → amount that overrides every student's own agreed figure. */
  readonly overrides: ReadonlyMap<string, number>;
  /** `YYYY-MM` keys chosen on the screen. */
  readonly billMonths: readonly string[];
  /**
   * The date a head with no month of its own is priced at — an admission or an
   * annual charge, which belong to the voucher rather than to a month. The
   * issue date, so the figure is the one in force when the challan was cut.
   */
  readonly asOf: Date;
  readonly sessionId: string;
  readonly alreadyBilled: readonly { studentId: string; feeHeadId: string; periodKey: string }[];
  readonly arrears: readonly ArrearSource[];
}

export function buildStudentPlan(input: PlanInput): StudentPlan {
  const { student, heads, overrides, billMonths, sessionId } = input;

  const name = `${student.firstName} ${student.lastName}`.trim();

  // Head → its amounts, newest first. Built here rather than trusting the
  // query's order, because "whichever row came back last" is not a price.
  const history = new Map<string, PlanInput['student']['fees']>();
  for (const fee of student.fees) {
    const rows = history.get(fee.feeHeadId) ?? [];
    rows.push(fee);
    history.set(fee.feeHeadId, rows);
  }
  for (const rows of history.values()) {
    rows.sort((a, b) => b.effectiveFrom.getTime() - a.effectiveFrom.getTime());
  }

  /**
   * What a head costs this child for a billing period.
   *
   * ## Two questions, not one
   *
   * The first is the ordinary one: what was the agreed amount **at the start of
   * the period**? That is the convention the whole slowly-changing dimension
   * exists for — a fee raised on the 15th does not re-rate the month that was
   * already running, so a challan printed on the 1st and a challan reprinted on
   * the 20th say the same number.
   *
   * The second only matters for somebody who had no agreement at the start,
   * and it is the one this was getting wrong: a child **admitted mid-month**.
   * Their fee begins the day they join, so on the 1st there was nothing — and
   * the answer was "no agreed amount", which left every mid-month admission
   * silently unbillable for their own joining month. A school lost that month's
   * fee on every single one, and the preview told them something untrue: the
   * child has an agreed amount, it simply started on the 25th.
   *
   * So when nothing was in force at the start, the **earliest agreement that
   * begins during the period** is used. A child who joins on the 25th is billed
   * for the month they joined, at the amount they agreed.
   *
   * A child who joins *after* the period still has nothing, and still skips —
   * correctly, and now for a reason the screen can name.
   */
  const agreedFor = (headId: string, periodStart: Date, periodEnd: Date) => {
    const rows = history.get(headId);
    if (rows === undefined) {
      return undefined;
    }

    // `rows` is newest first, so the first row not after the start is the one
    // in force on it.
    const inForceAtStart = rows.find((fee) => fee.effectiveFrom.getTime() <= periodStart.getTime());
    if (inForceAtStart !== undefined) {
      return inForceAtStart;
    }

    // Nothing had started. Take the earliest that begins inside the period —
    // `rows` is newest first, so the last match is the earliest one.
    return rows
      .filter((fee) => fee.effectiveFrom.getTime() <= periodEnd.getTime())
      .at(-1);
  };
  const billed = new Set(
    input.alreadyBilled
      .filter((row) => row.studentId === student.id)
      .map((row) => `${row.feeHeadId}:${row.periodKey}`),
  );

  const arrearsMinor = input.arrears.reduce((sum, arrear) => sum + arrear.balanceMinor, 0);

  const lines: PlannedLine[] = [];
  let sawHeadWithoutAmount = false;
  let startsAfterPeriod = false;

  // Sorted so the printed order matches the catalogue the school arranged,
  // rather than the order somebody happened to tick boxes in.
  const ordered = [...heads.values()].sort((a, b) => a.sortOrder - b.sortOrder);

  for (const head of ordered) {
    const override = overrides.get(head.id);

    if (override === undefined && !history.has(head.id)) {
      sawHeadWithoutAmount = true;
      continue;
    }

    for (const period of periodsFor(head, billMonths, sessionId)) {
      const claimKey = `${head.id}:${period.key}`;
      if (billed.has(claimKey)) {
        continue;
      }

      // Priced per period, not per voucher. `period.month` is null for a head
      // that is charged once rather than monthly, and those are priced at the
      // issue date — a single day, so the window is that day at both ends.
      const periodStart = period.month ?? input.asOf;
      const periodEnd = period.month === null ? input.asOf : endOfMonth(period.month);
      const own = override === undefined ? agreedFor(head.id, periodStart, periodEnd) : undefined;

      // They have a fee for this head, but it does not begin until after this
      // period is over — a child admitted next term, or an increment dated
      // ahead. Nothing to charge for *this* month, and a different thing from
      // having no agreed amount at all, which the preview now says separately.
      if (override === undefined && own === undefined) {
        startsAfterPeriod = true;
        continue;
      }

      const grossMinor =
        override ?? fromDecimalString((own as NonNullable<typeof own>).amount.toFixed(2));
      // A discount agreed for this child. An override is a deliberate figure for
      // this run and is taken at face value, discount included.
      const discountMinor =
        override !== undefined || own === undefined || own.discountedAmount === null
          ? 0
          : Math.max(0, grossMinor - fromDecimalString(own.discountedAmount.toFixed(2)));
      lines.push({
        feeHeadId: head.id,
        label: period.label === null ? head.name : `${head.name} - ${period.label}`,
        billMonth: period.month,
        amountMinor: grossMinor,
        discountMinor,
        periodKey: period.key,
        claimKey,
      });
    }
  }

  const ownPayableMinor = lines.reduce(
    (sum, line) => sum + line.amountMinor - line.discountMinor,
    0,
  );

  const base = {
    studentId: student.id,
    studentName: name,
    grNo: student.grNo,
    lines,
    arrears: input.arrears,
    arrearsMinor,
    ownPayableMinor,
  };

  if (lines.length === 0) {
    // The distinction matters to whoever reads the preview: "already billed" is
    // the system working, "no agreed amount" is a gap in the student's record
    // that somebody has to go and fix.
    // Three different situations, and a school acts differently on each:
    // "already billed" is the system working, "starts later" is a child who is
    // simply not here yet, and "no agreed amount" is the only one that is a gap
    // in somebody's record for a person to go and fix.
    if (sawHeadWithoutAmount) {
      return { ...base, skip: 'NO_FEE_AGREED' };
    }
    if (startsAfterPeriod) {
      return { ...base, skip: 'FEE_STARTS_LATER' };
    }
    return { ...base, skip: 'ALREADY_BILLED' };
  }

  if (ownPayableMinor + arrearsMinor <= 0) {
    return { ...base, skip: 'ZERO_AMOUNT' };
  }

  return base;
}

interface Period {
  readonly key: string;
  /** How the month reads on the printed line. Null when it does not apply. */
  readonly label: string | null;
  readonly month: Date | null;
}

/**
 * Which periods a head produces for the chosen months.
 *
 * This is the rule that stops three months of billing from charging three
 * admission fees: only a `MONTHLY` head repeats. An `ANNUAL` head is charged
 * once per session and a `ONE_TIME` head once in a child's life, whatever is
 * ticked on the screen.
 */
function periodsFor(head: HeadInfo, billMonths: readonly string[], sessionId: string): Period[] {
  if (head.frequency === 'ONE_TIME') {
    return [{ key: 'once', label: null, month: null }];
  }
  if (head.frequency === 'ANNUAL') {
    return [{ key: `session:${sessionId}`, label: null, month: null }];
  }

  // De-duplicated: the same month ticked twice is one charge.
  return [...new Set(billMonths)].sort().map((month) => ({
    key: month,
    label: monthLabel(month),
    month: firstOfMonth(month),
  }));
}

/** `2026-09` → `September 2026`. */
export function monthLabel(monthKey: string): string {
  const date = firstOfMonth(monthKey);
  return `${MONTH_NAMES[date.getUTCMonth()] ?? ''} ${String(date.getUTCFullYear())}`;
}

/**
 * `2026-09` → the 1st, at UTC midnight.
 *
 * UTC deliberately. `new Date('2026-09-01')` parsed in Asia/Karachi and stored
 * to a `date` column lands on the 31st of August, which is a whole month wrong
 * on a bill.
 */
export function firstOfMonth(monthKey: string): Date {
  const [year, month] = monthKey.split('-');
  return new Date(Date.UTC(Number(year), Number(month) - 1, 1));
}

const MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
] as const;

// --- Database-shaped helpers, kept here so the module has one entry point ----

export async function loadHeadCatalogue(
  tx: TransactionClient,
  headIds: readonly string[],
): Promise<HeadCatalogue> {
  const rows = await tx.feeHead.findMany({
    where: { id: { in: [...headIds] } },
    select: { id: true, name: true, frequency: true, sortOrder: true },
  });
  return new Map(rows.map((row) => [row.id, row]));
}

/**
 * What each of these students still owes, and on which vouchers.
 *
 * ## Why every open voucher counts, even one already carried
 *
 * An earlier version excluded vouchers already named as arrears on another
 * open voucher, to stop the figure compounding. That was the right fix for the
 * wrong model: back then a carrier's `net_payable` absorbed what it carried, so
 * counting the source again really was counting it twice.
 *
 * It no longer does. Each voucher keeps its own charge and nothing else, so
 * September's balance lives on September whether or not October prints it.
 * Excluding it would have November quote 5,000 of arrears to a parent who owes
 * 10,000 — understating the debt, which is the worse of the two errors.
 *
 * Nothing is double-counted because arrears are only ever a roll-up for
 * printing: the school's outstanding total sums `net_payable - paid`, and that
 * touches each voucher exactly once.
 */
export async function loadArrearSources(
  tx: TransactionClient,
  studentIds: readonly string[],
  before: string,
): Promise<Map<string, ArrearSource[]>> {
  if (studentIds.length === 0) {
    return new Map();
  }

  const rows = await tx.$queryRawUnsafe<
    {
      student_id: string;
      id: string;
      voucher_no: string;
      balance: { toFixed: (n: number) => string };
    }[]
  >(
    `SELECT v.student_id, v.id, v.voucher_no, (v.net_payable - v.paid_amount) AS balance
       FROM fee_vouchers v
      WHERE v.student_id = ANY($1::uuid[])
        AND v.status IN ('UNPAID', 'PARTIALLY_PAID')
        AND v.due_date < $2::date
        AND v.net_payable > v.paid_amount
      ORDER BY v.due_date ASC`,
    [...studentIds],
    before,
  );

  const byStudent = new Map<string, ArrearSource[]>();
  for (const row of rows) {
    const list = byStudent.get(row.student_id) ?? [];
    list.push({
      voucherId: row.id,
      voucherNo: row.voucher_no,
      balanceMinor: fromDecimalString(row.balance.toFixed(2)),
    });
    byStudent.set(row.student_id, list);
  }
  return byStudent;
}

/** The last day of the month a date falls in, at its own midnight. */
function endOfMonth(month: Date): Date {
  return new Date(Date.UTC(month.getUTCFullYear(), month.getUTCMonth() + 1, 0));
}
