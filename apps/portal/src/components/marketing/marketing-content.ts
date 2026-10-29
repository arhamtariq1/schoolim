import { TRIAL_DAYS } from '@ilm/contracts';
import {
  AdmissionIcon,
  AssetIcon,
  AssignmentIcon,
  AttendanceIcon,
  ExpenseIcon,
  FeesIcon,
  NotificationsIcon,
  ResultIcon,
  SalaryIcon,
  StaffIcon,
  StudentsIcon,
  TimetableIcon,
} from '@ilm/ui/icons';
import { BRAND } from '@ilm/utils';
import type { ComponentType, SVGProps } from 'react';

/**
 * Every word on the landing page that is not a heading — ADR-0020.
 *
 * Kept out of `welcome/page.tsx` so the page reads as layout and this file
 * reads as copy. A claim that stops being true is an edit here, not a hunt
 * through JSX.
 *
 * The test every line has to pass is the one ADR-0019 set: a school can check
 * it by using the product. Where a module is not built yet it carries
 * `soon: true`, which renders a visible "Coming soon" — flip the flag when it
 * ships, rather than letting the page promise it early.
 */

export const NAV = [
  { href: '#product', label: 'Product' },
  { href: '#portals', label: 'Portals' },
  { href: '#modules', label: 'Modules' },
  { href: '#security', label: 'Security' },
  { href: '#pricing', label: 'Pricing' },
  { href: '#faq', label: 'FAQ' },
] as const;

/** The four facts under the hero. Each is checkable in this repository. */
export const PROOF = [
  { term: `${TRIAL_DAYS} days free`, detail: 'No card, no sales call' },
  { term: 'Paisa-exact', detail: 'Money is never a float' },
  { term: 'Three to a sheet', detail: 'Challans print on A4' },
  { term: 'Row-level isolation', detail: 'Enforced by the database' },
] as const;

/**
 * The large numerals — ADR-0022, after the stat-first cards of the reference
 * sites. Not usage figures (ADR-0019 still bans those): every one of these is a
 * property of the product a school can count for itself.
 */
export const STATS = [
  {
    value: '12',
    unit: 'modules',
    detail: 'From the admission form to the day book, in one system.',
  },
  {
    value: '6',
    unit: 'portals',
    detail: 'Admin, principal, teacher, parent, office and platform.',
  },
  {
    value: '3',
    unit: 'challans per A4',
    detail: 'School, bank and parent copy, ready for the counter.',
  },
  {
    value: String(TRIAL_DAYS),
    unit: 'days free',
    detail: 'Every module, your real data, no card asked for.',
  },
] as const;

/**
 * Before and after, one row per problem.
 *
 * Written from the school's side of the desk: the "before" is something a
 * principal in Lahore or Multan will recognise from this week, not a category
 * of inefficiency.
 *
 * `preview` names the product screen shown beside each problem in the gap
 * section — see `marketing-mockups.tsx`.
 */
export const PROBLEMS = [
  {
    problem: 'Manual registers',
    preview: 'admission',
    before:
      'Admissions, marks and staff details copied from one register into the next, with a new mistake at every copy.',
    after:
      'Entered once, by the person who knows it. Every list, report and result card reads from that one entry.',
  },
  {
    problem: 'Scattered records',
    preview: 'profile',
    before:
      'Forms in a cabinet, phone numbers in a notebook, marks on a teacher’s laptop — and nobody sure which is current.',
    after:
      'One profile per student: admission, guardians, fees, attendance and results, found by name in a second.',
  },
  {
    problem: 'Fee tracking',
    preview: 'fees',
    before:
      'Hand-written challans, a receipt book per clerk, and a defaulter list nobody trusts by the tenth of the month.',
    after:
      'A month of vouchers in one run, printed for the bank, with paid, partial and overdue visible the moment it changes.',
  },
  {
    problem: 'Attendance',
    preview: 'attendance',
    before:
      'A register that lives in one classroom, counted by hand at the end of the month, and absences noticed a week late.',
    after:
      'Marked on the teacher’s phone in under a minute. The office sees every class as it is taken.',
  },
  {
    problem: 'Disconnected communication',
    preview: 'parent',
    before:
      'Notices lost in WhatsApp groups, diaries that never come home, and parents who hear about fees and absences last.',
    after:
      'A portal for every parent — attendance, results, assignments and vouchers, the same day they happen.',
  },
] as const;

