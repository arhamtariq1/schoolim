import {
  DEFAULT_VOUCHER_SETTINGS,
  ROLE_PERMISSIONS,
  type AcademicSession,
  type AssessmentListItem,
  type AssessmentTypeItem,
  type ClassLevel,
  type ClassLevelWithSections,
  type ClassOverview,
  type DefaulterList,
  type Expense,
  type ExpenseCategory,
  type FeeHead,
  type FeeIncrementList,
  type Holiday,
  type MonthlyReport,
  type RequestListItem,
  type RequestSummary,
  type SecurityDepositList,
  type SessionUser,
  type StaffListItem,
  type StaffRoster,
  type StaffSalaryList,
  type StudentListItem,
  type SubjectItem,
  type TimetableListItem,
  type TimetableOptions,
  type VoucherSummary,
} from '@ilm/contracts';

import type { DashboardSnapshot } from '@/lib/dashboard-data';

/**
 * Sample data for the landing page's admin preview — ADR-0022.
 *
 * The preview renders the portal's **real** screens (`HomeDashboard`,
 * `StudentsTable`, `VouchersView`, …) so that it is the product, not a
 * drawing of it. Those screens take their data as props, so this file is the
 * only thing that differs from a signed-in school: one fictional school,
 * Crescent Grammar School, on the 23rd of October 2026.
 *
 * Every value is typed against `@ilm/contracts`, so when a screen's data
 * changes shape the landing page fails to compile instead of drifting from
 * the product. Money is minor units, as everywhere else (ADR-0007).
 */

