import type { SessionUser } from '@ilm/contracts';
import { Button, CardContent, CardDescription, CardHeader, CardTitle } from '@ilm/ui';
import { AttendanceIcon, ClassIcon } from '@ilm/ui/icons';
import { DEFAULT_TIMEZONE, systemClock } from '@ilm/utils';
import Link from 'next/link';

import { DashboardAttendanceWeekChart } from '@/components/dashboard/dashboard-attendance-week-chart';
import { DashboardCard } from '@/components/dashboard/dashboard-card';
import {
  DashboardHeaderBand,
  timeBasedGreeting,
} from '@/components/dashboard/dashboard-header-band';
import { DashboardMonthCalendar } from '@/components/dashboard/dashboard-month-calendar';
import { DashboardStatCard } from '@/components/dashboard/dashboard-stat-card';
import type { DashboardWeeklyAttendance } from '@/lib/dashboard-data';
import { withTenantPrefix } from '@/lib/tenant-mode';

/**
 * The teacher's home — "Do my classes."
 *
 * ## Static, on purpose
 *
 * The salary, the attendance figures and the week's chart below are invented:
 * they have no summary endpoint behind them yet. **The classes and the student
 * head-count are real** — read from the attendance overview, which the API has
 * already narrowed to the teacher's own classes. When the remaining endpoints
 * exist, replace `TEACHER_DEMO`; nothing else here changes.
 *
 * There is deliberately no fee, voucher or admission widget: a teacher's home
 * must never show money or the school-wide picture.
 */

const TEACHER_DEMO = {
  /** Rupees, shown as a headline figure only. */
  monthlySalaryLabel: 'Rs 45,000',
  salaryNote: 'Paid on the 1st of every month',
  attendanceTodayPercent: 94,
  weeklyAttendance: [
    { label: 'Mon', present: 134, absent: 6, leave: 2 },
    { label: 'Tue', present: 137, absent: 4, leave: 1 },
    { label: 'Wed', present: 131, absent: 8, leave: 3 },
    { label: 'Thu', present: 139, absent: 2, leave: 1 },
    { label: 'Fri', present: 133, absent: 7, leave: 2 },
    { label: 'Sat', present: 128, absent: 10, leave: 4 },
  ] satisfies DashboardWeeklyAttendance[],
  events: [
    { id: 'e1', date: '', title: 'Monthly test — Grade 5 Maths', time: '09:00' },
  ],
} as const;

/** One of the teacher's own classes, read from the attendance overview. */
export interface TeacherClassCard {
  readonly classLevelId: string;
  readonly name: string;
  readonly students: number;
  readonly presentToday: number;
  /** False until somebody has taken today's register for the class. */
  readonly markedToday: boolean;
}

export function TeacherDashboard({
  session,
  tenantSlug,
  classes,
}: {
  session: SessionUser;
  tenantSlug: string | undefined;
  /** Only the classes assigned to this teacher — the API never sends another. */
  classes: readonly TeacherClassCard[];
}) {
  const demo = TEACHER_DEMO;
  const firstName = session.name.trim().split(/s+/)[0] ?? '';
  const greeting = timeBasedGreeting(firstName, session.school.timezone ?? DEFAULT_TIMEZONE);
  const today = systemClock.now().toISOString().slice(0, 10);
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
          value={String(classes.reduce((sum, entry) => sum + entry.students, 0))}
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
          value={`${String(demo.attendanceTodayPercent)}%`}
          description="Across all of my classes"
          href={hrefFor('/attendance/mark/students')}
          icon="AttendanceIcon"
          trend={{ label: '+2%', positive: true }}
        />
        <DashboardStatCard
          label="Monthly salary"
          value={demo.monthlySalaryLabel}
          description={demo.salaryNote}
          icon="FeesIcon"
        />
        <DashboardStatCard
          label="My attendance"
          value="22 / 24"
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
          <DashboardAttendanceWeekChart weekly={[...demo.weeklyAttendance]} />
        </div>
        <div className="flex h-full min-w-0 w-full">
          <DashboardMonthCalendar
            today={today}
            holidays={[]}
            events={demo.events.map((event) => ({ ...event, date: today }))}
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

