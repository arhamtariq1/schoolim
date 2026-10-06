import type { Holiday, SessionUser, StudentListItem } from '@ilm/contracts';
import { DEFAULT_TIMEZONE, systemClock, today } from '@ilm/utils';

import type { DashboardRecentFeePayment, DashboardSnapshot } from '@/lib/dashboard-data';

const DEMO_SESSION = '00000000-0000-4000-8000-000000000099';

/**
 * Static dashboard payload for UI work until a single summary API exists.
 *
 * Shape matches {@link DashboardSnapshot} from the live loaders — swap
 * `loadDashboardDemoSnapshot` for `loadDashboardSnapshot` in `page.tsx` when ready.
 */
export function loadDashboardDemoSnapshot(session: SessionUser): DashboardSnapshot {
  const todayDate = today(systemClock, session.school.timezone ?? DEFAULT_TIMEZONE);
  const sessionLabel = '2025 – 2026';

  const calendarHolidays = demoHolidays(todayDate);
  const recentAdmissions = demoStudents();
  const recentFeePayments = demoRecentFeePayments(recentAdmissions, todayDate);

  const paidMinor = 125_000_000;
  const pendingMinor = 35_000_000;
  const totalDueMinor = paidMinor + pendingMinor;

  const monthlyExpenses = [
    { label: 'May', amountMinor: 820_000_00 },
    { label: 'Jun', amountMinor: 910_000_00 },
    { label: 'Jul', amountMinor: 780_000_00 },
    { label: 'Aug', amountMinor: 860_000_00 },
    { label: 'Sep', amountMinor: 940_000_00 },
    { label: 'Oct', amountMinor: 880_000_00 },
  ];

  const collectedMinorFallback = 3_000_000_00;
  const revenueCollected = [
    2_650_000_00, 2_780_000_00, 2_920_000_00, 3_050_000_00, 3_120_000_00, 3_395_400_00,
  ];

  const revenueTrend = monthlyExpenses.map((entry, index) => {
    const collectedMinor = revenueCollected[index] ?? collectedMinorFallback;
    const netRevenueMinor = collectedMinor - entry.amountMinor;
    return {
      label: entry.label,
      collectedMinor,
      expensesMinor: entry.amountMinor,
      netRevenueMinor,
    };
  });

  const monthLabel = formatMonthYear(todayDate);

  return {
    todayDate,
    currentSessionLabel: sessionLabel,
    issues: [],
    students: { total: 842, active: 798 },
    staff: { total: 92, teachers: 64 },
    classCount: 14,
    statTrends: {
      students: { label: '+12%', positive: true },
      teachers: { label: '+8%', positive: true },
      staff: { label: '+5%', positive: true },
      revenue: { label: '+15%', positive: true },
    },
    attendance: {
      date: todayDate,
      isWorkingDay: true,
      holidayName: null,
      unmarkedClasses: 3,
      classesWithStudents: 12,
      present: 612,
      absent: 24,
      leave: 8,
    },
    weeklyAttendance: demoWeeklyAttendance(todayDate),
    attendanceByClass: [
      { label: 'Grade 1 · A', present: 28, absent: 1, leave: 0 },
      { label: 'Grade 2 · B', present: 30, absent: 2, leave: 1 },
      { label: 'Grade 3 · A', present: 27, absent: 0, leave: 0 },
      { label: 'Grade 4 · C', present: 29, absent: 3, leave: 0 },
      { label: 'Grade 5 · A', present: 31, absent: 1, leave: 2 },
      { label: 'Grade 6 · B', present: 26, absent: 2, leave: 1 },
      { label: 'Grade 7', present: 32, absent: 4, leave: 0 },
      { label: 'Grade 8 · A', present: 30, absent: 0, leave: 1 },
    ],
    fees: {
      voucherCount: 1264,
      paidMinor: 1_845_000_000,
      outstandingMinor: 234_000_000,
    },
    feeCollection: {
      collectedMinor: paidMinor,
      pendingMinor,
      totalDueMinor,
      progressPercent: 78,
      trendLabel: '+18%',
    },
    monthlyExpenses,
    revenueTrend,
    voucherSummary: {
      monthLabel,
      totalCount: 290,
      totalAmountMinor: 339_540_000,
      paidCount: 35,
      paidAmountMinor: 29_160_000,
      unpaidCount: 255,
      unpaidAmountMinor: 310_380_000,
      paidPercent: 11.12,
    },
    expenseBreakdown: [
      { label: 'Salaries', amountMinor: 520_000_00 },
      { label: 'Utilities', amountMinor: 95_000_00 },
      { label: 'Maintenance', amountMinor: 72_000_00 },
      { label: 'Supplies', amountMinor: 118_000_00 },
      { label: 'Other', amountMinor: 75_000_00 },
    ],
    defaulters: {
      families: 65,
      totalOwedMinor: 77_390_000,
      totalStudents: 842,
    },
    upcomingEvents: [
      {
        id: 'ev-1',
        date: todayDate,
        title: 'Science test — Class 8',
        time: '10:00 AM',
        tag: 'Exam',
        tone: 'danger',
      },
      {
        id: 'ev-2',
        date: todayDate,
        title: 'Staff meeting',
        time: '2:30 PM',
        tag: 'Meeting',
        tone: 'primary',
      },
      {
        id: 'ev-3',
        date: offsetDate(todayDate, 1),
        title: 'Fee collection deadline',
        time: 'All day',
        tag: 'Finance',
        tone: 'warning',
      },
      {
        id: 'ev-4',
        date: offsetDate(todayDate, 2),
        title: 'Parent–teacher evening',
        time: '4:00 PM',
        tag: 'Meeting',
        tone: 'primary',
      },
    ],
    recentActivity: [
      {
        id: 'act-1',
        at: '2026-10-06T09:15:00',
        tone: 'success',
        activity: 'Attendance marked',
        details: 'Class 6 — 32/34 present',
        byName: 'Sara Ahmed',
      },
      {
        id: 'act-2',
        at: '2026-10-06T08:42:00',
        tone: 'primary',
        activity: 'New admission',
        details: 'Ayesha Khan — Grade 1 · A',
        byName: 'Muhammad Yamaan',
      },
      {
        id: 'act-3',
        at: '2026-10-05T16:20:00',
        tone: 'warning',
        activity: 'Fee voucher issued',
        details: 'October — 48 students',
        byName: 'Finance desk',
      },
      {
        id: 'act-4',
        at: '2026-10-05T11:05:00',
        tone: 'success',
        activity: 'Payment recorded',
        details: 'GR 1040 — Rs 12,500',
        byName: 'Reception',
      },
      {
        id: 'act-5',
        at: '2026-10-04T14:00:00',
        tone: 'primary',
        activity: 'Calendar updated',
        details: 'Mid-term break added',
        byName: 'Admin',
      },
    ],
    recentAdmissions,
    recentFeePayments,
    upcomingHolidays: calendarHolidays.filter((entry) => entry.endDate >= todayDate).slice(0, 5),
    calendarHolidays,
  };
}

