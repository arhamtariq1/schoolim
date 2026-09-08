import { ROUTES, type Roster } from '@ilm/contracts';
import { systemClock } from '@ilm/utils';
import type { Metadata } from 'next';

import { AppShell } from '@/components/app-shell';
import { AttendanceRoster } from '@/components/attendance-roster';
import { apiFetch } from '@/lib/api';
import { getSession } from '@/lib/session';

/** Attendance › Mark › Students › one class. */
export const metadata: Metadata = { title: 'Mark attendance' };

export default async function ClassRosterPage({
  params,
  searchParams,
}: {
  params: Promise<{ classLevelId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ classLevelId }, query] = await Promise.all([params, searchParams]);
  const date =
    typeof query['date'] === 'string' && query['date'] !== ''
      ? query['date']
      : systemClock.now().toISOString().slice(0, 10);

  const [session, result] = await Promise.all([
    getSession(),
    apiFetch<{ data: Roster }>(`${ROUTES.attendance.roster(classLevelId)}?date=${date}`),
  ]);

  const empty: Roster = {
    classLevelId,
    className: '',
    date,
    day: { date, isWorkingDay: false, reason: null, holidayName: null },
    isEditable: false,
    lockedReason: null,
    markedAt: null,
    markedByName: null,
    students: [],
  };

  return (
    <AppShell
      user={{ name: session?.name ?? '', roleLabel: session?.roles.join(', ') ?? '' }}
      school={{ name: session?.school.name ?? '' }}
      permissions={session?.permissions ?? []}
      unverifiedEmail={session === undefined || session.emailVerified ? undefined : session.email}
    >
      <div className="space-y-6">
        <AttendanceRoster
          roster={result.ok ? result.data.data : empty}
          canMark={session?.permissions.includes('attendance.record.create') ?? false}
          error={result.ok ? undefined : result.message}
        />
      </div>
    </AppShell>
  );
}
