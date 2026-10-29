import { TRIAL_DAYS } from '@ilm/contracts';
import { Button, Money, cn } from '@ilm/ui';
import {
  AcademicsIcon,
  AccountIcon,
  AdmissionIcon,
  AttendanceIcon,
  CalendarIcon,
  ChevronDownIcon,
  ClassIcon,
  ExpenseIcon,
  FeesIcon,
  FileIcon,
  FinanceIcon,
  ForwardIcon,
  HistoryIcon,
  HolidayIcon,
  ICON_SIZE,
  ListChecksIcon,
  LockedIcon,
  MessagesIcon,
  PrintIcon,
  RequestsIcon,
  SalaryIcon,
  SchoolIcon,
  StudentsIcon,
  SuccessIcon,
  WebIcon,
} from '@ilm/ui/icons';
import { BRAND, minorUnits } from '@ilm/utils';
import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import type { ComponentType, ReactNode } from 'react';

import lemmaLogo from '../../../public/auth/lemma-logo.png';

import { MarketingBootstrap } from '@/components/marketing/marketing-bootstrap';
import { Converge, type ConvergeTool } from '@/components/marketing/marketing-converge';
import { LetterRoll } from '@/components/marketing/marketing-letters';
import { Manifesto } from '@/components/marketing/marketing-manifesto';
import { Label, Reveal, Rule, WordReveal } from '@/components/marketing/marketing-parts';
import {
  AttendancePreview,
  DefaulterPreview,
  FinancePreview,
  LaunchpadPreview,
  ResultPreview,
  TimetablePreview,
  VoucherPreview,
} from '@/components/marketing/marketing-previews';
import { MarketingRevealGuard } from '@/components/marketing/marketing-reveal-guard';
import { ScrollLine } from '@/components/marketing/marketing-scroll-line';
import { MarketingSmoothScroll } from '@/components/marketing/marketing-smooth-scroll';
import { MarketingStatus } from '@/components/marketing/marketing-status';
import { Tour, type TourStep } from '@/components/marketing/marketing-tour';
import { Hero } from '@/components/marketing/sections/hero';
import { SiteHeader } from '@/components/marketing/sections/site-header';
import { getPublicPlans } from '@/lib/public-plans';

/**
 * The public landing page, served at the apex — ADR-0010, art-directed per
 * ADR-0019 (as amended for the revamp).
 *
 * Reached by a rewrite from `/` (see `src/proxy.ts`), so the address bar reads
 * as the bare domain. This is the only page in the portal with no tenant and no
 * session, which makes it the only page allowed to say anything about the
 * product rather than about a school.
 *
 * ## The argument, in one line
 *
 * A school runs on half a dozen places that never agree; this is one window
 * for all of them. Every section is a version of that sentence: the hero shows
 * the window, "one window" folds the old tools into it, the bento shows every
 * module it holds, and the tour shows the four jobs it does daily.
 *
 * ## What it shows, and what it still refuses to
 *
 * The product is shown — as previews built from the real `@ilm/ui` parts and
 * the real navigation, with every number drawn from one sample-school file and
 * every preview labelled as a sample (`SampleTag`). What is still absent is
 * anything that would read as proof we do not have: no testimonials, no
 * customer logos, no usage statistics. A school deciding whether to trust us
 * with its fee collection can check every claim here by using the trial.
 *
 * ## Motion
 *
 * Reveals are CSS transitions driven by one `IntersectionObserver` in
 * `MarketingBootstrap`; smooth scrolling and the manifesto are Lenis; the three
 * set pieces (hero stage, "one window", the tour) are scroll-linked Motion
 * values. Nothing moves on a timer. Under `prefers-reduced-motion`, or with no
 * JavaScript, every set piece renders as its finished layout — the page is
 * complete as served HTML.
 */
export const metadata: Metadata = {
  title: `${BRAND.name} — the all-in-one school management system`,
  description:
    'Admissions, fees, attendance, marks, timetables, staff and finance in one window. One login, one record per student, set up in an afternoon.',
};

/**
 * Plans are data, not code: prices and plan details come from the platform
 * console (`getPublicPlans`) and are cached for a short window. Pricing is
 * decision D2 (docs/15) and still open, which is exactly why it must be
 * editable without a deploy.
 */
// A literal, not an imported constant: Next reads route-segment config statically
// and rejects anything it cannot evaluate at build time. Keep it equal to
// PLANS_REVALIDATE_SECONDS in lib/public-plans.ts.
export const revalidate = 30;

type IconComponent = ComponentType<{ className?: string; 'aria-hidden'?: boolean }>;

