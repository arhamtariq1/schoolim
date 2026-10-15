import {
  type ParentAttendance,
  type ParentChildProfile,
  type ParentChildSummary,
  type StudentMarkResult,
} from '@ilm/contracts';
import { Card, CardContent, CardHeader, CardTitle, DateDisplay, StatusBadge } from '@ilm/ui';
import { AttendanceIcon, ICON_SIZE, StudentsIcon } from '@ilm/ui/icons';
import type { Route } from 'next';
import Link from 'next/link';

import { ParentMarksCard } from '@/components/parent-marks-card';
import { WorkspacePageHeader } from '@/components/workspace-page-header';

type StatusTone = 'success' | 'warning' | 'danger' | 'info' | 'neutral';

const STATUS_LABELS: Record<string, { label: string; tone: StatusTone }> = {
  PRESENT: { label: 'Present', tone: 'success' },
  ABSENT: { label: 'Absent', tone: 'danger' },
  LATE: { label: 'Late', tone: 'warning' },
  LEAVE: { label: 'Leave', tone: 'info' },
  HALF_DAY: { label: 'Half day', tone: 'warning' },
  EXCUSED: { label: 'Excused', tone: 'info' },
};

/**
 * What a parent sees: their children, one at a time.
 *
 * Read-only on purpose — there is no form, button or action anywhere in this
 * file that changes a record. The only interactive element is the link that
 * switches child.
 */
export function ParentDashboard({
  name,
  kids,
  selectedId,
  profile,
  attendance,
  marks,
  error,
}: {
  name: string;
  kids: readonly ParentChildSummary[];
  selectedId?: string | undefined;
  profile?: ParentChildProfile | undefined;
  attendance?: ParentAttendance | undefined;
  marks?: readonly StudentMarkResult[] | undefined;
  error?: string | undefined;
}) {
  return (
    <div className="w-full space-y-6">
      <WorkspacePageHeader
        title={`Welcome, ${name}`}
        description="Your children’s profile, attendance and results in one place."
      />

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
              Children appear here once the school links them to your email address. If you
              expected to see someone, ask the school office to check the email on their record.
            </p>
          </Card>
        ) : null
      ) : (
        <>
          {kids.length > 1 ? (
            <nav aria-label="Switch child" className="flex flex-wrap gap-2">
              {kids.map((child) => (
                <Link
                  key={child.id}
                  href={`/parent?child=${child.id}` as Route}
                  aria-current={child.id === selectedId ? 'page' : undefined}
                  className={
                    child.id === selectedId
                      ? 'inline-flex items-center gap-2 rounded-full border border-primary bg-primary/10 py-1 ps-1 pe-4 text-sm font-medium text-primary'
                      : 'inline-flex items-center gap-2 rounded-full border border-border bg-card py-1 ps-1 pe-4 text-sm text-foreground transition-colors hover:bg-muted'
                  }
                >
                  <ChildAvatar child={child} className="size-8" />
                  {child.name}
                </Link>
              ))}
            </nav>
          ) : null}

          {profile === undefined ? null : (
            <div className="grid gap-4 lg:grid-cols-3">
              <ProfileCard profile={profile} />
              <div className="space-y-4 lg:col-span-2">
                <AttendanceCard attendance={attendance} />
                <ParentMarksCard marks={marks} />
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function ProfileCard({ profile }: { profile: ParentChildProfile }) {
  const placement = [profile.className, profile.sectionName].filter(Boolean).join(' · ');

  return (
    <Card>
      <CardContent className="flex flex-col items-center gap-3 px-6 pt-6 text-center">
        <ChildAvatar child={profile} className="size-24 text-xl" />
        <div className="space-y-1">
          <h2 className="text-lg font-semibold text-foreground">{profile.name}</h2>
          {placement === '' ? null : (
            <p className="text-sm text-muted-foreground">{placement}</p>
          )}
        </div>
        <StatusBadge tone={profile.status === 'ACTIVE' ? 'success' : 'neutral'}>
          {profile.status.charAt(0) + profile.status.slice(1).toLowerCase()}
        </StatusBadge>
      </CardContent>

      <dl className="mt-4 divide-y divide-border border-t border-border text-sm">
        <Detail label="GR number" value={profile.grNo} />
        <Detail label="Student ID" value={profile.studentCode} />
        <Detail label="Session" value={profile.sessionName} />
        <Detail label="Roll number" value={profile.rollNo === null ? null : String(profile.rollNo)} />
        <Detail
          label="Gender"
          value={
            profile.gender === null
              ? null
              : profile.gender.charAt(0) + profile.gender.slice(1).toLowerCase()
          }
        />
        <Detail
          label="Date of birth"
          value={profile.dateOfBirth === null ? null : <DateDisplay value={profile.dateOfBirth} />}
        />
        <Detail
          label="Admitted"
          value={profile.admittedOn === null ? null : <DateDisplay value={profile.admittedOn} />}
        />
        <Detail label="Address" value={profile.address} />
      </dl>
    </Card>
  );
}

function AttendanceCard({ attendance }: { attendance: ParentAttendance | undefined }) {
  return (
    <Card>
      <CardHeader className="flex-row items-center gap-2">
        <AttendanceIcon className={ICON_SIZE.heading} aria-hidden="true" />
        <CardTitle className="text-base">Attendance this month</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 px-4 py-4 sm:px-6">
        {attendance === undefined || attendance.markedDays === 0 ? (
          <p className="text-sm text-muted-foreground">
            No attendance has been marked this month yet.
          </p>
        ) : (
          <>
            <div className="flex flex-wrap items-end gap-x-6 gap-y-3">
              <div>
                <p className="text-3xl font-semibold tabular-nums text-foreground">
                  {attendance.attendancePercent === null
                    ? '—'
                    : `${String(attendance.attendancePercent)}%`}
                </p>
                <p className="text-xs text-muted-foreground">
                  of {attendance.markedDays} marked days
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                {Object.entries(STATUS_LABELS).map(([status, { label, tone }]) => {
                  const count = attendance.counts[status as keyof typeof attendance.counts];
                  return count === 0 ? null : (
                    <StatusBadge key={status} tone={tone}>
                      {label}: {count}
                    </StatusBadge>
                  );
                })}
              </div>
            </div>

            <ul className="divide-y divide-border rounded-md border border-border">
              {attendance.recent.map((entry) => {
                const status = STATUS_LABELS[entry.status];
                return (
                  <li
                    key={entry.date}
                    className="flex items-center justify-between gap-3 px-3 py-2 text-sm"
                  >
                    <DateDisplay value={entry.date} />
                    <span className="flex items-center gap-2">
                      {entry.note === null ? null : (
                        <span className="hidden text-xs text-muted-foreground sm:inline">
                          {entry.note}
                        </span>
                      )}
                      <StatusBadge tone={status?.tone ?? 'neutral'}>
                        {status?.label ?? entry.status}
                      </StatusBadge>
                    </span>
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </CardContent>
    </Card>
  );
}

function Detail({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 px-6 py-2.5">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="text-end font-medium text-foreground">
        {value === null || value === '' ? '—' : value}
      </dd>
    </div>
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
        // eslint-disable-next-line @next/next/no-img-element -- may be a data URL
        <img src={child.photoUrl} alt="" className="size-full object-cover" />
      )}
    </span>
  );
}
