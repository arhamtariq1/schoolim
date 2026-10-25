import type { SessionUser, TeacherDashboard as TeacherDashboardData } from '@ilm/contracts';
import { Button, CardContent, CardDescription, CardHeader, CardTitle } from '@ilm/ui';
import { AttendanceIcon, ClassIcon } from '@ilm/ui/icons';
import { DEFAULT_TIMEZONE } from '@ilm/utils';
import Link from 'next/link';

import { DashboardAttendanceWeekChart } from '@/components/dashboard/dashboard-attendance-week-chart';
import { DashboardCard } from '@/components/dashboard/dashboard-card';
import {
  DashboardHeaderBand,
  timeBasedGreeting,
} from '@/components/dashboard/dashboard-header-band';
import { DashboardMonthCalendar } from '@/components/dashboard/dashboard-month-calendar';
import { DashboardStatCard } from '@/components/dashboard/dashboard-stat-card';
import { formatMinorExact } from '@/components/dashboard/dashboard-chart-theme';
import { withTenantPrefix } from '@/lib/tenant-mode';

/**
 * The teacher's home — "Do my classes."
 *
 * Everything here is read from the dashboard API, which has already narrowed it
 * to the teacher's own classes and their own record. There is deliberately no
 * fee, voucher or admission widget: a teacher's home must never show money or
 * the school-wide picture.
 */

export function TeacherDashboard({
  session,
  tenantSlug,
  data,
}: {
  session: SessionUser;
  tenantSlug: string | undefined;
  /** Only this teacher's classes and record — the API never sends another. */
  data: TeacherDashboardData;
}) {
  const classes = data.classes;
  const firstName = session.name.trim().split(/s+/)[0] ?? '';
  const greeting = timeBasedGreeting(firstName, session.school.timezone ?? DEFAULT_TIMEZONE);
  const today = data.todayDate;
  // Tenant-aware, so the links also work when the portal runs in path mode.
  const hrefFor = (path: string): string => withTenantPrefix(path, tenantSlug);

  return (
    <div className="w-full space-y-3">
      <DashboardHeaderBand greeting={greeting} schoolName={session.school.name} />

      <section
        aria-label="Summary"
        className="grid auto-rows-fr grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4"
      >
        <DashboardStatCard
          label="My students"
          value={String(data.studentCount)}
          description={
            classes.length === 0
              ? 'No classes assigned yet'
              : `Across ${String(classes.length)} assigned class${classes.length === 1 ? '' : 'es'}`
          }
          href={hrefFor('/students')}
          icon="StudentsIcon"
        />
        <DashboardStatCard
          label="Present today"
          value={data.attendanceTodayPercent === null ? '—' : `${String(data.attendanceTodayPercent)}%`}
          description={
            data.attendanceTodayPercent === null
              ? 'No register taken yet today'
              : 'Across all of my classes'
          }
          href={hrefFor('/attendance/mark/students')}
          icon="AttendanceIcon"
        />
        <DashboardStatCard
          label="Monthly salary"
          value={data.monthlySalaryMinor === null ? '—' : formatMinorExact(data.monthlySalaryMinor)}
          description={
            data.lastSalaryPaidOn === null ? 'No salary paid yet' : `Last paid ${data.lastSalaryPaidOn}`
          }
          icon="FeesIcon"
        />
        <DashboardStatCard
          label="My attendance"
          value={
            data.myAttendance === null || data.myAttendance.markedDays === 0
              ? '—'
              : `${String(data.myAttendance.presentDays)} / ${String(data.myAttendance.markedDays)}`
          }
          description="Days present this month"
          href={hrefFor('/attendance/my')}
          icon="AccountIcon"
        />
      </section>

      <section
        aria-label="Attendance and calendar"
        className="grid w-full gap-3 lg:grid-cols-[minmax(0,1.65fr)_minmax(0,1fr)] lg:items-stretch"
      >
        <div className="flex h-full min-w-0 w-full">
          <DashboardAttendanceWeekChart weekly={data.weeklyAttendance} />
        </div>
        <div className="flex h-full min-w-0 w-full">
          <DashboardMonthCalendar
            today={today}
            holidays={data.calendarHolidays}
            events={data.upcomingEvents}
          />
        </div>
      </section>

      <DashboardCard>
        <CardHeader className="flex flex-row items-start justify-between gap-3">
          <div className="space-y-1">
            <CardTitle className="text-lg">My classes</CardTitle>
            <CardDescription>Only the classes assigned to you.</CardDescription>
          </div>
          <Button asChild tone="outline" size="sm">
            <Link href={hrefFor('/marks')}>Enter marks</Link>
          </Button>
        </CardHeader>
        <CardContent>
          {classes.length === 0 ? (
            <p className="rounded-xl border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">
              No class is assigned to you yet. The school office assigns classes on your staff
              record — once they do, they appear here.
            </p>
          ) : null}
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {classes.map((entry) => (
              <li key={entry.classLevelId}>
                <Link
                  href={hrefFor(`/attendance/mark/students/${entry.classLevelId}`)}
                  className="flex items-center gap-3 rounded-xl border border-border bg-card p-4 transition-colors hover:border-primary/35 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                >
                  <span className="flex size-10 items-center justify-center rounded-full bg-primary/10 text-primary">
                    <ClassIcon className="size-5" aria-hidden="true" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-semibold text-foreground">{entry.name}</span>
                    <span className="block text-xs text-muted-foreground">
                      {entry.students} student{entry.students === 1 ? '' : 's'} ·{' '}
                      {entry.markedToday
                        ? `${String(entry.presentToday)} present today`
                        : 'attendance not marked today'}
                    </span>
                  </span>
                  <AttendanceIcon className="size-4 text-muted-foreground" aria-hidden="true" />
                </Link>
              </li>
            ))}
          </ul>
        </CardContent>
      </DashboardCard>
    </div>
  );
}