const NAV = [
  { href: '#capabilities', label: 'Modules' },
  { href: '#tour', label: 'How it works' },
  { href: '#packages', label: 'Packages' },
  { href: '#questions', label: 'Questions' },
];

/** The tools "one window" replaces. Offsets are viewport units from the stage centre. */
const TOOLS: ConvergeTool[] = [
  {
    label: 'Attendance register',
    icon: <AttendanceIcon className={ICON_SIZE.inline} aria-hidden />,
    x: -32,
    y: -14,
    tilt: -7,
  },
  {
    label: 'Receipt book',
    icon: <ExpenseIcon className={ICON_SIZE.inline} aria-hidden />,
    x: 30,
    y: -18,
    tilt: 6,
  },
  {
    label: 'fees-2026.xlsx',
    icon: <FileIcon className={ICON_SIZE.inline} aria-hidden />,
    x: -36,
    y: 10,
    tilt: 5,
  },
  {
    label: 'Parents’ WhatsApp group',
    icon: <MessagesIcon className={ICON_SIZE.inline} aria-hidden />,
    x: 33,
    y: 9,
    tilt: -5,
  },
  {
    label: 'Result-card template',
    icon: <PrintIcon className={ICON_SIZE.inline} aria-hidden />,
    x: -22,
    y: 30,
    tilt: -3,
  },
  {
    label: 'Salary diary',
    icon: <SalaryIcon className={ICON_SIZE.inline} aria-hidden />,
    x: 22,
    y: 30,
    tilt: 7,
  },
];

const SMALL_MODULES: { Icon: IconComponent; title: string; body: string }[] = [
  {
    Icon: AdmissionIcon,
    title: 'Admissions & students',
    body: 'One record per student — guardians, siblings, documents and the whole history.',
  },
  {
    Icon: AcademicsIcon,
    title: 'Classes & sessions',
    body: 'Classes, sections and subjects, and promote a whole year at session end.',
  },
  {
    Icon: HolidayIcon,
    title: 'Calendar & holidays',
    body: 'Term dates and holidays the timetable and attendance already know about.',
  },
  {
    Icon: AccountIcon,
    title: 'Staff & salaries',
    body: 'Staff records, staff attendance and the monthly salary run, in rupees.',
  },
  {
    Icon: RequestsIcon,
    title: 'Requests',
    body: 'Leave, fee and record requests as conversations, not lost slips of paper.',
  },
  {
    Icon: StudentsIcon,
    title: 'Parent access',
    body: 'Guardians see their own children’s vouchers and requests — and nothing else.',
  },
];

const TOUR: TourStep[] = [
  {
    id: 'fees',
    label: 'Fees',
    title: 'Collect a fee in under twenty seconds.',
    body: 'Fee heads, plans and discounts you configure yourself. A month of vouchers generates in one run, and the defaulter list sorts itself by how long each family has owed.',
    points: [
      'Monthly vouchers in one run',
      'Challans print three to an A4 sheet',
      'Security deposits and fee increments built in',
    ],
    screen: (
      <div className="space-y-4">
        <VoucherPreview />
        <DefaulterPreview />
      </div>
    ),
  },
  {
    id: 'attendance',
    label: 'Attendance',
    title: 'Mark a class from the phone in your pocket.',
    body: 'Teachers mark by day or by period on the phone they already own, on 4G. The office sees it the moment it is taken — not at the end of the month.',
    points: ['Students and staff', 'Works on a 4G phone', 'Reports by class, by month, by student'],
    screen: (
      <div className="space-y-4">
        <AttendancePreview />
        <TimetablePreview />
      </div>
    ),
  },
  {
    id: 'results',
    label: 'Marks & results',
    title: 'Result cards from the marks you already entered.',
    body: 'Subjects and assessments you define, marks entered fast enough to do without a mouse, and result cards printed from the very same records.',
    points: [
      'Your subjects, your assessments',
      'Keyboard-fast marks entry',
      'Result cards ready to print',
    ],
    screen: <ResultPreview />,
  },
  {
    id: 'finance',
    label: 'Finance',
    title: 'Books that balance, every single day.',
    body: 'Revenue, expenses and salaries in one ledger. Every rupee lands against a student, a head and a month, and a correction is a reversing entry — never a quiet edit.',
    points: ['Revenue, expense and salaries', 'Nothing overwritten, ever', 'Every change audited'],
    screen: (
      <div className="space-y-4">
        <FinancePreview />
        <VoucherPreview />
      </div>
    ),
  },
];

const PRINCIPLES = [
  {
    verb: 'Record',
    body: 'Admissions, attendance and marks, entered once, by the person who already has the information.',
  },
  {
    verb: 'Reconcile',
    body: 'Every rupee lands against a student, a head and a month — so the ledger and the register never disagree.',
  },
  {
    verb: 'Report',
    body: 'Challans, result cards, day books and defaulter lists, printed from the same records they were entered into.',
  },
] as const;

