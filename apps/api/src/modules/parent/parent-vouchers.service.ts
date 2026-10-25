import {
  type ParentChallan,
  type ParentVoucherItem,
  type ParentVoucherList,
  type ParentVoucherListQuery,
  type ParentVoucherStatus,
} from '@ilm/contracts';
import { DEFAULT_TIMEZONE, today as todayIn } from '@ilm/utils';
import { Inject, Injectable } from '@nestjs/common';

import { type TransactionClient } from '../../prisma';
import { PrismaService } from '../../prisma/prisma.service';
import { NotFoundError } from '../../shared/errors/domain-error';
import { TenantContextService } from '../../shared/tenancy/tenant-context.service';
import { CLOCK, type Clock } from '../../shared/time/clock.provider';
import { SchoolLogoService } from '../schools/school-logo.service';
import { SchoolSettingsService } from '../schools/school-settings.service';
import { VoucherSettingsService } from '../schools/voucher-settings.service';
import { decimalToMinor, toSummary, VOUCHER_SUMMARY_SELECT, VouchersService } from '../vouchers/vouchers.service';

/**
 * A parent's fee vouchers.
 *
 * ## Every query starts at the signed-in guardian
 *
 * Like the rest of the parent portal: the children come from the caller's own
 * account, and every voucher read is constrained to them. A voucher of someone
 * else's child, a cancelled one, and one that does not exist are the same 404,
 * so one family cannot probe for another's voucher numbers. Nothing here writes.
 *
 * ## Money and layout are not recomputed
 *
 * The figures come from `VouchersService` — the same rows and the same mapping
 * the office's list and challan use — and the challan a parent previews is the
 * office's challan, under the school's own Voucher Settings. There is one
 * calculation and one layout, so the parent can never see a different number.
 */
@Injectable()
export class ParentVouchersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly context: TenantContextService,
    private readonly vouchers: VouchersService,
    private readonly schoolSettings: SchoolSettingsService,
    private readonly voucherSettings: VoucherSettingsService,
    private readonly logos: SchoolLogoService,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async list(query: ParentVoucherListQuery): Promise<ParentVoucherList> {
    return this.prisma.tenant(async (tx) => {
      const today = await this.today(tx);
      const linked = await this.linkedChildIds(tx);
      const kids = await tx.student.findMany({
        where: { id: { in: linked }, deletedAt: null },
        orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }],
        select: { id: true, firstName: true, lastName: true },
      });
      const children = kids.map((kid) => ({ id: kid.id, name: `${kid.firstName} ${kid.lastName}`.trim() }));

      if (query.studentId !== undefined && !linked.includes(query.studentId)) {
        throw new NotFoundError('student');
      }
      if (linked.length === 0) {
        return { items: [], total: 0, totals: { dueMinor: 0, paidMinor: 0, pendingMinor: 0 }, children, months: [] };
      }

      const scope = { studentId: { in: query.studentId === undefined ? linked : [query.studentId] } };
      const where = {
        ...scope,
        // A cancelled voucher was withdrawn by the office; the family never owed it.
        status: { not: 'CANCELLED' as const },
        ...(query.month === undefined ? {} : { billMonths: { has: new Date(`${query.month}-01T00:00:00.000Z`) } }),
        ...statusClause(query.status, today),
        ...(query.q === undefined || query.q === ''
          ? {}
          : {
              OR: [
                { voucherNo: { contains: query.q, mode: 'insensitive' as const } },
                { student: { firstName: { contains: query.q, mode: 'insensitive' as const } } },
                { student: { lastName: { contains: query.q, mode: 'insensitive' as const } } },
              ],
            }),
      };

      const [rows, total, sums, monthRows] = await Promise.all([
        tx.feeVoucher.findMany({
          where,
          orderBy: orderFor(query.sort, query.order),
          skip: query.offset,
          take: query.limit,
          select: VOUCHER_SUMMARY_SELECT,
        }),
        tx.feeVoucher.count({ where }),
        tx.feeVoucher.aggregate({ where, _sum: { netPayable: true, paidAmount: true } }),
        tx.feeVoucher.findMany({
          where: { ...scope, status: { not: 'CANCELLED' } },
          select: { billMonths: true },
        }),
      ]);

      const months = [
        ...new Set(monthRows.flatMap((row) => row.billMonths.map((month) => month.toISOString().slice(0, 7)))),
      ].sort((a, b) => b.localeCompare(a));

      const due = decimalToMinor(sums._sum.netPayable);
      const paid = decimalToMinor(sums._sum.paidAmount);

      return {
        items: rows.map((row) => withStatus(toSummary(row), today)),
        total,
        totals: { dueMinor: due, paidMinor: paid, pendingMinor: Math.max(0, due - paid) },
        children,
        months,
      };
    });
  }

  async detail(id: string): Promise<ParentChallan> {
    const owned = await this.prisma.tenant(async (tx) => {
      const linked = await this.linkedChildIds(tx);
      const voucher = await tx.feeVoucher.findFirst({
        where: { id, studentId: { in: linked }, status: { not: 'CANCELLED' } },
        select: { id: true },
      });
      return voucher === null ? null : { id: voucher.id, today: await this.today(tx) };
    });
    if (owned === null) {
      throw new NotFoundError('voucher');
    }
    const today = owned.today;

    const [challans, school, logo, bankLogos, settings] = await Promise.all([
      this.vouchers.challans([id]),
      this.schoolSettings.get(),
      this.logos.info('SCHOOL_LOGO'),
      this.logos.listBank(),
      this.voucherSettings.get(),
    ]);
    const challan = challans[0];
    if (challan === undefined) {
      throw new NotFoundError('voucher');
    }

    return {
      challan,
      paymentStatus: statusOf(challan.status, challan.dueDate, challan.balanceMinor, today),
      school: {
        name: school.name,
        address: school.address,
        phone: school.phone,
        logoVersion: logo.present ? (logo.version ?? '') : null,
        accentColor: school.primaryColor,
      },
      settings,
      bankLogos,
    };
  }

  /**
   * The school's own date, which is what "overdue" is decided by.
   *
   * Taken from UTC, a voucher due today reads as already late to a parent in
   * Karachi opening the app before 05:00 — a red badge and a late fee on a
   * challan nobody is late for. Same rule as the defaulters screen.
   */
  private async today(tx: TransactionClient): Promise<string> {
    const school = await tx.school.findFirst({ select: { timezone: true } });
    return todayIn(this.clock, school?.timezone ?? DEFAULT_TIMEZONE);
  }

  private async linkedChildIds(tx: TransactionClient): Promise<string[]> {
    const userId = this.context.userId;
    if (userId === undefined) {
      return [];
    }
    const links = await tx.studentGuardian.findMany({
      where: { guardian: { userId, deletedAt: null } },
      select: { studentId: true },
    });
    return [...new Set(links.map((link) => link.studentId))];
  }
}

