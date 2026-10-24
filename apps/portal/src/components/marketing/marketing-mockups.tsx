import { Money, StatusBadge, cn, type StatusTone } from '@ilm/ui';
import {
  ApproveIcon,
  AttendanceIcon,
  DashboardIcon,
  FeesIcon,
  FinanceIcon,
  ICON_SIZE,
  NotificationsIcon,
  ResultIcon,
  SearchIcon,
  StaffIcon,
  StudentsIcon,
  TimetableIcon,
  TrendUpIcon,
} from '@ilm/ui/icons';
import { BRAND } from '@ilm/utils';
import Image, { type StaticImageData } from 'next/image';
import type { CSSProperties, ReactNode } from 'react';

/**
 * Interface previews for the landing page — ADR-0020.
 *
 * ## These are illustrations, and they say so
 *
 * Every figure, name and voucher number below is sample data. Each frame
 * carries a visible "Sample data" caption and an accessible name that says the
 * same, because a school reading this page is deciding whether to trust us with
 * its money, and a mockup passed off as a customer's real numbers would be the
 * first lie it caught.
 *
 * ## Replacing them with real screenshots
 *
 * `ProductFrame` and `PhoneFrame` both take an optional `screenshot`. Pass a
 * static import and the frame renders the image instead of its children — the
 * mockup becomes dead code to delete, and no layout changes:
 *
 *     import feesShot from '@/../public/marketing/fees.png';
 *     <ProductFrame screenshot={feesShot} …>
 *
 * ## Why markup and not images today
 *
 * Built from the same `Money`, `StatusBadge` and semantic tokens the product
 * uses, so they follow the theme into dark mode, scale crisply at every width,
 * and cost a few kilobytes of HTML instead of a few hundred of PNG.
 *
 * Server Components throughout; nothing here ships JavaScript.
 */

/** A bar's length as a computed value — the one inline style docs/16 §2 allows. */
function extent(axis: 'height' | 'width', percent: number): CSSProperties {
  return { [axis]: `${String(percent)}%` };
}

/* -------------------------------------------------------------------------- */
/* Frames                                                                     */
/* -------------------------------------------------------------------------- */

interface FrameProps {
  /** What the picture shows, for a screen reader and as the image's alt text. */
  label: string;
  /** A real screenshot. When present it replaces the mockup entirely. */
  screenshot?: StaticImageData;
  children: ReactNode;
  className?: string;
}

/** A browser window around a desktop screen. */
export function ProductFrame({
  label,
  url,
  screenshot,
  children,
  className,
}: FrameProps & { url: string }) {
  return (
    <figure
      className={cn(
        'rounded-tile shadow-tile overflow-hidden border border-border bg-card',
        className,
      )}
    >
      <div className="flex items-center gap-4 border-b border-border bg-muted px-4 py-3">
        <span className="flex gap-1" aria-hidden>
          <span className="size-2 rounded-full bg-border" />
          <span className="size-2 rounded-full bg-border" />
          <span className="size-2 rounded-full bg-border" />
        </span>
        <span className="mx-auto flex h-6 w-full max-w-xs items-center justify-center truncate rounded-md bg-background px-3 text-xs text-muted-foreground">
          {url}
        </span>
        <span className="hidden w-8 sm:block" aria-hidden />
      </div>
      {screenshot === undefined ? (
        <div role="img" aria-label={`${label} (sample data)`}>
          <div aria-hidden>{children}</div>
        </div>
      ) : (
        <Image src={screenshot} alt={label} className="h-auto w-full" />
      )}
    </figure>
  );
}

