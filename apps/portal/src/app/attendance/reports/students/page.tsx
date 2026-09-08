import { ROUTES, type ClassOverview } from '@ilm/contracts';
import type { Metadata } from 'next';

import { AppShell } from '@/components/app-shell';
import { AttendanceClassGrid } from '@/components/attendance-class-grid';
import { apiFetch } from '@/lib/api';
import { getSession } from '@/lib/session';

/** Attendance › Report › Students — pick a class, then read its month. */
export const metadata: Metadata = { title: 'Attendance report' };

const EMPTY: ClassOverview = {
  date: '',
  day: { date: '', isWorkingDay: false, reason: null, holidayName: null },
  classes: [],
};

export default async function StudentReportIndexPage() {
  const [session, result] = await Promise.all([
    getSession(),
    apiFetch<{ data: ClassOverview }>(ROUTES.attendance.classes),
  ]);

  return (
    <AppShell
      user={{ name: session?.name ?? '', roleLabel: session?.roles.join(', ') ?? '' }}
      school={{ name: session?.school.name ?? '' }}
      permissions={session?.permissions ?? []}
      unverifiedEmail={session === undefined || session.emailVerified ? undefined : session.email}
    >
      <div className="space-y-6">
        <AttendanceClassGrid
          overview={result.ok ? result.data.data : EMPTY}
          hrefPrefix="/attendance/reports/students"
          actionLabel="View report"
          title="Student attendance report"
          description="A month at a time, per class, with the percentage worked out against the days each child could actually have attended."
          showDatePicker={false}
          basePath="/attendance/reports/students"
          error={result.ok ? undefined : result.message}
        />
      </div>
    </AppShell>
  );
}
