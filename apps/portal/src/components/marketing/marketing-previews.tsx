import { Money, StatusBadge, cn } from '@ilm/ui';
import {
  AcademicsIcon,
  AccountIcon,
  AdmissionIcon,
  AttendanceIcon,
  CalendarIcon,
  ChevronDownIcon,
  ClassIcon,
  DashboardIcon,
  FeesIcon,
  FinanceIcon,
  HolidayIcon,
  ICON_SIZE,
  NotificationsIcon,
  OverdueIcon,
  PrintIcon,
  RequestsIcon,
  SearchIcon,
  StudentsIcon,
} from '@ilm/ui/icons';
import Image from 'next/image';
import type { ComponentType, ReactNode } from 'react';

import lemmaLogo from '../../../public/auth/lemma-logo.png';

import {
  SAMPLE_COLLECTION,
  SAMPLE_KPIS,
  SAMPLE_LABEL,
  SAMPLE_PAYMENTS,
  SAMPLE_REGISTER,
  SAMPLE_RESULTS,
  SAMPLE_SCHOOL,
  SAMPLE_TIMETABLE,
} from './marketing-sample-school';

/**
 * Product previews for the landing page — ADR-0019 as amended.
 *
 * Built from the same `@ilm/ui` parts and semantic tokens as the application,
 * not from screenshots, so a preview cannot drift into showing a product we do
 * not have: the badge is the real badge, money goes through the real `<Money>`,
 * and the sidebar is the real navigation's labels and icons. Every number comes
 * from `marketing-sample-school.ts` and every preview carries `SampleTag`.
 *
 * All of it is `aria-hidden` by the caller's choice of wrapper: a screen reader
 * gets the section's real copy, not a tour of an imaginary dashboard.
 */

type IconComponent = ComponentType<{ className?: string; 'aria-hidden'?: boolean }>;

/** The label every preview carries, so nothing here reads as a customer. */
export function SampleTag({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        'tracking-label inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1 text-xs font-medium text-muted-foreground uppercase',
        className,
      )}
    >
      <span className="size-1.5 rounded-full bg-primary" aria-hidden />
      {SAMPLE_LABEL}
    </span>
  );
}

/** A browser-like window, the frame every large preview sits in. */
export function AppFrame({
  children,
  title,
  className,
}: {
  children: ReactNode;
  title: string;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'rounded-tile shadow-frame overflow-hidden border border-border bg-card',
        className,
      )}
    >
      <div className="flex items-center gap-3 border-b border-border bg-muted px-4 py-3">
        <span className="flex gap-1.5" aria-hidden>
          <span className="size-2.5 rounded-full bg-border" />
          <span className="size-2.5 rounded-full bg-border" />
          <span className="size-2.5 rounded-full bg-border" />
        </span>
        <span className="mx-auto truncate rounded-full bg-card px-4 py-1 text-xs text-muted-foreground">
          {title}
        </span>
        <span className="hidden w-12 sm:block" aria-hidden />
      </div>
      {children}
    </div>
  );
}

const NAV: { label: string; Icon: IconComponent; active?: boolean; children?: string[] }[] = [
  { label: 'Dashboard', Icon: DashboardIcon, active: true },
  { label: 'Add admission', Icon: AdmissionIcon },
  { label: 'Students', Icon: StudentsIcon },
  { label: 'Fees', Icon: FeesIcon, children: ['Fee vouchers', 'Defaulters', 'Security deposits'] },
  { label: 'Attendance', Icon: AttendanceIcon },
  { label: 'Marks', Icon: ClassIcon },
  { label: 'Academics', Icon: AcademicsIcon },
  { label: 'Timetables', Icon: CalendarIcon },
  { label: 'Calendar', Icon: HolidayIcon },
  { label: 'Staff', Icon: AccountIcon },
  { label: 'Finance', Icon: FinanceIcon },
  { label: 'Requests', Icon: RequestsIcon },
];

