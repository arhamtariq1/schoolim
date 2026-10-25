import {
  ROUTES,
  type DashboardPayload,
  type SessionUser,
  type StaffDashboard,
  type StudentListItem,
  type TeacherDashboard,
} from '@ilm/contracts';

import { apiFetch } from '@/lib/api';
import { DASHBOARD_RECENT_ROWS } from '@/lib/dashboard-limits';

// The shapes live in the contracts, next to the API that fills them.
export type {
  DashboardAttendance,
  DashboardClassAttendance,
  DashboardDefaulters,
  DashboardExpenseSegment,
  DashboardFeeCollection,
  DashboardFees,
  DashboardMonthlyExpense,
  DashboardRecentFeePayment,
  DashboardRevenueMonth,
  DashboardStaff,
  DashboardStatTrend,
  DashboardStudents,
  DashboardUpcomingEvent,
  DashboardVoucherSummary,
  DashboardWeeklyAttendance,
} from '@ilm/contracts';

export type DashboardActivityRow = {
  id: string;
  at: string;
  tone: 'success' | 'warning' | 'danger' | 'primary';
  activity: string;
  details: string;
  byName: string;
};

/** The staff dashboard plus the one list the page still reads from the students API. */
export type DashboardSnapshot = StaffDashboard & {
  recentAdmissions: StudentListItem[];
  /** Human-readable fetch failures — partial data still renders. */
  issues: string[];
};

export type LoadedDashboard =
  | { kind: 'staff'; snapshot: DashboardSnapshot }
  | { kind: 'teacher'; data: TeacherDashboard }
  | { kind: 'error'; message: string };

/**
 * The home screen's data: one call to the dashboard API, which decides by role
 * what the caller gets (revenue for the Admin only, a teacher's own classes for
 * a teacher). The only extra request is the newest admissions, which is the
 * students list the portal already has.
 */
export async function loadDashboard(session: SessionUser): Promise<LoadedDashboard> {
  const canSeeStudents = session.permissions.includes('students.student.read');

  const [summary, admissions] = await Promise.all([
    apiFetch<{ data: DashboardPayload }>(ROUTES.dashboard.summary),
    canSeeStudents
      ? apiFetch<{ data: StudentListItem[] }>(
          `${ROUTES.students.list}?limit=${String(DASHBOARD_RECENT_ROWS)}&offset=0&sort=createdAt&order=desc`,
        )
      : Promise.resolve(undefined),
  ]);

  if (!summary.ok) {
    return { kind: 'error', message: summary.message };
  }

  const payload = summary.data.data;
  if (payload.kind === 'teacher') {
    return { kind: 'teacher', data: payload };
  }

  const issues: string[] = [];
  if (admissions !== undefined && !admissions.ok) {
    issues.push(admissions.message);
  }

  return {
    kind: 'staff',
    snapshot: {
      ...payload,
      recentAdmissions: admissions !== undefined && admissions.ok ? admissions.data.data : [],
      issues,
    },
  };
}
