import { ROUTES, type MonthlyReport } from '@ilm/contracts';
import { systemClock } from '@ilm/utils';
import type { Metadata } from 'next';

import { AppShell } from '@/components/app-shell';
import { AttendanceMonthGrid } from '@/components/attendance-month-grid';
import { apiFetch } from '@/lib/api';
import { getSession } from '@/lib/session';

/** Attendance › Report › Staff. */
export const metadata: Metadata = { title: 'Staff attendance report' };

export default async function StaffReportPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const query = await searchParams;
  const month =
    typeof query['month'] === 'string' && query['month'] !== ''
      ? query['month']
      : systemClock.now().toISOString().slice(0, 7);
  const q = typeof query['q'] === 'string' ? query['q'] : '';

  const search = new URLSearchParams({ month });
  if (q !== '') {
    search.set('q', q);
  }

  const [session, result] = await Promise.all([
    getSession(),
    apiFetch<{ data: MonthlyReport }>(`${ROUTES.attendance.staffReport}?${search.toString()}`),
  ]);

  const empty: MonthlyReport = { month, title: 'Staff', days: [], workingDays: 0, rows: [] };

  return (
    <AppShell
      user={{ name: session?.name ?? '', email: session?.email ?? '', roleLabel: session?.roles.join(', ') ?? '' }}
      school={{ name: session?.school.name ?? '' }}
      permissions={session?.permissions ?? []}
      profileCompleted={session?.profileCompleted ?? true}
      unverifiedEmail={session === undefined || session.emailVerified ? undefined : session.email}
    >
      <div className="space-y-6">
        <AttendanceMonthGrid
          report={result.ok ? result.data.data : empty}
          basePath="/attendance/reports/teachers"
          filters={{ month, q }}
          heading="Staff attendance"
          codeLabel="Emp"
          error={result.ok ? undefined : result.message}
        />
      </div>
    </AppShell>
  );
}
