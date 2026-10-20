import {
  type AddSalaryAdjustment,
  type RecordSalaryPayment,
  type SalaryAdjustmentKind,
  type SalaryPaymentMethod,
  type SalaryStatus,
  type StaffRole,
  type StaffSalaryAdjustmentRecord,
  type StaffSalaryDetail,
  type StaffSalaryList,
  type StaffSalaryListItem,
  type StaffSalaryListQuery,
  type StaffSalaryMonth,
  type StaffSalaryPaymentRecord,
  type StaffSalaryReceipt,
  type StaffSalarySummary,
} from '@ilm/contracts';
import { fromDecimalString, minorUnits, toDecimalString } from '@ilm/utils';
import { Inject, Injectable } from '@nestjs/common';

import { type TransactionClient } from '../../prisma';
import { PrismaService } from '../../prisma/prisma.service';
import { BusinessRuleError, NotFoundError } from '../../shared/errors/domain-error';
import { TenantContextService } from '../../shared/tenancy/tenant-context.service';
import { CLOCK, type Clock } from '../../shared/time/clock.provider';
import { NotificationsService } from '../notifications/notifications.service';

/** Three years of months is more than any payroll question is about. */
const HISTORY_MONTHS = 36;

/**
 * Staff salaries — one monthly record per person, many payments against it.
 *
 * ## The model
 *
 * `staff_salary_periods` holds one row per person per month, with the basic
 * salary **as it was when the month became payable**. A later raise changes
 * what future months are made at; it cannot rewrite one already made.
 * `staff_salary_adjustments` adds bonuses, allowances and deductions. Payments
 * (`staff_salary_payments`) are any number of rows against the month — never a
 * row per month — so a part payment is just a payment that leaves a balance.
 *
 *     net       = base + adjustments
 *     remaining = net - paid          (never below zero, never overpaid)
 *
 * ## Becoming payable
 *
 * A month is made payable the first time somebody looks at it (or, for history,
 * opens a person), for everyone it applies to: active when it began, joined by
 * its end, basic salary above zero, and never a month that has not started.
 * That is `INSERT … ON CONFLICT DO NOTHING` on a unique key, so reading twice,
 * or two people reading at once, creates one row.
 *
 * A person who joined or left part-way through a month is billed the full
 * basic salary and **flagged**, not silently prorated: the amount for a part
 * month is a decision, and the way to record it is an explicit deduction with a
 * reason.
 *
 * ## Money safety
 *
 * Integer paisa in code, `numeric(14,2)` in the database. Every write to one
 * month takes a transaction-scoped advisory lock on that month's record, so two
 * payments racing for the same balance are serialised and the second sees the
 * first. All three tables are append-only for the application role (docs/12 R4).
 */