/** What the parent reads: paid or waived stays so; owing past the due date is overdue. */
function statusOf(
  status: ParentVoucherItem['status'],
  dueDate: string,
  balanceMinor: number,
  today: string,
): ParentVoucherStatus {
  if (status === 'PAID') return 'PAID';
  if (status === 'WAIVED') return 'WAIVED';
  if (balanceMinor > 0 && dueDate < today) return 'OVERDUE';
  return status === 'PARTIALLY_PAID' ? 'PARTIALLY_PAID' : 'UNPAID';
}

function withStatus(summary: ReturnType<typeof toSummary>, today: string): ParentVoucherItem {
  return { ...summary, paymentStatus: statusOf(summary.status, summary.dueDate, summary.balanceMinor, today) };
}

/**
 * Allow-listed, never interpolated from input.
 *
 * Ties fall to the newest issue date, then the newest creation, then the id, so
 * "latest first" holds within a day too and a paged list never repeats a row.
 */
function orderFor(sort: ParentVoucherListQuery['sort'], order: 'asc' | 'desc'): Record<string, unknown>[] {
  const primary: Record<string, unknown>[] = (() => {
    switch (sort) {
      case 'dueDate':
        return [{ dueDate: order }];
      case 'voucherNo':
        return [{ voucherNo: order }];
      case 'amount':
        return [{ netPayable: order }];
      case 'status':
        return [{ status: order }];
      case 'studentName':
        return [{ student: { firstName: order } }, { student: { lastName: order } }];
      default:
        return [{ issueDate: order }, { createdAt: order }];
    }
  })();
  return [...primary, { issueDate: 'desc' }, { createdAt: 'desc' }, { id: 'asc' }];
}

/** The same precedence as `statusOf`, as a `where`. */
function statusClause(status: ParentVoucherStatus | undefined, today: string): Record<string, unknown> {
  const day = new Date(`${today}T00:00:00.000Z`);
  switch (status) {
    case undefined:
      return {};
    case 'PAID':
      return { status: 'PAID' };
    case 'WAIVED':
      return { status: 'WAIVED' };
    case 'OVERDUE':
      return { status: { in: ['UNPAID', 'PARTIALLY_PAID'] }, dueDate: { lt: day } };
    case 'UNPAID':
      return { status: 'UNPAID', dueDate: { gte: day } };
    case 'PARTIALLY_PAID':
      return { status: 'PARTIALLY_PAID', dueDate: { gte: day } };
  }
}