/** A phone around a mobile screen — the device a teacher and a parent actually use. */
export function PhoneFrame({ label, screenshot, children, className }: FrameProps) {
  return (
    <figure
      className={cn(
        'shadow-tile mx-auto w-64 shrink-0 rounded-3xl border border-border bg-card p-2',
        className,
      )}
    >
      <div className="overflow-hidden rounded-2xl border border-border bg-background">
        <div className="flex justify-center py-2" aria-hidden>
          <span className="h-1 w-12 rounded-full bg-border" />
        </div>
        {screenshot === undefined ? (
          <div role="img" aria-label={`${label} (sample data)`}>
            <div aria-hidden className="px-4 pb-4">
              {children}
            </div>
          </div>
        ) : (
          <Image src={screenshot} alt={label} className="h-auto w-full" />
        )}
      </div>
    </figure>
  );
}

/** The honest caption under every mockup. */
export function SampleCaption({ className }: { className?: string }) {
  return (
    <p className={cn('tracking-label text-xs text-muted-foreground uppercase', className)}>
      Illustration · sample data
    </p>
  );
}

/* -------------------------------------------------------------------------- */
/* Shared pieces                                                              */
/* -------------------------------------------------------------------------- */

function Initials({ name, tint }: { name: string; tint: string }) {
  const letters = name
    .split(' ')
    .map((part) => part.charAt(0))
    .join('')
    .slice(0, 2);
  return (
    <span
      className={cn(
        tint,
        'inline-flex size-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold',
      )}
    >
      {letters}
    </span>
  );
}

function Panel({
  title,
  aside,
  children,
  className,
}: {
  title: string;
  aside?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('rounded-xl border border-border bg-card p-4', className)}>
      <div className="flex items-center justify-between gap-4">
        <p className="text-sm font-semibold">{title}</p>
        {aside}
      </div>
      <div className="mt-4">{children}</div>
    </div>
  );
}

function Stat({ label, children, note }: { label: string; children: ReactNode; note?: string }) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <p className="text-xs text-muted-foreground">{label}</p>
      <div className="mt-2 text-xl font-semibold tabular-nums">{children}</div>
      {note === undefined ? null : (
        <p className="mt-1 flex items-center gap-1 text-xs text-success">
          <TrendUpIcon className={ICON_SIZE.inline} aria-hidden />
          {note}
        </p>
      )}
    </div>
  );
}

function Meter({ percent, className }: { percent: number; className?: string }) {
  return (
    <span className="block h-2 w-full overflow-hidden rounded-full bg-muted">
      <span
        className={cn('block h-full rounded-full bg-primary', className)}
        style={extent('width', percent)}
      />
    </span>
  );
}

/** A button-shaped label. Not a control — these pictures are not interactive. */
function FakeButton({ children, quiet = false }: { children: ReactNode; quiet?: boolean }) {
  return (
    <span
      className={cn(
        'inline-flex h-8 items-center gap-2 rounded-md px-3 text-xs font-medium whitespace-nowrap',
        quiet ? 'border border-border bg-card' : 'bg-primary text-primary-foreground',
      )}
    >
      {children}
    </span>
  );
}

/* -------------------------------------------------------------------------- */
/* The hero dashboard                                                         */
/* -------------------------------------------------------------------------- */

const SIDEBAR = [
  { Icon: DashboardIcon, label: 'Dashboard', active: true },
  { Icon: StudentsIcon, label: 'Students' },
  { Icon: FeesIcon, label: 'Fees' },
  { Icon: AttendanceIcon, label: 'Attendance' },
  { Icon: ResultIcon, label: 'Exams' },
  { Icon: FinanceIcon, label: 'Finance' },
  { Icon: StaffIcon, label: 'Staff' },
  { Icon: TimetableIcon, label: 'Timetables' },
];

/** Six months of collection, as a share of the tallest bar. */
const COLLECTION = [
  { month: 'May', expected: 86, collected: 74 },
  { month: 'Jun', expected: 86, collected: 79 },
  { month: 'Jul', expected: 90, collected: 70 },
  { month: 'Aug', expected: 92, collected: 85 },
  { month: 'Sep', expected: 95, collected: 88 },
  { month: 'Oct', expected: 100, collected: 81 },
];

const CLASS_ATTENDANCE = [
  { name: 'Grade 1', percent: 98 },
  { name: 'Grade 4', percent: 94 },
  { name: 'Grade 7', percent: 91 },
  { name: 'Grade 9', percent: 88 },
  { name: 'Grade 10', percent: 96 },
];

