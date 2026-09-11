import {
  type CancelVoucher,
  type RecordPayment,
  type StudentLookupQuery,
  type StudentLookupResult,
  type UpdateVoucher,
  type VoucherDetail,
  type VoucherListQuery,
  type VoucherSummary,
  type VoucherTotals,
  type WaiveVoucher,
} from '@ilm/contracts';
import { fromDecimalString, minorUnits, systemClock, toDecimalString } from '@ilm/utils';
import { Injectable } from '@nestjs/common';

import { type TransactionClient } from '../../prisma';
import { PrismaService } from '../../prisma/prisma.service';
import { BusinessRuleError, NotFoundError } from '../../shared/errors/domain-error';

import { computeLateFee } from './voucher-generation.service';

/**
 * Reading vouchers, and the three things that can happen to one.
 *
 * ## What may change on an issued voucher, and what may not
 *
 * Dates and the late-fee switch may change. **Amounts may not.** A voucher is
 * frozen at generation (docs/modules/fees-and-finance §1), so the ways to
 * change what is owed are to cancel and regenerate, or to waive — and both
 * leave a record of who did it and why. An editable amount box is precisely how
 * a school's totals stop reconciling, which §4.3 calls out by name.
 *
 * ## Delete is cancel
 *
 * The reference screen has a trash icon. CLAUDE.md R4 says financial records
 * are append-only, so it cancels: the row stays, the status changes, the reason
 * is recorded, and the period claims are released so the month can be billed
 * again. A paid voucher cannot be cancelled at all — that is a refund, and a
 * refund is a reversal entry, not a deletion.
 */
@Injectable()
export class VouchersService {
  constructor(private readonly prisma: PrismaService) {}

  // --- Reading --------------------------------------------------------------

  async list(
    query: VoucherListQuery,
  ): Promise<{ items: VoucherSummary[]; total: number; totals: VoucherTotals }> {
    return this.prisma.tenant(async (tx) => {
      const where = buildWhere(query);

      const [rows, total, sums] = await Promise.all([
        tx.feeVoucher.findMany({
          where,
          orderBy: orderFor(query.sort, query.order),
          skip: query.offset,
          take: query.limit,
          select: VOUCHER_SUMMARY_SELECT,
        }),
        tx.feeVoucher.count({ where }),
        tx.feeVoucher.aggregate({
          where,
          _sum: { netPayable: true, paidAmount: true },
        }),
      ]);

      const netPayable = decimalToMinor(sums._sum.netPayable);
      const paid = decimalToMinor(sums._sum.paidAmount);

      return {
        items: rows.map(toSummary),
        total,
        totals: {
          count: total,
          netPayableMinor: minorUnits(netPayable),
          paidMinor: minorUnits(paid),
          // Never negative: the CHECK constraint keeps paid within payable, so
          // this cannot go the wrong way round without the database refusing.
          outstandingMinor: minorUnits(Math.max(0, netPayable - paid)),
        },
      };
    });
  }

