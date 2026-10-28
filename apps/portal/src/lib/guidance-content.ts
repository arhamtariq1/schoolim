import type { Permission } from '@ilm/contracts';

/**
 * The words of `/guidance`: what the product does and how to use it.
 *
 * Kept as data, apart from the page, so the copy can be edited (and later moved
 * behind `next-intl`) without touching layout. Every section and step declares
 * the permission that makes it relevant, the same way the sidebar does
 * (`lib/navigation.ts`): a teacher reads about marking a register, not about
 * billing — and is never told to open a screen they cannot reach.
 */

export type GuidanceIllustration =
  | 'overview'
  | 'dashboard'
  | 'students'
  | 'academics'
  | 'attendance'
  | 'fees'
  | 'fee-settings'
  | 'marks'
  | 'staff'
  | 'finance'
  | 'requests'
  | 'access'
  | 'parent';

export interface GuidanceStep {
  readonly title: string;
  readonly body: string;
  readonly href: string;
  readonly permission: Permission;
}

export interface GuidanceModule {
  /** Also the section's anchor: `/guidance#fees`. */
  readonly id: string;
  readonly title: string;
  /** The icon's exported name in `@ilm/ui/icons`. */
  readonly icon: string;
  readonly illustration: GuidanceIllustration;
  /** Who this is for, in a few words. */
  readonly audience: string;
  readonly summary: string;
  readonly steps: readonly string[];
  readonly tips: readonly string[];
  readonly href: string;
  readonly cta: string;
  readonly permission: Permission;
}

export interface GuidanceQuestion {
  readonly question: string;
  readonly answer: string;
}

/**
 * The order a new school sets itself up in. Each step depends on the ones above
 * it — fee vouchers need fee plans, fee plans need classes — so the order is the
 * advice.
 */
export const GETTING_STARTED_STEPS: readonly GuidanceStep[] = [
  {
    title: 'Complete your profile and school details',
    body: 'Add your name and photo, then the school’s name, address, logo and brand colour. The logo and colour appear on every voucher and receipt you print.',
    href: '/profile',
    permission: 'settings.school.configure',
  },
  {
    title: 'Open an academic session',
    body: 'A session is the school year. Attendance, fees and marks are all recorded against the session that is current.',
    href: '/academics/sessions',
    permission: 'academics.session.configure',
  },
  {
    title: 'Create classes and sections',
    body: 'Add each class (Grade 1, Grade 2…) and its sections (A, B…), then assign a class teacher.',
    href: '/classes',
    permission: 'academics.structure.read',
  },
  {
    title: 'Set up fees',
    body: 'Define fee heads such as tuition and transport, the amount each class pays, the late-fee policy and how vouchers look when printed.',
    href: '/settings/fees',
    permission: 'fees.plan.read',
  },
  {
    title: 'Add staff and invite users',
    body: 'Record your teachers and office staff, then invite the ones who need to sign in and choose what each role may open.',
    href: '/settings/access',
    permission: 'settings.user.manage',
  },
  {
    title: 'Admit your students',
    body: 'Enter each student with their guardian, class and section. Siblings can be linked so a family is billed and contacted together.',
    href: '/students/new',
    permission: 'students.student.create',
  },
  {
    title: 'Generate the month’s fee vouchers',
    body: 'Pick the month, preview exactly what will be billed, then generate vouchers for the whole school in one go.',
    href: '/fees/generate',
    permission: 'fees.voucher.generate',
  },
  {
    title: 'Start the daily routine',
    body: 'Teachers mark attendance each morning; the office collects fees as they arrive; marks are entered after each test.',
    href: '/attendance/mark',
    permission: 'attendance.record.read',
  },
];

