import { ROUTES, type AcademicSession } from '@ilm/contracts';

import { AppShell } from '@/components/app-shell';
import { SessionsManager } from '@/components/sessions-manager';
import { AcademicsTabs } from '@/components/tab-links';
import { apiFetch } from '@/lib/api';
import { getSession } from '@/lib/session';

/** Academics › Sessions — the school year, and which one is current. */
export default async function SessionsPage() {
  const [session, result] = await Promise.all([
    getSession(),
    apiFetch<{ data: AcademicSession[] }>(ROUTES.academics.sessions),
  ]);

  return (
    <AppShell
      user={{ name: session?.name ?? '', roleLabel: session?.roles.join(', ') ?? '' }}
      school={{ name: session?.school.name ?? '' }}
      permissions={session?.permissions ?? []}
      unverifiedEmail={session === undefined || session.emailVerified ? undefined : session.email}
    >
      <div className="space-y-6">
        <AcademicsTabs />
        <SessionsManager
          sessions={result.ok ? result.data.data : []}
          error={result.ok ? undefined : result.message}
          canConfigure={session?.permissions.includes('academics.structure.configure') ?? false}
        />
      </div>
    </AppShell>
  );
}
