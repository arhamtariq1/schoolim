import { ROUTES, type AcademicSession, type ClassLevel } from '@ilm/contracts';

import { AppShell } from '@/components/app-shell';
import { ClassesManager } from '@/components/classes-manager';
import { AcademicsTabs } from '@/components/tab-links';
import { apiFetch } from '@/lib/api';
import { getSession } from '@/lib/session';

/**
 * Academics — classes and sections.
 *
 * Sessions and the calendar are sibling routes rather than tabs inside one
 * page, so each is linkable and each fetches only what it needs. The tab strip
 * is shared navigation, not a client-side switcher hiding three payloads behind
 * one URL.
 *
 * `sessionId` lives in the query string: a school setting up next year wants to
 * send that view to a colleague, and a filter held in component state cannot be
 * sent to anyone.
 */
export default async function AcademicsPage({
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
  // Fall back to the current session, then to the most recent one — a school
  // whose current session is not set should still see something.
  const activeSessionId =
    requested ?? sessions.find((entry) => entry.isCurrent)?.id ?? sessions[0]?.id;

  const classesResult = await apiFetch<{ data: ClassLevel[] }>(
    activeSessionId === undefined
      ? ROUTES.academics.classes
      : `${ROUTES.academics.classes}?sessionId=${encodeURIComponent(activeSessionId)}`,
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
        <ClassesManager
          classes={classesResult.ok ? classesResult.data.data : []}
          sessions={sessions}
          activeSessionId={activeSessionId}
          error={classesResult.ok ? undefined : classesResult.message}
          canConfigure={session?.permissions.includes('academics.structure.configure') ?? false}
        />
      </div>
    </AppShell>
  );
}