  async detail(id: string): Promise<VoucherDetail> {
    return this.prisma.tenant(async (tx) => {
      const row = await tx.feeVoucher.findUnique({
        where: { id },
        select: {
          ...VOUCHER_SUMMARY_SELECT,
          lateFeeAuto: true,
          cancelReason: true,
          lines: {
            orderBy: { sortOrder: 'asc' },
            select: {
              id: true,
              feeHeadId: true,
              kind: true,
              label: true,
              billMonth: true,
              amount: true,
              discount: true,
              sortOrder: true,
            },
          },
          arrears: {
            select: {
              sourceVoucherId: true,
              amount: true,
              source: { select: { voucherNo: true, billMonths: true } },
            },
          },
          allocations: {
            select: {
              amount: true,
              payment: {
                select: {
                  id: true,
                  receiptNo: true,
                  method: true,
                  paidOn: true,
                  reference: true,
                  status: true,
                },
              },
            },
          },
        },
      });

      if (row === null) {
        throw new NotFoundError('That voucher does not exist.');
      }

      return {
        ...toSummary(row),
        lateFeeAuto: row.lateFeeAuto,
        cancelReason: row.cancelReason,
        lines: row.lines.map((line) => ({
          id: line.id,
          feeHeadId: line.feeHeadId,
          kind: line.kind,
          label: line.label,
          billMonth: line.billMonth === null ? null : isoDate(line.billMonth),
          amountMinor: minorUnits(decimalToMinor(line.amount)),
          discountMinor: minorUnits(decimalToMinor(line.discount)),
          sortOrder: line.sortOrder,
        })),
        arrears: row.arrears.map((arrear) => ({
          sourceVoucherId: arrear.sourceVoucherId,
          sourceVoucherNo: arrear.source.voucherNo,
          sourceBillMonths: arrear.source.billMonths.map(isoDate),
          amountMinor: minorUnits(decimalToMinor(arrear.amount)),
        })),
        payments: row.allocations.map((allocation) => ({
          id: allocation.payment.id,
          receiptNo: allocation.payment.receiptNo,
          amountMinor: minorUnits(decimalToMinor(allocation.amount)),
          method: allocation.payment.method,
          paidOn: isoDate(allocation.payment.paidOn),
          reference: allocation.payment.reference,
          reversed: allocation.payment.status === 'REVERSED',
        })),
      };
    });
  }

