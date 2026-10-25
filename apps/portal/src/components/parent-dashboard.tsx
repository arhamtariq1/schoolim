import {
  type ParentAttendance,
  type ParentChildProfile,
  type ParentChildSummary,
  type ParentVoucherList,
  type StudentMarkResult,
  type TimetableCalendarEvent,
  type TimetableDetail,
} from '@ilm/contracts';
import { Button, Card, DateDisplay, Money, StatusBadge } from '@ilm/ui';
import {
  AccountIcon,
  AttendanceIcon,
  FeesIcon,
  FileIcon,
  ICON_SIZE,
  ListViewIcon,
  SessionIcon,
  StudentsIcon,
  SuccessIcon,
  DateRangeIcon,
} from '@ilm/ui/icons';
import { minorUnits } from '@ilm/utils';
import Link from 'next/link';
import type { ReactNode } from 'react';

import { ChooseChildButton } from '@/components/parent-child-filter';
import { ParentMarksCard } from '@/components/parent-marks-card';
import { ParentRecentVouchersTable } from '@/components/parent-recent-vouchers-table';
import { WeeklyGrid } from '@/components/timetable-detail-view';
import { feeMonthLabel } from '@/lib/parent-vouchers-ui';
import { subjectIcon, subjectToneByName } from '@/lib/timetable-ui';

/** One child's line in the "All children" overview. */
export interface ChildOverview {
  child: ParentChildSummary;
  /** This month's attending share; null when nothing is marked or it could not be read. */
  attendancePercent: number | null;
  /** What is still owed on this child's vouchers, in minor units; null when not readable. */
  pendingMinor: number | null;
}

/** A result, with whose it is when several children's are listed together. */
export type ChildResult = StudentMarkResult & { studentName?: string };

/** A test or exam ahead, with whose it is when several children's are listed together. */
export interface UpcomingItem {
  event: TimetableCalendarEvent;
  who?: string;
}

/**
 * What a parent sees: all their children together, or one of them.
 *
 * Which is decided by the header's child filter. With `overview` the page draws
 * every child — a card each, then their attendance, tests, fees and results
 * added together, each row saying whose it is. Without it, the page draws the
 * one child's profile, timetable and the rest.
 *
 * Read-only on purpose — nothing here changes a record. The interactive parts are
 * links (pick a child, see all of something) and the button that saves a voucher
 * as a PDF. Every figure arrives from the parent routes, which start at the
 * signed-in guardian.
 */
