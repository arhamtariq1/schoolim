import type { Holiday } from './academics';

/**
 * The dashboard — one request, shaped for the home screen.
 *
 * Plain types, not zod schemas: nothing posts to this. It is read once per page
 * load and every figure in it was computed by the server from the school's own
 * rows. Money is integer paisa.
 *
 * What is present depends on who is asking, not on what the screen chooses to
 * hide. A section the caller has no permission for is **absent** (or an empty
 * list), so a figure they may not see never travels to their browser — revenue
 * above all.
 */

export interface DashboardStudents {
  total: number;
  active: number;
}

export interface DashboardStaff {
  total: number;
  teachers: number;
}

export interface DashboardAttendance {
  date: string;
  isWorkingDay: boolean;
  holidayName: string | null;
  unmarkedClasses: number;
  classesWithStudents: number;
  present: number;
  absent: number;
  leave: number;
}

export interface DashboardFees {
  voucherCount: number;
  paidMinor: number;
  outstandingMinor: number;
}

export interface DashboardDefaulters {
  families: number;
  totalOwedMinor: number;
  totalStudents?: number;
}

export interface DashboardVoucherSummary {
  monthLabel: string;
  totalCount: number;
  totalAmountMinor: number;
  paidCount: number;
  paidAmountMinor: number;
  unpaidCount: number;
  unpaidAmountMinor: number;
  paidPercent: number;
}

export interface DashboardRevenueMonth {
  label: string;
  collectedMinor: number;
  expensesMinor: number;
  netRevenueMinor: number;
}

export interface DashboardClassAttendance {
  label: string;
  present: number;
  absent: number;
  leave: number;
}

export interface DashboardWeeklyAttendance {
  label: string;
  /** `YYYY-MM-DD`. */
  date?: string;
  present: number;
  absent: number;
  leave: number;
}

export interface DashboardUpcomingEvent {
  id: string;
  date: string;
  title: string;
  time: string;
  tag: string;
  tone: 'primary' | 'warning' | 'danger' | 'neutral';
}

export interface DashboardFeeCollection {
  collectedMinor: number;
  pendingMinor: number;
  totalDueMinor: number;
  progressPercent: number;
  trendLabel: string;
}

export interface DashboardMonthlyExpense {
  label: string;
  amountMinor: number;
}

export interface DashboardExpenseSegment {
  label: string;
  amountMinor: number;
}

export interface DashboardStatTrend {
  label: string;
  positive: boolean;
}

export interface DashboardRecentFeePayment {
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
  paymentLabel: string;
}

/** The home screen of the Admin, Principal and Office Staff. */
export interface StaffDashboard {
  kind: 'staff';
  todayDate: string;
  currentSessionLabel?: string;
  students?: DashboardStudents;
  staff?: DashboardStaff;
  classCount?: number;
  attendance?: DashboardAttendance;
  attendanceByClass: DashboardClassAttendance[];
  weeklyAttendance: DashboardWeeklyAttendance[];
  fees?: DashboardFees;
  feeCollection?: DashboardFeeCollection;
  voucherSummary?: DashboardVoucherSummary;
  /** Empty unless the caller holds `finance.revenue.read` — the Admin alone. */
  revenueTrend: DashboardRevenueMonth[];
  monthlyExpenses: DashboardMonthlyExpense[];
  expenseBreakdown: DashboardExpenseSegment[];
  defaulters?: DashboardDefaulters;
  statTrends: Partial<Record<'students' | 'teachers' | 'staff' | 'revenue', DashboardStatTrend>>;
  recentFeePayments: DashboardRecentFeePayment[];
  upcomingHolidays: Holiday[];
  upcomingEvents: DashboardUpcomingEvent[];
  calendarHolidays: Holiday[];
}

export interface TeacherDashboardClass {
  classLevelId: string;
  name: string;
  students: number;
  presentToday: number;
  /** False until somebody has taken today's register for the class. */
  markedToday: boolean;
}

/** A teacher's home: their own classes, and no school-wide money. */
export interface TeacherDashboard {
  kind: 'teacher';
  todayDate: string;
  classes: TeacherDashboardClass[];
  studentCount: number;
  /** Present as a share of everybody marked today, or null before any register. */
  attendanceTodayPercent: number | null;
  weeklyAttendance: DashboardWeeklyAttendance[];
  /** Their own monthly salary; null when no salary is set. */
  monthlySalaryMinor: number | null;
  /** When they were last paid, `YYYY-MM-DD`. */
  lastSalaryPaidOn: string | null;
  /** Their own attendance this month: days present of days marked. Null with no staff record. */
  myAttendance: { presentDays: number; markedDays: number } | null;
  upcomingEvents: DashboardUpcomingEvent[];
  calendarHolidays: Holiday[];
}

export type DashboardPayload = StaffDashboard | TeacherDashboard;