export type GapPreview = (typeof PROBLEMS)[number]['preview'];

export interface Feature {
  Icon: ComponentType<SVGProps<SVGSVGElement>>;
  title: string;
  body: string;
  /** Not built yet. Renders a visible label; remove when it ships. */
  soon?: boolean;
}

export const FEATURES: readonly Feature[] = [
  {
    Icon: AdmissionIcon,
    title: 'Admissions',
    body: 'From enquiry to enrolled in one flow — admission number, documents and guardians captured once.',
  },
  {
    Icon: StudentsIcon,
    title: 'Student management',
    body: 'A complete record per student, siblings linked, promoted from one session to the next in bulk.',
  },
  {
    Icon: FeesIcon,
    title: 'Fee vouchers',
    body: 'Fee heads, plans, discounts and arrears. A month of vouchers in one run, three to an A4 sheet.',
  },
  {
    Icon: AttendanceIcon,
    title: 'Attendance',
    body: 'Daily or by period, from any phone. Monthly registers and absentee lists build themselves.',
  },
  {
    Icon: ResultIcon,
    title: 'Exams and results',
    body: 'Tests and term exams, marks entered by class, and result cards printed with grades.',
  },
  {
    Icon: AssignmentIcon,
    title: 'Assignments',
    body: 'Work set with a due date, visible to students and parents in their own portal.',
    soon: true,
  },
  {
    Icon: StaffIcon,
    title: 'Staff and HR',
    body: 'Profiles, designations, documents and staff attendance, each account scoped to its role.',
  },
  {
    Icon: SalaryIcon,
    title: 'Salaries',
    body: 'Monthly salaries per staff member, with a clear record of every payment and adjustment.',
  },
  {
    Icon: ExpenseIcon,
    title: 'Expenses',
    body: 'Categorised spending against the day book, so the month closes with numbers that agree.',
  },
  {
    Icon: AssetIcon,
    title: 'Assets',
    body: 'A register of what the school owns — furniture, lab equipment, transport — and where it is.',
    soon: true,
  },
  {
    Icon: TimetableIcon,
    title: 'Timetables',
    body: 'The weekly grid by class, period and teacher, built once and visible to everyone it concerns.',
  },
  {
    Icon: NotificationsIcon,
    title: 'Notifications',
    body: 'Push notifications and notices for fees, absences and announcements, straight to the phone.',
  },
];

/**
 * The deck in "Inside the product". `preview` names the mockup that sits beside
 * each panel — see `marketing-mockups.tsx`.
 */
export const SHOWCASE = [
  {
    preview: 'fees',
    title: 'Fees that reconcile',
    body: 'Configure your own heads, plans and discounts, then generate every voucher for the month in one run. Corrections are reversing entries, never quiet edits — so the ledger always explains itself.',
    detail: ['Challans print for the bank', 'Arrears carried forward', 'Defaulters by class'],
  },
  {
    preview: 'attendance',
    title: 'Attendance as it happens',
    body: 'Teachers mark from the phone they already own, by day or by period. The office sees it the moment it is taken, and parents see it the same day.',
    detail: ['Works on a 4G phone', 'Monthly registers built', 'Staff attendance too'],
  },
  {
    preview: 'results',
    title: 'Results without the late nights',
    body: 'Set up exams once, let each teacher enter marks for their own subject, and print result cards for a whole class without a single spreadsheet.',
    detail: ['Marks entered by class', 'Grades computed for you', 'Result cards in one print'],
  },
  {
    preview: 'finance',
    title: 'Books that balance',
    body: 'Collection against expected, expenses by category, salaries paid, and a day book the accountant can print and sign. Finance is the product, not a report bolted on.',
    detail: ['Day book, printed and signed', 'Expenses and salaries', 'Every change audited'],
  },
] as const;

