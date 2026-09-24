import { ROUTES, type AcademicSession, type ClassLevel } from '@ilm/contracts';

import { ClassesManager } from '@/components/classes-manager';
import { SchoolShell } from '@/components/school-shell';
import { apiFetch } from '@/lib/api';
import { getSession } from '@/lib/session';

/**
 * Classes and sections for the active academic session.
 *
 * Sessions and the calendar live under Academics in the sidebar. The old
 * `/academics` URL redirects here.
 */
export default async function ClassesPage({
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

  const classesResult = await apiFetch<{ data: ClassLevel[] }>(
    activeSessionId === undefined
      ? ROUTES.academics.classes
      : `${ROUTES.academics.classes}?sessionId=${encodeURIComponent(activeSessionId)}`,
  );

  return (
    <SchoolShell>
      <ClassesManager
        classes={classesResult.ok ? classesResult.data.data : []}
        sessions={sessions}
        activeSessionId={activeSessionId}
        error={classesResult.ok ? undefined : classesResult.message}
        canConfigure={session?.permissions.includes('academics.structure.configure') ?? false}
      />
    </SchoolShell>
  );
}