function demoWeeklyAttendance(todayDate: string) {
  const rows = [
    { label: 'Mon 6 Oct', present: 598, absent: 28, leave: 6 },
    { label: 'Tue 7 Oct', present: 605, absent: 22, leave: 5 },
    { label: 'Wed 8 Oct', present: 610, absent: 18, leave: 4 },
    { label: 'Thu 9 Oct', present: 608, absent: 20, leave: 4 },
    { label: 'Fri 10 Oct', present: 612, absent: 24, leave: 8 },
    { label: 'Sat 11 Oct', present: 420, absent: 12, leave: 2 },
  ];

  return rows.map((entry, index) => ({
    ...entry,
    date: offsetDate(todayDate, index - (rows.length - 1)),
  }));
}

function formatMonthYear(iso: string): string {
  const parsed = new Date(`${iso}T12:00:00Z`);
  return parsed.toLocaleDateString('en-PK', { month: 'short', year: 'numeric', timeZone: 'UTC' });
}

function offsetDate(iso: string, days: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  const next = new Date(Date.UTC(y ?? 2000, (m ?? 1) - 1, (d ?? 1) + days));
  return next.toISOString().slice(0, 10);
}

function demoHolidays(todayDate: string): Holiday[] {
  const year = todayDate.slice(0, 4);
  return [
    holiday('01', 'Eid ul-Fitr break', `${year}-03-31`, `${year}-04-04`, 'HOLIDAY'),
    holiday('02', 'Summer vacation', `${year}-06-01`, `${year}-08-15`, 'VACATION'),
    holiday('03', 'Independence Day', `${year}-08-14`, `${year}-08-14`, 'HOLIDAY'),
    holiday('04', 'Defence Day', `${year}-09-06`, `${year}-09-06`, 'HOLIDAY'),
    holiday('05', 'Mid-term break', `${year}-10-20`, `${year}-10-24`, 'VACATION'),
    holiday('06', 'Quaid-e-Azam Day', `${year}-12-25`, `${year}-12-25`, 'HOLIDAY'),
  ];
}