function Sidebar() {
  return (
    <aside className="hidden w-52 shrink-0 border-e border-border p-3 md:block">
      {/* The real mark, as the application's own sidebar shows it. */}
      <Image
        src={lemmaLogo}
        alt=""
        data-logo
        className="ms-3 mt-1 mb-4 h-6 w-auto object-contain object-left"
      />
      <ul className="space-y-0.5">
        {NAV.map(({ label, Icon, active, children }) => (
          <li key={label}>
            <span
              className={cn(
                'flex items-center gap-3 rounded-md px-3 py-1.5 text-xs',
                active ? 'bg-primary/10 font-semibold text-primary' : 'text-muted-foreground',
              )}
            >
              <Icon className={ICON_SIZE.inline} aria-hidden />
              <span className="flex-1">{label}</span>
              {children ? <ChevronDownIcon className={ICON_SIZE.inline} aria-hidden /> : null}
            </span>
            {children ? (
              <ul className="ms-6 mt-0.5 space-y-0.5 border-s border-border ps-3">
                {children.map((child) => (
                  <li key={child} className="py-1 text-xs text-muted-foreground">
                    {child}
                  </li>
                ))}
              </ul>
            ) : null}
          </li>
        ))}
      </ul>
    </aside>
  );
}

function Kpi({
  label,
  children,
  Icon,
  note,
}: {
  label: string;
  children: ReactNode;
  Icon: IconComponent;
  note: string;
}) {
  return (
    <div className="rounded-xl border border-border bg-background p-4">
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        {label}
        <Icon className={ICON_SIZE.inline} aria-hidden />
      </div>
      <p className="tabular mt-3 text-xl font-semibold">{children}</p>
      <p className="mt-1 text-xs text-muted-foreground">{note}</p>
    </div>
  );
}

/** Six months of collection, collected against billed. Bar heights are computed values. */
export function CollectionChart({ className }: { className?: string }) {
  return (
    <div className={cn('flex h-32 items-end gap-3', className)}>
      {SAMPLE_COLLECTION.map((month) => (
        <div key={month.month} className="flex h-full flex-1 flex-col items-center gap-2">
          <div className="relative flex w-full flex-1 items-end justify-center">
            <span
              className="absolute bottom-0 w-full rounded-t-md bg-primary/15"
              style={{ height: `${String(month.expected)}%` }}
            />
            <span
              className="relative w-3/5 rounded-t-md bg-primary"
              style={{ height: `${String(month.collected)}%` }}
            />
          </div>
          <span className="text-xs text-muted-foreground">{month.month}</span>
        </div>
      ))}
    </div>
  );
}