  /**
   * The typeahead behind the "GR No / Name" box.
   *
   * Searches the GR number, the student code and the name in one go, because
   * the person at the counter has whichever of those the parent said, and
   * making them choose a field first is a worse counter.
   */
  async lookupStudents(query: StudentLookupQuery): Promise<StudentLookupResult[]> {
    return this.prisma.tenant(async (tx) => {
      const term = query.q;

      const students = await tx.student.findMany({
        where: {
          status: 'ACTIVE',
          deletedAt: null,
          ...(query.sessionId === undefined
            ? {}
            : { enrollments: { some: { sessionId: query.sessionId, status: 'ENROLLED' } } }),
          OR: [
            { grNo: { contains: term, mode: 'insensitive' } },
            { studentCode: { contains: term, mode: 'insensitive' } },
            { firstName: { contains: term, mode: 'insensitive' } },
            { lastName: { contains: term, mode: 'insensitive' } },
          ],
        },
        orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }],
        take: query.limit,
        select: {
          id: true,
          firstName: true,
          lastName: true,
          grNo: true,
          enrollments: {
            orderBy: { createdAt: 'desc' },
            take: 1,
            select: {
              classLevel: { select: { name: true } },
              section: { select: { name: true } },
            },
          },
          guardians: {
            where: { guardian: { relation: 'FATHER' } },
            take: 1,
            select: { guardian: { select: { name: true } } },
          },
          feeVouchers: {
            where: { status: { in: ['UNPAID', 'PARTIALLY_PAID'] } },
            select: { netPayable: true, paidAmount: true },
          },
        },
      });

      return students.map((student) => ({
        id: student.id,
        name: `${student.firstName} ${student.lastName}`.trim(),
        grNo: student.grNo,
        fatherName: student.guardians[0]?.guardian.name ?? null,
        className: student.enrollments[0]?.classLevel.name ?? null,
        sectionName: student.enrollments[0]?.section?.name ?? null,
        outstandingMinor: minorUnits(
          student.feeVouchers.reduce(
            (sum, voucher) =>
              sum + decimalToMinor(voucher.netPayable) - decimalToMinor(voucher.paidAmount),
            0,
          ),
        ),
      }));
    });
  }

  // --- Changing -------------------------------------------------------------

  /** Dates and the late-fee switch only. See the class comment. */
  async update(id: string, input: UpdateVoucher): Promise<VoucherDetail> {
    await this.prisma.tenant(async (tx) => {
      const voucher = await tx.feeVoucher.findUnique({
        where: { id },
        select: {
          id: true,
          status: true,
          netPayable: true,
          issueDate: true,
          dueDate: true,
          validTill: true,
        },
      });
      if (voucher === null) {
        throw new NotFoundError('That voucher does not exist.');
      }
      if (voucher.status === 'CANCELLED') {
        throw new BusinessRuleError('FEES_VOUCHER_CANCELLED', 'That voucher was cancelled.');
      }
      if (voucher.status === 'PAID') {
        throw new BusinessRuleError(
          'FEES_VOUCHER_ALREADY_PAID',
          'That voucher is paid. Its dates can no longer be changed.',
        );
      }

      const issueDate =
        input.issueDate === undefined ? voucher.issueDate : new Date(input.issueDate);
      const dueDate = input.dueDate === undefined ? voucher.dueDate : new Date(input.dueDate);
      const validTill =
        input.validTill === undefined ? voucher.validTill : new Date(input.validTill);

      // Checked here as well as by the constraint, so the person gets a
      // sentence rather than a 500 from a violated CHECK.
      if (dueDate < issueDate || validTill < dueDate) {
        throw new BusinessRuleError(
          'BUSINESS_RULE_VIOLATION',
          'The due date cannot be before the issue date, and the challan cannot expire before it is due.',
        );
      }

      const lateFee =
        input.applyLateFee === false
          ? 0
          : await recomputeLateFee(tx, decimalToMinor(voucher.netPayable));

      await tx.feeVoucher.update({
        where: { id },
        data: {
          issueDate,
          dueDate,
          validTill,
          ...(input.applyLateFee === undefined ? {} : { lateFeeAuto: input.applyLateFee }),
          lateFeeAmount: toDecimalString(minorUnits(lateFee)),
        },
      });
    });

    return this.detail(id);
  }

  /**
   * Cancel — what the trash icon does.
   *
   * The period claims go with it. That is the point: cancelling September's
   * voucher has to let September be generated again, and the claims are what
   * would otherwise keep reporting the student as already billed forever.
   */
  async cancel(id: string, input: CancelVoucher): Promise<void> {
    await this.prisma.tenant(async (tx) => {
      const voucher = await tx.feeVoucher.findUnique({
        where: { id },
        select: { id: true, status: true, paidAmount: true },
      });
      if (voucher === null) {
        throw new NotFoundError('That voucher does not exist.');
      }
      if (voucher.status === 'CANCELLED') {
        throw new BusinessRuleError('FEES_VOUCHER_CANCELLED', 'That voucher is already cancelled.');
      }
      if (decimalToMinor(voucher.paidAmount) > 0) {
        throw new BusinessRuleError(
          'FEES_VOUCHER_ALREADY_PAID',
          'Money has been received against this voucher, so it cannot be cancelled. Reverse the payment first.',
        );
      }

      await tx.feeVoucherPeriod.deleteMany({ where: { voucherId: id } });
      await tx.feeVoucher.update({
        where: { id },
        data: { status: 'CANCELLED', cancelledAt: systemClock.now(), cancelReason: input.reason },
      });
    });
  }

  /**
   * Record a payment — the Pay button.
   *
   * ## Allocation settles the arrears first
   *
   * A voucher carrying arrears is carrying somebody else's balance. Paying it
   * has to close those older vouchers, oldest first, or they stay open and
   * reappear as arrears on next month's challan forever. The allocation rows
   * record exactly which voucher got which rupee — invariant 3.
   *
   * The arrears figure printed on the challan is re-read here rather than
   * trusted: the parent may have paid the old voucher at the counter in
   * between, and settling it twice would take money for a debt already cleared.
   */
  async pay(id: string, input: RecordPayment, actorId: string | undefined): Promise<VoucherDetail> {
    await this.prisma.tenant(async (tx) => {
      const replay = await tx.feePayment.findFirst({
        where: { idempotencyKey: input.idempotencyKey },
        select: { id: true },
      });
      if (replay !== null) {
        // A double-submitted form is one payment.
        return;
      }

      const voucher = await tx.feeVoucher.findUnique({
        where: { id },
        select: {
          id: true,
          studentId: true,
          status: true,
          grossAmount: true,
          netPayable: true,
          paidAmount: true,
          dueDate: true,
          lateFeeAmount: true,
          arrears: { select: { sourceVoucherId: true } },
        },
      });
      if (voucher === null) {
        throw new NotFoundError('That voucher does not exist.');
      }
      if (voucher.status === 'CANCELLED') {
        throw new BusinessRuleError(
          'FEES_VOUCHER_CANCELLED',
          'That voucher was cancelled. Nothing is owed on it.',
        );
      }

      // The vouchers this one carries, re-read rather than trusted. The parent
      // may have paid September at the counter since October was printed, and
      // settling it twice would take money for a debt already cleared.
      const carried =
        voucher.arrears.length === 0
          ? []
          : await tx.feeVoucher.findMany({
              where: {
                id: { in: voucher.arrears.map((arrear) => arrear.sourceVoucherId) },
                status: { in: ['UNPAID', 'PARTIALLY_PAID'] },
              },
              orderBy: { dueDate: 'asc' },
              select: { id: true, netPayable: true, paidAmount: true },
            });

      const arrearsOutstanding = carried.reduce(
        (sum, source) =>
          sum + decimalToMinor(source.netPayable) - decimalToMinor(source.paidAmount),
        0,
      );

      // Paying after the due date owes the surcharge, and at that point it
      // becomes a real charge on this voucher rather than a number in a box.
      const paidLate = new Date(input.paidOn) > voucher.dueDate;
      const lateFee = paidLate ? decimalToMinor(voucher.lateFeeAmount) : 0;

      if (lateFee > 0) {
        await tx.feeVoucherLine.create({
          data: {
            voucherId: id,
            kind: 'LATE_FEE',
            label: 'Late payment surcharge',
            amount: toDecimalString(minorUnits(lateFee)),
            sortOrder: 900,
          } as never,
        });
        // Raised on gross as well as payable, so `net = gross - discount -
        // waiver` still holds. The database refuses anything else.
        await tx.feeVoucher.update({
          where: { id },
          data: {
            grossAmount: toDecimalString(minorUnits(decimalToMinor(voucher.grossAmount) + lateFee)),
            netPayable: toDecimalString(minorUnits(decimalToMinor(voucher.netPayable) + lateFee)),
          },
        });
      }

      const ownBalance =
        decimalToMinor(voucher.netPayable) + lateFee - decimalToMinor(voucher.paidAmount);
      if (ownBalance + arrearsOutstanding <= 0) {
        throw new BusinessRuleError(
          'FEES_VOUCHER_ALREADY_PAID',
          'That voucher is already settled.',
        );
      }

      const due = ownBalance + arrearsOutstanding;
      const amount = input.amountMinor ?? due;

      if (amount > due) {
        throw new BusinessRuleError(
          'FEES_PAYMENT_EXCEEDS_BALANCE',
          `That is more than the ${formatRupees(due)} outstanding. Overpayment is not recorded here.`,
        );
      }

      const receiptNo = await nextReceiptNo(tx);
      const payment = await tx.feePayment.create({
        data: {
          studentId: voucher.studentId,
          receiptNo,
          amount: toDecimalString(minorUnits(amount)),
          method: input.method,
          paidOn: new Date(input.paidOn),
          idempotencyKey: input.idempotencyKey,
          ...(input.reference === undefined ? {} : { reference: input.reference }),
          ...(actorId === undefined ? {} : { createdBy: actorId }),
        } as never,
        select: { id: true },
      });

      /**
       * Oldest first, across the vouchers this one carries, then whatever is
       * left to the voucher in hand — docs §7, "allocation is oldest-first".
       *
       * A part payment therefore closes September before it touches October,
       * which is both what an accountant expects and what stops the oldest
       * debt ageing indefinitely while newer ones are settled.
       */
      let remaining = amount;

      for (const source of carried) {
        if (remaining <= 0) {
          break;
        }
        const owed = decimalToMinor(source.netPayable) - decimalToMinor(source.paidAmount);
        if (owed <= 0) {
          continue;
        }
        const applied = Math.min(owed, remaining);
        await this.applyToVoucher(tx, payment.id, source.id, applied);
        remaining -= applied;
      }

      if (remaining > 0) {
        await this.applyToVoucher(tx, payment.id, id, Math.min(remaining, ownBalance));
      }
    });

    return this.detail(id);
  }

  /**
   * Waive what is left — a negative line and a reason, never a quiet edit.
   *
   * docs §4.3: "The old portal had Fee Waived Off as a direct edit. That is how
   * numbers stop reconciling." So the gross stays exactly what was charged, the
   * waiver is its own column and its own line, and the year's giving can be
   * added up and explained.
   */
  async waive(
    id: string,
    input: WaiveVoucher,
    actorId: string | undefined,
  ): Promise<VoucherDetail> {
    await this.prisma.tenant(async (tx) => {
      const voucher = await tx.feeVoucher.findUnique({
        where: { id },
        select: {
          id: true,
          status: true,
          grossAmount: true,
          discountAmount: true,
          waiverAmount: true,
          arrearsAmount: true,
          netPayable: true,
          paidAmount: true,
        },
      });
      if (voucher === null) {
        throw new NotFoundError('That voucher does not exist.');
      }
      if (voucher.status === 'CANCELLED') {
        throw new BusinessRuleError('FEES_VOUCHER_CANCELLED', 'That voucher was cancelled.');
      }

      const balance = decimalToMinor(voucher.netPayable) - decimalToMinor(voucher.paidAmount);
      if (balance <= 0) {
        throw new BusinessRuleError('FEES_VOUCHER_ALREADY_PAID', 'There is nothing left to waive.');
      }

      const amount = input.amountMinor ?? balance;
      if (amount > balance) {
        throw new BusinessRuleError(
          'FEES_PAYMENT_EXCEEDS_BALANCE',
          `Only ${formatRupees(balance)} is outstanding, so no more than that can be waived.`,
        );
      }

      const waiver = decimalToMinor(voucher.waiverAmount) + amount;
      const net = decimalToMinor(voucher.netPayable) - amount;

      await tx.feeVoucherLine.create({
        data: {
          voucherId: id,
          kind: 'WAIVER',
          label: `Waived — ${input.reason}`,
          amount: toDecimalString(minorUnits(amount)),
          sortOrder: 950,
        } as never,
      });

      await tx.feeVoucher.update({
        where: { id },
        data: {
          waiverAmount: toDecimalString(minorUnits(waiver)),
          netPayable: toDecimalString(minorUnits(net)),
          status: net <= decimalToMinor(voucher.paidAmount) ? 'WAIVED' : voucher.status,
        },
      });

      void actorId;
    });

    return this.detail(id);
  }

  /** One allocation, and the voucher status that follows from it. */
  private async applyToVoucher(
    tx: TransactionClient,
    paymentId: string,
    voucherId: string,
    amountMinor: number,
  ): Promise<void> {
    if (amountMinor <= 0) {
      return;
    }

    await tx.feePaymentAllocation.create({
      data: { paymentId, voucherId, amount: toDecimalString(minorUnits(amountMinor)) } as never,
    });

    const target = await tx.feeVoucher.findUniqueOrThrow({
      where: { id: voucherId },
      select: { netPayable: true, paidAmount: true },
    });

    const net = decimalToMinor(target.netPayable);
    const paid = decimalToMinor(target.paidAmount) + amountMinor;

    // Callers never allocate more than a voucher's own balance, and the
    // database refuses it besides — `paid <= net_payable`. Asserting it here
    // turns a constraint violation into a sentence somebody can act on.
    if (paid > net) {
      throw new BusinessRuleError(
        'FEES_PAYMENT_EXCEEDS_BALANCE',
        'That payment is larger than the amount outstanding on the voucher it was being applied to.',
      );
    }

    await tx.feeVoucher.update({
      where: { id: voucherId },
      data: {
        paidAmount: toDecimalString(minorUnits(paid)),
        status: paid >= net ? 'PAID' : 'PARTIALLY_PAID',
        ...(paid >= net ? { paidOn: systemClock.now() } : {}),
      },
    });
  }
}

