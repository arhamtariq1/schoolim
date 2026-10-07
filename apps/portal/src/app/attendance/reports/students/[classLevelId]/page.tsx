import { ROUTES, type MonthlyReport } from '@ilm/contracts';
import { systemClock } from '@ilm/utils';
import type { Metadata } from 'next';

import { AttendanceMonthGrid } from '@/components/attendance-month-grid';
import { apiFetch } from '@/lib/api';
import { getSession } from '@/lib/session';

/** Attendance › Report › Students › one class, one month. */
export const metadata: Metadata = { title: 'Attendance report' };

export default async function StudentReportPage({
  params,
  searchParams,
}: {
  params: Promise<{ classLevelId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ classLevelId }, query] = await Promise.all([params, searchParams]);
  const month =
    typeof query['month'] === 'string' && query['month'] !== ''
      ? query['month']
      : systemClock.now().toISOString().slice(0, 7);
  const q = typeof query['q'] === 'string' ? query['q'] : '';

  const search = new URLSearchParams({ month });
  if (q !== '') {
    search.set('q', q);
  }

  // `getSession` stays in the batch: the shell reads it from the request, but
  // dropping the call would change what this page fetches.
  const [, result] = await Promise.all([
    getSession(),
    apiFetch<{ data: MonthlyReport }>(
      `${ROUTES.attendance.studentReport(classLevelId)}?${search.toString()}`,
    ),
  ]);

  const empty: MonthlyReport = { month, title: '', days: [], workingDays: 0, rows: [] };
  const report = result.ok ? result.data.data : empty;

  return (
    <div className="space-y-6">
        <AttendanceMonthGrid
          report={report}
          basePath={`/attendance/reports/students/${classLevelId}`}
          filters={{ month, q }}
          heading={report.title === '' ? 'Attendance' : `${report.title} attendance`}
          codeLabel="GR"
          error={result.ok ? undefined : result.message}
        />
      </div>
  );
}
