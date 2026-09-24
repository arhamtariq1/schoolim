import { ROUTES, type AcademicSession } from '@ilm/contracts';

import { SchoolShell } from '@/components/school-shell';
import { SessionsManager } from '@/components/sessions-manager';
import { apiFetch } from '@/lib/api';
import { getSession } from '@/lib/session';

/** Academics › Sessions — the school year, and which one is current. */
export default async function SessionsPage() {
  const [session, result] = await Promise.all([
    getSession(),
    apiFetch<{ data: AcademicSession[] }>(ROUTES.academics.sessions),
  ]);

  return (
    <SchoolShell>
      <SessionsManager
        sessions={result.ok ? result.data.data : []}
        error={result.ok ? undefined : result.message}
        canConfigure={session?.permissions.includes('academics.structure.configure') ?? false}
      />
    </SchoolShell>
  );
}