export type ShowcasePreview = (typeof SHOWCASE)[number]['preview'];

/** The six portals. `preview` names the mockup shown in the role's panel. */
export const ROLES = [
  {
    id: 'admin',
    name: 'Admin',
    tagline: 'The whole school, end to end.',
    body: 'Admissions, fees, finance, staff and reporting under one login — with the controls to decide what everybody else can see and do.',
    points: [
      'Admissions and student records',
      'Fee plans, vouchers and collection',
      'Expenses, salaries and the day book',
      'Staff accounts and permissions',
      'School-wide reports and defaulter lists',
    ],
  },
  {
    id: 'principal',
    name: 'Principal',
    tagline: 'Academic oversight, without the paperwork.',
    body: 'See how every class is doing today — attendance, results and staffing — without waiting for a register to be carried up the stairs.',
    points: [
      'Live attendance across every class',
      'Results and class performance',
      'Staff attendance and coordination',
      'Timetables and academic sessions',
      'Requests and approvals',
    ],
  },
  {
    id: 'teacher',
    name: 'Teachers',
    tagline: 'Their classes, on their phone.',
    body: 'Teachers see only the classes they are assigned, and do the day’s admin in minutes from the phone they already carry.',
    points: [
      'Assigned classes and subjects',
      'Student attendance in seconds',
      'Marks for tests and exams',
      'Assignments and due dates',
      'Each student’s academic progress',
    ],
  },
  {
    id: 'parent',
    name: 'Parents',
    tagline: 'Their child, at a glance.',
    body: 'Parents see their own children and nothing else — and stop relying on a diary to make it home in the school bag.',
    points: [
      'Daily attendance',
      'Results and report cards',
      'Assignments and due dates',
      'Fee vouchers and payment status',
      'School notices and updates',
    ],
  },
  {
    id: 'office',
    name: 'Office staff',
    tagline: 'The front desk, organised.',
    body: 'Reception and office staff handle admissions, records and the fee counter — within exactly the responsibilities the admin assigns them.',
    points: [
      'New admissions and enquiries',
      'Student and guardian records',
      'Fee collection at the counter',
      'Printing challans and documents',
      'Tasks scoped by permission',
    ],
  },
  {
    id: 'platform',
    name: 'Super Admin',
    tagline: 'The platform, above every school.',
    body: `For the team running ${BRAND.name}: every school, subscription and account in one console — and never inside a school’s data without a recorded reason.`,
    points: [
      'Onboard and manage schools',
      'Subscriptions, trials and billing',
      'Account and access management',
      'Platform-wide health and usage',
      'Audited operator access',
    ],
  },
] as const;

export type RoleId = (typeof ROLES)[number]['id'];

/**
 * Lemma against the two ways most schools run today. Deliberately not against
 * a named competitor: a claim about somebody else's product is one we cannot
 * keep true, and the honest alternatives are the register and the spreadsheet.
 */
export const COMPARISON = {
  columns: [BRAND.name, 'Paper registers', 'Spreadsheets'],
  rows: [
    {
      topic: 'Monthly fee vouchers',
      values: ['Every student, one run', 'Written by hand', 'Copied row by row'],
    },
    {
      topic: 'Attendance',
      values: ['On a phone, seen instantly', 'Counted at month end', 'Typed in later'],
    },
    {
      topic: 'Parents',
      values: ['Their own portal', 'Diary and phone calls', 'No access'],
    },
    {
      topic: 'Result cards',
      values: ['Printed per class', 'Filled in by hand', 'A formula per sheet'],
    },
    {
      topic: 'Who changed what',
      values: ['Every change recorded', 'Not recorded', 'Whoever has the file'],
    },
    {
      topic: 'Getting started',
      values: [
        'One afternoon, nothing to install',
        'Already in the cupboard',
        'Built from scratch',
      ],
    },
  ],
} as const;