// --- Shared shapes ----------------------------------------------------------

const VOUCHER_SUMMARY_SELECT = {
  id: true,
  voucherNo: true,
  status: true,
  studentId: true,
  sessionId: true,
  issueDate: true,
  dueDate: true,
  validTill: true,
  billMonths: true,
  grossAmount: true,
  discountAmount: true,
  waiverAmount: true,
  arrearsAmount: true,
  netPayable: true,
  lateFeeAmount: true,
  paidAmount: true,
  paidOn: true,
  session: { select: { name: true } },
  student: {
    select: {
      firstName: true,
      lastName: true,
      grNo: true,
      enrollments: {
        orderBy: { createdAt: 'desc' as const },
        take: 1,
        select: {
          classLevel: { select: { name: true } },
          section: { select: { name: true } },
        },
      },
      guardians: {
        where: { guardian: { relation: 'FATHER' as const } },
        take: 1,
        select: { guardian: { select: { name: true } } },
      },
    },
  },
} as const;

type VoucherRow = {
  id: string;
  voucherNo: string;
  status: VoucherSummary['status'];
  studentId: string;
  sessionId: string;
  issueDate: Date;
  dueDate: Date;
  validTill: Date;
  billMonths: Date[];
  grossAmount: unknown;
  discountAmount: unknown;
  waiverAmount: unknown;
  arrearsAmount: unknown;
  netPayable: unknown;
  lateFeeAmount: unknown;
  paidAmount: unknown;
  paidOn: Date | null;
  session: { name: string };
  student: {
    firstName: string;
    lastName: string;
    grNo: string;
    enrollments: { classLevel: { name: string }; section: { name: string } | null }[];
    guardians: { guardian: { name: string } }[];
  };
};