/** Stable, valid UUIDs: `id(7)` → `00000000-0000-4000-8000-000000000007`. */
function id(n: number): string {
  return `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
}

export const TODAY = '2026-10-23';
export const MONTH = '2026-10';

/* -------------------------------------------------------------------------- */
/* Who is signed in                                                           */
/* -------------------------------------------------------------------------- */

// The school's owner: the role whose menu the product owner's screenshot shows,
// Salaries included. Its label in the header is "Admin" (SCHOOL_ROLE_LABELS).
const ADMIN_PERMISSIONS = Object.keys(ROLE_PERMISSIONS.OWNER);

export const SESSION: SessionUser = {
  id: id(1),
  name: 'Ayesha Siddiqui',
  email: 'principal@crescent.school',
  roles: ['OWNER'],
  permissions: ADMIN_PERMISSIONS,
  mustChangePassword: false,
  avatarUrl: null,
  emailVerified: true,
  profileCompleted: true,
  school: {
    id: id(2),
    name: 'Crescent Grammar School',
    slug: 'crescent',
    timezone: 'Asia/Karachi',
    locale: 'en-PK',
    primaryColor: null,
  },
};

export const can = (permission: string): boolean => ADMIN_PERMISSIONS.includes(permission);

/* -------------------------------------------------------------------------- */
/* Sessions, classes, subjects                                                */
/* -------------------------------------------------------------------------- */

const SESSION_ID = id(10);

export const SESSIONS: AcademicSession[] = [
  {
    id: SESSION_ID,
    name: '2026–27',
    startDate: '2026-04-01',
    endDate: '2027-03-31',
    status: 'ACTIVE',
    isCurrent: true,
    enrollmentCount: 486,
    sectionCount: 16,
  },
  {
    id: id(11),
    name: '2025–26',
    startDate: '2025-04-01',
    endDate: '2026-03-31',
    status: 'CLOSED',
    isCurrent: false,
    enrollmentCount: 451,
    sectionCount: 15,
  },
  {
    id: id(12),
    name: '2027–28',
    startDate: '2027-04-01',
    endDate: '2028-03-31',
    status: 'PLANNED',
    isCurrent: false,
    enrollmentCount: 0,
    sectionCount: 0,
  },
];

const CLASS_NAMES = [
  'Playgroup',
  'Nursery',
  'Prep',
  'Grade 1',
  'Grade 2',
  'Grade 3',
  'Grade 4',
  'Grade 5',
  'Grade 6',
  'Grade 7',
  'Grade 8',
  'Grade 9',
  'Grade 10',
] as const;

const STRENGTH = [24, 28, 31, 38, 36, 41, 44, 39, 37, 42, 35, 39, 32];
const TEACHERS = [
  'Rabia Anwar',
  'Sadia Karim',
  'Hina Javed',
  'Adeel Hassan',
  'Faisal Qadir',
  'Nadia Pervez',
  'Kamran Shah',
];

export const CLASSES: ClassLevel[] = CLASS_NAMES.map((name, index) => {
  const strength = STRENGTH[index] ?? 30;
  const sections = strength > 35 ? ['A', 'B'] : ['A'];
  return {
    id: id(100 + index),
    name,
    numericOrder: index - 2,
    isActive: true,
    sections: sections.map((section, s) => ({
      id: id(200 + index * 2 + s),
      name: section,
      capacity: 30,
      sessionId: SESSION_ID,
      sessionName: '2026–27',
      studentCount: Math.trunc(strength / sections.length),
    })),
    studentCount: strength,
    sessionStudentCount: strength,
    teachers: [
      { id: id(300 + (index % TEACHERS.length)), name: TEACHERS[index % TEACHERS.length] ?? '' },
    ],
  };
});

export const CLASS_OPTIONS = CLASSES.map((level) => ({ id: level.id, name: level.name }));

export const CLASSES_WITH_SECTIONS: ClassLevelWithSections[] = CLASSES.map((level) => ({
  id: level.id,
  name: level.name,
  numericOrder: level.numericOrder,
  sections: level.sections.map((section) => ({
    id: section.id,
    name: section.name,
    capacity: section.capacity,
  })),
}));

export const FEE_HEADS: FeeHead[] = (
  [
    ['TUITION', 'Tuition fee', 850_000, 'MONTHLY'],
    ['ADMISSION', 'Admission fee', 1_500_000, 'ONE_TIME'],
    ['ANNUAL', 'Annual charges', 600_000, 'ANNUAL'],
    ['EXAM', 'Examination fee', 150_000, 'ANNUAL'],
    ['TRANSPORT', 'Transport', 350_000, 'MONTHLY'],
    ['SECURITY', 'Security deposit', 500_000, 'ONE_TIME'],
  ] as const
).map(([type, name, amount, frequency], index) => ({
  id: id(400 + index),
  type,
  name,
  defaultAmountMinor: amount,
  sortOrder: index,
  isActive: true,
  frequency,
  classLevels: CLASS_OPTIONS,
  studentCount: type === 'TRANSPORT' ? 128 : 486,
}));

export const SUBJECTS: SubjectItem[] = [
  'Mathematics',
  'English',
  'Science',
  'Urdu',
  'Islamiat',
  'Computer',
].map((name, index) => ({ id: id(500 + index), name, usageCount: 12 }));

export const ASSESSMENT_TYPES: AssessmentTypeItem[] = ['Monthly test', 'Mid-term', 'Final'].map(
  (name, index) => ({ id: id(600 + index), name, usageCount: 18 }),
);

/* -------------------------------------------------------------------------- */
/* People                                                                     */
/* -------------------------------------------------------------------------- */

const STUDENT_NAMES = [
  ['Ayesha', 'Khan', 'Imran Khan', 'FEMALE'],
  ['Hamza', 'Malik', 'Asif Malik', 'MALE'],
  ['Zainab', 'Ali', 'Raza Ali', 'FEMALE'],
  ['Usman', 'Tariq', 'Tariq Aziz', 'MALE'],
  ['Fatima', 'Noor', 'Noor Ahmed', 'FEMALE'],
  ['Ali', 'Raza', 'Raza Hussain', 'MALE'],
  ['Maryam', 'Siddiqui', 'Kashif Siddiqui', 'FEMALE'],
  ['Bilal', 'Ahmed', 'Naveed Ahmed', 'MALE'],
  ['Hira', 'Shah', 'Sajid Shah', 'FEMALE'],
  ['Saad', 'Qureshi', 'Javed Qureshi', 'MALE'],
] as const;

export const STUDENTS: StudentListItem[] = STUDENT_NAMES.map(
  ([firstName, lastName, father, gender], index) => {
    const level = CLASSES[3 + (index % 10)] ?? CLASSES[0];
    return {
      id: id(1000 + index),
      grNo: String(1287 - index * 37),
      studentCode: `CGS-${String(1287 - index * 37).padStart(4, '0')}`,
      firstName,
      lastName,
      status: index === 7 ? 'INACTIVE' : 'ACTIVE',
      gender,
      className: level?.name ?? null,
      sectionName: index % 2 === 0 ? 'A' : 'B',
      rollNo: 3 + index,
      guardianName: father,
      guardianPhone: `0300 ${String(1234567 + index * 1111)}`,
      fatherName: father,
      admittedOn: `2026-${String(4 + (index % 6)).padStart(2, '0')}-${String(2 + index).padStart(2, '0')}`,
      photoUrl: null,
      tuitionFeeMinor: 650_000 + (index % 4) * 100_000,
    };
  },
);

const studentName = (student: StudentListItem) => `${student.firstName} ${student.lastName}`;

const STAFF_SEED = [
  ['Adeel Hassan', 'TEACHER', 'MALE'],
  ['Rabia Anwar', 'TEACHER', 'FEMALE'],
  ['Faisal Qadir', 'TEACHER', 'MALE'],
  ['Hina Javed', 'TEACHER', 'FEMALE'],
  ['Nadia Pervez', 'OFFICE_STAFF', 'FEMALE'],
  ['Kamran Shah', 'PRINCIPAL', 'MALE'],
  ['Sadia Karim', 'TEACHER', 'FEMALE'],
  ['Shahid Iqbal', 'SECURITY_GUARD', 'MALE'],
  ['Imtiaz Ali', 'PEON', 'MALE'],
] as const;

const SALARY = [
  9_500_000, 8_200_000, 8_800_000, 7_900_000, 7_000_000, 14_000_000, 7_600_000, 3_800_000,
  3_200_000,
];

export const STAFF: StaffListItem[] = STAFF_SEED.map(([name, role, gender], index) => ({
  id: id(300 + index),
  employeeNo: `EMP-${String(101 + index)}`,
  name,
  email:
    role === 'SECURITY_GUARD' || role === 'PEON'
      ? null
      : `${name.split(' ')[0]?.toLowerCase() ?? 'staff'}@crescent.school`,
  phone: `0321 ${String(4567890 + index * 1311)}`,
  gender,
  role,
  status: 'ACTIVE',
  casualLeaves: 10,
  sickLeaves: 8,
  basicSalaryMinor: SALARY[index] ?? 5_000_000,
  joinedOn: `20${String(18 + (index % 7))}-0${String(1 + (index % 8))}-01`,
  hasLogin: role !== 'SECURITY_GUARD' && role !== 'PEON',
  invitePending: index === 6,
  createdAt: '2026-04-01T09:00:00.000Z',
}));

/* -------------------------------------------------------------------------- */
/* Dashboard                                                                  */
/* -------------------------------------------------------------------------- */

const MONTHS = ['May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct'] as const;
const COLLECTED = [96_400_000, 101_200_000, 98_700_000, 112_500_000, 118_900_000, 124_500_000];
const SPENT = [74_900_000, 77_600_000, 75_900_000, 83_400_000, 84_700_000, 86_100_000];

export const HOLIDAYS: Holiday[] = (
  [
    ['Sports day', 'EVENT', '2026-10-30', '2026-10-30', 'emerald'],
    ['Parent–teacher meeting', 'EVENT', '2026-10-25', '2026-10-25', 'sky'],
    ['Iqbal Day', 'HOLIDAY', '2026-11-09', '2026-11-09', 'amber'],
    ['Mid-term exams', 'EVENT', '2026-11-18', '2026-11-27', 'violet'],
    ['Quaid-e-Azam Day', 'HOLIDAY', '2026-12-25', '2026-12-25', 'amber'],
    ['Winter vacation', 'VACATION', '2026-12-22', '2027-01-04', 'rose'],
  ] as const
).map(([name, type, startDate, endDate, colorKey], index) => ({
  id: id(700 + index),
  sessionId: SESSION_ID,
  name,
  type,
  appliesTo: 'ALL',
  startDate,
  endDate,
  colorKey,
  notes: null,
  days: Math.max(1, Math.trunc((Date.parse(endDate) - Date.parse(startDate)) / 86_400_000) + 1),
}));

export const DASHBOARD: DashboardSnapshot = {
  kind: 'staff',
  todayDate: TODAY,
  currentSessionLabel: '2026–27',
  students: { total: 486, active: 486 },
  staff: { total: 46, teachers: 32 },
  classCount: 13,
  attendance: {
    date: TODAY,
    isWorkingDay: true,
    holidayName: null,
    unmarkedClasses: 2,
    classesWithStudents: 13,
    present: 452,
    absent: 21,
    leave: 13,
  },
  attendanceByClass: CLASSES.slice(3).map((level, index) => ({
    label: level.name,
    present: level.studentCount - 2 - (index % 3),
    absent: 1 + (index % 2),
    leave: 1 + (index % 3 === 0 ? 1 : 0),
  })),
  weeklyAttendance: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((label, index) => ({
    label,
    date: `2026-10-${String(17 + index).padStart(2, '0')}`,
    present: [448, 455, 451, 459, 452, 437][index] ?? 450,
    absent: [24, 19, 22, 16, 21, 31][index] ?? 20,
    leave: [14, 12, 13, 11, 13, 18][index] ?? 12,
  })),
  fees: { voucherCount: 486, paidMinor: 124_500_000, outstandingMinor: 29_400_000 },
  feeCollection: {
    collectedMinor: 124_500_000,
    pendingMinor: 29_400_000,
    totalDueMinor: 153_900_000,
    progressPercent: 81,
    trendLabel: '+4.7% vs September',
  },
  voucherSummary: {
    monthLabel: 'October 2026',
    totalCount: 486,
    totalAmountMinor: 153_900_000,
    paidCount: 401,
    paidAmountMinor: 124_500_000,
    unpaidCount: 85,
    unpaidAmountMinor: 29_400_000,
    paidPercent: 81,
  },
  revenueTrend: MONTHS.map((label, index) => ({
    label,
    collectedMinor: COLLECTED[index] ?? 0,
    expensesMinor: SPENT[index] ?? 0,
    netRevenueMinor: (COLLECTED[index] ?? 0) - (SPENT[index] ?? 0),
  })),
  monthlyExpenses: MONTHS.map((label, index) => ({ label, amountMinor: SPENT[index] ?? 0 })),
  expenseBreakdown: [
    { label: 'Salaries', amountMinor: 62_400_000 },
    { label: 'Utilities', amountMinor: 9_800_000 },
    { label: 'Maintenance', amountMinor: 5_600_000 },
    { label: 'Transport', amountMinor: 4_900_000 },
    { label: 'Stationery', amountMinor: 3_400_000 },
  ],
  defaulters: { families: 31, totalOwedMinor: 7_600_000, totalStudents: 38 },
  statTrends: {
    students: { label: '+38 new', positive: true },
    teachers: { label: '+4 new', positive: true },
    staff: { label: '+2 new', positive: true },
    revenue: { label: '+12% vs Sep', positive: true },
  },
  recentFeePayments: STUDENTS.slice(0, 6).map((student, index) => ({
    id: id(800 + index),
    studentId: student.id,
    firstName: student.firstName,
    lastName: student.lastName,
    studentCode: student.studentCode,
    grNo: student.grNo,
    photoUrl: null,
    fatherName: student.fatherName,
    guardianName: student.guardianName,
    guardianPhone: student.guardianPhone,
    className: student.className,
    sectionName: student.sectionName,
    rollNo: student.rollNo,
    paidOn: `2026-10-${String(23 - index).padStart(2, '0')}`,
    amountMinor: student.tuitionFeeMinor ?? 850_000,
    paymentLabel: index % 3 === 0 ? 'Bank' : 'Cash',
  })),
  upcomingHolidays: HOLIDAYS.filter((holiday) => holiday.type !== 'EVENT'),
  upcomingEvents: [
    {
      id: id(900),
      date: '2026-10-25',
      title: 'Parent–teacher meeting',
      time: '10:00 AM',
      tag: 'Meeting',
      tone: 'primary',
    },
    {
      id: id(901),
      date: '2026-10-30',
      title: 'Annual sports day',
      time: '08:30 AM',
      tag: 'Event',
      tone: 'warning',
    },
    {
      id: id(902),
      date: '2026-11-10',
      title: 'November vouchers due',
      time: 'All day',
      tag: 'Fees',
      tone: 'danger',
    },
    {
      id: id(903),
      date: '2026-11-18',
      title: 'Mid-term exams begin',
      time: '08:00 AM',
      tag: 'Exams',
      tone: 'neutral',
    },
  ],
  calendarHolidays: HOLIDAYS,
  recentAdmissions: STUDENTS.slice(0, 6),
  issues: [],
};

/* -------------------------------------------------------------------------- */
/* Fees                                                                       */
/* -------------------------------------------------------------------------- */

const VOUCHER_STATUS = [
  'PAID',
  'PARTIALLY_PAID',
  'PAID',
  'UNPAID',
  'UNPAID',
  'PAID',
  'PAID',
  'UNPAID',
  'PAID',
  'PARTIALLY_PAID',
] as const;

export const VOUCHERS: VoucherSummary[] = STUDENTS.map((student, index) => {
  const net = student.tuitionFeeMinor ?? 850_000;
  const arrears = index === 3 || index === 7 ? 650_000 : 0;
  const total = net + arrears;
  const status = VOUCHER_STATUS[index] ?? 'UNPAID';
  const paid = status === 'PAID' ? total : status === 'PARTIALLY_PAID' ? Math.trunc(total / 2) : 0;
  return {
    id: id(1100 + index),
    voucherNo: `V-2610-${String(412 - index * 7).padStart(4, '0')}`,
    status,
    studentId: student.id,
    studentName: studentName(student),
    grNo: student.grNo,
    fatherName: student.fatherName,
    className: student.className,
    sectionName: student.sectionName,
    sessionId: SESSION_ID,
    sessionName: '2026–27',
    issueDate: '2026-10-01',
    dueDate: '2026-10-10',
    validTill: '2026-10-20',
    billMonths: ['2026-10-01'],
    grossMinor: net,
    discountMinor: 0,
    waiverMinor: 0,
    arrearsMinor: arrears,
    netPayableMinor: net,
    totalPayableMinor: total,
    lateFeeMinor: 0,
    paidMinor: paid,
    balanceMinor: total - paid,
    paidOn: paid > 0 ? `2026-10-${String(4 + index).padStart(2, '0')}` : null,
  };
});

export const VOUCHER_TOTALS = {
  count: 486,
  netPayableMinor: 153_900_000,
  paidMinor: 124_500_000,
  outstandingMinor: 29_400_000,
};

export const VOUCHER_SETTINGS = DEFAULT_VOUCHER_SETTINGS;

export const DEFAULTERS: DefaulterList = {
  rows: STUDENTS.slice(2, 9).map((student, index) => {
    const months = index % 3 === 0 ? ['2026-09', '2026-10'] : ['2026-10'];
    const owed = (student.tuitionFeeMinor ?? 850_000) * months.length;
    return {
      studentId: student.id,
      grNo: student.grNo,
      studentCode: student.studentCode,
      name: studentName(student),
      fatherName: student.fatherName,
      gender: student.gender,
      className: student.className,
      sectionName: student.sectionName,
      contact: student.guardianPhone,
      status: 'ACTIVE',
      totalOwedMinor: owed,
      monthsOwed: months.length,
      months,
      vouchers: months.map((month, m) => ({
        voucherId: id(1200 + index * 2 + m),
        voucherNo: `V-26${month.slice(5)}-${String(300 + index).padStart(4, '0')}`,
        billMonths: [month],
        issueDate: `${month}-01`,
        dueDate: `${month}-10`,
        validTill: `${month}-20`,
        status: 'UNPAID',
        balanceMinor: student.tuitionFeeMinor ?? 850_000,
        netPayableMinor: student.tuitionFeeMinor ?? 850_000,
        paidMinor: 0,
      })),
    };
  }),
  total: 38,
  totalOwedMinor: 7_600_000,
  asOf: TODAY,
};

export const FEE_INCREMENTS: FeeIncrementList = {
  rows: STUDENTS.map((student, index) => ({
    studentId: student.id,
    grNo: student.grNo,
    studentCode: student.studentCode,
    name: studentName(student),
    fatherName: student.fatherName,
    gender: student.gender,
    className: student.className,
    sectionName: student.sectionName,
    contact: student.guardianPhone,
    status: 'ACTIVE',
    admittedOn: student.admittedOn,
    currentFeeMinor: student.tuitionFeeMinor,
    currentPayableMinor: student.tuitionFeeMinor,
    discountReason: index === 4 ? 'Sibling discount' : null,
    pendingFrom: index % 3 === 0 ? '2026-11-01' : null,
    pendingFeeMinor: index % 3 === 0 ? (student.tuitionFeeMinor ?? 0) + 50_000 : null,
    pendingPayableMinor: index % 3 === 0 ? (student.tuitionFeeMinor ?? 0) + 50_000 : null,
  })),
  total: 486,
  feeHead: { id: FEE_HEADS[0]?.id ?? id(400), name: 'Tuition fee' },
};

export const SECURITY_DEPOSITS: SecurityDepositList = {
  rows: STUDENTS.slice(0, 8).map((student, index) => {
    const refunded = index === 5 ? 500_000 : 0;
    return {
      id: id(1300 + index),
      studentId: student.id,
      grNo: student.grNo,
      studentCode: student.studentCode,
      name: studentName(student),
      fatherName: student.fatherName,
      className: student.className,
      contact: student.guardianPhone,
      status: index === 5 ? 'LEFT' : 'ACTIVE',
      month: student.admittedOn?.slice(0, 7) ?? '2026-04',
      receivedOn: student.admittedOn ?? '2026-04-02',
      voucherId: id(1400 + index),
      voucherNo: `V-26${String(4 + index).padStart(2, '0')}-${String(120 + index).padStart(4, '0')}`,
      depositedMinor: 500_000,
      refundedMinor: refunded,
      leftMinor: 500_000 - refunded,
      note: null,
      refunds: [],
    };
  }),
  total: 486,
  totalDepositedMinor: 243_000_000,
  totalLeftMinor: 238_500_000,
};

/* -------------------------------------------------------------------------- */
/* Attendance                                                                 */
/* -------------------------------------------------------------------------- */

const TODAY_STATUS = { date: TODAY, isWorkingDay: true, reason: null, holidayName: null };

export const CLASS_OVERVIEW: ClassOverview = {
  date: TODAY,
  day: TODAY_STATUS,
  classes: CLASSES.flatMap((level, index) =>
    level.sections.map((section) => {
      const strength = section.studentCount;
      const marked = !(index === 11 && section.name === 'B') && index !== 1;
      return {
        classLevelId: level.id,
        className: level.name,
        numericOrder: level.numericOrder,
        sectionId: section.id,
        sectionName: section.name,
        strength,
        markedAt: marked ? '2026-10-23T03:25:00.000Z' : null,
        present: marked ? strength - 2 : 0,
        absent: marked ? 1 : 0,
        late: marked && index % 4 === 0 ? 1 : 0,
        leave: marked && index % 4 !== 0 ? 1 : 0,
      };
    }),
  ),
};

const STAFF_MARKS = [
  'PRESENT',
  'PRESENT',
  'CASUAL_LEAVE',
  'PRESENT',
  'PRESENT',
  'PRESENT',
  'LATE',
  'PRESENT',
  'PRESENT',
] as const;

export const STAFF_ROSTER: StaffRoster = {
  date: TODAY,
  day: TODAY_STATUS,
  isEditable: true,
  lockedReason: null,
  markedAt: '2026-10-23T03:10:00.000Z',
  staff: STAFF.map((person, index) => ({
    staffId: person.id,
    employeeNo: person.employeeNo,
    name: person.name,
    email: person.email,
    role: person.role,
    photoUrl: null,
    status: STAFF_MARKS[index] ?? 'PRESENT',
    note: null,
  })),
};

/** October 2026: Sundays closed, the 25th onward still to come. */
const OCTOBER_DAYS = Array.from({ length: 31 }, (_, index) => {
  const date = `2026-10-${String(index + 1).padStart(2, '0')}`;
  // 1 October 2026 is a Thursday, so Sundays fall on the 4th, 11th, 18th and 25th.
  const sunday = (index + 1) % 7 === 4;
  return { date, isWorkingDay: !sunday, reason: null, holidayName: sunday ? 'Sunday' : null };
});

export const STAFF_MONTHLY: MonthlyReport = {
  month: MONTH,
  title: 'Staff · October 2026',
  days: OCTOBER_DAYS,
  workingDays: 27,
  rows: STAFF.map((person, index) => {
    const days: Record<string, string> = {};
    let present = 0;
    let absent = 0;
    let late = 0;
    let leave = 0;
    for (const day of OCTOBER_DAYS) {
      const n = Number(day.date.slice(8));
      if (!day.isWorkingDay || n > 23) {
        continue;
      }
      const roll = (n * 7 + index * 3) % 23;
      const mark =
        roll === 0
          ? 'ABSENT'
          : roll === 5
            ? 'LATE'
            : roll === 11 && index % 2 === 0
              ? 'CASUAL_LEAVE'
              : 'PRESENT';
      days[String(n)] = mark;
      if (mark === 'PRESENT') present += 1;
      else if (mark === 'ABSENT') absent += 1;
      else if (mark === 'LATE') late += 1;
      else leave += 1;
    }
    const expected = present + absent + late + leave;
    return {
      subjectId: person.id,
      name: person.name,
      code: person.employeeNo,
      days,
      present,
      absent,
      late,
      leave,
      photoUrl: null,
      expectedDays: expected,
      percentBasisPoints: Math.trunc(((present + late) / Math.max(1, expected)) * 10_000),
    };
  }),
};

/* -------------------------------------------------------------------------- */
/* Academics                                                                  */
/* -------------------------------------------------------------------------- */

export const ASSESSMENTS: AssessmentListItem[] = (
  [
    [9, 0, 1, '2026-10-21', 100, 42, 78.4],
    [9, 1, 1, '2026-10-20', 100, 42, 81.2],
    [8, 2, 0, '2026-10-17', 50, 37, 74.9],
    [11, 0, 1, '2026-10-16', 100, 39, 69.5],
    [6, 3, 0, '2026-10-14', 25, 44, 86.1],
    [12, 4, 1, '2026-10-12', 100, 32, null],
  ] as const
).map(([level, subject, type, heldOn, totalMarks, entryCount, average], index) => ({
  id: id(1500 + index),
  classLevelId: CLASSES[level]?.id ?? id(100),
  className: CLASSES[level]?.name ?? '',
  subjectId: SUBJECTS[subject]?.id ?? id(500),
  subjectName: SUBJECTS[subject]?.name ?? '',
  typeId: ASSESSMENT_TYPES[type]?.id ?? id(600),
  typeName: ASSESSMENT_TYPES[type]?.name ?? '',
  heldOn,
  totalMarks,
  entryCount,
  averagePercent: average,
}));

export const TIMETABLES: TimetableListItem[] = CLASSES.slice(3, 11).map((level, index) => ({
  id: id(1600 + index),
  title: index === 6 ? `${level.name} · Mid-term datesheet` : `${level.name} · Weekly timetable`,
  kind: index === 6 ? 'ASSESSMENT' : 'CLASS',
  status: index === 5 ? 'DRAFT' : 'PUBLISHED',
  session: { id: SESSION_ID, name: '2026–27' },
  classLevel: { id: level.id, name: level.name },
  section:
    level.sections[0] === undefined
      ? null
      : { id: level.sections[0].id, name: level.sections[0].name },
  assessmentType: index === 6 ? { id: ASSESSMENT_TYPES[1]?.id ?? id(601), name: 'Mid-term' } : null,
  startsOn: index === 6 ? '2026-11-18' : '2026-04-06',
  endsOn: index === 6 ? '2026-11-27' : null,
  entryCount: index === 6 ? 8 : 36,
  publishedAt: index === 5 ? null : '2026-04-03T10:00:00.000Z',
  updatedAt: '2026-10-19T08:30:00.000Z',
}));

export const TIMETABLE_OPTIONS: TimetableOptions = {
  sessions: SESSIONS.map((s) => ({
    id: s.id,
    name: s.name,
    isCurrent: s.isCurrent,
    startDate: s.startDate,
    endDate: s.endDate,
  })),
  classes: CLASSES.map((level) => ({
    id: level.id,
    name: level.name,
    sections: level.sections.map((section) => ({
      id: section.id,
      name: section.name,
      sessionId: section.sessionId,
    })),
    subjectIds: SUBJECTS.map((subject) => subject.id),
    subjectTeachers: [],
  })),
  subjects: SUBJECTS.map((subject) => ({ id: subject.id, name: subject.name })),
  assessmentTypes: ASSESSMENT_TYPES.map((type) => ({ id: type.id, name: type.name })),
  teachers: STAFF.filter((person) => person.role === 'TEACHER').map((person) => ({
    id: person.id,
    name: person.name,
  })),
};

/* -------------------------------------------------------------------------- */
/* Finance                                                                    */
/* -------------------------------------------------------------------------- */

export const EXPENSE_CATEGORIES: ExpenseCategory[] = [
  'Utilities',
  'Maintenance',
  'Transport',
  'Stationery',
  'Events',
].map((name, index) => ({
  id: id(1700 + index),
  name,
  glCode: null,
  isActive: true,
  sortOrder: index,
  expenseCount: 12 - index,
}));

export const EXPENSES: Expense[] = (
  [
    [0, 'Electricity bill · October', 'LESCO', 8_420_000, 'BANK_TRANSFER', '2026-10-21'],
    [1, 'Lab equipment repair', 'Al-Noor Scientific', 2_350_000, 'CASH', '2026-10-19'],
    [2, 'Diesel · school vans', 'PSO Model Town', 3_100_000, 'CASH', '2026-10-18'],
    [3, 'Printer paper and toner', 'Paper House', 1_180_000, 'CASH', '2026-10-16'],
    [0, 'Gas bill · October', 'SNGPL', 1_240_000, 'BANK_TRANSFER', '2026-10-14'],
    [4, 'Sports day trophies', 'Star Trophies', 1_650_000, 'CHEQUE', '2026-10-12'],
    [1, 'Classroom fans servicing', 'Pak Electric', 980_000, 'CASH', '2026-10-09'],
  ] as const
).map(([category, description, payee, amount, method, paidOn], index) => ({
  id: id(1800 + index),
  voucherNo: `EXP-2610-${String(48 - index).padStart(3, '0')}`,
  sessionId: SESSION_ID,
  sessionName: '2026–27',
  categoryId: EXPENSE_CATEGORIES[category]?.id ?? id(1700),
  categoryName: EXPENSE_CATEGORIES[category]?.name ?? '',
  description,
  payee,
  amountMinor: amount,
  method,
  paidOn,
  reference: method === 'CHEQUE' ? '004512' : null,
}));

export const SALARIES: StaffSalaryList = {
  month: MONTH,
  items: STAFF.map((person, index) => {
    const status = index < 5 ? 'PAID' : index === 5 ? 'PARTIAL' : 'UNPAID';
    const net = person.basicSalaryMinor + (index === 0 ? 500_000 : 0);
    const paid = status === 'PAID' ? net : status === 'PARTIAL' ? Math.trunc(net / 2) : 0;
    return {
      staffId: person.id,
      name: person.name,
      employeeNo: person.employeeNo,
      role: person.role,
      photoUrl: null,
      month: MONTH,
      baseMinor: person.basicSalaryMinor,
      adjustmentsMinor: net - person.basicSalaryMinor,
      netMinor: net,
      paidMinor: paid,
      remainingMinor: net - paid,
      status,
      lastPaidOn: paid > 0 ? '2026-10-01' : null,
    };
  }),
  summary: {
    totalPayrollMinor: 312_400_000,
    totalPaidMinor: 259_100_000,
    totalPendingMinor: 53_300_000,
    unpaidStaffCount: 8,
  },
  total: 46,
};

/* -------------------------------------------------------------------------- */
/* Requests                                                                   */
/* -------------------------------------------------------------------------- */

const person = (n: number, name: string, roleLabel: string) => ({ id: id(n), name, roleLabel });

export const REQUESTS: RequestListItem[] = (
  [
    [
      'Leave for 24–25 October',
      'LEAVE',
      'NORMAL',
      'PENDING',
      person(302, 'Faisal Qadir', 'Teacher'),
      null,
    ],
    [
      'Fee concession for Ayesha',
      'FEE',
      'HIGH',
      'IN_PROGRESS',
      person(1900, 'Imran Khan', 'Parent'),
      0,
    ],
    [
      'Character certificate',
      'DOCUMENT',
      'NORMAL',
      'RESOLVED',
      person(1901, 'Raza Ali', 'Parent'),
      2,
    ],
    [
      'Swap period 3 with Grade 6-B',
      'ACADEMIC',
      'LOW',
      'PENDING',
      person(303, 'Hina Javed', 'Teacher'),
      null,
    ],
    [
      'Bus route change',
      'TRANSPORT',
      'NORMAL',
      'REJECTED',
      person(1902, 'Noor Ahmed', 'Parent'),
      4,
    ],
    [
      'Broken desk in Grade 7-B',
      'COMPLAINT',
      'URGENT',
      'PENDING',
      person(300, 'Adeel Hassan', 'Teacher'),
      null,
    ],
  ] as const
).map(([subject, category, priority, status, requester, student], index) => {
  const child = student === null ? undefined : STUDENTS[student];
  return {
    id: id(2000 + index),
    requestNo: `REQ-${String(241 - index)}`,
    subject,
    category,
    priority,
    status,
    requester,
    student:
      child === undefined
        ? null
        : { id: child.id, name: studentName(child), grNo: child.grNo, className: child.className },
    assignee: status === 'PENDING' ? null : person(1, 'Ayesha Siddiqui', 'Admin'),
    createdAt: `2026-10-${String(22 - index).padStart(2, '0')}T05:00:00.000Z`,
    lastActivityAt: `2026-10-${String(23 - (index % 3)).padStart(2, '0')}T07:30:00.000Z`,
  };
});

export const REQUEST_SUMMARY: RequestSummary = {
  total: 48,
  pending: 3,
  inProgress: 4,
  resolved: 37,
  rejected: 3,
  reopened: 1,
};

export const ASSIGNEES = [
  person(1, 'Ayesha Siddiqui', 'Admin'),
  person(305, 'Kamran Shah', 'Principal'),
];