export const BENEFITS = [
  {
    title: 'Hours back, every week',
    body: 'Attendance, vouchers and result cards that took days of copying take minutes. The time goes back to students.',
  },
  {
    title: 'Far less paper',
    body: 'Registers, receipt books and files give way to one record — and you still print every challan and result card you need.',
  },
  {
    title: 'Transparency you can audit',
    body: 'Every rupee lands against a student, a head and a month, and every change records who made it and when.',
  },
  {
    title: 'One place for everything',
    body: 'Students, staff, fees and results in one system, so the office, the accounts and the principal see the same numbers.',
  },
  {
    title: 'Parents in the loop',
    body: 'Attendance, results and fees reach parents directly, so a missed day or an unpaid voucher is a conversation, not a surprise.',
  },
] as const;

/**
 * How the product is built, in the terms a principal or an accountant asks
 * about. Each line is enforced in code — see docs/03 and the house rules — so
 * the page can say it plainly.
 */
export const SECURITY = [
  {
    title: 'Your school, sealed off',
    body: 'Every row carries the school it belongs to, and the database itself refuses a query that crosses the line. A bug in the application cannot show another school your students.',
  },
  {
    title: 'A ledger, not a spreadsheet',
    body: 'Money is stored to the paisa and paid records are never edited. A correction is a reversing entry, so the books always explain how they got here.',
  },
  {
    title: 'Every change has a name on it',
    body: 'Who changed a fee, a mark or a salary, when, and what it was before. The audit trail is written on every change, not switched on after something goes wrong.',
  },
  {
    title: 'People see only their part',
    body: 'Menus are built from what each role may do. A teacher sees their own classes, a parent their own children — and nothing else exists for them.',
  },
] as const;

export const STEPS = [
  {
    when: 'Day 1',
    title: 'Create your school',
    body: `Your school’s name, its address and your own login. One form, under a minute, with a ${TRIAL_DAYS}-day trial and no card.`,
  },
  {
    when: 'Day 1',
    title: 'Set up classes and fees',
    body: 'Classes, sections, subjects, fee heads and plans — in your words and your amounts. No consultant, no setup fee.',
  },
  {
    when: 'Week 1',
    title: 'Add students and staff',
    body: 'Enrol students with their guardians, add teachers and the office team. Each person gets the portal that fits their role.',
  },
  {
    when: 'Month 1',
    title: 'Run your first month',
    body: 'Generate the vouchers, mark the first day’s attendance and let parents sign in. The register can go back in the cupboard.',
  },
] as const;

/**
 * The packages.
 *
 * ⚠️ **Pricing is decision D2 and is still open** (docs/15). These figures are
 * placeholders with a defensible shape — per-campus, three tiers — and they are
 * in one constant precisely so that resolving D2 is an edit here rather than a
 * hunt through JSX. They must not go in front of a real customer before D2
 * closes; docs/19 §5 has the cost floor that has to be cleared first.
 *
 * `annualPriceMinor` is written out rather than computed: it is ten months for
 * twelve, and a price a customer is quoted should be a number somebody chose,
 * not the output of a division that has to be rounded (ADR-0007).
 *
 * Money is minor units, as everywhere else (ADR-0007).
 */