function toSummary(row: VoucherRow): VoucherSummary {
  const net = decimalToMinor(row.netPayable);
  const paid = decimalToMinor(row.paidAmount);
  const arrears = decimalToMinor(row.arrearsAmount);

  return {
    id: row.id,
    voucherNo: row.voucherNo,
    status: row.status,
    studentId: row.studentId,
    studentName: `${row.student.firstName} ${row.student.lastName}`.trim(),
    grNo: row.student.grNo,
    fatherName: row.student.guardians[0]?.guardian.name ?? null,
    className: row.student.enrollments[0]?.classLevel.name ?? null,
    sectionName: row.student.enrollments[0]?.section?.name ?? null,
    sessionId: row.sessionId,
    sessionName: row.session.name,
    issueDate: isoDate(row.issueDate),
    dueDate: isoDate(row.dueDate),
    validTill: isoDate(row.validTill),
    billMonths: row.billMonths.map(isoDate),
    grossMinor: minorUnits(decimalToMinor(row.grossAmount)),
    discountMinor: minorUnits(decimalToMinor(row.discountAmount)),
    waiverMinor: minorUnits(decimalToMinor(row.waiverAmount)),
    arrearsMinor: minorUnits(arrears),
    netPayableMinor: minorUnits(net),
    totalPayableMinor: minorUnits(net + arrears),
    lateFeeMinor: minorUnits(decimalToMinor(row.lateFeeAmount)),
    paidMinor: minorUnits(paid),
    balanceMinor: minorUnits(Math.max(0, net - paid)),
    paidOn: row.paidOn === null ? null : isoDate(row.paidOn),
  };
}

