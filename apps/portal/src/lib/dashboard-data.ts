import {
  ROUTES,
  type ClassAttendanceCard,
  type ClassOverview,
  type DefaulterList,
  type Holiday,
  type SessionUser,
  type StudentListItem,
  type VoucherTotals,
} from '@ilm/contracts';
import { DEFAULT_TIMEZONE, systemClock, today } from '@ilm/utils';

import { apiFetch } from '@/lib/api';

export type DashboardStudents = {
  total: number;
  active: number;
};

export type DashboardStaff = {
  total: number;
  teachers: number;
};

export type DashboardAttendance = {
  date: string;
  isWorkingDay: boolean;
  holidayName: string | null;
  unmarkedClasses: number;
  classesWithStudents: number;
  present: number;
  absent: number;
  leave: number;
};

export type DashboardFees = {
  voucherCount: number;
  paidMinor: number;
  outstandingMinor: number;
};

export type DashboardDefaulters = {
  families: number;
  totalOwedMinor: number;
  /** Register size for defaulter gauge context (demo / summary API). */
  totalStudents?: number;
};

export type DashboardVoucherSummary = {
  monthLabel: string;
  totalCount: number;
  totalAmountMinor: number;
  paidCount: number;
  paidAmountMinor: number;
  unpaidCount: number;
  unpaidAmountMinor: number;
  paidPercent: number;
};

export type DashboardRevenueMonth = {
  label: string;
  collectedMinor: number;
  expensesMinor: number;
  netRevenueMinor: number;
};

export type DashboardClassAttendance = {
  label: string;
  present: number;
  absent: number;
  leave: number;
};

export type DashboardWeeklyAttendance = {
  label: string;
  /** ISO date for timeseries charts (yyyy-mm-dd). */
  date?: string;
  present: number;
  absent: number;
  leave: number;
};

export type DashboardUpcomingEvent = {
  id: string;
  date: string;
  title: string;
  time: string;
  tag: string;
  tone: 'primary' | 'warning' | 'danger' | 'neutral';
};

export type DashboardFeeCollection = {
  collectedMinor: number;
  pendingMinor: number;
  totalDueMinor: number;
  progressPercent: number;
  trendLabel: string;
};

export type DashboardMonthlyExpense = {
  label: string;
  amountMinor: number;
};

export type DashboardExpenseSegment = {
  label: string;
  amountMinor: number;
};

export type DashboardActivityRow = {
  id: string;
  at: string;
  tone: 'success' | 'warning' | 'danger' | 'primary';
  activity: string;
  details: string;
  byName: string;
};

export type DashboardStatTrend = {
  label: string;
  positive: boolean;
};

/** Latest fee payment per student — home table until payments feed API exists. */
export type DashboardRecentFeePayment = {
  id: string;
  studentId: string;
  firstName: string;
  lastName: string;
  studentCode: string;
  grNo: string;
  photoUrl: string | null;
  fatherName: string | null;
  guardianName: string | null;
  guardianPhone: string | null;
  className: string | null;
  sectionName: string | null;
  rollNo: number | null;
  paidOn: string;
  amountMinor: number;
  /** e.g. voucher month or receipt label. */
  paymentLabel: string;
};

export type DashboardSnapshot = {
  todayDate: string;
  students?: DashboardStudents;
  staff?: DashboardStaff;
  attendance?: DashboardAttendance;
  /** Per-class counts for the attendance chart (classes with students only). */
  attendanceByClass: DashboardClassAttendance[];
  /** Stacked bar — one point per day (demo / future weekly API). */
  weeklyAttendance: DashboardWeeklyAttendance[];
  fees?: DashboardFees;
  feeCollection?: DashboardFeeCollection;
  /** Current month voucher roll-up (Nurture-style home card). */
  voucherSummary?: DashboardVoucherSummary;
  /** Fee vs expense trend for owner revenue chart. */
  revenueTrend: DashboardRevenueMonth[];
  /** Last six months — demo / future expenses summary API. */
  monthlyExpenses: DashboardMonthlyExpense[];
  /** Current month by category — pairs with the donut on the home row. */
  expenseBreakdown: DashboardExpenseSegment[];
  defaulters?: DashboardDefaulters;
  classCount?: number;
  currentSessionLabel?: string;
  statTrends: Partial<
    Record<'students' | 'teachers' | 'staff' | 'revenue', DashboardStatTrend>
  >;
  recentAdmissions: StudentListItem[];
  recentFeePayments: DashboardRecentFeePayment[];
  upcomingHolidays: Holiday[];
  upcomingEvents: DashboardUpcomingEvent[];
  recentActivity: DashboardActivityRow[];
  /** Full session holiday list for the calendar month view. */
  calendarHolidays: Holiday[];
  /** Human-readable fetch failures — partial data still renders. */
  issues: string[];
};