export const PACKAGES = [
  {
    code: 'starter',
    name: 'Starter',
    forWhom: 'A single campus finding its feet',
    priceMinor: 400_000,
    annualPriceMinor: 4_000_000,
    studentCap: 300,
    features: [
      'Students, admissions and guardians',
      'Fee heads, plans and monthly vouchers',
      'Attendance and daily registers',
      'Timetables and notices',
      'Up to 10 staff accounts',
    ],
    cta: 'Start free',
    href: '/signup',
    recommended: false,
  },
  {
    code: 'standard',
    name: 'Standard',
    forWhom: 'An established school running its own accounts',
    priceMinor: 900_000,
    annualPriceMinor: 9_000_000,
    studentCap: 1000,
    features: [
      'Everything in Starter',
      'Full finance: expenses, salaries, day book',
      'Exams, marks and result cards',
      'Parent and teacher portals',
      'Push notifications',
      'Unlimited staff accounts',
    ],
    cta: 'Start free',
    href: '/signup',
    recommended: true,
  },
  {
    code: 'group',
    name: 'Group',
    forWhom: 'Several campuses under one administration',
    priceMinor: 2_000_000,
    annualPriceMinor: 20_000_000,
    studentCap: undefined,
    features: [
      'Everything in Standard',
      'Every campus, one login',
      'Consolidated reporting across campuses',
      'Data migration from your registers',
      'Priority support with a named contact',
    ],
    cta: 'Talk to us',
    href: `mailto:${BRAND.supportEmail}`,
    recommended: false,
  },
] as const;

export type BillingCycle = 'monthly' | 'annual';

/**
 * The plan comparison under the cards. `true` renders a tick, `false` a dash,
 * and a string is shown as written. Columns follow `PACKAGES` order.
 */
export const PLAN_MATRIX: readonly {
  group: string;
  rows: readonly { feature: string; values: readonly [PlanCell, PlanCell, PlanCell] }[];
}[] = [
  {
    group: 'School records',
    rows: [
      { feature: 'Admissions and student profiles', values: [true, true, true] },
      { feature: 'Attendance, students and staff', values: [true, true, true] },
      { feature: 'Timetables', values: [true, true, true] },
      { feature: 'Exams and result cards', values: [false, true, true] },
    ],
  },
  {
    group: 'Fees and finance',
    rows: [
      { feature: 'Fee plans and monthly vouchers', values: [true, true, true] },
      { feature: 'Challans printed for the bank', values: [true, true, true] },
      { feature: 'Expenses, salaries and day book', values: [false, true, true] },
      { feature: 'Consolidated reports across campuses', values: [false, false, true] },
    ],
  },
  {
    group: 'People',
    rows: [
      { feature: 'Students', values: ['Up to 300', 'Up to 1,000', 'Unlimited'] },
      { feature: 'Staff accounts', values: ['Up to 10', 'Unlimited', 'Unlimited'] },
      { feature: 'Parent and teacher portals', values: [false, true, true] },
      { feature: 'Campuses', values: ['1', '1', 'Unlimited'] },
    ],
  },
  {
    group: 'Support',
    rows: [
      { feature: 'Email support', values: [true, true, true] },
      { feature: 'Guided onboarding call', values: [false, true, true] },
      { feature: 'Data migration from registers', values: [false, false, true] },
    ],
  },
];

export type PlanCell = boolean | string;

/** What every plan has, whatever it costs. Printed once under the cards. */
export const EVERY_PLAN = [
  `${TRIAL_DAYS}-day free trial, no card`,
  'Unlimited fee vouchers and receipts',
  'Point-in-time database backups',
  'Every change audited',
  'Works on any phone browser',
  'Your data exportable, always',
] as const;

/**
 * Objections, answered, in the three tabs the FAQ shows. Narrow on purpose:
 * where something is not built yet it says so, because the first promise this
 * page breaks is the last thing a school believes.
 */
