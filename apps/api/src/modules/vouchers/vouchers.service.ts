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
import { firstOfMonth, monthLabel } from './voucher-planner';

/**
 * Reading vouchers, and the three things that can happen to one.
 *
 * ## What may change on an issued voucher, and when
 *
 * Dates and the late-fee switch may change at any time before the voucher is
 * paid. They do not alter what is owed.
 *
 * The **lines** may change only while nothing has been received against the
 * voucher — `UNPAID`, nothing paid, nothing waived. That is where R4 draws its
 * line, and it draws it at the receipt rather than at generation: a challan
 * raised this morning with the lab fee left off is a mistake to correct, while
 * one a parent has paid against is a record that a receipt already agrees with.
 * After the first rupee the ways to change the number are a further payment, a
 * waiver, or a cancellation — each of which leaves a trail of itself.
 *
 * There is deliberately **no way to set the status** and no editable paid
 * amount. Status is what the payment ledger adds up to; a dropdown offering
 * `PAID` would be money with no receipt behind it, and `WAIVED` set that way
 * would skip the reason and the ledger entry — the "Fee Waived Off as a direct
 * edit" that §4.3 names as how a school's totals stop reconciling.
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
        throw new NotFoundError('voucher');
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
      // Locked for the whole edit.
      //
      // Without this, a payment arriving between the check below and the write
      // would be paid against a total this method is about to change — the
      // receipt and the voucher would then disagree by exactly the line that
      // was added. `FOR UPDATE` makes the payment wait, and it then re-reads a
      // voucher whose lines are already settled.
      const locked = await tx.$queryRawUnsafe<{ id: string }[]>(
        `SELECT id FROM fee_vouchers WHERE id = $1::uuid FOR UPDATE`,
        id,
      );
      if (locked.length === 0) {
        throw new NotFoundError('voucher');
      }

      const voucher = await tx.feeVoucher.findUnique({
        where: { id },
        select: {
          id: true,
          status: true,
          studentId: true,
          sessionId: true,
          billMonths: true,
          grossAmount: true,
          discountAmount: true,
          waiverAmount: true,
          arrearsAmount: true,
          netPayable: true,
          paidAmount: true,
          issueDate: true,
          dueDate: true,
          validTill: true,
        },
      });
      if (voucher === null) {
        throw new NotFoundError('voucher');
      }
      if (voucher.status === 'CANCELLED') {
        throw new BusinessRuleError('FEES_VOUCHER_CANCELLED', 'That voucher was cancelled.');
      }
      if (voucher.status === 'PAID') {
        throw new BusinessRuleError(
          'FEES_VOUCHER_ALREADY_PAID',
          'That voucher is paid. It can no longer be changed — record a refund or a further payment instead.',
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

      const removals = input.removeLineIds ?? [];
      const additions = input.addHeads ?? [];
      const changesLines = removals.length > 0 || additions.length > 0;

      let gross = decimalToMinor(voucher.grossAmount);
      let discount = decimalToMinor(voucher.discountAmount);

      if (changesLines) {
        await this.editLines(tx, { id, voucher, removals, additions, issueDate });

        // Re-summed from the rows rather than adjusted by the delta. Arithmetic
        // that tracks a running total drifts the first time a path forgets to
        // update it; the lines are the truth, so this asks them.
        const totals = await tx.feeVoucherLine.aggregate({
          where: { voucherId: id, kind: 'FEE' },
          _sum: { amount: true, discount: true },
        });
        gross = decimalToMinor(totals._sum.amount);
        discount = decimalToMinor(totals._sum.discount);
      }

      const arrears = decimalToMinor(voucher.arrearsAmount);
      const waiver = decimalToMinor(voucher.waiverAmount);
      const net = gross - discount - waiver + arrears;

      const lateFee = input.applyLateFee === false ? 0 : await recomputeLateFee(tx, net);

      await tx.feeVoucher.update({
        where: { id },
        data: {
          issueDate,
          dueDate,
          validTill,
          ...(input.applyLateFee === undefined ? {} : { lateFeeAuto: input.applyLateFee }),
          lateFeeAmount: toDecimalString(minorUnits(lateFee)),
          ...(changesLines
            ? {
                grossAmount: toDecimalString(minorUnits(gross)),
                discountAmount: toDecimalString(minorUnits(discount)),
                netPayable: toDecimalString(minorUnits(net)),
              }
            : {}),
        },
      });
    });

    return this.detail(id);
  }

  /**
   * Taking lines off a voucher and putting lines on.
   *
   * ## Only while nothing has been received
   *
   * A voucher nobody has paid against is a bill that has not yet become a
   * financial record — fixing the lab fee somebody forgot is a correction, not
   * a rewrite of history. The moment a rupee arrives there is a receipt naming
   * a total, and changing the voucher makes the two disagree, so R4 closes the
   * door: from then on the paths are a payment, a waiver or a cancellation.
   *
   * A waiver closes it too. A waiver was a decision about *this* total, and
   * moving the total under it silently changes what was forgiven.
   *
   * ## Why the period claims move with the lines
   *
   * `fee_voucher_periods` is what stops a student being billed twice for
   * September. A line added without its claim is a month that can be billed
   * again next week; a line removed without releasing its claim is a month that
   * can never be billed again at all — and neither shows up until somebody runs
   * generation and finds the wrong answer.
   */
  private async editLines(
    tx: TransactionClient,
    context: {
      id: string;
      voucher: {
        status: string;
        studentId: string;
        sessionId: string;
        billMonths: Date[];
        paidAmount: unknown;
        waiverAmount: unknown;
      };
      removals: readonly string[];
      additions: readonly { feeHeadId: string; amountMinor?: number | undefined }[];
      issueDate: Date;
    },
  ): Promise<void> {
    const { id, voucher, removals, additions, issueDate } = context;

    if (decimalToMinor(voucher.paidAmount) > 0 || voucher.status !== 'UNPAID') {
      throw new BusinessRuleError(
        'FEES_VOUCHER_ALREADY_PAID',
        'Money has already been received against this voucher, so its fees can no longer be changed. Record a further payment, waive the balance, or cancel it and issue a new one.',
      );
    }
    if (decimalToMinor(voucher.waiverAmount) > 0) {
      throw new BusinessRuleError(
        'BUSINESS_RULE_VIOLATION',
        'Part of this voucher has been waived, so its fees can no longer be changed. Cancel it and issue a new one instead.',
      );
    }

    // --- Removals ----------------------------------------------------------
    if (removals.length > 0) {
      const lines = await tx.feeVoucherLine.findMany({
        where: { id: { in: [...removals] }, voucherId: id },
        select: {
          id: true,
          kind: true,
          feeHeadId: true,
          billMonth: true,
          label: true,
          // The frequency decides which claim this line holds, and only the
          // head knows it.
          feeHead: { select: { frequency: true } },
        },
      });

      if (lines.length !== removals.length) {
        // Scoped to this voucher above, so a missing row is either another
        // voucher's line or one already gone. Either way the request describes
        // a voucher that is not the one in front of the person sending it.
        throw new BusinessRuleError(
          'BUSINESS_RULE_VIOLATION',
          'Some of those lines are no longer on this voucher. Reload it and try again.',
        );
      }

      const notFee = lines.find((line) => line.kind !== 'FEE');
      if (notFee !== undefined) {
        throw new BusinessRuleError(
          'BUSINESS_RULE_VIOLATION',
          notFee.kind === 'ARREAR'
            ? `"${notFee.label}" is an unpaid balance carried from an earlier voucher. Removing it here would forgive that voucher without any record of it — cancel or waive the original instead.`
            : `"${notFee.label}" records a decision that was already made, so it cannot be removed.`,
        );
      }

      // The claims go first, so a failure leaves claims without lines rather
      // than lines without claims — the former blocks a re-bill loudly, the
      // latter allows a double-bill silently.
      for (const line of lines) {
        if (line.feeHeadId === null || line.feeHead === null) {
          continue;
        }
        await tx.feeVoucherPeriod.deleteMany({
          where: {
            voucherId: id,
            feeHeadId: line.feeHeadId,
            periodKey: periodKeyFor(line.feeHead.frequency, line.billMonth, voucher.sessionId),
          },
        });
      }

      await tx.feeVoucherLine.deleteMany({ where: { id: { in: lines.map((l) => l.id) } } });
    }

    // --- Additions ---------------------------------------------------------
    for (const addition of additions) {
      const head = await tx.feeHead.findFirst({
        where: { id: addition.feeHeadId },
        select: { id: true, name: true, frequency: true, defaultAmount: true, isActive: true },
      });
      if (head === null) {
        throw new NotFoundError('fee head');
      }
      if (!head.isActive) {
        throw new BusinessRuleError(
          'BUSINESS_RULE_VIOLATION',
          `${head.name} is no longer offered, so it cannot be added to a voucher.`,
        );
      }

      const months = voucher.billMonths.map((month) => isoDate(month).slice(0, 7));
      if (head.frequency === 'MONTHLY' && months.length === 0) {
        throw new BusinessRuleError(
          'BUSINESS_RULE_VIOLATION',
          `${head.name} is charged monthly, and this voucher bills no month. Add it to a voucher for a month instead.`,
        );
      }

      // The same rule generation uses, so adding tuition to a three-month
      // challan produces three lines and adding an admission fee produces one.
      const periods =
        head.frequency === 'ONE_TIME'
          ? [{ key: 'once', month: null as Date | null, label: null as string | null }]
          : head.frequency === 'ANNUAL'
            ? [{ key: `session:${voucher.sessionId}`, month: null, label: null }]
            : [...new Set(months)].sort().map((month) => ({
                key: month,
                month: firstOfMonth(month),
                label: monthLabel(month),
              }));

      const agreed = await agreedAmountFor(tx, voucher.studentId, head.id, issueDate);
      const amount = addition.amountMinor ?? agreed?.amountMinor ?? decimalToMinor(head.defaultAmount);
      // An override is a decision about the money, not about the concession, so
      // it replaces the agreed amount outright rather than being discounted
      // again — otherwise typing "5000" bills 3,500 and nobody can see why.
      const lineDiscount = addition.amountMinor === undefined ? (agreed?.discountMinor ?? 0) : 0;

      for (const period of periods) {
        const claimed = await tx.feeVoucherPeriod.findFirst({
          where: { studentId: voucher.studentId, feeHeadId: head.id, periodKey: period.key },
          select: { voucherId: true, voucher: { select: { voucherNo: true } } },
        });

        if (claimed !== null) {
          throw new BusinessRuleError(
            'FEES_ALREADY_BILLED',
            claimed.voucherId === id
              ? `${head.name}${period.label === null ? '' : ` for ${period.label}`} is already on this voucher.`
              : `${head.name}${period.label === null ? '' : ` for ${period.label}`} was already billed on voucher ${claimed.voucher.voucherNo}.`,
          );
        }

        await tx.feeVoucherLine.create({
          data: {
            voucherId: id,
            feeHeadId: head.id,
            kind: 'FEE',
            label: period.label === null ? head.name : `${head.name} - ${period.label}`,
            ...(period.month === null ? {} : { billMonth: period.month }),
            amount: toDecimalString(minorUnits(amount)),
            discount: toDecimalString(minorUnits(lineDiscount)),
            sortOrder: 100,
          } as never,
        });

        await tx.feeVoucherPeriod.create({
          data: {
            voucherId: id,
            studentId: voucher.studentId,
            feeHeadId: head.id,
            periodKey: period.key,
          } as never,
        });
      }
    }

    // A voucher with nothing on it is not a bill. Cancelling is the act that
    // was meant, and it releases the months and records a reason.
    const remaining = await tx.feeVoucherLine.count({ where: { voucherId: id, kind: 'FEE' } });
    if (remaining === 0) {
      throw new BusinessRuleError(
        'BUSINESS_RULE_VIOLATION',
        'That would leave the voucher with no fees on it. Cancel the voucher instead — it keeps the record and frees the months to be billed again.',
      );
    }
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
        throw new NotFoundError('voucher');
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
        throw new NotFoundError('voucher');
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
        throw new NotFoundError('voucher');
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

/**
 * The claim key a line occupies.
 *
 * Mirrors `periodsFor` in the planner, and takes the **frequency** rather than
 * inferring it. A one-time head and an annual head both leave `billMonth` null,
 * so a version of this that read only the line could not tell `once` from
 * `session:…` — and picking the wrong one means the claim is not released when
 * the line is removed, leaving a head that can never be billed to that student
 * again with nothing on screen to explain why.
 */
function periodKeyFor(
  frequency: string,
  billMonth: Date | null,
  sessionId: string,
): string {
  if (frequency === 'ONE_TIME') {
    return 'once';
  }
  if (frequency === 'ANNUAL') {
    return `session:${sessionId}`;
  }
  return billMonth === null ? `session:${sessionId}` : isoDate(billMonth).slice(0, 7);
}

/**
 * What this student had agreed to pay for a head on a given day.
 *
 * The same slowly-changing lookup the rest of fees uses: the newest row whose
 * `effective_from` is on or before the date. A line added to a voucher issued
 * in September must carry September's agreed amount, not whatever the fee
 * happens to be by the time somebody notices it was missing.
 */
async function agreedAmountFor(
  tx: TransactionClient,
  studentId: string,
  feeHeadId: string,
  on: Date,
): Promise<{ amountMinor: number; discountMinor: number } | undefined> {
  const rows = await tx.$queryRawUnsafe<{ amount: string; discounted_amount: string | null }[]>(
    `SELECT amount::text, discounted_amount::text
       FROM student_fees
      WHERE student_id = $1::uuid AND fee_head_id = $2::uuid AND effective_from <= $3::date
      ORDER BY effective_from DESC
      LIMIT 1`,
    studentId,
    feeHeadId,
    isoDate(on),
  );

  const row = rows[0];
  if (row === undefined) {
    return undefined;
  }

  const amountMinor = fromDecimalString(row.amount);
  return {
    amountMinor,
    discountMinor:
      row.discounted_amount === null ? 0 : amountMinor - fromDecimalString(row.discounted_amount),
  };
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
