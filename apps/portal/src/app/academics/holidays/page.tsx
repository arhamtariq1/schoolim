import { normalizeHoliday, ROUTES, type AcademicSession, type Holiday } from '@ilm/contracts';
import { DEFAULT_TIMEZONE, systemClock, today } from '@ilm/utils';

import { HolidaysManager } from '@/components/holidays-manager';
import { apiFetch } from '@/lib/api';
import { getSession } from '@/lib/session';

/** Academics › Calendar — holidays, vacations and events, per session. */
export default async function HolidaysPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const query = await searchParams;
  const requested = typeof query['sessionId'] === 'string' ? query['sessionId'] : undefined;

  const [session, sessionsResult] = await Promise.all([
    getSession(),
    apiFetch<{ data: AcademicSession[] }>(ROUTES.academics.sessions),
  ]);

  const sessions = sessionsResult.ok ? sessionsResult.data.data : [];
  const activeSessionId =
    requested ?? sessions.find((entry) => entry.isCurrent)?.id ?? sessions[0]?.id;

  const holidaysResult =
    activeSessionId === undefined
      ? undefined
      : await apiFetch<{ data: Holiday[] }>(
          `${ROUTES.academics.holidays}?sessionId=${encodeURIComponent(activeSessionId)}`,
        );

  const todayDate = today(systemClock, session?.school.timezone ?? DEFAULT_TIMEZONE);

  return (
    <HolidaysManager
      holidays={
        holidaysResult?.ok === true ? holidaysResult.data.data.map(normalizeHoliday) : []
      }
      sessions={sessions}
      activeSessionId={activeSessionId}
      today={todayDate}
      error={holidaysResult !== undefined && !holidaysResult.ok ? holidaysResult.message : undefined}
      canConfigure={session?.permissions.includes('academics.structure.configure') ?? false}
    />
  );
}