/**
 * Who sees what. `tint` is a complete class name — Tailwind finds classes by
 * scanning source text, so `bg-tint-${key}` would compile to nothing.
 */
const ROLES = [
  {
    Icon: SchoolIcon,
    tint: 'bg-tint-mint',
    role: 'Owner & principal',
    points: [
      'The whole school on one dashboard',
      'Collection, attendance and staff at a glance',
      'Every campus under one sign-in',
    ],
  },
  {
    Icon: FinanceIcon,
    tint: 'bg-tint-butter',
    role: 'Accountant',
    points: [
      'Vouchers, payments and deposits',
      'Revenue, expense and salaries',
      'Nothing edited, everything reversible',
    ],
  },
  {
    Icon: ClassIcon,
    tint: 'bg-tint-peach',
    role: 'Teacher',
    points: ['Only their own classes', 'Attendance and marks from a phone', 'The week’s timetable'],
  },
  {
    Icon: StudentsIcon,
    tint: 'bg-tint-lavender',
    role: 'Parent',
    points: [
      'Their own children, nobody else’s',
      'Fee vouchers and what is due',
      'Requests to the school office',
    ],
  },
] as const;

/** The engineering promises, each one a rule this repository enforces. */
const TRUST: { Icon: IconComponent; title: string; body: string }[] = [
  {
    Icon: FinanceIcon,
    title: 'Paisa-exact',
    body: 'Money is stored in whole paisa, never as a floating-point number.',
  },
  {
    Icon: HistoryIcon,
    title: 'Append-only ledger',
    body: 'A paid voucher is never edited. Corrections are reversing entries with a reason.',
  },
  {
    Icon: LockedIcon,
    title: 'Row-level isolation',
    body: 'Every row carries its school, and the database itself refuses anything else.',
  },
  {
    Icon: ListChecksIcon,
    title: 'Every change audited',
    body: 'Who changed what, when, and what it was before — on every mutation.',
  },
  {
    Icon: PrintIcon,
    title: 'Prints for the bank',
    body: 'Fee challans with your logo and bank details, three copies to an A4 sheet.',
  },
  {
    Icon: WebIcon,
    title: 'Nothing to install',
    body: 'A browser is all it needs — including the one on a teacher’s phone.',
  },
];

const STEPS = [
  {
    title: 'Create your school',
    body: 'Your name, your address at this domain, your own password. One form, under a minute, nobody in the loop.',
  },
  {
    title: 'Set up what you charge',
    body: 'Classes, sections, fee heads and plans — in your words and your amounts. Nobody has to configure it for you.',
  },
  {
    title: 'Invite the people who use it',
    body: 'Office staff, teachers and guardians. Each one sees only what their role allows, and the menu is built from their permissions.',
  },
] as const;

/**
 * Objections, answered. Phrased narrowly on purpose: where something is not
 * built yet it says so, because the first promise this page breaks is the last
 * thing a school believes.
 */
const QUESTIONS = [
  {
    q: 'Is there anything to install?',
    a: 'No. It runs in a browser, including the browser on the phone a teacher already owns, on a 4G connection. There is no desktop software, no server to buy and nothing for your IT person to maintain.',
  },
  {
    q: 'Can it handle Urdu names?',
    a: 'Names are stored and shown exactly as they are typed, in Urdu or English, on screen and on printed documents. The interface itself is in English today; it is built so it can be translated without the screens being rebuilt.',
  },
  {
    q: 'Who in my school can see what?',
    a: 'Each person has a role, and the menu is generated from what that role is allowed to do rather than hidden with a disabled button. A teacher sees their own classes. A guardian sees their own children and nothing else — not even that another family exists.',
  },
  {
    q: 'Can we still print fee challans for the bank?',
    a: 'Yes, and it is a first-class part of the product rather than a screenshot. Three copies go across a landscape A4 sheet, or four on a portrait one, with your logo, your bank details and a copy for the bank.',
  },
  {
    q: 'Is our data separate from other schools?',
    a: 'Yes, and not only by convention. Every row carries the school it belongs to and the database enforces it on every query, so a mistake in the application cannot return another school’s students. It is the first thing we built.',
  },
  {
    q: `What happens during the ${String(TRIAL_DAYS)} days?`,
    a: 'You use all of it, with your real students and your real fee structure, and we do not ask for a card. Nothing is charged and nothing auto-renews, because billing is not switched on during a trial at all.',
  },
];

