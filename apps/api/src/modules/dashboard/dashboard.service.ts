import {
  grantFor,
  type DashboardClassAttendance,
  type DashboardExpenseSegment,
  type DashboardMonthlyExpense,
  type DashboardPayload,
  type DashboardRecentFeePayment,
  type DashboardRevenueMonth,
  type DashboardStatTrend,
  type DashboardUpcomingEvent,
  type DashboardWeeklyAttendance,
  type Holiday,
  type Permission,
  type SchoolRole,
  type StaffDashboard,
  type TeacherDashboard,
} from '@ilm/contracts';
import { DEFAULT_TIMEZONE, fromDecimalString, today } from '@ilm/utils';
import { Inject, Injectable } from '@nestjs/common';

import { type TransactionClient } from '../../prisma';
import { PrismaService } from '../../prisma/prisma.service';
import { ClassScopeService } from '../../shared/rbac/class-scope.service';
import { TenantContextService } from '../../shared/tenancy/tenant-context.service';
import { CLOCK, type Clock } from '../../shared/time/clock.provider';
import { toHoliday } from '../academics/holidays.service';

/** Roles that see the whole school; a teacher with none of these sees only their classes. */
const SCHOOL_WIDE_ROLES: readonly string[] = [
  'OWNER',
  'PRINCIPAL',
  'ADMIN',
  'ACCOUNTANT',
  'RECEPTION',
  'COORDINATOR',
];

const MONTH_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MONTH_LONG = [
  'January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September',
  'October', 'November', 'December',
];
const DAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/**
 * Everything the home screen shows, worked out in one place.
 *
 * ## Why here and not in the page
 *
 * The page used to stitch the dashboard together from a dozen list endpoints —
 * some of them fetched with `limit=1` just to read a total — and fell back to
 * invented numbers where no endpoint existed. Every figure here is computed
 * from the school's rows, in one transaction, so the cards agree with each
 * other and with the screens they link to.
 *
 * ## Sections are decided by permission
 *
 * A section the caller may not see is not sent. Revenue in particular is
 * computed only for `finance.revenue.read`, so for anyone else it is never even
 * queried, let alone shipped and hidden.
 */