function can(permissions: readonly string[], permission: string): boolean {
  return permissions.includes(permission);
}

function summarizeAttendance(overview: ClassOverview): DashboardAttendance {
  const withStudents = overview.classes.filter((entry) => entry.strength > 0);
  const unmarked = withStudents.filter((entry) => entry.markedAt === null).length;

  let present = 0;
  let absent = 0;
  let leave = 0;
  for (const entry of overview.classes) {
    present += entry.present;
    absent += entry.absent;
    leave += entry.leave;
  }

  return {
    date: overview.date,
    isWorkingDay: overview.day.isWorkingDay,
    holidayName: overview.day.holidayName,
    unmarkedClasses: unmarked,
    classesWithStudents: withStudents.length,
    present,
    absent,
    leave,
  };
}

function classAttendanceRows(classes: ClassAttendanceCard[]): DashboardClassAttendance[] {
  return classes
    .filter((entry) => entry.strength > 0)
    .slice(0, 12)
    .map((entry) => ({
      label:
        entry.sectionName === null || entry.sectionName === ''
          ? entry.className
          : `${entry.className} · ${entry.sectionName}`,
      present: entry.present,
      absent: entry.absent,
      leave: entry.leave,
    }));
}

function upcomingHolidays(holidays: Holiday[], today: string): Holiday[] {
  return holidays
    .filter((entry) => entry.endDate >= today)
    .sort((a, b) => (a.startDate < b.startDate ? -1 : a.startDate > b.startDate ? 1 : 0))
    .slice(0, 5);
}

/**
 * Loads whatever the signed-in person may see — each block is permission-gated
 * and fetched in parallel. There is no dashboard API; these are the same list
 * endpoints the rest of the portal uses, with small limits where only totals matter.
 */
