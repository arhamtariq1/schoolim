import { ROUTES, type AcademicSession, type Holiday } from '@ilm/contracts';

import { HolidaysManager } from '@/components/holidays-manager';
import { SchoolShell } from '@/components/school-shell';
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

  return (
    <SchoolShell>
      <HolidaysManager
        holidays={holidaysResult?.ok === true ? holidaysResult.data.data : []}
        sessions={sessions}
        activeSessionId={activeSessionId}
        error={
          holidaysResult !== undefined && !holidaysResult.ok ? holidaysResult.message : undefined
        }
        canConfigure={session?.permissions.includes('academics.structure.configure') ?? false}
      />
    </SchoolShell>
  );
}