/** Two digits, so `01` and `04` occupy the same width down a column. */
const pad = (value: number) => String(value).padStart(2, '0');

const linkClass =
  'rounded-sm text-sm text-muted-foreground transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none';

function ModuleTile({
  Icon,
  title,
  body,
  className,
  children,
}: {
  Icon: IconComponent;
  title: string;
  body: string;
  className?: string;
  children?: ReactNode;
}) {
  return (
    <article
      className={cn(
        'rounded-tile shadow-tile flex flex-col border border-border bg-card p-6 transition-transform duration-200 ease-out hover:-translate-y-1 lg:p-8',
        className,
      )}
    >
      <div className="flex items-center gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
          <Icon className={ICON_SIZE.nav} aria-hidden />
        </span>
        <h3 className="text-lg font-semibold">{title}</h3>
      </div>
      <p className="mt-4 max-w-md text-sm leading-relaxed text-muted-foreground">{body}</p>
      {children ? (
        <div className="mt-6 flex-1 rounded-xl bg-muted p-4" aria-hidden>
          {children}
        </div>
      ) : null}
    </article>
  );
}

export default async function WelcomePage() {
  const plans = await getPublicPlans();
  return (
    <div
      id="top"
      className="marketing min-h-dvh bg-background text-foreground"
    >
      {/* Before the content, so the attribute is set before the hero paints. */}
      <MarketingBootstrap />
      {/* After it, and after hydration: re-observes anything React replaced. */}
      <MarketingRevealGuard />
      <MarketingSmoothScroll />

      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:start-6 focus:top-6 focus:z-50 focus:rounded-full focus:bg-card focus:px-4 focus:py-2 focus:text-sm focus:ring-2 focus:ring-ring"
      >
        Skip to content
      </a>

      <SiteHeader links={NAV} />

      <main id="main">
        {/* ------------------------------------------------------------------
            Hero — the admin dashboard rising out of the dark band.
            ------------------------------------------------------------------ */}
        <Hero />

        {/* ------------------------------------------------------------------
            One window — the old tools fold into the new one.
            ------------------------------------------------------------------ */}
        <section aria-labelledby="one-window-heading" className="relative">
          <Converge
            tools={TOOLS}
            before={
              <>
                <Label className="text-primary">01 — The problem</Label>
                <p className="text-display-sm mt-4 font-semibold text-balance">
                  A school runs on six places that never agree.
                </p>
              </>
            }
            after={
              <>
                <h2 id="one-window-heading" className="text-display-md font-semibold text-balance">
                  {BRAND.name} is one window for all of it.
                </h2>
                <p className="mx-auto mt-4 max-w-xl text-base leading-relaxed text-muted-foreground">
                  Every module shares one record per student — so the office, the accounts and the
                  parents always see the same answer.
                </p>
              </>
            }
          >
            <div aria-hidden>
              <LaunchpadPreview />
            </div>
          </Converge>
        </section>

        {/* ------------------------------------------------------------------
            Every module — a bento, each tile carrying its own screen.
            ------------------------------------------------------------------ */}
        <section
          id="capabilities"
          aria-labelledby="capabilities-heading"
          className="mx-auto max-w-7xl scroll-mt-28 px-6 py-24 lg:px-12 lg:py-32"
        >
          <div className="grid gap-8 lg:grid-cols-12 lg:items-end">
            <div className="lg:col-span-7">
              <Reveal>
                <Label className="text-primary">02 — Everything included</Label>
              </Reveal>
              <WordReveal
                as="h2"
                id="capabilities-heading"
                text="Every module a school needs, already connected."
                className="text-display-md mt-6 font-semibold"
              />
            </div>
            <Reveal index={1} className="lg:col-span-5">
              <p className="text-base leading-relaxed text-muted-foreground">
                No add-ons to buy and nothing to stitch together. A fee paid at the counter is on
                the dashboard, the student’s record and the day book in the same moment.
              </p>
            </Reveal>
          </div>

          <div className="mt-16 grid gap-4 lg:grid-cols-3">
            <Reveal className="lg:col-span-2 lg:row-span-2">
              <ModuleTile
                Icon={FeesIcon}
                title="Fees & vouchers"
                body="Fee plans, monthly vouchers, discounts, increments and security deposits — and a defaulter list that sorts itself by how long each family has owed."
                className="h-full"
              >
                <div className="grid gap-4 sm:grid-cols-2">
                  <VoucherPreview />
                  <DefaulterPreview />
                </div>
              </ModuleTile>
            </Reveal>
            <Reveal index={1}>
              <ModuleTile
                Icon={AttendanceIcon}
                title="Attendance"
                body="Students and staff, by day or by period, marked from any phone."
                className="h-full"
              >
                <AttendancePreview />
              </ModuleTile>
            </Reveal>
            <Reveal index={2}>
              <ModuleTile
                Icon={ClassIcon}
                title="Marks & result cards"
                body="Your subjects and assessments, printed as result cards."
                className="h-full"
              >
                <ResultPreview />
              </ModuleTile>
            </Reveal>
            <Reveal index={3}>
              <ModuleTile
                Icon={CalendarIcon}
                title="Timetables"
                body="Periods, breaks and teachers, the source the calendar reads from."
                className="h-full"
              >
                <TimetablePreview />
              </ModuleTile>
            </Reveal>
            <Reveal index={4} className="lg:col-span-2">
              <ModuleTile
                Icon={FinanceIcon}
                title="Finance"
                body="Revenue, expenses and salaries in one ledger that reconciles itself."
                className="h-full"
              >
                <FinancePreview />
              </ModuleTile>
            </Reveal>
          </div>

          <ul className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {SMALL_MODULES.map((module, position) => (
              <li key={module.title}>
                <Reveal index={position}>
                  <ModuleTile Icon={module.Icon} title={module.title} body={module.body} />
                </Reveal>
              </li>
            ))}
          </ul>
        </section>

        {/* ------------------------------------------------------------------
            The tour — four daily jobs, each with its screen.
            ------------------------------------------------------------------ */}
        <section
          id="tour"
          aria-labelledby="tour-heading"
          className="scroll-mt-28 bg-muted py-24 lg:py-32"
        >
          <div className="mx-auto max-w-7xl px-6 lg:px-12">
            <Reveal>
              <Label className="text-primary">03 — A day at school</Label>
            </Reveal>
            <WordReveal
              as="h2"
              id="tour-heading"
              text="Built for the jobs that happen every single day."
              className="text-display-md mt-6 max-w-3xl font-semibold"
            />
            <div className="mt-16 lg:mt-8">
              <Tour steps={TOUR} />
            </div>
          </div>
        </section>

        {/* ------------------------------------------------------------------
            The manifesto, lit word by word as it is read.
            ------------------------------------------------------------------ */}
        <section
          aria-labelledby="manifesto-heading"
          className="mx-auto max-w-7xl px-6 py-24 lg:px-12 lg:py-32"
        >
          <Reveal>
            <Label id="manifesto-heading" className="text-primary">
              04 — Why it exists
            </Label>
          </Reveal>
          <Manifesto
            className="text-display-sm mt-10 max-w-5xl leading-snug font-medium"
            text={`The register is in one cupboard. The receipt book is in another. The spreadsheet lives on somebody's own laptop, and none of it reconciles, because none of it is in the same place. ${BRAND.name} keeps one record for each student, and every rupee, mark and absence hangs off it — so the answer to "has this family paid?" is the same answer in the office, in the accounts, and on the phone.`}
          />
          <div className="mt-20 grid gap-12 lg:grid-cols-3 lg:gap-16">
            {PRINCIPLES.map((principle, position) => (
              <Reveal key={principle.verb} index={position}>
                <Rule index={position} />
                <h3 className="text-display-xs mt-6 font-semibold">{principle.verb}</h3>
                <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
                  {principle.body}
                </p>
              </Reveal>
            ))}
          </div>
        </section>

        {/* ------------------------------------------------------------------
            Roles — everyone gets their own window.
            ------------------------------------------------------------------ */}
        <section
          aria-labelledby="roles-heading"
          className="mx-auto max-w-7xl px-6 pb-24 lg:px-12 lg:pb-32"
        >
          <Reveal>
            <Label className="text-primary">05 — Built for every role</Label>
          </Reveal>
          <WordReveal
            as="h2"
            id="roles-heading"
            text="Everyone gets their own window."
            className="text-display-md mt-6 font-semibold"
          />
          <p className="mt-6 max-w-2xl text-base leading-relaxed text-muted-foreground">
            The menu is built from each person’s permissions, so nobody wades through screens that
            are not theirs — and nobody sees a record they should not.
          </p>
          <ul className="mt-16 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {ROLES.map(({ Icon, tint, role, points }, position) => (
              <li key={role}>
                <Reveal index={position} className={cn('rounded-tile h-full p-6 lg:p-8', tint)}>
                  <span className="flex size-12 items-center justify-center rounded-full bg-card">
                    <Icon className={ICON_SIZE.heading} aria-hidden />
                  </span>
                  <h3 className="text-display-xs mt-8 font-semibold">{role}</h3>
                  <ul className="mt-6 space-y-3">
                    {points.map((point) => (
                      <li key={point} className="flex gap-3 text-sm leading-relaxed">
                        <SuccessIcon
                          className={cn(ICON_SIZE.inline, 'mt-0.5 shrink-0')}
                          aria-hidden
                        />
                        {point}
                      </li>
                    ))}
                  </ul>
                </Reveal>
              </li>
            ))}
          </ul>
        </section>

        {/* ------------------------------------------------------------------
            Trust — the one dark band. Each item is a rule the codebase enforces.
            ------------------------------------------------------------------ */}
        <section aria-labelledby="trust-heading" className="px-4 lg:px-8">
          <div className="marketing-invert rounded-tile mx-auto max-w-7xl bg-background px-6 py-20 text-foreground lg:px-16 lg:py-28">
            <div className="grid gap-10 lg:grid-cols-12">
              <div className="lg:col-span-5">
                <Label>06 — Built to be trusted</Label>
                <h2 id="trust-heading" className="text-display-md mt-6 font-semibold text-balance">
                  Your fee collection deserves engineering, not a spreadsheet.
                </h2>
              </div>
              <p className="text-base leading-relaxed text-muted-foreground lg:col-span-6 lg:col-start-7 lg:self-end">
                These are not features on a list. They are rules the software is built on, enforced
                by the database and checked on every change — and you can see each one at work
                during your trial.
              </p>
            </div>
            <ul className="mt-16 grid gap-x-12 gap-y-10 sm:grid-cols-2 lg:grid-cols-3">
              {TRUST.map(({ Icon, title, body }, position) => (
                <li key={title}>
                  <Reveal index={position}>
                    <Rule index={position} />
                    <div className="mt-6 flex items-center gap-3">
                      <Icon className={cn(ICON_SIZE.heading, 'text-primary')} aria-hidden />
                      <h3 className="text-lg font-semibold">{title}</h3>
                    </div>
                    <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{body}</p>
                  </Reveal>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* ------------------------------------------------------------------
            How it works — three steps, joined by a line that draws as you read.
            ------------------------------------------------------------------ */}
        <section
          id="how"
          aria-labelledby="how-heading"
          className="mx-auto max-w-7xl scroll-mt-28 px-6 py-24 lg:px-12 lg:py-32"
        >
          <Reveal>
            <Label className="text-primary">07 — Getting started</Label>
          </Reveal>
          <WordReveal
            as="h2"
            id="how-heading"
            text="Three steps, and one afternoon."
            className="text-display-md mt-6 font-semibold"
          />
          <ScrollLine className="mt-16 hidden lg:block" />
          <ol className="grid gap-12 lg:mt-10 lg:grid-cols-3 lg:gap-16">
            {STEPS.map((step, position) => (
              <li key={step.title}>
                <Reveal index={position}>
                  <span className="tabular flex size-10 items-center justify-center rounded-full bg-primary text-sm font-semibold text-primary-foreground">
                    {pad(position + 1)}
                  </span>
                  <h3 className="text-display-xs mt-6 font-semibold">{step.title}</h3>
                  <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{step.body}</p>
                </Reveal>
              </li>
            ))}
          </ol>
        </section>

        {/* ------------------------------------------------------------------
            Packages — live from the platform console. The recommended one is
            marked with a label *and* the dark ground, never colour alone.
            ------------------------------------------------------------------ */}
        <section
          id="packages"
          aria-labelledby="packages-heading"
          className="mx-auto max-w-7xl scroll-mt-28 px-6 pb-24 lg:px-12 lg:pb-32"
        >
          <div className="grid gap-8 lg:grid-cols-12 lg:items-end">
            <div className="lg:col-span-7">
              <Reveal>
                <Label className="text-primary">08 — Packages</Label>
              </Reveal>
              <WordReveal
                as="h2"
                id="packages-heading"
                text="Priced per campus, billed in rupees."
                className="text-display-md mt-6 font-semibold"
              />
            </div>
            <Reveal index={1} className="lg:col-span-5">
              <p className="text-base leading-relaxed text-muted-foreground">
                Every package starts with the same {TRIAL_DAYS}-day trial, and you can change or
                cancel at any time. Billed in Pakistani rupees, with nothing to sign.
              </p>
            </Reveal>
          </div>

          {plans === undefined || plans.length === 0 ? (
            // No plans to show: say so and offer the way forward, never an
            // empty gap where the prices should be.
            <Reveal className="rounded-tile mt-16 border border-border bg-card p-8">
              <p className="max-w-xl text-sm leading-relaxed text-muted-foreground">
                {plans === undefined
                  ? 'Pricing is unavailable right now. Please check back shortly, or start your free trial and we will confirm the price with you.'
                  : 'Pricing is shared when you start. Begin your free trial and we will confirm the right package for your school.'}
              </p>
              <Button asChild size="touch" className="mt-6 rounded-full">
                <Link href="/signup">Start free trial</Link>
              </Button>
            </Reveal>
          ) : (
            <div className="mt-16 grid gap-4 lg:grid-cols-3">
              {plans.map((plan, position) => {
                const isRecommended = plan.isRecommended;
                return (
                  <Reveal
                    key={plan.code}
                    index={position}
                    className={cn(
                      'rounded-tile flex h-full flex-col border p-8 lg:p-10',
                      isRecommended
                        ? 'marketing-invert shadow-frame border-transparent bg-background text-foreground'
                        : 'shadow-tile border-border bg-card',
                    )}
                  >
                    <div className="flex items-baseline justify-between gap-3">
                      <h3 className="text-display-xs font-semibold">{plan.name}</h3>
                      {isRecommended ? (
                        <span className="tracking-label rounded-full bg-primary px-3 py-1 text-xs font-medium text-primary-foreground uppercase">
                          Most schools
                        </span>
                      ) : null}
                    </div>
                    <p className="mt-2 text-sm text-muted-foreground">{plan.tagline}</p>
                    <p className="mt-8 flex items-baseline gap-2">
                      <Money
                        valueMinor={minorUnits(plan.priceMinor)}
                        withSymbol
                        className="text-display-sm font-semibold"
                      />
                      <span className="text-sm text-muted-foreground">
                        / {plan.billingCycle === 'YEARLY' ? 'year' : 'month'}
                      </span>
                    </p>
                    <p className="mt-2 text-xs text-muted-foreground">
                      {plan.studentCap === null
                        ? 'No student limit'
                        : `Up to ${plan.studentCap.toLocaleString('en-PK')} students`}
                    </p>
                    {/* `flex-1` so every button sits on the bottom edge whatever
                        the number of features. */}
                    <ul className="mt-8 flex-1 space-y-3 border-t border-border pt-8">
                      {plan.features.map((feature) => (
                        <li
                          key={feature}
                          className="flex gap-3 text-sm leading-relaxed text-muted-foreground"
                        >
                          <SuccessIcon
                            className={cn(ICON_SIZE.inline, 'mt-0.5 shrink-0 text-primary')}
                            aria-hidden
                          />
                          {feature}
                        </li>
                      ))}
                    </ul>
                    <Button
                      asChild
                      size="touch"
                      tone={isRecommended ? 'primary' : 'outline'}
                      className="mt-10 w-full rounded-full"
                    >
                      <Link href="/signup">Start free trial</Link>
                    </Button>
                  </Reveal>
                );
              })}
            </div>
          )}
        </section>

        {/* ------------------------------------------------------------------
            Questions — native `<details>`: keyboard-operable, searchable with
            find-in-page, and no JavaScript.
            ------------------------------------------------------------------ */}
        <section
          id="questions"
          aria-labelledby="questions-heading"
          className="mx-auto max-w-7xl scroll-mt-28 px-6 pb-24 lg:px-12 lg:pb-32"
        >
          <div className="grid gap-12 lg:grid-cols-12 lg:gap-16">
            <div className="lg:col-span-4">
              <div className="lg:sticky lg:top-28">
                <Reveal>
                  <Label className="text-primary">09 — Questions</Label>
                </Reveal>
                <WordReveal
                  as="h2"
                  id="questions-heading"
                  text="Before you sign up."
                  className="text-display-md mt-6 font-semibold"
                />
                <Reveal index={1}>
                  <p className="mt-6 text-sm leading-relaxed text-muted-foreground">
                    Something we have not answered? Write to{' '}
                    <a
                      href={`mailto:${BRAND.supportEmail}`}
                      data-underline
                      className="text-foreground"
                    >
                      {BRAND.supportEmail}
                    </a>
                    .
                  </p>
                </Reveal>
              </div>
            </div>
            <div className="space-y-3 lg:col-span-8">
              {QUESTIONS.map((item, position) => (
                <Reveal key={item.q} index={position}>
                  <details className="group rounded-tile open:shadow-tile border border-border bg-card px-6 transition-colors">
                    <summary className="flex cursor-pointer list-none items-center gap-6 rounded-sm py-6 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none">
                      <span className="tabular text-xs text-muted-foreground">
                        {pad(position + 1)}
                      </span>
                      <h3 className="flex-1 text-base font-semibold">{item.q}</h3>
                      <ChevronDownIcon
                        className={cn(
                          ICON_SIZE.inline,
                          'shrink-0 text-muted-foreground transition-transform duration-200 group-open:rotate-180',
                        )}
                        aria-hidden
                      />
                    </summary>
                    <p className="max-w-2xl ps-10 pb-6 text-sm leading-relaxed text-muted-foreground">
                      {item.a}
                    </p>
                  </details>
                </Reveal>
              ))}
            </div>
          </div>
        </section>

        {/* ------------------------------------------------------------------
            The close.
            ------------------------------------------------------------------ */}
        <section aria-labelledby="final-cta" className="px-4 pb-20 lg:px-8 lg:pb-28">
          <Reveal>
            <div className="marketing-invert rounded-tile relative isolate mx-auto max-w-7xl overflow-hidden bg-background px-6 py-20 text-center text-foreground lg:px-16 lg:py-28">
              <span aria-hidden className="marketing-grid absolute inset-0 -z-10 opacity-40" />
              <Label>{TRIAL_DAYS} days free · no card</Label>
              <h2
                id="final-cta"
                className="text-display-lg mx-auto mt-8 max-w-4xl font-semibold text-balance"
              >
                Run your whole school from one window — starting this afternoon.
              </h2>
              <p className="mx-auto mt-8 max-w-xl text-base leading-relaxed text-muted-foreground">
                One form creates your school, your account and your trial. No card, no sales call,
                and nobody from us in the middle of it.
              </p>
              <div className="mt-12 flex flex-wrap items-center justify-center gap-4">
                <Button asChild size="touch" className="rounded-full px-8">
                  <Link href="/signup">
                    Set up your school
                    <ForwardIcon className={ICON_SIZE.inline} aria-hidden />
                  </Link>
                </Button>
                <Link href="/login" className={cn(linkClass, 'inline-flex')}>
                  <LetterRoll text="Sign in instead" />
                </Link>
              </div>
            </div>
          </Reveal>
        </section>
      </main>

      {/* ----------------------------------------------------------------
          Footer.
          ---------------------------------------------------------------- */}
      <footer className="mx-auto max-w-7xl px-6 pb-12 lg:px-12">
        <Rule />
        <div className="grid gap-12 pt-12 lg:grid-cols-12 lg:gap-8">
          <Reveal index={0} className="lg:col-span-4">
            <Image
              src={lemmaLogo}
              alt={BRAND.name}
              data-logo
              className="h-9 w-auto object-contain object-left"
            />
            <p className="mt-5 max-w-xs text-sm leading-relaxed text-muted-foreground">
              The all-in-one school management system for Pakistan — admissions, fees, attendance,
              marks, timetables, staff and finance in one window.
            </p>
            <p className="tracking-label mt-6 text-xs font-medium text-muted-foreground uppercase">
              <MarketingStatus place="Built in Pakistan" />
            </p>
          </Reveal>

          <Reveal index={1} className="lg:col-span-3">
            <Label>Navigate</Label>
            <ul className="mt-5 space-y-3">
              {NAV.map((item) => (
                <li key={item.href}>
                  <a href={item.href} className={cn(linkClass, 'inline-flex')}>
                    <LetterRoll text={item.label} />
                  </a>
                </li>
              ))}
            </ul>
          </Reveal>

          <Reveal index={2} className="lg:col-span-2">
            <Label>Account</Label>
            <ul className="mt-5 space-y-3">
              <li>
                <Link href="/signup" className={cn(linkClass, 'inline-flex')}>
                  <LetterRoll text="Start free" />
                </Link>
              </li>
              <li>
                <Link href="/login" className={cn(linkClass, 'inline-flex')}>
                  <LetterRoll text="Sign in" />
                </Link>
              </li>
            </ul>
          </Reveal>

          <Reveal index={3} className="lg:col-span-3">
            <Label>Support</Label>
            <p className="mt-5">
              <a href={`mailto:${BRAND.supportEmail}`} data-underline className={linkClass}>
                {BRAND.supportEmail}
              </a>
            </p>
            <p className="mt-3 text-sm text-muted-foreground">
              {TRIAL_DAYS} days free. No card, no sales call.
            </p>
          </Reveal>
        </div>

        <Rule className="mt-16" />
        <div className="flex flex-wrap items-center justify-between gap-4 pt-6">
          <p className="text-xs text-muted-foreground">
            © {BRAND.name} — school management for Pakistan.
          </p>
          {/* `#top` is the page container, so this is a real anchor that works
              with no JavaScript; Lenis eases it when there is. */}
          <a href="#top" className={cn(linkClass, 'group inline-flex items-center gap-2 text-xs')}>
            <LetterRoll text="Back to top" />
            <ForwardIcon
              className={cn(
                ICON_SIZE.inline,
                '-rotate-90 transition-transform duration-300 group-hover:-translate-y-1',
              )}
              aria-hidden
            />
          </a>
        </div>
      </footer>
    </div>
  );
}