export async function loadDashboardSnapshot(session: SessionUser): Promise<DashboardSnapshot> {
  const permissions = session.permissions;
  const issues: string[] = [];
  const todayDate = today(systemClock, session.school.timezone ?? DEFAULT_TIMEZONE);

  const tasks: {
    students?: Promise<void>;
    staff?: Promise<void>;
    teachers?: Promise<void>;
    attendance?: Promise<void>;
    fees?: Promise<void>;
    defaulters?: Promise<void>;
    setup?: Promise<void>;
    recent?: Promise<void>;
    holidays?: Promise<void>;
  } = {};

  const snapshot: DashboardSnapshot = {
    todayDate,
    recentAdmissions: [],
    recentFeePayments: [],
    upcomingHolidays: [],
    upcomingEvents: [],
    recentActivity: [],
    calendarHolidays: [],
    attendanceByClass: [],
    weeklyAttendance: [],
    revenueTrend: [],
    monthlyExpenses: [],
    expenseBreakdown: [],
    statTrends: {},
    issues,
  };

  if (can(permissions, 'students.student.read')) {
    tasks.students = (async () => {
      const result = await apiFetch<{
        data: StudentListItem[];
        meta: {
          page: { total: number };
          aggregates: Record<string, number>;
        };
      }>(`${ROUTES.students.list}?limit=1&offset=0`);
      if (!result.ok) {
        issues.push(result.message);
        return;
      }
      snapshot.students = {
        total: result.data.meta.page.total,
        active: result.data.meta.aggregates['totalActive'] ?? 0,
      };
    })();

    tasks.recent = (async () => {
      const result = await apiFetch<{ data: StudentListItem[] }>(
        `${ROUTES.students.list}?limit=10&offset=0&sort=createdAt&order=desc`,
      );
      if (!result.ok) {
        issues.push(result.message);
        return;
      }
      snapshot.recentAdmissions = result.data.data;
    })();
  }

  if (can(permissions, 'staff.record.read')) {
    tasks.staff = (async () => {
      const result = await apiFetch<{
        data: unknown[];
        meta: { page: { total: number } };
      }>(`${ROUTES.staff.list}?limit=1&offset=0`);
      if (!result.ok) {
        issues.push(result.message);
        return;
      }
      snapshot.staff = { total: result.data.meta.page.total, teachers: 0 };
    })();

    tasks.teachers = (async () => {
      const result = await apiFetch<{
        data: unknown[];
        meta: { page: { total: number } };
      }>(`${ROUTES.staff.list}?limit=1&offset=0&role=TEACHER`);
      if (!result.ok) {
        return;
      }
      if (snapshot.staff !== undefined) {
        snapshot.staff = { ...snapshot.staff, teachers: result.data.meta.page.total };
      }
    })();
  }

  if (can(permissions, 'attendance.record.read')) {
    tasks.attendance = (async () => {
      const result = await apiFetch<{ data: ClassOverview }>(ROUTES.attendance.classes);
      if (!result.ok) {
        issues.push(result.message);
        return;
      }
      snapshot.attendance = summarizeAttendance(result.data.data);
      snapshot.attendanceByClass = classAttendanceRows(result.data.data.classes);
    })();
  }

  if (can(permissions, 'fees.voucher.read')) {
    tasks.fees = (async () => {
      const result = await apiFetch<{
        data: unknown[];
        meta: { totals: VoucherTotals };
      }>(`${ROUTES.vouchers.list}?limit=1&offset=0`);
      if (!result.ok) {
        issues.push(result.message);
        return;
      }
      const totals = result.data.meta.totals;
      snapshot.fees = {
        voucherCount: totals.count,
        paidMinor: totals.paidMinor,
        outstandingMinor: totals.outstandingMinor,
      };
    })();
  }

  if (can(permissions, 'fees.defaulter.read')) {
    tasks.defaulters = (async () => {
      const result = await apiFetch<{ data: DefaulterList }>(
        `${ROUTES.defaulters.list}?limit=1&offset=0`,
      );
      if (!result.ok) {
        issues.push(result.message);
        return;
      }
      snapshot.defaulters = {
        families: result.data.data.total,
        totalOwedMinor: result.data.data.totalOwedMinor,
      };
    })();
  }

  if (can(permissions, 'academics.structure.read')) {
    tasks.setup = (async () => {
      const result = await apiFetch<{
        data: { session: { label: string } | null; classes: { id: string }[] };
      }>(ROUTES.academics.setup);
      if (!result.ok) {
        issues.push(result.message);
        return;
      }
      snapshot.classCount = result.data.data.classes.length;
      snapshot.currentSessionLabel = result.data.data.session?.label;
    })();

  }

  await Promise.all(Object.values(tasks));

  if (can(permissions, 'academics.structure.read')) {
    const sessionId = await (async () => {
      const result = await apiFetch<{
        data: { session: { id: string } | null };
      }>(ROUTES.academics.setup);
      if (!result.ok) {
        return undefined;
      }
      return result.data.data.session?.id;
    })();

    if (sessionId !== undefined) {
      const result = await apiFetch<{ data: Holiday[] }>(
        `${ROUTES.academics.holidays}?sessionId=${encodeURIComponent(sessionId)}`,
      );
      if (!result.ok) {
        issues.push(result.message);
      } else {
        snapshot.calendarHolidays = result.data.data;
        snapshot.upcomingHolidays = upcomingHolidays(result.data.data, todayDate);
      }
    }
  }

  return snapshot;
}