function holiday(
  suffix: string,
  name: string,
  startDate: string,
  endDate: string,
  type: Holiday['type'],
): Holiday {
  const start = new Date(`${startDate}T00:00:00Z`);
  const end = new Date(`${endDate}T00:00:00Z`);
  const days = Math.round((end.getTime() - start.getTime()) / 86_400_000) + 1;

  return {
    id: `00000000-0000-4000-8000-0000000000${suffix}`,
    sessionId: DEMO_SESSION,
    name,
    type,
    appliesTo: 'ALL',
    startDate,
    endDate,
    notes: null,
    days,
  };
}

function demoRecentFeePayments(
  students: StudentListItem[],
  todayDate: string,
): DashboardRecentFeePayment[] {
  const amounts = [12_500_00, 15_000_00, 12_500_00, 18_750_00];
  const labels = ['October tuition', 'October tuition', 'October tuition + transport', 'October tuition'];
  const paidDates = [
    todayDate,
    offsetDate(todayDate, -1),
    offsetDate(todayDate, -2),
    offsetDate(todayDate, -3),
  ];

  return students.map((student, index) => ({
    id: `00000000-0000-4000-8001-${String(2000 + index).padStart(12, '0')}`,
    studentId: student.id,
    firstName: student.firstName,
    lastName: student.lastName,
    studentCode: student.studentCode,
    grNo: student.grNo,
    photoUrl: student.photoUrl,
    fatherName: student.fatherName,
    guardianName: student.guardianName,
    guardianPhone: student.guardianPhone,
    className: student.className,
    sectionName: student.sectionName,
    rollNo: student.rollNo,
    paidOn: paidDates[index] ?? todayDate,
    amountMinor: amounts[index] ?? 12_500_00,
    paymentLabel: labels[index] ?? 'Fee payment',
  }));
}

function demoStudents(): StudentListItem[] {
  const rows: Omit<StudentListItem, 'id'>[] = [
    row('1042', 'Ayesha', 'Khan', 'Grade 1 · A', '2026-09-28'),
    row('1041', 'Hassan', 'Raza', 'Grade 3 · B', '2026-09-25'),
    row('1040', 'Fatima', 'Ali', 'Grade 5 · A', '2026-09-22'),
    row('1039', 'Usman', 'Malik', 'Grade 2 · A', '2026-09-18'),
  ];

  return rows.map((entry, index) => ({
    ...entry,
    id: `00000000-0000-4000-8000-${String(1000 + index).padStart(12, '0')}`,
  }));
}

function row(
  grNo: string,
  firstName: string,
  lastName: string,
  className: string,
  admittedOn: string,
): Omit<StudentListItem, 'id'> {
  return {
    grNo,
    studentCode: `ST-${grNo}`,
    firstName,
    lastName,
    status: 'ACTIVE',
    gender: 'MALE',
    className,
    sectionName: null,
    rollNo: Number(grNo) % 40,
    guardianName: `${lastName} Guardian`,
    guardianPhone: '03001234567',
    fatherName: `${lastName}`,
    admittedOn,
    photoUrl: null,
    tuitionFeeMinor: 12_500_00,
  };
}
