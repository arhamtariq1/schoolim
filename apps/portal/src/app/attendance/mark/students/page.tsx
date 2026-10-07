import { ROUTES, type ClassOverview } from '@ilm/contracts';
import type { Metadata } from 'next';

import { AttendanceClassGrid } from '@/components/attendance-class-grid';
import { apiFetch } from '@/lib/api';
import { getSession } from '@/lib/session';

/**
 * Attendance › Mark › Students.
 *
 * The date lives in the query string, so "the 3rd, where Grade 5 was never
 * marked" is a link somebody can send.
 */
export const metadata: Metadata = { title: 'Mark attendance' };

const EMPTY: ClassOverview = {
  date: '',
  day: { date: '', isWorkingDay: false, reason: null, holidayName: null },
  classes: [],
};

export default async function MarkStudentAttendancePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const date = typeof params['date'] === 'string' ? params['date'] : '';

  // `getSession` stays in the batch: the shell reads it from the request, but
  // dropping the call would change what this page fetches.
  const [, result] = await Promise.all([
    getSession(),
    apiFetch<{ data: ClassOverview }>(
      `${ROUTES.attendance.classes}${date === '' ? '' : `?date=${date}`}`,
    ),
  ]);

  return (
    <div className="space-y-6">
        <AttendanceClassGrid
          overview={result.ok ? result.data.data : EMPTY}
          hrefPrefix="/attendance/mark/students"
          hrefSuffix={date === '' ? '' : `?date=${date}`}
          actionLabel="Mark attendance"
          title="Mark student attendance"
          description="Pick a class. Everyone starts present, so you only tap the exceptions."
          basePath="/attendance/mark/students"
          error={result.ok ? undefined : result.message}
        />
      </div>
  );
}
