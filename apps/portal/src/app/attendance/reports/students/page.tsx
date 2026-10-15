import { ROUTES, type ClassOverview } from '@ilm/contracts';
import type { Metadata } from 'next';

import { AttendanceClassReportTable } from '@/components/attendance-class-report-table';
import { NoAcademicSessionState } from '@/components/no-academic-session-state';
import { WorkspacePageHeader } from '@/components/workspace-page-header';
import { isNoAcademicSessionError } from '@/lib/academic-session-error';
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
  // `getSession` stays in the batch: the shell reads it from the request, but
  // dropping the call would change what this page fetches.
  const [, result] = await Promise.all([
    getSession(),
    apiFetch<{ data: ClassOverview }>(ROUTES.attendance.classes),
  ]);

  if (!result.ok && isNoAcademicSessionError(result.message)) {
    return (
      <div className="w-full space-y-6">
        <WorkspacePageHeader
          title="Student attendance report"
          description="A month at a time, per class."
        />
        <NoAcademicSessionState />
      </div>
    );
  }

  return (
    <div className="space-y-6">
        <AttendanceClassReportTable
          overview={result.ok ? result.data.data : EMPTY}
          hrefPrefix="/attendance/reports/students"
          title="Student attendance report"
          description="A month at a time, per class, with the percentage worked out against the days each child could actually have attended."
          error={result.ok ? undefined : result.message}
        />
      </div>
  );
}