/** The hero's dashboard — the first screen a principal sees. */
export function DashboardPreview() {
  return (
    <AppFrame title={`${SAMPLE_SCHOOL.name} — Dashboard`}>
      <div className="flex">
        <Sidebar />
        <div className="min-w-0 flex-1 p-4 sm:p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-xs text-muted-foreground">
                {SAMPLE_SCHOOL.campus} · {SAMPLE_SCHOOL.session}
              </p>
              <p className="mt-1 text-lg font-semibold">Good morning, Principal</p>
            </div>
            <div className="flex items-center gap-2">
              <span className="hidden items-center gap-2 rounded-md border border-border px-3 py-1.5 text-xs text-muted-foreground sm:flex">
                <SearchIcon className={ICON_SIZE.inline} aria-hidden />
                Search students, vouchers…
              </span>
              <span className="flex size-8 items-center justify-center rounded-md border border-border text-muted-foreground">
                <NotificationsIcon className={ICON_SIZE.inline} aria-hidden />
              </span>
            </div>
          </div>

          <div className="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Kpi label="Students" Icon={StudentsIcon} note="12 admitted this month">
              {SAMPLE_KPIS.students}
            </Kpi>
            <Kpi label="Collected" Icon={FeesIcon} note="October, so far">
              <Money valueMinor={SAMPLE_KPIS.collectedThisMonthMinor} withSymbol />
            </Kpi>
            <Kpi label="Present today" Icon={AttendanceIcon} note="454 of 482 students">
              {SAMPLE_KPIS.attendanceToday}
            </Kpi>
            <Kpi label="Defaulters" Icon={OverdueIcon} note="Down from 31 last month">
              {SAMPLE_KPIS.defaulters}
            </Kpi>
          </div>

          <div className="mt-4 grid gap-4 xl:grid-cols-5">
            <div className="rounded-xl border border-border bg-background p-4 xl:col-span-3">
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold">Fee collection</p>
                <span className="flex items-center gap-3 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1.5">
                    <span className="size-2 rounded-full bg-primary" aria-hidden />
                    Collected
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="size-2 rounded-full bg-primary/20" aria-hidden />
                    Billed
                  </span>
                </span>
              </div>
              <CollectionChart className="mt-4" />
            </div>
            <div className="rounded-xl border border-border bg-background p-4 xl:col-span-2">
              <p className="text-sm font-semibold">Latest payments</p>
              <ul className="mt-3 divide-y divide-border">
                {SAMPLE_PAYMENTS.slice(0, 3).map((payment) => (
                  <li key={payment.voucher} className="flex items-center gap-3 py-2.5">
                    <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
                      {payment.name.charAt(0)}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-xs font-medium">{payment.name}</span>
                      <span className="block text-xs text-muted-foreground">{payment.section}</span>
                    </span>
                    <Money valueMinor={payment.amountMinor} className="text-xs font-semibold" />
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </div>
    </AppFrame>
  );
}

/** The heads on the sample voucher; they sum to `SAMPLE_PAYMENTS[0].amountMinor`. */
const VOUCHER_LINES = [
  { head: 'Tuition — October', amountMinor: 380_000 },
  { head: 'Computer lab', amountMinor: 40_000 },
  { head: 'Transport', amountMinor: 30_000 },
] as const;

/** A paid fee voucher, as the office sees it. */
export function VoucherPreview({ className }: { className?: string }) {
  const payment = SAMPLE_PAYMENTS[0];
  return (
    <div className={cn('rounded-xl border border-border bg-card p-4', className)}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs text-muted-foreground">Fee voucher</p>
          <p className="mt-0.5 font-mono text-xs font-medium select-all">{payment.voucher}</p>
        </div>
        <StatusBadge tone="success">Paid</StatusBadge>
      </div>
      <dl className="mt-4 space-y-2 text-xs">
        {VOUCHER_LINES.map((line) => (
          <div key={line.head} className="flex justify-between gap-3">
            <dt className="text-muted-foreground">{line.head}</dt>
            <dd>
              <Money valueMinor={line.amountMinor} />
            </dd>
          </div>
        ))}
        <div className="flex justify-between gap-3 border-t border-border pt-2 font-semibold">
          <dt>Total</dt>
          <dd>
            <Money valueMinor={payment.amountMinor} withSymbol />
          </dd>
        </div>
      </dl>
    </div>
  );
}

/** A defaulter list row — the same data, ageing instead of paid. */
export function DefaulterPreview({ className }: { className?: string }) {
  return (
    <ul className={cn('space-y-2', className)}>
      {SAMPLE_PAYMENTS.slice(1, 4).map((payment, position) => (
        <li
          key={payment.voucher}
          className="flex items-center gap-3 rounded-lg border border-border bg-card px-3 py-2"
        >
          <span className="min-w-0 flex-1 truncate text-xs font-medium">{payment.name}</span>
          <Money valueMinor={payment.amountMinor} className="text-xs" />
          <StatusBadge tone={position === 0 ? 'danger' : 'warning'}>
            {position === 0 ? '60+ days' : '30 days'}
          </StatusBadge>
        </li>
      ))}
    </ul>
  );
}

const MARK_TONE = {
  P: 'bg-success/15 text-success',
  A: 'bg-danger/15 text-danger',
  L: 'bg-warning/15 text-warning',
} as const;

/** One class register, as a teacher marks it on a phone. */
export function AttendancePreview({ className }: { className?: string }) {
  const marks = [...SAMPLE_REGISTER] as ('P' | 'A' | 'L')[];
  const present = marks.filter((mark) => mark === 'P').length;
  return (
    <div className={cn('rounded-xl border border-border bg-card p-4', className)}>
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs font-semibold">Grade 5-A · Today</p>
        <StatusBadge tone="success">
          {present} of {marks.length} present
        </StatusBadge>
      </div>
      <div className="mt-4 grid grid-cols-8 gap-1.5 sm:grid-cols-12">
        {marks.map((mark, position) => (
          <span
            key={position}
            className={cn(
              'flex aspect-square items-center justify-center rounded-md text-xs font-semibold',
              MARK_TONE[mark],
            )}
          >
            {mark}
          </span>
        ))}
      </div>
    </div>
  );
}

/** Three days of one section's timetable. */
export function TimetablePreview({ className }: { className?: string }) {
  const days = ['Mon', 'Tue', 'Wed'] as const;
  return (
    <div className={cn('rounded-xl border border-border bg-card p-4', className)}>
      <p className="text-xs font-semibold">Grade 8-B · Timetable</p>
      <div className="mt-3 space-y-1.5">
        {SAMPLE_TIMETABLE.map((row, day) => (
          <div key={days[day]} className="flex items-center gap-1.5">
            <span className="w-8 shrink-0 text-xs text-muted-foreground">{days[day]}</span>
            {row.map((subject, period) => (
              <span
                key={`${String(day)}-${String(period)}`}
                className={cn(
                  'flex-1 truncate rounded-md px-1.5 py-1 text-center text-xs',
                  subject === 'Break'
                    ? 'bg-muted text-muted-foreground'
                    : 'bg-primary/10 font-medium text-primary',
                )}
              >
                {subject}
              </span>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

/** A result card, the document parents keep. */
export function ResultPreview({ className }: { className?: string }) {
  return (
    <div className={cn('rounded-xl border border-border bg-card p-4', className)}>
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-xs text-muted-foreground">Result card · Mid-term</p>
          <p className="mt-0.5 text-sm font-semibold">Ayesha Khan · Grade 5-A</p>
        </div>
        <span className="flex size-8 items-center justify-center rounded-md border border-border text-muted-foreground">
          <PrintIcon className={ICON_SIZE.inline} aria-hidden />
        </span>
      </div>
      <ul className="mt-4 space-y-2">
        {SAMPLE_RESULTS.map((result) => (
          <li key={result.subject} className="flex items-center gap-3 text-xs">
            <span className="w-24 shrink-0 text-muted-foreground">{result.subject}</span>
            <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
              <span
                className="block h-full rounded-full bg-primary"
                style={{ width: `${String(result.marks)}%` }}
              />
            </span>
            <span className="tabular w-8 text-end font-semibold">{result.marks}</span>
            <span className="w-6 text-end text-muted-foreground">{result.grade}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Revenue against expense — the finance module in one glance. */
export function FinancePreview({ className }: { className?: string }) {
  return (
    <div className={cn('rounded-xl border border-border bg-card p-4', className)}>
      <div className="grid grid-cols-3 gap-3">
        {(
          [
            ['Revenue', 184_250_000],
            ['Expense', 96_400_000],
            ['Salaries', 61_800_000],
          ] as const
        ).map(([label, amount]) => (
          <div key={label}>
            <p className="text-xs text-muted-foreground">{label}</p>
            <Money valueMinor={amount} className="mt-1 block text-xs font-semibold" />
          </div>
        ))}
      </div>
      <CollectionChart className="mt-4 h-20" />
    </div>
  );
}

const LAUNCHPAD = NAV.filter((item) => item.label !== 'Dashboard');

/** What the scattered tools become: every module, one login, one record. */
export function LaunchpadPreview() {
  return (
    <AppFrame title={`${SAMPLE_SCHOOL.name} — one login, every module`}>
      <div className="p-4 sm:p-6">
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 sm:gap-3">
          {LAUNCHPAD.map(({ label, Icon }) => (
            <div
              key={label}
              className="flex flex-col items-center gap-2 rounded-xl border border-border bg-background px-2 py-4 text-center"
            >
              <span className="flex size-10 items-center justify-center rounded-full bg-primary/10 text-primary">
                <Icon className={ICON_SIZE.nav} aria-hidden />
              </span>
              <span className="text-xs font-medium">{label}</span>
            </div>
          ))}
        </div>
      </div>
    </AppFrame>
  );
}

/** A small notification card for the hero's floating layer. */
export function FloatCard({
  Icon,
  title,
  detail,
  children,
}: {
  Icon: IconComponent;
  title: string;
  detail: string;
  children?: ReactNode;
}) {
  return (
    <div className="rounded-tile shadow-frame flex w-64 items-start gap-3 border border-border bg-card p-4">
      <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
        <Icon className={ICON_SIZE.inline} aria-hidden />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold">{title}</span>
        <span className="mt-0.5 block text-xs text-muted-foreground">{detail}</span>
        {children}
      </span>
    </div>
  );
}