function buildWhere(query: VoucherListQuery): Record<string, unknown> {
  return {
    ...(query.sessionId === undefined ? {} : { sessionId: query.sessionId }),
    ...(query.studentId === undefined ? {} : { studentId: query.studentId }),
    ...(query.status === undefined ? {} : { status: query.status }),
    ...(query.from === undefined && query.to === undefined
      ? {}
      : {
          issueDate: {
            ...(query.from === undefined ? {} : { gte: new Date(query.from) }),
            // Inclusive: "1st to 31st" means the 31st to everybody but a
            // programmer. `@db.Date` carries no time, so `lte` is the whole day.
            ...(query.to === undefined ? {} : { lte: new Date(query.to) }),
          },
        }),
    ...(query.outstandingOnly === true ? { status: { in: ['UNPAID', 'PARTIALLY_PAID'] } } : {}),
    ...(query.classLevelId === undefined &&
    query.sectionId === undefined &&
    query.grNo === undefined
      ? {}
      : {
          student: {
            ...(query.grNo === undefined
              ? {}
              : { grNo: { contains: query.grNo, mode: 'insensitive' } }),
            ...(query.classLevelId === undefined && query.sectionId === undefined
              ? {}
              : {
                  enrollments: {
                    some: {
                      ...(query.classLevelId === undefined
                        ? {}
                        : { classLevelId: query.classLevelId }),
                      ...(query.sectionId === undefined ? {} : { sectionId: query.sectionId }),
                    },
                  },
                }),
          },
        }),
    ...(query.q === undefined || query.q === ''
      ? {}
      : {
          OR: [
            { voucherNo: { contains: query.q, mode: 'insensitive' } },
            { student: { firstName: { contains: query.q, mode: 'insensitive' } } },
            { student: { lastName: { contains: query.q, mode: 'insensitive' } } },
            { student: { grNo: { contains: query.q, mode: 'insensitive' } } },
            {
              student: {
                guardians: {
                  some: { guardian: { name: { contains: query.q, mode: 'insensitive' } } },
                },
              },
            },
          ],
        }),
  };
}