@Injectable()
export class DashboardService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly context: TenantContextService,
    private readonly classScope: ClassScopeService,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async summary(): Promise<DashboardPayload> {
    return this.prisma.tenant(async (tx) => {
      const school = await tx.school.findFirst({ select: { timezone: true } });
      const todayDate = today(this.clock, school?.timezone ?? DEFAULT_TIMEZONE);

      const roles = this.context.roles;
      const teacherOnly =
        roles.includes('TEACHER') && !roles.some((role) => SCHOOL_WIDE_ROLES.includes(role));

      return teacherOnly ? this.teacher(tx, todayDate) : this.staff(tx, todayDate);
    });
  }

  private can(permission: Permission): boolean {
    return grantFor(this.context.roles as readonly SchoolRole[], permission) !== undefined;
  }

  // ---- Admin, Principal, Office Staff ----------------------------------------

  private async staff(tx: TransactionClient, todayDate: string): Promise<StaffDashboard> {
    const dashboard: StaffDashboard = {
      kind: 'staff',
      todayDate,
      attendanceByClass: [],
      weeklyAttendance: [],
      revenueTrend: [],
      monthlyExpenses: [],
      expenseBreakdown: [],
      statTrends: {},
      recentFeePayments: [],
      upcomingHolidays: [],
      upcomingEvents: [],
      calendarHolidays: [],
    };

    const session = await tx.academicSession.findFirst({
      where: { isCurrent: true },
      select: { id: true, name: true },
    });
    if (session !== null) {
      dashboard.currentSessionLabel = session.name;
    }

    const monthStart = `${todayDate.slice(0, 7)}-01`;

    if (this.can('students.student.read')) {
      const rows = await tx.$queryRawUnsafe<{ total: number; active: number; fresh: number }[]>(
        `SELECT COUNT(*)::int AS total,
                COUNT(*) FILTER (WHERE status = 'ACTIVE')::int AS active,
                COUNT(*) FILTER (WHERE created_at >= $1::date)::int AS fresh
           FROM students WHERE deleted_at IS NULL`,
        monthStart,
      );
      const row = rows[0];
      dashboard.students = { total: row?.total ?? 0, active: row?.active ?? 0 };
      dashboard.statTrends.students = growth(row?.fresh ?? 0);
    }

    if (this.can('staff.record.read')) {
      const rows = await tx.$queryRawUnsafe<
        { total: number; teachers: number; fresh_teachers: number; fresh_other: number }[]
      >(
        `SELECT COUNT(*)::int AS total,
                COUNT(*) FILTER (WHERE role = 'TEACHER')::int AS teachers,
                COUNT(*) FILTER (WHERE role = 'TEACHER' AND created_at >= $1::date)::int AS fresh_teachers,
                COUNT(*) FILTER (WHERE role <> 'TEACHER' AND created_at >= $1::date)::int AS fresh_other
           FROM staff WHERE deleted_at IS NULL AND status = 'ACTIVE'`,
        monthStart,
      );
      const row = rows[0];
      dashboard.staff = { total: row?.total ?? 0, teachers: row?.teachers ?? 0 };
      dashboard.statTrends.teachers = growth(row?.fresh_teachers ?? 0);
      dashboard.statTrends.staff = growth(row?.fresh_other ?? 0);
    }

    if (this.can('academics.structure.read')) {
      dashboard.classCount = await tx.classLevel.count({ where: { isActive: true } });
    }

    if (this.can('attendance.record.read') && session !== null) {
      const attendance = await this.attendance(tx, todayDate, session.id, undefined);
      dashboard.attendance = attendance.today;
      dashboard.attendanceByClass = attendance.byClass;
      dashboard.weeklyAttendance = attendance.week;
    }

    if (this.can('fees.voucher.read')) {
      await this.fees(tx, dashboard, todayDate, monthStart);
    }

    if (this.can('fees.defaulter.read')) {
      const rows = await tx.$queryRawUnsafe<{ families: number; owed: string; students: number }[]>(
        `SELECT COUNT(DISTINCT COALESCE(sg.guardian_id, v.student_id))::int AS families,
                COALESCE(SUM(GREATEST(v.net_payable - v.paid_amount, 0)), 0)::numeric(14,2)::text AS owed,
                (SELECT COUNT(*)::int FROM students WHERE deleted_at IS NULL AND status = 'ACTIVE') AS students
           FROM fee_vouchers v
           LEFT JOIN student_guardians sg ON sg.student_id = v.student_id AND sg.is_primary
          WHERE v.status IN ('UNPAID', 'PARTIALLY_PAID') AND v.due_date < $1::date`,
        todayDate,
      );
      const row = rows[0];
      dashboard.defaulters = {
        families: row?.families ?? 0,
        totalOwedMinor: fromDecimalString(row?.owed ?? '0.00'),
        totalStudents: row?.students ?? 0,
      };
    }

    if (this.can('finance.expense.read')) {
      dashboard.monthlyExpenses = await this.monthlyExpenses(tx, monthStart);
      dashboard.expenseBreakdown = await this.expenseBreakdown(tx, monthStart);
    }

    // Revenue: computed only for the Admin. For everyone else the query never runs.
    if (this.can('finance.revenue.read')) {
      dashboard.revenueTrend = await this.revenueTrend(tx, monthStart);
      const last = dashboard.revenueTrend.at(-1);
      const before = dashboard.revenueTrend.at(-2);
      if (last !== undefined && before !== undefined && before.netRevenueMinor !== 0) {
        const change = Math.round(
          ((last.netRevenueMinor - before.netRevenueMinor) / Math.abs(before.netRevenueMinor)) * 100,
        );
        dashboard.statTrends.revenue = {
          label: `${change >= 0 ? '+' : ''}${String(change)}%`,
          positive: change >= 0,
        };
      }
    }

    if (this.can('fees.voucher.read')) {
      dashboard.recentFeePayments = await this.recentFeePayments(tx);
    }

    if (session !== null && this.can('academics.structure.read')) {
      const holidays = await this.holidays(tx, session.id);
      dashboard.calendarHolidays = holidays;
      dashboard.upcomingHolidays = holidays
        .filter((entry) => entry.endDate >= todayDate)
        .slice(0, 5);
      dashboard.upcomingEvents = eventsFrom(dashboard.upcomingHolidays, todayDate);
    }

    return dashboard;
  }

  // ---- teachers ----------------------------------------------------------------

  private async teacher(tx: TransactionClient, todayDate: string): Promise<TeacherDashboard> {
    const dashboard: TeacherDashboard = {
      kind: 'teacher',
      todayDate,
      classes: [],
      studentCount: 0,
      attendanceTodayPercent: null,
      weeklyAttendance: [],
      monthlySalaryMinor: null,
      lastSalaryPaidOn: null,
      myAttendance: null,
      upcomingEvents: [],
      calendarHolidays: [],
    };

    const session = await tx.academicSession.findFirst({
      where: { isCurrent: true },
      select: { id: true },
    });

    // The teacher's own classes — and nothing else. An empty scope is "none", never "all".
    const scope = (await this.classScope.classLevelIds(tx, 'attendance.record.read')) ?? [];

    if (session !== null && scope.length > 0) {
      const attendance = await this.attendance(tx, todayDate, session.id, scope);
      dashboard.weeklyAttendance = attendance.week;

      const marked = attendance.today.present + attendance.today.absent + attendance.today.leave;
      dashboard.attendanceTodayPercent =
        marked === 0 ? null : Math.round((attendance.today.present / marked) * 100);

      const cards = await tx.$queryRawUnsafe<
        { id: string; name: string; strength: number; present: number; marked: number }[]
      >(
        `SELECT c.id, c.name,
                (SELECT COUNT(*)::int FROM enrollments e
                   JOIN students s ON s.id = e.student_id AND s.deleted_at IS NULL AND s.status = 'ACTIVE'
                  WHERE e.class_level_id = c.id AND e.session_id = $2::uuid AND e.status = 'ENROLLED') AS strength,
                (SELECT COUNT(*)::int FROM attendance_records a
                  WHERE a.class_level_id = c.id AND a.date = $3::date AND a.period = 0
                    AND a.status IN ('PRESENT', 'LATE', 'HALF_DAY')) AS present,
                (SELECT COUNT(*)::int FROM attendance_records a
                  WHERE a.class_level_id = c.id AND a.date = $3::date AND a.period = 0) AS marked
           FROM class_levels c
          WHERE c.id = ANY($1::uuid[])
          ORDER BY c.numeric_order`,
        [...scope],
        session.id,
        todayDate,
      );
      dashboard.classes = cards.map((row) => ({
        classLevelId: row.id,
        name: row.name,
        students: row.strength,
        presentToday: row.present,
        markedToday: row.marked > 0,
      }));
      dashboard.studentCount = dashboard.classes.reduce((sum, entry) => sum + entry.students, 0);
    }

    // Their own pay, from their own staff record — never anybody else's.
    const userId = this.context.userId;
    if (userId !== undefined) {
      const staff = await tx.staff.findFirst({
        where: { userId, deletedAt: null },
        select: { id: true, basicSalary: true },
      });
      if (staff !== null) {
        const salary = fromDecimalString(staff.basicSalary.toFixed(2));
        dashboard.monthlySalaryMinor = salary > 0 ? salary : null;
        const last = await tx.staffSalaryPayment.findFirst({
          where: { staffId: staff.id },
          orderBy: [{ paidOn: 'desc' }, { createdAt: 'desc' }],
          select: { paidOn: true },
        });
        dashboard.lastSalaryPaidOn = last === null ? null : last.paidOn.toISOString().slice(0, 10);

        const mine = await tx.$queryRawUnsafe<{ present: number; marked: number }[]>(
          `SELECT COUNT(*) FILTER (WHERE status IN ('PRESENT', 'LATE', 'HALF_DAY'))::int AS present,
                  COUNT(*)::int AS marked
             FROM staff_attendance_records
            WHERE staff_id = $1::uuid AND date >= $2::date AND date < ($2::date + interval '1 month')`,
          staff.id,
          `${todayDate.slice(0, 7)}-01`,
        );
        dashboard.myAttendance = {
          presentDays: mine[0]?.present ?? 0,
          markedDays: mine[0]?.marked ?? 0,
        };
      }
    }

    if (session !== null) {
      const holidays = await this.holidays(tx, session.id);
      dashboard.calendarHolidays = holidays;
      dashboard.upcomingEvents = eventsFrom(
        holidays.filter((entry) => entry.endDate >= todayDate).slice(0, 5),
        todayDate,
      );
    }

    return dashboard;
  }

  // ---- shared blocks -------------------------------------------------------------

  /**
   * Today's attendance, per class, and the last seven days.
   *
   * `scope` narrows to a teacher's classes in the query itself; `undefined` is
   * the whole school.
   */
  private async attendance(
    tx: TransactionClient,
    todayDate: string,
    sessionId: string,
    scope: readonly string[] | undefined,
  ): Promise<{
    today: NonNullable<StaffDashboard['attendance']>;
    byClass: DashboardClassAttendance[];
    week: DashboardWeeklyAttendance[];
  }> {
    const classFilter = scope === undefined ? '' : 'AND a.class_level_id = ANY($3::uuid[])';
    const enrolFilter = scope === undefined ? '' : 'AND e.class_level_id = ANY($3::uuid[])';
    const extra: unknown[] = scope === undefined ? [] : [[...scope]];

    const perClass = await tx.$queryRawUnsafe<
      { name: string; strength: number; present: number; absent: number; leave: number; marked: number }[]
    >(
      `SELECT c.name, c.numeric_order,
              COUNT(DISTINCT e.student_id)::int AS strength,
              COUNT(DISTINCT a.student_id) FILTER (WHERE a.status IN ('PRESENT', 'LATE', 'HALF_DAY'))::int AS present,
              COUNT(DISTINCT a.student_id) FILTER (WHERE a.status = 'ABSENT')::int AS absent,
              COUNT(DISTINCT a.student_id) FILTER (WHERE a.status IN ('LEAVE', 'EXCUSED'))::int AS leave,
              COUNT(DISTINCT a.student_id)::int AS marked
         FROM class_levels c
         JOIN enrollments e ON e.class_level_id = c.id AND e.session_id = $2::uuid AND e.status = 'ENROLLED' ${enrolFilter}
         JOIN students s ON s.id = e.student_id AND s.deleted_at IS NULL AND s.status = 'ACTIVE'
         LEFT JOIN attendance_records a ON a.student_id = e.student_id AND a.date = $1::date AND a.period = 0
        GROUP BY c.id, c.name, c.numeric_order
        ORDER BY c.numeric_order`,
      todayDate,
      sessionId,
      ...extra,
    );

    const holiday = await tx.holiday.findFirst({
      where: { startDate: { lte: new Date(todayDate) }, endDate: { gte: new Date(todayDate) } },
      select: { name: true },
    });
    const weekday = new Date(`${todayDate}T00:00:00Z`).getUTCDay();

    const withStudents = perClass.filter((row) => row.strength > 0);
    const totals = withStudents.reduce(
      (sum, row) => ({
        present: sum.present + row.present,
        absent: sum.absent + row.absent,
        leave: sum.leave + row.leave,
      }),
      { present: 0, absent: 0, leave: 0 },
    );

    const weekRows = await tx.$queryRawUnsafe<
      { day: Date; present: number; absent: number; leave: number }[]
    >(
      `SELECT a.date AS day,
              COUNT(*) FILTER (WHERE a.status IN ('PRESENT', 'LATE', 'HALF_DAY'))::int AS present,
              COUNT(*) FILTER (WHERE a.status = 'ABSENT')::int AS absent,
              COUNT(*) FILTER (WHERE a.status IN ('LEAVE', 'EXCUSED'))::int AS leave
         FROM attendance_records a
        WHERE a.period = 0 AND a.date BETWEEN ($1::date - 6) AND $1::date ${classFilter.replace('$3', '$2')}
        GROUP BY a.date`,
      todayDate,
      ...(scope === undefined ? [] : [[...scope]]),
    );
    const byDay = new Map(weekRows.map((row) => [row.day.toISOString().slice(0, 10), row]));
    const week: DashboardWeeklyAttendance[] = [];
    for (let back = 6; back >= 0; back -= 1) {
      const date = shiftDate(todayDate, -back);
      const row = byDay.get(date);
      week.push({
        label: DAY_SHORT[new Date(`${date}T00:00:00Z`).getUTCDay()] ?? date,
        date,
        present: row?.present ?? 0,
        absent: row?.absent ?? 0,
        leave: row?.leave ?? 0,
      });
    }

    return {
      today: {
        date: todayDate,
        isWorkingDay: holiday === null && weekday !== 0,
        holidayName: holiday?.name ?? null,
        unmarkedClasses: withStudents.filter((row) => row.marked === 0).length,
        classesWithStudents: withStudents.length,
        ...totals,
      },
      byClass: withStudents.slice(0, 12).map((row) => ({
        label: row.name,
        present: row.present,
        absent: row.absent,
        leave: row.leave,
      })),
      week,
    };
  }

  private async fees(
    tx: TransactionClient,
    dashboard: StaffDashboard,
    todayDate: string,
    monthStart: string,
  ): Promise<void> {
    const vouchers = await tx.$queryRawUnsafe<
      {
        all_count: number;
        all_paid: string;
        all_outstanding: string;
        m_count: number;
        m_total: string;
        m_paid_count: number;
        m_paid: string;
        m_unpaid_count: number;
        m_unpaid: string;
      }[]
    >(
      `SELECT COUNT(*) FILTER (WHERE status <> 'CANCELLED')::int AS all_count,
              COALESCE(SUM(paid_amount) FILTER (WHERE status <> 'CANCELLED'), 0)::numeric(14,2)::text AS all_paid,
              COALESCE(SUM(GREATEST(net_payable - paid_amount, 0)) FILTER (WHERE status IN ('UNPAID', 'PARTIALLY_PAID')), 0)::numeric(14,2)::text AS all_outstanding,
              COUNT(*) FILTER (WHERE status <> 'CANCELLED' AND issue_date >= $1::date AND issue_date < ($1::date + interval '1 month'))::int AS m_count,
              COALESCE(SUM(net_payable) FILTER (WHERE status <> 'CANCELLED' AND issue_date >= $1::date AND issue_date < ($1::date + interval '1 month')), 0)::numeric(14,2)::text AS m_total,
              COUNT(*) FILTER (WHERE status = 'PAID' AND issue_date >= $1::date AND issue_date < ($1::date + interval '1 month'))::int AS m_paid_count,
              COALESCE(SUM(paid_amount) FILTER (WHERE status <> 'CANCELLED' AND issue_date >= $1::date AND issue_date < ($1::date + interval '1 month')), 0)::numeric(14,2)::text AS m_paid,
              COUNT(*) FILTER (WHERE status IN ('UNPAID', 'PARTIALLY_PAID') AND issue_date >= $1::date AND issue_date < ($1::date + interval '1 month'))::int AS m_unpaid_count,
              COALESCE(SUM(GREATEST(net_payable - paid_amount, 0)) FILTER (WHERE status IN ('UNPAID', 'PARTIALLY_PAID') AND issue_date >= $1::date AND issue_date < ($1::date + interval '1 month')), 0)::numeric(14,2)::text AS m_unpaid
         FROM fee_vouchers`,
      monthStart,
    );
    const v = vouchers[0];
    const monthTotal = fromDecimalString(v?.m_total ?? '0.00');
    const monthPaid = fromDecimalString(v?.m_paid ?? '0.00');
    const outstanding = fromDecimalString(v?.all_outstanding ?? '0.00');

    dashboard.fees = {
      voucherCount: v?.all_count ?? 0,
      paidMinor: fromDecimalString(v?.all_paid ?? '0.00'),
      outstandingMinor: outstanding,
    };

    const month = Number(todayDate.slice(5, 7));
    dashboard.voucherSummary = {
      monthLabel: `${MONTH_LONG[month - 1] ?? ''} ${todayDate.slice(0, 4)}`,
      totalCount: v?.m_count ?? 0,
      totalAmountMinor: monthTotal,
      paidCount: v?.m_paid_count ?? 0,
      paidAmountMinor: monthPaid,
      unpaidCount: v?.m_unpaid_count ?? 0,
      unpaidAmountMinor: fromDecimalString(v?.m_unpaid ?? '0.00'),
      paidPercent: monthTotal === 0 ? 0 : Math.min(100, Math.round((monthPaid / monthTotal) * 100)),
    };

    const collected = await tx.$queryRawUnsafe<{ this_month: string; last_month: string }[]>(
      `SELECT COALESCE(SUM(amount) FILTER (WHERE paid_on >= $1::date AND paid_on < ($1::date + interval '1 month')), 0)::numeric(14,2)::text AS this_month,
              COALESCE(SUM(amount) FILTER (WHERE paid_on >= ($1::date - interval '1 month') AND paid_on < $1::date), 0)::numeric(14,2)::text AS last_month
         FROM fee_payments WHERE status = 'CONFIRMED'`,
      monthStart,
    );
    const thisMonth = fromDecimalString(collected[0]?.this_month ?? '0.00');
    const lastMonth = fromDecimalString(collected[0]?.last_month ?? '0.00');
    const totalDue = thisMonth + outstanding;

    let trendLabel = 'First collections';
    if (lastMonth > 0) {
      const change = Math.round(((thisMonth - lastMonth) / lastMonth) * 100);
      trendLabel = `${change >= 0 ? '+' : ''}${String(change)}% vs last month`;
    } else if (thisMonth === 0) {
      trendLabel = 'Nothing collected yet';
    }

    dashboard.feeCollection = {
      collectedMinor: thisMonth,
      pendingMinor: outstanding,
      totalDueMinor: totalDue,
      progressPercent: totalDue === 0 ? 0 : Math.min(100, Math.round((thisMonth / totalDue) * 100)),
      trendLabel,
    };
  }

  private async monthlyExpenses(
    tx: TransactionClient,
    monthStart: string,
  ): Promise<DashboardMonthlyExpense[]> {
    // Salaries are money out too, and the bigger part of it for most schools. They
    // are recorded on their own ledger rather than as expense rows, so they are
    // added here — by the month they were paid, the same basis as an expense.
    const rows = await tx.$queryRawUnsafe<{ month: Date; total: string }[]>(
      `SELECT date_trunc('month', paid_on)::date AS month, SUM(amount)::numeric(14,2)::text AS total
         FROM (
           SELECT paid_on, amount FROM expenses
           UNION ALL
           SELECT paid_on, amount FROM staff_salary_payments
         ) AS spent
        WHERE paid_on >= ($1::date - interval '5 months') AND paid_on < ($1::date + interval '1 month')
        GROUP BY 1`,
      monthStart,
    );
    const byMonth = new Map(rows.map((row) => [row.month.toISOString().slice(0, 7), row.total]));
    return lastSixMonths(monthStart).map(({ key, label }) => ({
      label,
      amountMinor: fromDecimalString(byMonth.get(key) ?? '0.00'),
    }));
  }

  private async revenueTrend(
    tx: TransactionClient,
    monthStart: string,
  ): Promise<DashboardRevenueMonth[]> {
    const collected = await tx.$queryRawUnsafe<{ month: Date; total: string }[]>(
      `SELECT date_trunc('month', paid_on)::date AS month, SUM(amount)::numeric(14,2)::text AS total
         FROM fee_payments
        WHERE status = 'CONFIRMED' AND paid_on >= ($1::date - interval '5 months') AND paid_on < ($1::date + interval '1 month')
        GROUP BY 1`,
      monthStart,
    );
    const spent = await this.monthlyExpenses(tx, monthStart);
    const collectedBy = new Map(
      collected.map((row) => [row.month.toISOString().slice(0, 7), row.total]),
    );
    return lastSixMonths(monthStart).map(({ key, label }, index) => {
      const collectedMinor = fromDecimalString(collectedBy.get(key) ?? '0.00');
      const expensesMinor = spent[index]?.amountMinor ?? 0;
      return { label, collectedMinor, expensesMinor, netRevenueMinor: collectedMinor - expensesMinor };
    });
  }

  private async expenseBreakdown(
    tx: TransactionClient,
    monthStart: string,
  ): Promise<DashboardExpenseSegment[]> {
    // Salaries as one slice beside the expense categories, so the breakdown adds
    // up to the same month total the trend chart shows.
    const rows = await tx.$queryRawUnsafe<{ name: string; total: string }[]>(
      `SELECT name, total::numeric(14,2)::text AS total FROM (
           SELECT c.name, SUM(e.amount) AS total
             FROM expenses e JOIN expense_categories c ON c.id = e.category_id
            WHERE e.paid_on >= $1::date AND e.paid_on < ($1::date + interval '1 month')
            GROUP BY c.name
           UNION ALL
           SELECT 'Staff salaries', SUM(amount)
             FROM staff_salary_payments
            WHERE paid_on >= $1::date AND paid_on < ($1::date + interval '1 month')
            HAVING SUM(amount) > 0
         ) AS spent
        ORDER BY spent.total DESC LIMIT 6`,
      monthStart,
    );
    return rows.map((row) => ({ label: row.name, amountMinor: fromDecimalString(row.total) }));
  }

  private async recentFeePayments(tx: TransactionClient): Promise<DashboardRecentFeePayment[]> {
    const rows = await tx.$queryRawUnsafe<
      {
        id: string;
        student_id: string;
        first_name: string;
        last_name: string;
        student_code: string;
        gr_no: string;
        photo_url: string | null;
        paid_on: Date;
        amount: string;
        receipt_no: string;
        guardian_name: string | null;
        guardian_phone: string | null;
        father_name: string | null;
        class_name: string | null;
        section_name: string | null;
        roll_no: number | null;
      }[]
    >(
      `SELECT * FROM (
         SELECT DISTINCT ON (p.student_id)
                p.id, p.student_id, s.first_name, s.last_name, s.student_code, s.gr_no, s.photo_url,
                p.paid_on, p.amount::numeric(14,2)::text AS amount, p.receipt_no,
                g.name AS guardian_name, g.phone AS guardian_phone,
                CASE WHEN g.relation = 'FATHER' THEN g.name END AS father_name,
                c.name AS class_name, sec.name AS section_name, e.roll_no, p.created_at
           FROM fee_payments p
           JOIN students s ON s.id = p.student_id AND s.deleted_at IS NULL
           LEFT JOIN LATERAL (
             SELECT x.name, x.phone, x.relation FROM student_guardians sg
               JOIN guardians x ON x.id = sg.guardian_id
              WHERE sg.student_id = s.id ORDER BY sg.is_primary DESC LIMIT 1
           ) g ON true
           LEFT JOIN LATERAL (
             SELECT en.class_level_id, en.section_id, en.roll_no FROM enrollments en
              WHERE en.student_id = s.id AND en.status = 'ENROLLED' ORDER BY en.created_at DESC LIMIT 1
           ) e ON true
           LEFT JOIN class_levels c ON c.id = e.class_level_id
           LEFT JOIN sections sec ON sec.id = e.section_id
          WHERE p.status = 'CONFIRMED' AND p.amount > 0
          ORDER BY p.student_id, p.paid_on DESC, p.created_at DESC
       ) latest
       ORDER BY paid_on DESC, created_at DESC
       LIMIT 10`,
    );
    return rows.map((row) => ({
      id: row.id,
      studentId: row.student_id,
      firstName: row.first_name,
      lastName: row.last_name,
      studentCode: row.student_code,
      grNo: row.gr_no,
      photoUrl: row.photo_url,
      fatherName: row.father_name,
      guardianName: row.guardian_name,
      guardianPhone: row.guardian_phone,
      className: row.class_name,
      sectionName: row.section_name,
      rollNo: row.roll_no,
      paidOn: row.paid_on.toISOString().slice(0, 10),
      amountMinor: fromDecimalString(row.amount),
      paymentLabel: row.receipt_no,
    }));
  }

  private async holidays(tx: TransactionClient, sessionId: string): Promise<Holiday[]> {
    const rows = await tx.holiday.findMany({
      where: { sessionId },
      orderBy: { startDate: 'asc' },
    });
    return rows.map(toHoliday);
  }
}