export const GUIDANCE_MODULES: readonly GuidanceModule[] = [
  {
    id: 'dashboard',
    title: 'Dashboard',
    icon: 'DashboardIcon',
    illustration: 'dashboard',
    audience: 'Owners, principals and office staff',
    summary:
      'The first screen after you sign in: today’s attendance, fees collected and outstanding this month, and shortcuts to the work you do most.',
    steps: [
      'Read the summary cards for today’s attendance and this month’s collection.',
      'Click any number to open the list of records behind it.',
      'Use the quick actions to jump straight to admissions, fee collection or attendance.',
    ],
    tips: ['The dashboard only shows the areas your role can open.'],
    href: '/',
    cta: 'Open the dashboard',
    permission: 'dashboard.workspace.read',
  },
  {
    id: 'students',
    title: 'Admissions and students',
    icon: 'StudentsIcon',
    illustration: 'students',
    audience: 'Office staff and teachers',
    summary:
      'The register of every student: admission, guardians, class and section, fee plan, attendance and results — all on one profile.',
    steps: [
      'Choose Add admission and fill in the student, guardian and class details.',
      'Link a sibling if the family already has a child at the school.',
      'Open Students to search, filter by class, or select many students for a bulk action.',
      'Click a student to see their profile, fees, attendance and marks.',
    ],
    tips: [
      'Admission (GR) numbers are issued automatically from the range set in Settings.',
      'Edits to a student are recorded with who made them and when.',
    ],
    href: '/students',
    cta: 'Open students',
    permission: 'students.student.read',
  },
  {
    id: 'academics',
    title: 'Classes, sessions and calendar',
    icon: 'AcademicsIcon',
    illustration: 'academics',
    audience: 'Principals and coordinators',
    summary:
      'The structure the rest of the school hangs on: academic sessions, classes and sections, subjects, timetables, holidays and end-of-year promotion.',
    steps: [
      'Open Sessions to start the school year and mark it current.',
      'Under Classes, add sections, subjects and a class teacher for each class.',
      'Build each class’s weekly timetable under Timetables.',
      'Mark holidays and events on the Calendar so attendance skips them.',
      'At year end, use Promote students to move whole classes up together.',
    ],
    tips: ['Promotion shows a preview of every student who will move before anything changes.'],
    href: '/classes',
    cta: 'Open classes',
    permission: 'academics.structure.read',
  },
  {
    id: 'attendance',
    title: 'Attendance',
    icon: 'AttendanceIcon',
    illustration: 'attendance',
    audience: 'Teachers and principals',
    summary:
      'Daily registers for students and staff, each person’s own record, and monthly reports per class.',
    steps: [
      'Open Mark attendance › Students and choose your class.',
      'Everyone starts as present — tap only the students who are absent or on leave.',
      'Save the register. You can correct it later the same day.',
      'Principals open Attendance report to see a class or a staff member month by month.',
    ],
    tips: [
      'Holidays from the calendar are skipped automatically.',
      'My attendance shows your own record as a member of staff.',
    ],
    href: '/attendance/mark',
    cta: 'Mark attendance',
    permission: 'attendance.record.read',
  },
  {
    id: 'fees',
    title: 'Fees and vouchers',
    icon: 'FeesIcon',
    illustration: 'fees',
    audience: 'Accountants and office staff',
    summary:
      'Monthly fee vouchers for every student, collection at the counter, defaulters, fee increments and security deposits.',
    steps: [
      'Open Generate fee, choose the month, and review the preview of what will be billed.',
      'Generate — vouchers are created for every eligible student at once.',
      'Print vouchers, or let parents download them from their own portal.',
      'When a family pays, find the voucher under Fee Vouchers and record the payment.',
      'Open Defaulters to see who has not paid and follow up.',
    ],
    tips: [
      'Generating the same month twice never creates duplicate vouchers.',
      'A payment is never deleted: a mistake is corrected with a reversing entry, so the history stays honest.',
      'Select several vouchers to record or print them together.',
    ],
    href: '/fees/vouchers',
    cta: 'Open fee vouchers',
    permission: 'fees.voucher.read',
  },
  {
    id: 'fee-settings',
    title: 'Fee settings',
    icon: 'SettingsIcon',
    illustration: 'fee-settings',
    audience: 'Owners and accountants',
    summary:
      'What each class pays and how it is billed: fee heads, class amounts, late fees, voucher layout and admission-number ranges.',
    steps: [
      'Add fee heads such as tuition, transport and admission fee.',
      'Set the amount each class pays for every head.',
      'Choose a late-fee policy and the due day of the month.',
      'Configure the voucher: bank details, copies per page and notes.',
    ],
    tips: [
      'A change to a fee amount applies to vouchers generated after it, never to ones already paid.',
    ],
    href: '/settings/fees',
    cta: 'Open fee settings',
    permission: 'fees.plan.read',
  },
  {
    id: 'marks',
    title: 'Marks and results',
    icon: 'ResultIcon',
    illustration: 'marks',
    audience: 'Teachers',
    summary: 'Tests, quizzes and exams for each class and subject, with marks entered per student.',
    steps: [
      'Under Marks › Setup, add the subjects and assessment types your school uses.',
      'Choose New test, then the class, subject, type, date and total marks.',
      'Enter each student’s marks — the Tab key moves to the next student.',
      'Save. Parents see published results in their portal.',
    ],
    tips: ['Marks entry works with the keyboard alone, from the first box to Save.'],
    href: '/marks',
    cta: 'Open marks',
    permission: 'exams.result.read',
  },
  {
    id: 'staff',
    title: 'Staff and salaries',
    icon: 'StaffIcon',
    illustration: 'staff',
    audience: 'Owners and accountants',
    summary:
      'Every member of staff, their designation and salary, and a record of each payment made.',
    steps: [
      'Add a staff member with their designation, contact details and monthly salary.',
      'Open Salaries to pay one person or many at once.',
      'Print a receipt for any payment from the staff member’s salary history.',
    ],
    tips: ['Select several staff on Salaries to pay the whole month in one go.'],
    href: '/staff',
    cta: 'Open staff',
    permission: 'staff.record.read',
  },
  {
    id: 'finance',
    title: 'Finance',
    icon: 'FinanceIcon',
    illustration: 'finance',
    audience: 'Owners and accountants',
    summary: 'Money in and money out: fee revenue, day-to-day expenses by category, and salaries.',
    steps: [
      'Open Revenue to see fees collected over any date range.',
      'Record an expense under Expense, choosing its category.',
      'Compare revenue against expenses to see how the month is going.',
    ],
    tips: ['Expense categories are set once and reused — keep the list short.'],
    href: '/finance/revenue',
    cta: 'Open finance',
    permission: 'finance.expense.read',
  },
  {
    id: 'requests',
    title: 'Requests',
    icon: 'RequestsIcon',
    illustration: 'requests',
    audience: 'Everyone',
    summary:
      'Leave applications, complaints and other requests, sent to the office and tracked until they are answered.',
    steps: [
      'Choose New request, pick the kind, describe it and attach a picture if it helps.',
      'Follow its status — open, in review, approved or declined.',
      'The office opens Manage Requests to reply and decide.',
    ],
    tips: ['You get a notification when someone replies to your request.'],
    href: '/requests',
    cta: 'Open requests',
    permission: 'workflow.request.create',
  },
  {
    id: 'access',
    title: 'Users and access',
    icon: 'AccessIcon',
    illustration: 'access',
    audience: 'School admins',
    summary:
      'Who can sign in, and what each role may see and do. Menus follow permissions, so people only see what they can use.',
    steps: [
      'Invite a person by email and choose their role.',
      'Adjust what a role may open — for example, let teachers admit students.',
      'Remove access when someone leaves; their history stays on record.',
    ],
    tips: ['Turning a permission on reveals its menu item for that role automatically.'],
    href: '/settings/access',
    cta: 'Open users and access',
    permission: 'settings.user.manage',
  },
  {
    id: 'parent',
    title: 'Parent portal',
    icon: 'StudentsIcon',
    illustration: 'parent',
    audience: 'Parents and guardians',
    summary:
      'Your children’s attendance, marks and fee vouchers, one child at a time — from any phone.',
    steps: [
      'Open My children and pick a child from the switcher at the top.',
      'See their recent attendance and test results.',
      'Open Fee vouchers to preview a voucher or download it as a PDF to pay at the bank.',
    ],
    tips: ['Turn on notifications to hear about new vouchers and results.'],
    href: '/parent',
    cta: 'Open my children',
    permission: 'parent.child.read',
  },
];