const PAYMENTS: readonly {
  name: string;
  cls: string;
  voucher: string;
  amountMinor: number;
  status: string;
  tone: StatusTone;
  tint: string;
}[] = [
  {
    name: 'Ayesha Khan',
    cls: '7-B',
    voucher: 'V-2610-0412',
    amountMinor: 850_000,
    status: 'Paid',
    tone: 'success',
    tint: 'bg-tint-mint',
  },
  {
    name: 'Hamza Malik',
    cls: '5-A',
    voucher: 'V-2610-0398',
    amountMinor: 620_000,
    status: 'Partial',
    tone: 'warning',
    tint: 'bg-tint-butter',
  },
  {
    name: 'Zainab Ali',
    cls: '9-C',
    voucher: 'V-2610-0377',
    amountMinor: 1_150_000,
    status: 'Paid',
    tone: 'success',
    tint: 'bg-tint-lavender',
  },
  {
    name: 'Usman Tariq',
    cls: '3-A',
    voucher: 'V-2610-0351',
    amountMinor: 540_000,
    status: 'Overdue',
    tone: 'danger',
    tint: 'bg-tint-peach',
  },
];

export function DashboardMock() {
  return (
    <div className="flex bg-background text-foreground">
      <aside className="hidden w-52 shrink-0 border-e border-border bg-card p-4 md:block">
        <p className="px-2 text-base font-semibold">{BRAND.name}</p>
        <p className="mt-1 px-2 text-xs text-muted-foreground">Crescent Grammar School</p>
        <ul className="mt-6 space-y-1">
          {SIDEBAR.map(({ Icon, label, active }) => (
            <li
              key={label}
              className={cn(
                'flex items-center gap-3 rounded-md px-2 py-2 text-sm',
                active === true
                  ? 'bg-primary/10 font-medium text-primary'
                  : 'text-muted-foreground',
              )}
            >
              <Icon className={ICON_SIZE.inline} />
              {label}
            </li>
          ))}
        </ul>
      </aside>

      <div className="min-w-0 flex-1 p-4 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-lg font-semibold">Good morning, Sana</p>
            <p className="text-xs text-muted-foreground">Session 2026–27 · Term 1</p>
          </div>
          <div className="hidden items-center gap-2 sm:flex">
            <span className="flex h-8 w-48 items-center gap-2 rounded-md border border-border bg-card px-3 text-xs text-muted-foreground">
              <SearchIcon className={ICON_SIZE.inline} />
              Search students
            </span>
            <FakeButton>Generate vouchers</FakeButton>
          </div>
        </div>

        <div className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Stat label="Students" note="+38 this term">
            1,248
          </Stat>
          <Stat label="Present today">94.2%</Stat>
          <Stat label="Collected · October" note="81% of expected">
            <Money valueMinor={384_500_000} withSymbol className="text-xl font-semibold" />
          </Stat>
          <Stat label="Outstanding">
            <Money valueMinor={61_200_000} withSymbol className="text-xl font-semibold" />
          </Stat>
        </div>

        <div className="mt-3 grid gap-3 lg:grid-cols-3">
          <Panel
            title="Fee collection"
            className="lg:col-span-2"
            aside={
              <span className="flex items-center gap-4 text-xs text-muted-foreground">
                <span className="flex items-center gap-1">
                  <span className="size-2 rounded-full bg-border" /> Expected
                </span>
                <span className="flex items-center gap-1">
                  <span className="size-2 rounded-full bg-primary" /> Collected
                </span>
              </span>
            }
          >
            <div className="flex h-40 items-end gap-3 sm:gap-6">
              {COLLECTION.map((bar) => (
                <div key={bar.month} className="flex h-full flex-1 flex-col justify-end gap-2">
                  <div className="flex flex-1 items-end justify-center gap-1">
                    <span
                      className="w-full max-w-4 rounded-t-sm bg-border"
                      style={extent('height', bar.expected)}
                    />
                    <span
                      className="w-full max-w-4 rounded-t-sm bg-primary"
                      style={extent('height', bar.collected)}
                    />
                  </div>
                  <span className="text-center text-xs text-muted-foreground">{bar.month}</span>
                </div>
              ))}
            </div>
          </Panel>

          <Panel title="Attendance today" className="hidden lg:block">
            <ul className="space-y-3">
              {CLASS_ATTENDANCE.map((row) => (
                <li key={row.name}>
                  <div className="flex justify-between text-xs">
                    <span>{row.name}</span>
                    <span className="text-muted-foreground tabular-nums">{row.percent}%</span>
                  </div>
                  <div className="mt-1">
                    <Meter percent={row.percent} />
                  </div>
                </li>
              ))}
            </ul>
          </Panel>
        </div>

        <Panel
          title="Recent payments"
          className="mt-3"
          aside={<FakeButton quiet>View all</FakeButton>}
        >
          <ul className="divide-y divide-border">
            {PAYMENTS.map((row) => (
              <li key={row.voucher} className="flex items-center gap-3 py-2">
                <Initials name={row.name} tint={row.tint} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{row.name}</p>
                  <p className="text-xs text-muted-foreground">Class {row.cls}</p>
                </div>
                <span className="hidden font-mono text-xs text-muted-foreground sm:block">
                  {row.voucher}
                </span>
                <Money valueMinor={row.amountMinor} className="hidden w-24 text-end sm:block" />
                <StatusBadge tone={row.tone}>{row.status}</StatusBadge>
              </li>
            ))}
          </ul>
        </Panel>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* The four showcase screens                                                  */
/* -------------------------------------------------------------------------- */

export function FeesMock() {
  return (
    <div className="bg-background p-4 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-base font-semibold">Vouchers · October</p>
          <p className="text-xs text-muted-foreground">Grade 7 · 4 sections · 142 students</p>
        </div>
        <FakeButton>
          <FeesIcon className={ICON_SIZE.inline} />
          Generate 142 vouchers
        </FakeButton>
      </div>

      <div className="mt-4 rounded-xl border border-border bg-card p-4">
        <div className="flex items-baseline justify-between text-xs text-muted-foreground">
          <span>Collected against expected</span>
          <span className="tabular-nums">78%</span>
        </div>
        <div className="mt-2">
          <Meter percent={78} />
        </div>
        <div className="mt-3 flex flex-wrap gap-x-6 gap-y-1 text-xs">
          <span>
            Collected <Money valueMinor={94_120_000} withSymbol className="text-xs" />
          </span>
          <span className="text-muted-foreground">
            Expected <Money valueMinor={120_700_000} withSymbol className="text-xs" />
          </span>
        </div>
      </div>

      <ul className="mt-4 divide-y divide-border rounded-xl border border-border bg-card">
        {PAYMENTS.map((row) => (
          <li key={row.voucher} className="flex items-center gap-3 px-4 py-3">
            <span className="hidden w-24 font-mono text-xs text-muted-foreground sm:block">
              {row.voucher}
            </span>
            <span className="min-w-0 flex-1 truncate text-sm">{row.name}</span>
            <Money valueMinor={row.amountMinor} className="text-end sm:w-20" />
            <StatusBadge tone={row.tone}>{row.status}</StatusBadge>
          </li>
        ))}
      </ul>
    </div>
  );
}

const ROLL: readonly { name: string; mark: 'P' | 'A' | 'L'; tint: string }[] = [
  { name: 'Ali Raza', mark: 'P', tint: 'bg-tint-mint' },
  { name: 'Fatima Noor', mark: 'P', tint: 'bg-tint-lavender' },
  { name: 'Hassan Javed', mark: 'A', tint: 'bg-tint-peach' },
  { name: 'Maryam Siddiqui', mark: 'P', tint: 'bg-tint-butter' },
  { name: 'Omar Farooq', mark: 'L', tint: 'bg-tint-mint' },
];

function MarkToggle({ active }: { active: 'P' | 'A' | 'L' }) {
  return (
    <span className="inline-flex rounded-md border border-border bg-muted p-1 text-xs font-medium">
      {(['P', 'A', 'L'] as const).map((mark) => (
        <span
          key={mark}
          className={cn(
            'inline-flex size-6 items-center justify-center rounded-sm',
            mark === active
              ? mark === 'P'
                ? 'bg-success text-primary-foreground'
                : mark === 'A'
                  ? 'bg-danger text-primary-foreground'
                  : 'bg-warning text-primary-foreground'
              : 'text-muted-foreground',
          )}
        >
          {mark}
        </span>
      ))}
    </span>
  );
}

export function AttendanceMock() {
  return (
    <div className="bg-background p-4 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-base font-semibold">Grade 6-A · Mark attendance</p>
          <p className="text-xs text-muted-foreground">Thursday · Period 1 · 35 students</p>
        </div>
        <FakeButton quiet>Mark all present</FakeButton>
      </div>

      <ul className="mt-4 divide-y divide-border rounded-xl border border-border bg-card">
        {ROLL.map((row) => (
          <li key={row.name} className="flex items-center gap-3 px-4 py-3">
            <Initials name={row.name} tint={row.tint} />
            <span className="min-w-0 flex-1 truncate text-sm">{row.name}</span>
            <MarkToggle active={row.mark} />
          </li>
        ))}
      </ul>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-muted-foreground">
          <span className="font-medium text-foreground">32</span> present ·{' '}
          <span className="font-medium text-foreground">2</span> absent ·{' '}
          <span className="font-medium text-foreground">1</span> leave
        </p>
        <FakeButton>
          <ApproveIcon className={ICON_SIZE.inline} />
          Save attendance
        </FakeButton>
      </div>
    </div>
  );
}

const SUBJECTS = [
  { subject: 'English', obtained: 82, grade: 'A' },
  { subject: 'Urdu', obtained: 88, grade: 'A' },
  { subject: 'Mathematics', obtained: 94, grade: 'A+' },
  { subject: 'Science', obtained: 79, grade: 'B+' },
  { subject: 'Islamiat', obtained: 90, grade: 'A+' },
];

export function ResultsMock() {
  return (
    <div className="bg-background p-4 sm:p-6">
      <div className="rounded-xl border border-border bg-card p-4 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-4 border-b border-border pb-4">
          <div>
            <p className="tracking-label text-xs text-muted-foreground uppercase">
              Result card · First term
            </p>
            <p className="mt-2 text-lg font-semibold">Ayesha Khan</p>
            <p className="text-xs text-muted-foreground">
              Class 7-B · Adm. <span className="font-mono">CGS-1043</span>
            </p>
          </div>
          <div className="text-end">
            <p className="text-xl font-semibold tabular-nums">86.6%</p>
            <StatusBadge tone="success">Grade A</StatusBadge>
          </div>
        </div>
        <table className="mt-2 w-full text-sm">
          <thead>
            <tr className="text-xs text-muted-foreground">
              <th className="py-2 text-start font-medium">Subject</th>
              <th className="py-2 text-end font-medium">Marks</th>
              <th className="py-2 text-end font-medium">Grade</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {SUBJECTS.map((row) => (
              <tr key={row.subject}>
                <td className="py-2">{row.subject}</td>
                <td className="py-2 text-end tabular-nums">
                  {row.obtained}
                  <span className="text-muted-foreground"> / 100</span>
                </td>
                <td className="py-2 text-end font-medium">{row.grade}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

const EXPENSES = [
  { head: 'Salaries', minor: 182_000_000, percent: 100 },
  { head: 'Utilities', minor: 21_400_000, percent: 22 },
  { head: 'Maintenance', minor: 12_800_000, percent: 14 },
  { head: 'Stationery', minor: 6_300_000, percent: 8 },
];

export function FinanceMock() {
  return (
    <div className="bg-background p-4 sm:p-6">
      <p className="text-base font-semibold">October at a glance</p>
      <div className="mt-4 grid grid-cols-2 gap-3">
        <Stat label="Income">
          <Money valueMinor={384_500_000} withSymbol className="text-lg font-semibold sm:text-xl" />
        </Stat>
        <Stat label="Expenses">
          <Money valueMinor={222_500_000} withSymbol className="text-lg font-semibold sm:text-xl" />
        </Stat>
      </div>
      <Panel title="Expenses by head" className="mt-3">
        <ul className="space-y-3">
          {EXPENSES.map((row) => (
            <li key={row.head}>
              <div className="flex justify-between gap-3 text-xs">
                <span>{row.head}</span>
                <Money valueMinor={row.minor} className="text-xs text-muted-foreground" />
              </div>
              <div className="mt-1">
                <Meter percent={row.percent} />
              </div>
            </li>
          ))}
        </ul>
      </Panel>
      <div className="mt-3 flex items-center justify-between gap-3 rounded-xl border border-border bg-card px-4 py-3">
        <span className="text-sm">Day book · 23 Oct</span>
        <FakeButton quiet>Print and sign</FakeButton>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* The six portal previews                                                    */
/* -------------------------------------------------------------------------- */

export function AdminPreview() {
  return (
    <ProductFrame url="crescent.school/dashboard" label="The admin dashboard">
      <div className="bg-background p-4 sm:p-6">
        <div className="grid grid-cols-2 gap-3">
          <Stat label="Admissions this month" note="+12 vs September">
            46
          </Stat>
          <Stat label="Collected">
            <Money valueMinor={384_500_000} withSymbol className="text-xl font-semibold" />
          </Stat>
          <Stat label="Staff on payroll">74</Stat>
          <Stat label="Defaulters">
            <span className="text-danger">31</span>
          </Stat>
        </div>
        <Panel title="Needs your attention" className="mt-3">
          <ul className="space-y-2 text-sm">
            <li className="flex items-center justify-between gap-3">
              November vouchers not generated
              <StatusBadge tone="warning">Due</StatusBadge>
            </li>
            <li className="flex items-center justify-between gap-3">
              3 salary adjustments to approve
              <StatusBadge tone="info">Review</StatusBadge>
            </li>
          </ul>
        </Panel>
      </div>
    </ProductFrame>
  );
}

export function PrincipalPreview() {
  return (
    <ProductFrame url="crescent.school/attendance" label="The principal's attendance overview">
      <div className="bg-background p-4 sm:p-6">
        <div className="grid grid-cols-3 gap-3">
          <Stat label="Students in">94.2%</Stat>
          <Stat label="Staff in">71 / 74</Stat>
          <Stat label="Classes marked">38 / 40</Stat>
        </div>
        <Panel title="By class, today" className="mt-3">
          <ul className="space-y-3">
            {CLASS_ATTENDANCE.map((row) => (
              <li key={row.name} className="flex items-center gap-3">
                <span className="w-16 shrink-0 text-xs">{row.name}</span>
                <Meter percent={row.percent} />
                <span className="w-10 shrink-0 text-end text-xs text-muted-foreground tabular-nums">
                  {row.percent}%
                </span>
              </li>
            ))}
          </ul>
        </Panel>
      </div>
    </ProductFrame>
  );
}

const PERIODS = [
  { time: '08:00', cls: 'Grade 6-A', subject: 'Mathematics', done: true },
  { time: '08:45', cls: 'Grade 7-B', subject: 'Mathematics', done: true },
  { time: '10:15', cls: 'Grade 8-A', subject: 'Science', done: false },
  { time: '11:00', cls: 'Grade 6-C', subject: 'Mathematics', done: false },
];

export function TeacherPreview() {
  return (
    <PhoneFrame label="A teacher's day on the phone">
      <p className="text-xs text-muted-foreground">Thursday</p>
      <p className="text-base font-semibold">My classes today</p>
      <ul className="mt-4 space-y-2">
        {PERIODS.map((period) => (
          <li
            key={period.time}
            className="flex items-center gap-3 rounded-xl border border-border bg-card p-3"
          >
            <span className="text-xs text-muted-foreground tabular-nums">{period.time}</span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium">{period.cls}</span>
              <span className="block text-xs text-muted-foreground">{period.subject}</span>
            </span>
            {period.done ? (
              <ApproveIcon className={cn(ICON_SIZE.inline, 'text-success')} />
            ) : (
              <span className="text-xs font-medium text-primary">Mark</span>
            )}
          </li>
        ))}
      </ul>
      <div className="mt-4 flex justify-center">
        <FakeButton>Enter test marks</FakeButton>
      </div>
    </PhoneFrame>
  );
}

export function ParentPreview() {
  return (
    <PhoneFrame label="A parent's view of their child">
      <ParentMock />
    </PhoneFrame>
  );
}

/** The parent's phone screen, unframed — `PhoneFrame` or a gap card supplies the device. */
export function ParentMock() {
  return (
    <>
      <div className="flex items-center gap-3">
        <Initials name="Ayesha Khan" tint="bg-tint-mint" />
        <div>
          <p className="text-sm font-semibold">Ayesha Khan</p>
          <p className="text-xs text-muted-foreground">Class 7-B</p>
        </div>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-2">
        <div className="rounded-xl border border-border bg-card p-3">
          <p className="text-xs text-muted-foreground">Attendance</p>
          <p className="text-lg font-semibold tabular-nums">96%</p>
        </div>
        <div className="rounded-xl border border-border bg-card p-3">
          <p className="text-xs text-muted-foreground">First term</p>
          <p className="text-lg font-semibold">A</p>
        </div>
      </div>
      <div className="mt-2 rounded-xl border border-border bg-card p-3">
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs text-muted-foreground">November voucher</p>
          <StatusBadge tone="warning">Due</StatusBadge>
        </div>
        <Money valueMinor={850_000} withSymbol className="mt-1 block text-lg font-semibold" />
      </div>
      <div className="mt-2 flex gap-3 rounded-xl border border-border bg-card p-3">
        <NotificationsIcon className={cn(ICON_SIZE.inline, 'mt-1 shrink-0 text-primary')} />
        <p className="text-xs leading-relaxed">
          Parent–teacher meeting on Saturday at 10:00. Please confirm attendance.
        </p>
      </div>
    </>
  );
}

const ADMISSION_FIELDS = [
  { label: 'Student name', value: 'Ibrahim Shah' },
  { label: 'Class applying for', value: 'Grade 3' },
  { label: 'Guardian', value: 'Kamran Shah · Father' },
  { label: 'Admission no.', value: 'CGS-1287', mono: true },
];

export function OfficePreview() {
  return (
    <ProductFrame url="crescent.school/students/new" label="A new admission at the front desk">
      <AdmissionMock />
    </ProductFrame>
  );
}

export function AdmissionMock() {
  return (
    <div className="bg-background p-4 sm:p-6">
      <p className="text-base font-semibold">New admission</p>
      <p className="text-xs text-muted-foreground">Step 2 of 3 · Guardian details</p>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        {ADMISSION_FIELDS.map((field) => (
          <div key={field.label}>
            <p className="text-xs text-muted-foreground">{field.label}</p>
            <p
              className={cn(
                'mt-1 flex h-10 items-center rounded-md border border-border bg-card px-3 text-sm',
                field.mono === true && 'font-mono',
              )}
            >
              {field.value}
            </p>
          </div>
        ))}
      </div>
      <div className="mt-4 flex justify-end gap-2">
        <FakeButton quiet>Back</FakeButton>
        <FakeButton>Save and print challan</FakeButton>
      </div>
    </div>
  );
}

const SCHOOLS: readonly {
  name: string;
  city: string;
  students: string;
  status: string;
  tone: StatusTone;
}[] = [
  {
    name: 'Crescent Grammar School',
    city: 'Lahore',
    students: '1,248',
    status: 'Active',
    tone: 'success',
  },
  { name: 'Al-Huda Public School', city: 'Multan', students: '612', status: 'Trial', tone: 'info' },
  {
    name: 'The Oaks Academy',
    city: 'Islamabad',
    students: '904',
    status: 'Active',
    tone: 'success',
  },
  {
    name: 'Iqra Model School',
    city: 'Faisalabad',
    students: '377',
    status: 'Past due',
    tone: 'warning',
  },
];

export function PlatformPreview() {
  return (
    <ProductFrame url="admin.platform/schools" label="The platform console's school list">
      <div className="bg-background p-4 sm:p-6">
        <div className="flex items-center justify-between gap-3">
          <p className="text-base font-semibold">Schools</p>
          <FakeButton>Onboard a school</FakeButton>
        </div>
        <ul className="mt-4 divide-y divide-border rounded-xl border border-border bg-card">
          {SCHOOLS.map((school) => (
            <li key={school.name} className="flex items-center gap-3 px-4 py-3">
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium">{school.name}</span>
                <span className="block text-xs text-muted-foreground">{school.city}</span>
              </span>
              <span className="hidden text-xs text-muted-foreground tabular-nums sm:block">
                {school.students} students
              </span>
              <StatusBadge tone={school.tone}>{school.status}</StatusBadge>
            </li>
          ))}
        </ul>
      </div>
    </ProductFrame>
  );
}

/* -------------------------------------------------------------------------- */
/* The gap — the screens its cards peek at                                     */
/* -------------------------------------------------------------------------- */

const PROFILE_TABS = ['Profile', 'Guardians', 'Fees', 'Attendance', 'Results'];

/** Everything about one student on one screen — the answer to "scattered records". */
export function StudentProfileMock() {
  return (
    <div className="bg-background p-4 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Initials name="Ayesha Khan" tint="bg-tint-mint" />
          <div>
            <p className="text-base font-semibold">Ayesha Khan</p>
            <p className="text-xs text-muted-foreground">
              Class 7-B · Adm. <span className="font-mono">CGS-1043</span>
            </p>
          </div>
        </div>
        <StatusBadge tone="success">Enrolled</StatusBadge>
      </div>

      <ul className="mt-4 flex gap-1 overflow-hidden rounded-lg bg-muted p-1 text-xs font-medium">
        {PROFILE_TABS.map((tab, index) => (
          <li
            key={tab}
            className={cn(
              'rounded-md px-3 py-1 whitespace-nowrap',
              index === 0 ? 'bg-card text-foreground' : 'text-muted-foreground',
            )}
          >
            {tab}
          </li>
        ))}
      </ul>

      <div className="mt-4 grid grid-cols-2 gap-3">
        <div className="rounded-xl border border-border bg-card p-4">
          <p className="text-xs text-muted-foreground">Guardian</p>
          <p className="mt-2 text-sm font-semibold">Imran Khan · Father</p>
          <p className="text-xs text-muted-foreground tabular-nums">0300 1234567</p>
        </div>
        <div className="rounded-xl border border-border bg-card p-4">
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs text-muted-foreground">October voucher</p>
            <StatusBadge tone="success">Paid</StatusBadge>
          </div>
          <Money valueMinor={850_000} withSymbol className="mt-2 block text-sm font-semibold" />
        </div>
        <div className="rounded-xl border border-border bg-card p-4">
          <p className="text-xs text-muted-foreground">Attendance · this term</p>
          <p className="mt-2 text-sm font-semibold tabular-nums">96%</p>
          <div className="mt-2">
            <Meter percent={96} />
          </div>
        </div>
        <div className="rounded-xl border border-border bg-card p-4">
          <p className="text-xs text-muted-foreground">First term</p>
          <p className="mt-2 text-sm font-semibold tabular-nums">86.6% · Grade A</p>
          <p className="text-xs text-muted-foreground">Result card printed</p>
        </div>
      </div>
    </div>
  );
}