/** Allow-listed, never interpolated from client input. */
function orderFor(sort: string, order: 'asc' | 'desc'): Record<string, unknown> {
  switch (sort) {
    case 'dueDate':
      return { dueDate: order };
    case 'voucherNo':
      return { voucherNo: order };
    case 'amount':
      return { netPayable: order };
    case 'studentName':
      return { student: { firstName: order } };
    default:
      return { issueDate: order };
  }
}

async function recomputeLateFee(tx: TransactionClient, netMinor: number): Promise<number> {
  const school = await tx.school.findFirstOrThrow({
    select: { lateFeePercent: true, lateFeeFlat: true },
  });
  return computeLateFee(
    netMinor,
    fromDecimalString(school.lateFeePercent.toFixed(2)),
    fromDecimalString(school.lateFeeFlat.toFixed(2)),
  );
}

async function nextReceiptNo(tx: TransactionClient): Promise<string> {
  const rows = await tx.$queryRawUnsafe<{ next: number }[]>(
    `INSERT INTO number_sequences (id, school_id, kind, next_value, updated_at)
     VALUES (gen_random_uuid(), current_school_id(), 'receipt', 2, now())
     ON CONFLICT (school_id, kind)
     DO UPDATE SET next_value = number_sequences.next_value + 1, updated_at = now()
     RETURNING next_value - 1 AS next`,
  );

  const value = rows[0]?.next;
  if (value === undefined) {
    throw new BusinessRuleError(
      'INTERNAL_ERROR',
      'Could not allocate a receipt number. Nothing was saved.',
    );
  }
  return `RC-${String(value).padStart(6, '0')}`;
}

/**
 * `numeric` reaches us as a Prisma `Decimal`, not a string.
 *
 * Calling `.trim()` on it — which is what the string path does — throws
 * "value.trim is not a function" and turns a list into a 500. Narrowing here
 * once is cheaper than remembering at thirty call sites.
 */
function decimalToMinor(value: unknown): number {
  if (value === null || value === undefined) {
    return 0;
  }
  if (typeof value === 'string') {
    return fromDecimalString(value);
  }
  const decimal = value as { toFixed?: (digits: number) => string };
  if (typeof decimal.toFixed === 'function') {
    return fromDecimalString(decimal.toFixed(2));
  }
  return 0;
}

/** `Date` → `YYYY-MM-DD`, in UTC, because a `date` column has no zone. */
function isoDate(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function formatRupees(minor: number): string {
  return `PKR ${(minor / 100).toLocaleString('en-PK', { minimumFractionDigits: 0 })}`;
}