/** Things every signed-in person can do, whatever their role. */
export const EVERYDAY_TIPS: readonly { readonly title: string; readonly body: string }[] = [
  {
    title: 'Search anything',
    body: 'Press Ctrl + K (⌘ K on a Mac) to search students, staff and settings, and jump straight there.',
  },
  {
    title: 'Notifications',
    body: 'The bell in the header collects replies, new vouchers and anything waiting on you.',
  },
  {
    title: 'Light or dark',
    body: 'Switch the theme from the header. Your choice is remembered on this device.',
  },
  {
    title: 'Works on your phone',
    body: 'Every screen fits a small phone. Open the menu button at the top left to navigate.',
  },
];

export const GUIDANCE_FAQ: readonly GuidanceQuestion[] = [
  {
    question: 'Why can’t I see a menu item a colleague has?',
    answer:
      'Menus are generated from your role’s permissions. Ask your school admin to grant access under Users & Access.',
  },
  {
    question: 'I made a mistake on a payment. Can I delete it?',
    answer:
      'Payments are never deleted, so the books always add up. Record a correction instead — the original and the correction both stay visible.',
  },
  {
    question: 'Is our school’s data visible to other schools?',
    answer:
      'No. Every school’s records are isolated from every other school’s at the database level.',
  },
  {
    question: 'I forgot my password.',
    answer:
      'Choose “Forgot password” on the sign-in screen and follow the code sent to your email.',
  },
];
