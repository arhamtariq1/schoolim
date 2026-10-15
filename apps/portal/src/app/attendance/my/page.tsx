import { ROUTES, type MonthlyReport } from '@ilm/contracts';
import { systemClock } from '@ilm/utils';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { MonthlyAttendanceReportView } from '@/components/monthly-attendance-report-view';
import { apiFetch } from '@/lib/api';
import { getSession } from '@/lib/session';

/**
 * Attendance › My attendance.
 *
 * The signed-in member of staff's own month. The endpoint takes no id — it
 * finds the record from the session — so there is no way to ask for anybody
 * else's from this page.
 */
export const metadata: Metadata = { title: 'My attendance' };

export default async function MyAttendancePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const query = await searchParams;
  const month =
    typeof query['month'] === 'string' && query['month'] !== ''
      ? query['month']
      : systemClock.now().toISOString().slice(0, 7);

  const [session, result] = await Promise.all([
    getSession(),
    apiFetch<{ data: MonthlyReport }>(`${ROUTES.attendance.myReport}?month=${month}`),
  ]);

  // Not a screen for everybody: the school owner has no attendance of their own
  // to track. Hidden from the menu, and a typed address is a 404, not an error.
  if (!(session?.permissions.includes('attendance.own.read') ?? false)) {
    notFound();
  }

  const empty: MonthlyReport = { month, title: 'Me', days: [], workingDays: 0, rows: [] };

  return (
    <div className="space-y-6">
      <MonthlyAttendanceReportView
        variant="staff"
        report={result.ok ? result.data.data : empty}
        basePath="/attendance/my"
        filters={{ month, q: '' }}
        error={result.ok ? undefined : result.message}
      />
    </div>
  );
}