@Injectable()
export class StaffSalaryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly context: TenantContextService,
    private readonly notifications: NotificationsService,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  // ---- reads ---------------------------------------------------------------

  async list(query: StaffSalaryListQuery): Promise<StaffSalaryList> {
    const month = query.month ?? this.currentMonth();

    return this.prisma.tenant(async (tx) => {
      if (month <= this.currentMonth()) {
        await this.ensurePeriods(tx, { fromMonth: month, toMonth: month });
      }

      const base = `
        WITH rows AS (
          SELECT p.id AS period_id, s.id AS staff_id, s.name, s.employee_no, s.role::text AS role,
                 s.photo_url, p.month, p.base_salary AS base,
                 COALESCE(a.adj, 0) AS adj, COALESCE(y.paid, 0) AS paid, y.last_paid_on
            FROM staff_salary_periods p
            JOIN staff s ON s.id = p.staff_id AND s.school_id = p.school_id
            LEFT JOIN LATERAL (
              SELECT SUM(x.amount) AS adj FROM staff_salary_adjustments x WHERE x.period_id = p.id
            ) a ON true
            LEFT JOIN LATERAL (
              SELECT SUM(z.amount) AS paid, MAX(z.paid_on) AS last_paid_on
                FROM staff_salary_payments z WHERE z.period_id = p.id
            ) y ON true
           WHERE p.month = $1::date AND s.deleted_at IS NULL
        ), calc AS (
          SELECT *, (base + adj) AS net, (base + adj - paid) AS remaining,
                 CASE WHEN base + adj - paid <= 0 THEN 'PAID'
                      WHEN paid > 0 THEN 'PARTIAL' ELSE 'UNPAID' END AS status
            FROM rows
        )`;

      const summaryRows = await tx.$queryRawUnsafe<
        { payroll: string; paid: string; pending: string; unpaid: bigint | number }[]
      >(
        `${base}
         SELECT COALESCE(SUM(net), 0)::numeric(14,2)::text AS payroll,
                COALESCE(SUM(paid), 0)::numeric(14,2)::text AS paid,
                COALESCE(SUM(GREATEST(remaining, 0)), 0)::numeric(14,2)::text AS pending,
                COUNT(*) FILTER (WHERE remaining > 0) AS unpaid
           FROM calc`,
        month + '-01',
      );
      const summaryRow = summaryRows[0];
      const summary: StaffSalarySummary = {
        totalPayrollMinor: fromDecimalString(summaryRow?.payroll ?? '0.00'),
        totalPaidMinor: fromDecimalString(summaryRow?.paid ?? '0.00'),
        totalPendingMinor: fromDecimalString(summaryRow?.pending ?? '0.00'),
        unpaidStaffCount: Number(summaryRow?.unpaid ?? 0),
      };

      const params: unknown[] = [month + '-01'];
      const filters: string[] = [];
      if (query.q !== undefined && query.q !== '') {
        params.push(`%${query.q.replace(/[%_\\]/g, (char) => `\\${char}`)}%`);
        filters.push(`(name ILIKE $${String(params.length)} OR employee_no ILIKE $${String(params.length)})`);
      }
      if (query.status !== undefined) {
        params.push(query.status);
        filters.push(`status = $${String(params.length)}`);
      }
      const where = filters.length === 0 ? '' : `WHERE ${filters.join(' AND ')}`;

      const sortColumn: Record<StaffSalaryListQuery['sort'], string> = {
        name: 'lower(name)',
        role: 'role',
        net: 'net',
        paid: 'paid',
        remaining: 'remaining',
        status: `CASE status WHEN 'UNPAID' THEN 0 WHEN 'PARTIAL' THEN 1 ELSE 2 END`,
        lastPaidOn: 'last_paid_on',
      };
      const direction = query.order === 'desc' ? 'DESC' : 'ASC';

      const totalRows = await tx.$queryRawUnsafe<{ total: bigint | number }[]>(
        `${base} SELECT COUNT(*) AS total FROM calc ${where}`,
        ...params,
      );

      params.push(query.limit, query.offset);
      const rows = await tx.$queryRawUnsafe<
        {
          staff_id: string;
          name: string;
          employee_no: string;
          role: StaffRole;
          photo_url: string | null;
          base: string;
          adj: string;
          paid: string;
          net: string;
          remaining: string;
          status: SalaryStatus;
          last_paid_on: Date | null;
        }[]
      >(
        `${base}
         SELECT staff_id, name, employee_no, role, photo_url,
                base::numeric(14,2)::text AS base, adj::numeric(14,2)::text AS adj,
                paid::numeric(14,2)::text AS paid, net::numeric(14,2)::text AS net,
                GREATEST(remaining, 0)::numeric(14,2)::text AS remaining, status, last_paid_on
           FROM calc ${where}
          ORDER BY ${sortColumn[query.sort]} ${direction} NULLS LAST, lower(name) ASC
          LIMIT $${String(params.length - 1)} OFFSET $${String(params.length)}`,
        ...params,
      );

      const items: StaffSalaryListItem[] = rows.map((row) => ({
        staffId: row.staff_id,
        name: row.name,
        employeeNo: row.employee_no,
        role: row.role,
        photoUrl: row.photo_url,
        month,
        baseMinor: fromDecimalString(row.base),
        adjustmentsMinor: fromDecimalString(row.adj),
        netMinor: fromDecimalString(row.net),
        paidMinor: fromDecimalString(row.paid),
        remainingMinor: fromDecimalString(row.remaining),
        status: row.status,
        lastPaidOn: row.last_paid_on === null ? null : row.last_paid_on.toISOString().slice(0, 10),
      }));

      return { month, items, summary, total: Number(totalRows[0]?.total ?? 0) };
    });
  }

  async detail(staffId: string): Promise<StaffSalaryDetail> {
    return this.prisma.tenant(async (tx) => {
      await this.ensurePeriods(tx, {
        staffId,
        fromMonth: shiftMonth(this.currentMonth(), -(HISTORY_MONTHS - 1)),
        toMonth: this.currentMonth(),
      });
      return this.readDetail(tx, staffId);
    });
  }

  async receipt(paymentId: string): Promise<StaffSalaryReceipt> {
    return this.prisma.tenant(async (tx) => {
      const payment = await tx.staffSalaryPayment.findFirst({
        where: { id: paymentId },
        select: {
          id: true,
          staffId: true,
          periodId: true,
          month: true,
          amount: true,
          paidOn: true,
          method: true,
          reference: true,
          notes: true,
          recordedBy: true,
          createdAt: true,
        },
      });
      if (payment === null) {
        throw new NotFoundError('salary payment');
      }

      const [staff, school, balance, earlier, names] = await Promise.all([
        tx.staff.findFirst({
          where: { id: payment.staffId },
          select: { id: true, name: true, employeeNo: true, role: true },
        }),
        tx.school.findFirst({ select: { name: true } }),
        this.balanceOf(tx, payment.periodId),
        tx.staffSalaryPayment.findMany({
          where: { periodId: payment.periodId, createdAt: { lte: payment.createdAt } },
          select: { amount: true },
        }),
        this.namesOf(tx, [payment.recordedBy]),
      ]);
      if (staff === null || school === null) {
        throw new NotFoundError('salary payment');
      }

      const paidThrough = earlier.reduce((sum, row) => sum + decimalToMinor(row.amount), 0);

      return {
        receiptNo: `SAL-${payment.id.slice(-8).toUpperCase()}`,
        schoolName: school.name,
        staff: {
          id: staff.id,
          name: staff.name,
          employeeNo: staff.employeeNo,
          role: staff.role as StaffRole,
        },
        month: payment.month.toISOString().slice(0, 7),
        amountMinor: decimalToMinor(payment.amount),
        paidOn: payment.paidOn.toISOString().slice(0, 10),
        method: payment.method as SalaryPaymentMethod,
        reference: payment.reference,
        notes: payment.notes,
        recordedByName: names.get(payment.recordedBy ?? '') ?? null,
        remainingAfterMinor: Math.max(0, balance.baseMinor + balance.adjustmentsMinor - paidThrough),
      };
    });
  }

  // ---- writes --------------------------------------------------------------

  async record(staffId: string, input: RecordSalaryPayment): Promise<StaffSalaryDetail> {
    return this.prisma.tenant(async (tx) => {
      this.assertPayableMonth(input.month);
      if (input.paidOn > this.clock.now().toISOString().slice(0, 10)) {
        throw new BusinessRuleError(
          'BUSINESS_RULE_VIOLATION',
          'The payment date cannot be in the future.',
        );
      }

      const periodId = await this.periodFor(tx, staffId, input.month);
      await this.lock(tx, periodId);

      // A repeat of a payment that already went through — a double click, or a
      // retry after a dropped response — is answered with the current state,
      // not a second payment.
      if (input.idempotencyKey !== undefined) {
        const existing = await tx.staffSalaryPayment.findFirst({
          where: { idempotencyKey: input.idempotencyKey },
          select: { id: true },
        });
        if (existing !== null) {
          return this.readDetail(tx, staffId);
        }
      }

      const balance = await this.balanceOf(tx, periodId);
      const remaining = balance.baseMinor + balance.adjustmentsMinor - balance.paidMinor;
      if (remaining <= 0) {
        throw new BusinessRuleError(
          'BUSINESS_RULE_VIOLATION',
          'This salary is already fully paid for that month.',
        );
      }

      const amountMinor = input.amountMinor ?? remaining;
      if (amountMinor > remaining) {
        throw new BusinessRuleError(
          'BUSINESS_RULE_VIOLATION',
          `That is more than the ${rupees(remaining)} still owed for ${input.month}. A salary cannot be overpaid.`,
        );
      }

      const payment = await tx.staffSalaryPayment.create({
        data: {
          staffId,
          periodId,
          month: monthStart(input.month),
          amount: toDecimalString(minorUnits(amountMinor)),
          paidOn: new Date(input.paidOn),
          method: input.method,
          reference: blankToNull(input.reference),
          notes: blankToNull(input.notes),
          idempotencyKey: input.idempotencyKey ?? null,
          recordedBy: this.context.userId ?? null,
        } as never,
        select: { id: true },
      });

      await tx.auditLog.create({
        data: {
          schoolId: this.context.schoolId,
          action: 'staff.salary.pay',
          entityType: 'Staff',
          entityId: staffId,
          actorType: 'USER',
          actorUserId: this.context.userId ?? null,
          before: { remainingMinor: remaining },
          after: {
            paymentId: payment.id,
            month: input.month,
            amountMinor,
            paidOn: input.paidOn,
            method: input.method,
            remainingMinor: remaining - amountMinor,
          },
          at: this.clock.now(),
        },
      });

      // The member of staff hears that they have been paid — only if they have a
      // login, and never about a payment they recorded themselves.
      const paid = await tx.staff.findFirst({
        where: { id: staffId },
        select: { userId: true },
      });
      if (paid?.userId !== null && paid?.userId !== undefined) {
        await this.notifications.notify(tx, {
          recipientIds: [paid.userId],
          exceptUserId: this.context.userId,
          kind: 'salary.paid',
          title: `Salary paid: ${rupees(amountMinor)}`,
          body: `For ${input.month}${remaining - amountMinor > 0 ? ` · ${rupees(remaining - amountMinor)} still to come` : ''}`,
          entityType: 'staff',
          entityId: staffId,
        });
      }

      return this.readDetail(tx, staffId);
    });
  }

  async adjust(staffId: string, input: AddSalaryAdjustment): Promise<StaffSalaryDetail> {
    return this.prisma.tenant(async (tx) => {
      this.assertPayableMonth(input.month);

      if (input.kind === 'ADJUSTMENT' && input.direction === undefined) {
        throw new BusinessRuleError(
          'BUSINESS_RULE_VIOLATION',
          'Say whether the manual adjustment adds to or takes from the salary.',
        );
      }
      const signedMinor =
        input.kind === 'DEDUCTION' || (input.kind === 'ADJUSTMENT' && input.direction === 'SUBTRACT')
          ? -input.amountMinor
          : input.amountMinor;

      const periodId = await this.periodFor(tx, staffId, input.month);
      await this.lock(tx, periodId);

      const balance = await this.balanceOf(tx, periodId);
      const net = balance.baseMinor + balance.adjustmentsMinor;
      const nextNet = net + signedMinor;
      if (nextNet < 0) {
        throw new BusinessRuleError(
          'BUSINESS_RULE_VIOLATION',
          'That would take the salary below zero.',
        );
      }
      if (nextNet < balance.paidMinor) {
        throw new BusinessRuleError(
          'BUSINESS_RULE_VIOLATION',
          `${rupees(balance.paidMinor)} has already been paid for ${input.month}, so the salary cannot be reduced below that.`,
        );
      }

      const adjustment = await tx.staffSalaryAdjustment.create({
        data: {
          periodId,
          kind: input.kind,
          amount: toDecimalString(minorUnits(signedMinor)),
          reason: input.reason,
          createdBy: this.context.userId ?? null,
        } as never,
        select: { id: true },
      });

      await tx.auditLog.create({
        data: {
          schoolId: this.context.schoolId,
          action: 'staff.salary.adjust',
          entityType: 'Staff',
          entityId: staffId,
          actorType: 'USER',
          actorUserId: this.context.userId ?? null,
          before: { netMinor: net },
          after: {
            adjustmentId: adjustment.id,
            month: input.month,
            kind: input.kind,
            amountMinor: signedMinor,
            reason: input.reason,
            netMinor: nextNet,
          },
          at: this.clock.now(),
        },
      });

      return this.readDetail(tx, staffId);
    });
  }

  /**
   * Make every month up to now payable for one person at their **current**
   * salary. Called by the staff update just before a salary change is saved, so
   * the months that already existed in practice keep the figure they were
   * running at; only months made afterwards use the new one.
   */
  async snapshotBeforeSalaryChange(tx: TransactionClient, staffId: string): Promise<void> {
    await this.ensurePeriods(tx, {
      staffId,
      fromMonth: shiftMonth(this.currentMonth(), -(HISTORY_MONTHS - 1)),
      toMonth: this.currentMonth(),
    });
  }

  // ---- internals -----------------------------------------------------------

  /**
   * Insert the missing monthly records, once each.
   *
   * Everyone (or one person) who was on the payroll in a month in
   * `[fromMonth, toMonth]`: not removed, a basic salary above zero, joined by
   * the end of the month (a missing join date means the month the record was
   * made), and not gone before it began. Months after the current one are never
   * made — no future dues.
   */
  private async ensurePeriods(
    tx: TransactionClient,
    range: { fromMonth: string; toMonth: string; staffId?: string },
  ): Promise<void> {
    const current = this.currentMonth();
    const toMonth = range.toMonth > current ? current : range.toMonth;
    if (range.fromMonth > toMonth) {
      return;
    }

    await tx.$executeRawUnsafe(
      `INSERT INTO staff_salary_periods (id, school_id, staff_id, month, base_salary, created_by)
       SELECT gen_random_uuid(), s.school_id, s.id, m::date, s.basic_salary, $4::uuid
         FROM staff s
        CROSS JOIN generate_series($1::date, $2::date, interval '1 month') AS m
        WHERE s.school_id = current_school_id()
          AND s.deleted_at IS NULL
          AND s.basic_salary > 0
          AND ($3::uuid IS NULL OR s.id = $3::uuid)
          AND date_trunc('month', COALESCE(s.joined_on::timestamp, s.created_at AT TIME ZONE 'UTC'))::date <= m::date
          AND (s.left_on IS NULL OR s.left_on >= m::date)
       ON CONFLICT (school_id, staff_id, month) DO NOTHING`,
      range.fromMonth + '-01',
      toMonth + '-01',
      range.staffId ?? null,
      this.context.userId ?? null,
    );
  }

  /** The month's record for one person, made if it applies and does not yet exist. */
  private async periodFor(tx: TransactionClient, staffId: string, month: string): Promise<string> {
    const staff = await tx.staff.findFirst({
      where: { id: staffId, deletedAt: null },
      select: { id: true },
    });
    if (staff === null) {
      throw new NotFoundError('staff member');
    }

    await this.ensurePeriods(tx, { staffId, fromMonth: month, toMonth: month });

    const period = await tx.staffSalaryPeriod.findFirst({
      where: { staffId, month: monthStart(month) },
      select: { id: true },
    });
    if (period === null) {
      throw new BusinessRuleError(
        'BUSINESS_RULE_VIOLATION',
        'There is no salary payable for that person in that month. Check their basic salary and joining date.',
      );
    }
    return period.id;
  }

  /** Serialise writers on one month's record for the rest of the transaction. */
  private async lock(tx: TransactionClient, periodId: string): Promise<void> {
    await tx.$executeRawUnsafe(`SELECT pg_advisory_xact_lock(hashtextextended($1, 0))`, periodId);
  }

  private async balanceOf(
    tx: TransactionClient,
    periodId: string,
  ): Promise<{ baseMinor: number; adjustmentsMinor: number; paidMinor: number }> {
    const rows = await tx.$queryRawUnsafe<{ base: string; adj: string; paid: string }[]>(
      `SELECT p.base_salary::numeric(14,2)::text AS base,
              COALESCE((SELECT SUM(amount) FROM staff_salary_adjustments WHERE period_id = p.id), 0)::numeric(14,2)::text AS adj,
              COALESCE((SELECT SUM(amount) FROM staff_salary_payments WHERE period_id = p.id), 0)::numeric(14,2)::text AS paid
         FROM staff_salary_periods p
        WHERE p.id = $1::uuid`,
      periodId,
    );
    const row = rows[0];
    if (row === undefined) {
      throw new NotFoundError('salary record');
    }
    return {
      baseMinor: fromDecimalString(row.base),
      adjustmentsMinor: fromDecimalString(row.adj),
      paidMinor: fromDecimalString(row.paid),
    };
  }

  private async readDetail(tx: TransactionClient, staffId: string): Promise<StaffSalaryDetail> {
    const staff = await tx.staff.findFirst({
      where: { id: staffId, deletedAt: null },
      select: {
        id: true,
        name: true,
        employeeNo: true,
        role: true,
        photoUrl: true,
        email: true,
        phone: true,
        designation: true,
        joinedOn: true,
        leftOn: true,
        status: true,
        basicSalary: true,
      },
    });
    if (staff === null) {
      throw new NotFoundError('staff member');
    }

    const monthRows = await tx.$queryRawUnsafe<
      {
        month: Date;
        base: string;
        adj: string;
        paid: string;
        last_paid_on: Date | null;
      }[]
    >(
      `SELECT p.month, p.base_salary::numeric(14,2)::text AS base,
              COALESCE(a.adj, 0)::numeric(14,2)::text AS adj,
              COALESCE(y.paid, 0)::numeric(14,2)::text AS paid, y.last_paid_on
         FROM staff_salary_periods p
         LEFT JOIN LATERAL (
           SELECT SUM(x.amount) AS adj FROM staff_salary_adjustments x WHERE x.period_id = p.id
         ) a ON true
         LEFT JOIN LATERAL (
           SELECT SUM(z.amount) AS paid, MAX(z.paid_on) AS last_paid_on
             FROM staff_salary_payments z WHERE z.period_id = p.id
         ) y ON true
        WHERE p.staff_id = $1::uuid
        ORDER BY p.month DESC
        LIMIT ${String(HISTORY_MONTHS * 2)}`,
      staffId,
    );

    const joinedMonth = staff.joinedOn?.toISOString().slice(0, 7);
    const leftMonth = staff.leftOn?.toISOString().slice(0, 7);

    const months: StaffSalaryMonth[] = monthRows.map((row) => {
      const month = row.month.toISOString().slice(0, 7);
      const baseMinor = fromDecimalString(row.base);
      const adjustmentsMinor = fromDecimalString(row.adj);
      const paidMinor = fromDecimalString(row.paid);
      const netMinor = baseMinor + adjustmentsMinor;
      const remainingMinor = Math.max(0, netMinor - paidMinor);
      return {
        month,
        baseMinor,
        adjustmentsMinor,
        netMinor,
        paidMinor,
        remainingMinor,
        status: statusOf(netMinor, paidMinor),
        lastPaidOn: row.last_paid_on === null ? null : row.last_paid_on.toISOString().slice(0, 10),
        partialMonth:
          joinedMonth === month && (staff.joinedOn?.getUTCDate() ?? 1) > 1
            ? 'JOINED'
            : leftMonth === month
              ? 'LEFT'
              : null,
      };
    });

    const paymentRows = await tx.staffSalaryPayment.findMany({
      where: { staffId },
      orderBy: [{ paidOn: 'desc' }, { createdAt: 'desc' }],
      take: 500,
      select: {
        id: true,
        month: true,
        amount: true,
        paidOn: true,
        method: true,
        reference: true,
        notes: true,
        recordedBy: true,
        createdAt: true,
      },
    });
    const adjustmentRows = await tx.staffSalaryAdjustment.findMany({
      where: { period: { staffId } },
      orderBy: { createdAt: 'desc' },
      take: 500,
      select: {
        id: true,
        kind: true,
        amount: true,
        reason: true,
        createdBy: true,
        createdAt: true,
        period: { select: { month: true } },
      },
    });

    const names = await this.namesOf(tx, [
      ...paymentRows.map((row) => row.recordedBy),
      ...adjustmentRows.map((row) => row.createdBy),
    ]);

    const payments: StaffSalaryPaymentRecord[] = paymentRows.map((row) => ({
      id: row.id,
      month: row.month.toISOString().slice(0, 7),
      amountMinor: decimalToMinor(row.amount),
      paidOn: row.paidOn.toISOString().slice(0, 10),
      method: row.method as SalaryPaymentMethod,
      reference: row.reference,
      notes: row.notes,
      recordedByName: names.get(row.recordedBy ?? '') ?? null,
      recordedAt: row.createdAt.toISOString(),
    }));

    const adjustments: StaffSalaryAdjustmentRecord[] = adjustmentRows.map((row) => ({
      id: row.id,
      month: row.period.month.toISOString().slice(0, 7),
      kind: row.kind as SalaryAdjustmentKind,
      amountMinor: decimalToMinor(row.amount),
      reason: row.reason,
      createdByName: names.get(row.createdBy ?? '') ?? null,
      createdAt: row.createdAt.toISOString(),
    }));

    const year = this.clock.now().toISOString().slice(0, 4);
    const paidThisYearMinor = payments
      .filter((payment) => payment.paidOn.startsWith(year))
      .reduce((sum, payment) => sum + payment.amountMinor, 0);
    const latest = payments[0];

    return {
      staff: {
        id: staff.id,
        name: staff.name,
        employeeNo: staff.employeeNo,
        role: staff.role as StaffRole,
        photoUrl: staff.photoUrl,
        email: staff.email,
        phone: staff.phone,
        designation: staff.designation,
        joinedOn: staff.joinedOn === null ? null : staff.joinedOn.toISOString().slice(0, 10),
        status: staff.status,
        basicSalaryMinor: decimalToMinor(staff.basicSalary),
      },
      summary: {
        currentMonthlySalaryMinor: decimalToMinor(staff.basicSalary),
        paidThisYearMinor,
        outstandingMinor: months.reduce((sum, month) => sum + month.remainingMinor, 0),
        lastPayment:
          latest === undefined
            ? null
            : {
                amountMinor: latest.amountMinor,
                paidOn: latest.paidOn,
                month: latest.month,
                method: latest.method,
              },
      },
      months,
      payments,
      adjustments,
    };
  }

  private async namesOf(
    tx: TransactionClient,
    ids: readonly (string | null)[],
  ): Promise<Map<string, string>> {
    const unique = [...new Set(ids.filter((id): id is string => id !== null))];
    if (unique.length === 0) {
      return new Map();
    }
    const users = await tx.user.findMany({
      where: { id: { in: unique } },
      select: { id: true, name: true },
    });
    return new Map(users.map((user) => [user.id, user.name]));
  }

  private assertPayableMonth(month: string): void {
    if (month > this.currentMonth()) {
      throw new BusinessRuleError(
        'BUSINESS_RULE_VIOLATION',
        'That month has not started yet, so there is no salary to pay or adjust for it.',
      );
    }
  }

  private currentMonth(): string {
    return this.clock.now().toISOString().slice(0, 7);
  }
}

function statusOf(netMinor: number, paidMinor: number): SalaryStatus {
  if (netMinor - paidMinor <= 0) {
    return 'PAID';
  }
  return paidMinor > 0 ? 'PARTIAL' : 'UNPAID';
}

function decimalToMinor(value: { toFixed: (digits: number) => string }): number {
  return fromDecimalString(value.toFixed(2));
}

function monthStart(month: string): Date {
  return new Date(`${month}-01T00:00:00.000Z`);
}

function shiftMonth(month: string, delta: number): string {
  const total = Number(month.slice(0, 4)) * 12 + (Number(month.slice(5, 7)) - 1) + delta;
  const year = Math.floor(total / 12);
  return `${String(year)}-${String((total % 12) + 1).padStart(2, '0')}`;
}

function rupees(minor: number): string {
  return `Rs ${toDecimalString(minorUnits(minor))}`;
}

function blankToNull(value: string | undefined): string | null {
  return value === undefined || value.trim() === '' ? null : value.trim();
}

