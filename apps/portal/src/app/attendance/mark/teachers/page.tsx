import { ROUTES, type StaffRoster } from '@ilm/contracts';
import { systemClock } from '@ilm/utils';
import type { Metadata } from 'next';

import { StaffAttendanceRosterView } from '@/components/staff-attendance-roster';
import { apiFetch } from '@/lib/api';
import { getSession } from '@/lib/session';

/** Attendance › Mark › Staff. */
export const metadata: Metadata = { title: 'Staff attendance' };

export default async function MarkStaffAttendancePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const date = typeof params['date'] === 'string' ? params['date'] : '';

  const [session, result] = await Promise.all([
    getSession(),
    apiFetch<{ data: StaffRoster }>(
      `${ROUTES.attendance.staffRoster}${date === '' ? '' : `?date=${date}`}`,
    ),
  ]);

  const fallbackDate = date === '' ? systemClock.now().toISOString().slice(0, 10) : date;
  const empty: StaffRoster = {
    date: fallbackDate,
    day: { date: fallbackDate, isWorkingDay: false, reason: null, holidayName: null },
    isEditable: false,
    lockedReason: null,
    markedAt: null,
    staff: [],
  };

  return (
    <div className="space-y-6">
        <StaffAttendanceRosterView
          roster={result.ok ? result.data.data : empty}
          canMark={session?.permissions.includes('attendance.record.create') ?? false}
          error={result.ok ? undefined : result.message}
        />
      </div>
  );
}