export const FAQ = [
  {
    id: 'general',
    label: 'General',
    items: [
      {
        q: 'Is there anything to install?',
        a: 'No. It runs in a browser, including the browser on the phone a teacher already owns, on a 4G connection. There is no desktop software, no server to buy and nothing for your IT person to maintain.',
      },
      {
        q: 'How long does it take to get started?',
        a: 'Most of the setup is one afternoon: classes, sections, subjects and your fee structure. Adding students is the longest part, and you can do it a class at a time while the paper registers keep running.',
      },
      {
        q: 'Can it handle Urdu names?',
        a: 'Names are stored and shown exactly as they are typed, in Urdu or English, on screen and on printed documents. The interface itself is in English today; it is built so it can be translated without the screens being rebuilt.',
      },
      {
        q: 'Who in my school can see what?',
        a: 'Each person has a role, and the menu is generated from what that role is allowed to do rather than hidden behind a disabled button. A teacher sees their own classes. A parent sees their own children and nothing else — not even that another family exists.',
      },
    ],
  },
  {
    id: 'fees',
    label: 'Fees and billing',
    items: [
      {
        q: 'Can we still print fee challans for the bank?',
        a: 'Yes, and it is a first-class part of the product rather than a screenshot. Three copies go across a landscape A4 sheet, or four on a portrait one, with your logo, your bank details and a copy for the bank.',
      },
      {
        q: `What happens during the ${TRIAL_DAYS} days?`,
        a: 'You use all of it, with your real students and your real fee structure, and we do not ask for a card. Nothing is charged and nothing auto-renews, because billing is not switched on during a trial at all.',
      },
      {
        q: 'How is the price worked out?',
        a: 'Per campus, per month, by the number of students you enrol. Paying for the year costs ten months instead of twelve. Moving up a plan takes effect the same day; moving down takes effect at the next renewal.',
      },
      {
        q: 'What if we outgrow our plan mid-year?',
        a: 'Nothing stops working. We will tell you when you pass your plan’s student limit, and you can move up whenever suits you — your data, settings and history come with you unchanged.',
      },
    ],
  },
  {
    id: 'data',
    label: 'Data and security',
    items: [
      {
        q: 'Is our data separate from other schools?',
        a: 'Yes, and not only by convention. Every row carries the school it belongs to and the database enforces it on every query, so a mistake in the application cannot return another school’s students.',
      },
      {
        q: 'Can somebody quietly change a paid fee?',
        a: 'No. A paid voucher is never edited and a payment is never deleted. A correction is a new, reversing entry with a name and a reason on it, so the ledger always shows what happened.',
      },
      {
        q: 'Can we take our data with us?',
        a: 'Yes. Lists export to CSV and Excel from the screen you are on, and if you ever leave we hand over a complete export of your school. Your records are yours.',
      },
      {
        q: 'Who on your side can see our records?',
        a: 'Only support staff you have asked for help, and only with a recorded reason that is kept in an audit log. Nobody browses a school’s data out of curiosity, because the system does not let them.',
      },
    ],
  },
] as const;

/** The footer's link columns. In-page anchors and the two auth routes only. */
export const FOOTER_LINKS = [
  {
    heading: 'Product',
    links: [
      { href: '#product', label: 'Tour' },
      { href: '#modules', label: 'Modules' },
      { href: '#portals', label: 'Portals' },
      { href: '#pricing', label: 'Pricing' },
    ],
  },
  {
    heading: 'Company',
    links: [
      { href: '#security', label: 'Security' },
      { href: '#how', label: 'Getting started' },
      { href: '#faq', label: 'FAQ' },
    ],
  },
  {
    heading: 'Account',
    links: [
      { href: '/signup', label: 'Start free' },
      { href: '/login', label: 'Sign in' },
    ],
  },
] as const;

/**
 * Contact details for the footer.
 *
 * ⚠️ `phone` and `city` are **placeholders** until the company's details are
 * settled (docs/19). The phone is deliberately not dialable — a made-up number
 * that happens to belong to somebody is worse than an obvious blank.
 */
export const CONTACT = {
  email: BRAND.supportEmail,
  phone: '+92 3XX XXX XXXX',
  city: 'Pakistan',
  hours: 'Mon – Sat, 9:00 – 18:00 PKT',
} as const;