export function ParentDashboard({
  kids,
  selectedId,
  overview,
  profile,
  attendance,
  marks,
  vouchers,
  weekly,
  upcoming,
  error,
}: {
  kids: readonly ParentChildSummary[];
  selectedId?: string | undefined;
  /** Present on the "All children" view, one entry per child. */
  overview?: readonly ChildOverview[] | undefined;
  profile?: ParentChildProfile | undefined;
  attendance?: ParentAttendance | undefined;
  marks?: readonly ChildResult[] | undefined;
  vouchers?: ParentVoucherList | undefined;
  /** The published weekly timetable of this child's class, if the school has one. */
  weekly?: TimetableDetail | undefined;
  upcoming: readonly UpcomingItem[];
  error?: string | undefined;
}) {
  const selected = kids.find((child) => child.id === selectedId);
  return (
    <div className="parent-portal w-full space-y-4">
      <header>
        <h1 className="text-xl font-semibold tracking-tight text-foreground md:text-2xl">
          My children
        </h1>
        <p className="text-sm leading-relaxed text-muted-foreground">
          {overview !== undefined
            ? `Showing all ${String(kids.length)} children together. Choose one in the header to see only theirs.`
            : kids.length > 1 && selected !== undefined
              ? `Showing ${selected.name} only. Choose “All children” in the header to see everyone.`
              : 'View your children’s profile, fees, attendance, timetable and test results.'}
        </p>
      </header>

      {error === undefined ? null : (
        <div
          role="alert"
          className="rounded-md border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-danger"
        >
          {error}
        </div>
      )}

      {kids.length === 0 ? (
        error === undefined ? (
          <Card className="px-6 py-12 text-center">
            <StudentsIcon
              className={`${ICON_SIZE.illustration} mx-auto text-muted-foreground`}
              aria-hidden="true"
            />
            <p className="mt-4 text-base font-medium text-foreground">No children linked yet</p>
            <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
              Children appear here once the school links them to your email address. If you expected
              to see someone, ask the school office to check the email on their record.
            </p>
          </Card>
        ) : null
      ) : (
        <>
          {overview === undefined ? null : (
            <>
              <nav aria-label="Your children" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {overview.map((line) => (
                  <ChildOverviewCard key={line.child.id} line={line} />
                ))}
              </nav>

              <div className="grid gap-3 lg:grid-cols-3">
                <AttendanceCard attendance={attendance} together />
                <UpcomingCard items={upcoming} />
                <FeeStatusCard vouchers={vouchers} />
              </div>

              <div className="grid gap-3 lg:grid-cols-2">
                <RecentVouchersCard vouchers={vouchers} showStudent />
                <ParentMarksCard marks={marks} />
              </div>
            </>
          )}

          {overview !== undefined || profile === undefined ? null : (
            <>
              <ProfileCard profile={profile} />

              <div className="grid gap-3 lg:grid-cols-3">
                <AttendanceCard attendance={attendance} />
                <UpcomingCard items={upcoming} />
                <FeeStatusCard vouchers={vouchers} childId={profile.id} />
              </div>

              <WeeklyTimetableCard timetable={weekly} className={profile.className} />

              <div className="grid gap-3 lg:grid-cols-2">
                <RecentVouchersCard vouchers={vouchers} childId={profile.id} />
                <ParentMarksCard marks={marks} />
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}

// --- The children ---------------------------------------------------------------

/**
 * One child on the "All children" view: who they are, and the two things a parent
 * checks first — this month's attendance and what is still owed. Its button
 * narrows every page to that child, the same as choosing them in the header.
 */
function ChildOverviewCard({ line }: { line: ChildOverview }) {
  const { child, attendancePercent, pendingMinor } = line;
  const placement = [
    child.className,
    child.sectionName === null ? null : `Section ${child.sectionName}`,
  ]
    .filter((part) => part !== null)
    .join(' · ');
  const owing = pendingMinor !== null && pendingMinor > 0;

  return (
    <Card className="flex flex-col gap-4 p-4">
      <div className="flex items-center gap-3">
        <ChildAvatar child={child} className="size-12 text-base" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-foreground">{child.name}</p>
          {placement === '' ? null : (
            <p className="truncate text-xs text-muted-foreground">{placement}</p>
          )}
          <p className="text-xs text-muted-foreground">GR No: {child.grNo}</p>
        </div>
        <StatusBadge tone={child.status === 'ACTIVE' ? 'success' : 'neutral'}>
          {child.status.charAt(0) + child.status.slice(1).toLowerCase()}
        </StatusBadge>
      </div>

      <dl className="grid grid-cols-2 divide-x divide-border rounded-lg bg-muted/40 py-2.5 text-center">
        <Figure label="Attendance this month">
          {attendancePercent === null ? '—' : `${String(attendancePercent)}%`}
        </Figure>
        <Figure label={owing ? 'Fees outstanding' : 'Fees'} danger={owing}>
          {pendingMinor === null ? (
            '—'
          ) : owing ? (
            <Money valueMinor={minorUnits(pendingMinor)} withSymbol />
          ) : (
            <span className="text-success">Paid up</span>
          )}
        </Figure>
      </dl>

      <ChooseChildButton childId={child.id}>
        See only {child.name.split(/\s+/)[0]}
      </ChooseChildButton>
    </Card>
  );
}

function ProfileCard({ profile }: { profile: ParentChildProfile }) {
  const placement = [
    profile.className,
    profile.sectionName === null ? null : `Section ${profile.sectionName}`,
  ]
    .filter((part) => part !== null)
    .join(' · ');
  const active = profile.status === 'ACTIVE';

  return (
    <Card className="flex flex-wrap items-center gap-x-8 gap-y-5 p-5 sm:p-6">
      <div className="flex min-w-0 items-center gap-4">
        <ChildAvatar child={profile} className="size-20 text-xl" />
        <div className="min-w-0">
          <h2 className="text-lg font-semibold text-foreground">{profile.name}</h2>
          {placement === '' ? null : <p className="text-sm text-muted-foreground">{placement}</p>}
          <p className="text-sm text-muted-foreground">GR No: {profile.grNo}</p>
        </div>
      </div>

      <dl className="flex flex-1 flex-wrap items-center gap-x-8 gap-y-4 lg:justify-center">
        <Fact icon={<DateRangeIcon className={ICON_SIZE.nav} aria-hidden />} label="Date of birth">
          {profile.dateOfBirth === null ? '—' : <DateDisplay value={profile.dateOfBirth} />}
        </Fact>
        <Fact icon={<SessionIcon className={ICON_SIZE.nav} aria-hidden />} label="Session">
          {profile.sessionName ?? '—'}
        </Fact>
        <Fact icon={<AccountIcon className={ICON_SIZE.nav} aria-hidden />} label="Admission date">
          {profile.admittedOn === null ? '—' : <DateDisplay value={profile.admittedOn} />}
        </Fact>
      </dl>

      <div
        className={`flex items-center gap-3 rounded-xl border px-4 py-3 ${
          active ? 'border-success/30 bg-success/10' : 'border-border bg-muted/40'
        }`}
      >
        <SuccessIcon
          className={`${ICON_SIZE.heading} ${active ? 'text-success' : 'text-muted-foreground'}`}
          aria-hidden
        />
        <div>
          <p className={`text-sm font-semibold ${active ? 'text-success' : 'text-foreground'}`}>
            {active
              ? 'Active student'
              : `${profile.status.charAt(0)}${profile.status.slice(1).toLowerCase()} student`}
          </p>
          <p className="text-xs text-muted-foreground">
            {active ? 'Currently enrolled' : 'Not currently enrolled'}
          </p>
        </div>
      </div>
    </Card>
  );
}

function Fact({ icon, label, children }: { icon: ReactNode; label: string; children: ReactNode }) {
  return (
    <div className="flex items-center gap-3 border-border lg:border-s lg:ps-6 lg:first:border-s-0 lg:first:ps-0">
      <span className="text-primary">{icon}</span>
      <div>
        <dt className="text-xs text-muted-foreground">{label}</dt>
        <dd className="text-sm font-semibold text-foreground">{children}</dd>
      </div>
    </div>
  );
}

// --- The cards --------------------------------------------------------------------

/** Nothing to show: an icon and one line, in the middle of the space the card has. */
function CardEmpty({ icon, children }: { icon: ReactNode; children: ReactNode }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 py-8 text-center">
      <span className="text-primary">{icon}</span>
      <p className="text-sm text-muted-foreground">{children}</p>
    </div>
  );
}

function CardTitle({
  icon,
  children,
  action,
}: {
  icon: ReactNode;
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <h2 className="flex items-center gap-2 text-sm font-semibold text-foreground">
        <span className="text-primary">{icon}</span>
        {children}
      </h2>
      {action}
    </div>
  );
}

function ViewAll({ href }: { href: string }) {
  return (
    <Button
      asChild
      size="sm"
      tone="outline"
      className="border-primary/30 bg-primary/10 text-primary hover:bg-primary/15"
    >
      <Link href={href}>View all</Link>
    </Button>
  );
}

/** A ring of the attending share, with who was where beside it. Colour is never the only message. */
function AttendanceCard({
  attendance,
  together = false,
}: {
  attendance: ParentAttendance | undefined;
  /** Every child's days added together, so "Total days" counts child-days. */
  together?: boolean;
}) {
  const marked = attendance?.markedDays ?? 0;
  const counts = attendance?.counts;
  const present = (counts?.PRESENT ?? 0) + (counts?.LATE ?? 0) + (counts?.HALF_DAY ?? 0);
  const absent = counts?.ABSENT ?? 0;
  const leave = (counts?.LEAVE ?? 0) + (counts?.EXCUSED ?? 0);
  const percent = attendance?.attendancePercent ?? null;

  const radius = 40;
  const circumference = 2 * Math.PI * radius;

  return (
    <Card className="flex flex-col gap-4 p-5">
      <CardTitle icon={<AttendanceIcon className={ICON_SIZE.nav} aria-hidden />}>
        Attendance{attendance === undefined ? '' : ` (${feeMonthLabel(attendance.month)})`}
        {together ? ' · all children' : ''}
      </CardTitle>

      {marked === 0 ? (
        <CardEmpty icon={<AttendanceIcon className={ICON_SIZE.illustration} aria-hidden />}>
          No attendance has been marked this month yet.
        </CardEmpty>
      ) : (
        <div className="flex flex-wrap items-center gap-6">
          <div className="relative size-32 shrink-0">
            <svg
              viewBox="0 0 100 100"
              className="size-full -rotate-90"
              role="img"
              aria-label={`${String(percent ?? 0)}% present`}
            >
              <circle
                cx="50"
                cy="50"
                r={radius}
                fill="none"
                strokeWidth="10"
                className="stroke-muted"
              />
              <circle
                cx="50"
                cy="50"
                r={radius}
                fill="none"
                strokeWidth="10"
                strokeLinecap="round"
                className="stroke-primary"
                strokeDasharray={`${String((circumference * (percent ?? 0)) / 100)} ${String(circumference)}`}
              />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-xl font-semibold text-foreground tabular-nums">
                {percent === null ? '—' : `${String(percent)}%`}
              </span>
              <span className="text-xs text-muted-foreground">Present</span>
            </div>
          </div>

          <dl className="min-w-40 flex-1 space-y-2 text-sm">
            <LegendRow dot="bg-primary" label="Present" value={present} />
            <LegendRow dot="bg-danger" label="Absent" value={absent} />
            <LegendRow dot="bg-warning" label="Leave" value={leave} />
            <div className="flex items-center justify-between gap-3 border-t border-border pt-2">
              <dt className="ps-5 text-muted-foreground">
                {together ? 'Total days, all children' : 'Total days'}
              </dt>
              <dd className="font-semibold text-foreground tabular-nums">{marked}</dd>
            </div>
          </dl>
        </div>
      )}
    </Card>
  );
}

function LegendRow({ dot, label, value }: { dot: string; label: string; value: number }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className="flex items-center gap-2 text-foreground">
        <span aria-hidden className={`size-2.5 rounded-full ${dot}`} />
        {label}
      </dt>
      <dd className="font-semibold text-foreground tabular-nums">{value}</dd>
    </div>
  );
}

function UpcomingCard({ items }: { items: readonly UpcomingItem[] }) {
  return (
    <Card className="flex flex-col gap-4 p-5">
      <CardTitle
        icon={<FileIcon className={ICON_SIZE.nav} aria-hidden />}
        action={<ViewAll href="/timetables" />}
      >
        Upcoming tests &amp; exams
      </CardTitle>

      {items.length === 0 ? (
        <CardEmpty icon={<FileIcon className={ICON_SIZE.illustration} aria-hidden />}>
          No tests or exams are scheduled yet.
        </CardEmpty>
      ) : (
        <ul className="space-y-2.5">
          {items.map(({ event, who }) => {
            const name = event.subject ?? event.title;
            const tone = subjectToneByName(name);
            const Icon = subjectIcon(name);
            return (
              <li
                key={`${event.key}-${who ?? ''}`}
                className="flex items-center gap-3 rounded-lg border border-border bg-muted/30 p-2.5"
              >
                <span
                  className={`flex size-10 shrink-0 items-center justify-center rounded-lg border ${tone.card}`}
                >
                  <Icon className={`${ICON_SIZE.nav} ${tone.icon}`} aria-hidden />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-foreground">
                    {event.title}
                    {event.subject === null ? '' : ` - ${event.subject}`}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {who === undefined ? null : (
                      <span className="font-medium text-foreground">{who} · </span>
                    )}
                    <DateDisplay value={event.date} />
                  </p>
                </div>
                <StatusBadge tone="info" showIcon={false}>
                  Upcoming
                </StatusBadge>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}

/** The voucher list, narrowed to one child when there is one. */
function vouchersHref(childId: string | undefined): string {
  return childId === undefined ? '/parent/vouchers' : `/parent/vouchers?studentId=${childId}`;
}

function FeeStatusCard({
  vouchers,
  childId,
}: {
  vouchers: ParentVoucherList | undefined;
  childId?: string;
}) {
  const totals = vouchers?.totals ?? { dueMinor: 0, paidMinor: 0, pendingMinor: 0 };
  const owing = totals.pendingMinor > 0;

  return (
    <Card className="flex flex-col gap-4 p-5">
      <CardTitle
        icon={<FeesIcon className={ICON_SIZE.nav} aria-hidden />}
        action={<ViewAll href={vouchersHref(childId)} />}
      >
        Fee status
      </CardTitle>

      <div
        className={`flex items-center gap-3 rounded-xl border px-4 py-4 ${
          owing ? 'border-danger/30 bg-danger/10' : 'border-success/30 bg-success/10'
        }`}
      >
        <SuccessIcon
          className={`${ICON_SIZE.heading} ${owing ? 'text-danger' : 'text-success'}`}
          aria-hidden
        />
        <div>
          <p
            className={`text-xl font-semibold tabular-nums ${owing ? 'text-danger' : 'text-success'}`}
          >
            <Money valueMinor={minorUnits(totals.pendingMinor)} withSymbol />
          </p>
          <p className="text-xs text-muted-foreground">
            {owing ? 'Total outstanding' : 'Nothing outstanding'}
          </p>
        </div>
      </div>

      <dl className="grid grid-cols-3 divide-x divide-border text-center">
        <Figure label="Total due">
          <Money valueMinor={minorUnits(totals.dueMinor)} withSymbol />
        </Figure>
        <Figure label="Paid">
          <Money valueMinor={minorUnits(totals.paidMinor)} withSymbol />
        </Figure>
        <Figure label="Pending" danger={owing}>
          <Money valueMinor={minorUnits(totals.pendingMinor)} withSymbol />
        </Figure>
      </dl>
    </Card>
  );
}

function Figure({
  label,
  danger = false,
  children,
}: {
  label: string;
  danger?: boolean;
  children: ReactNode;
}) {
  return (
    <div className="px-2">
      <dd
        className={`text-sm font-semibold tabular-nums ${danger ? 'text-danger' : 'text-foreground'}`}
      >
        {children}
      </dd>
      <dt className="text-xs text-muted-foreground">{label}</dt>
    </div>
  );
}

/** The weekly periods of the class this child is in — the same grid the timetable page draws. */
function WeeklyTimetableCard({
  timetable,
  className,
}: {
  timetable: TimetableDetail | undefined;
  className: string | null;
}) {
  return (
    <Card className="flex flex-col gap-4 p-5">
      <CardTitle
        icon={<DateRangeIcon className={ICON_SIZE.nav} aria-hidden />}
        action={<ViewAll href="/timetables" />}
      >
        Weekly timetable{className === null ? '' : ` · ${className}`}
      </CardTitle>

      {timetable === undefined || timetable.entries.length === 0 ? (
        <CardEmpty icon={<DateRangeIcon className={ICON_SIZE.illustration} aria-hidden />}>
          The weekly timetable for this class has not been published yet.
        </CardEmpty>
      ) : (
        <WeeklyGrid entries={timetable.entries} view="week" />
      )}
    </Card>
  );
}

function RecentVouchersCard({
  vouchers,
  childId,
  showStudent = false,
}: {
  vouchers: ParentVoucherList | undefined;
  childId?: string;
  showStudent?: boolean;
}) {
  const items = vouchers?.items ?? [];

  return (
    <Card className="flex flex-col gap-4 p-5">
      <CardTitle
        icon={<ListViewIcon className={ICON_SIZE.nav} aria-hidden />}
        action={<ViewAll href={vouchersHref(childId)} />}
      >
        Recent fee vouchers
      </CardTitle>

      <ParentRecentVouchersTable rows={items} showStudent={showStudent} />
    </Card>
  );
}

function ChildAvatar({
  child,
  className,
}: {
  child: { name: string; photoUrl: string | null };
  className?: string;
}) {
  const initials = child.name
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part.charAt(0))
    .slice(0, 2)
    .join('')
    .toUpperCase();

  return (
    <span
      aria-hidden="true"
      className={`flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-primary/10 font-semibold text-primary ${className ?? ''}`}
    >
      {child.photoUrl === null || child.photoUrl === '' ? (
        initials
      ) : (
        <img src={child.photoUrl} alt="" className="size-full object-cover" />
      )}
    </span>
  );
}