function growth(fresh: number): DashboardStatTrend {
  return fresh > 0
    ? { label: `+${String(fresh)} new`, positive: true }
    : { label: 'Stable', positive: true };
}

function shiftDate(date: string, days: number): string {
  const moved = new Date(`${date}T00:00:00Z`);
  moved.setUTCDate(moved.getUTCDate() + days);
  return moved.toISOString().slice(0, 10);
}

function lastSixMonths(monthStart: string): { key: string; label: string }[] {
  const year = Number(monthStart.slice(0, 4));
  const month = Number(monthStart.slice(5, 7)) - 1;
  const result: { key: string; label: string }[] = [];
  for (let back = 5; back >= 0; back -= 1) {
    const total = year * 12 + month - back;
    const y = Math.floor(total / 12);
    const m = total % 12;
    result.push({ key: `${String(y)}-${String(m + 1).padStart(2, '0')}`, label: MONTH_SHORT[m] ?? '' });
  }
  return result;
}

function eventsFrom(holidays: readonly Holiday[], todayDate: string): DashboardUpcomingEvent[] {
  return holidays.map((entry) => ({
    id: entry.id,
    date: entry.startDate < todayDate ? todayDate : entry.startDate,
    title: entry.name,
    time: entry.days > 1 ? `${String(entry.days)} days` : 'All day',
    tag: entry.type === 'EVENT' ? 'Event' : entry.type === 'VACATION' ? 'Vacation' : 'Holiday',
    tone: entry.type === 'EVENT' ? 'primary' : entry.type === 'VACATION' ? 'danger' : 'warning',
  }));
}
