import { ROUTES, type AcademicSession, type Holiday } from '@ilm/contracts';

import { AppShell } from '@/components/app-shell';
import { HolidaysManager } from '@/components/holidays-manager';
import { AcademicsTabs } from '@/components/tab-links';
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
    <AppShell
      user={{ name: session?.name ?? '', roleLabel: session?.roles.join(', ') ?? '' }}
      school={{ name: session?.school.name ?? '' }}
      permissions={session?.permissions ?? []}
      unverifiedEmail={session === undefined || session.emailVerified ? undefined : session.email}
    >
      <div className="space-y-6">
        <AcademicsTabs />
        <HolidaysManager
          holidays={holidaysResult?.ok === true ? holidaysResult.data.data : []}
          sessions={sessions}
          activeSessionId={activeSessionId}
          error={
            holidaysResult !== undefined && !holidaysResult.ok ? holidaysResult.message : undefined
          }
          canConfigure={session?.permissions.includes('academics.structure.configure') ?? false}
        />
      </div>
    </AppShell>
  );
}
