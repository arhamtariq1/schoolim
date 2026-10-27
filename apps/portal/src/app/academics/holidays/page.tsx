import {
  MAX_CALENDAR_DAYS,
  normalizeHoliday,
  ROUTES,
  type AcademicSession,
  type Holiday,
  type TimetableCalendarEvent,
} from '@ilm/contracts';
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

  // Class periods, tests and exams, read from the timetables for the session. The
  // API narrows them to what this person may see; someone with no timetable
  // access simply has none. The span is capped by the API, so a long session is
  // trimmed to its first year rather than refused.
  const activeSession = sessions.find((entry) => entry.id === activeSessionId);
  const canSeeTimetables = session?.permissions.includes('academics.timetable.read') ?? false;
  const scheduledResult =
    activeSession === undefined || !canSeeTimetables
      ? undefined
      : await apiFetch<{ data: TimetableCalendarEvent[] }>(
          `${ROUTES.timetables.calendar}?${new URLSearchParams({
            from: String(activeSession.startDate).slice(0, 10),
            to: lastDayWithin(
              String(activeSession.startDate).slice(0, 10),
              String(activeSession.endDate).slice(0, 10),
            ),
          }).toString()}`,
        );

  const todayDate = today(systemClock, session?.school.timezone ?? DEFAULT_TIMEZONE);

  return (
    <HolidaysManager
      holidays={holidaysResult?.ok === true ? holidaysResult.data.data.map(normalizeHoliday) : []}
      sessions={sessions}
      activeSessionId={activeSessionId}
      scheduled={scheduledResult?.ok === true ? scheduledResult.data.data : []}
      today={todayDate}
      error={
        holidaysResult !== undefined && !holidaysResult.ok ? holidaysResult.message : undefined
      }
      canConfigure={session?.permissions.includes('academics.structure.configure') ?? false}
    />
  );
}

/** The later of nothing and the end, but never more than the API will expand in one go. */
function lastDayWithin(from: string, to: string): string {
  const limit = new Date(`${from}T00:00:00.000Z`);
  limit.setUTCDate(limit.getUTCDate() + MAX_CALENDAR_DAYS - 1);
  const capped = limit.toISOString().slice(0, 10);
  return to < capped ? to : capped;
}
