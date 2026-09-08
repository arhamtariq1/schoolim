import { EmptyState } from '@ilm/ui';

import { AppShell } from '@/components/app-shell';
import { PageHeader } from '@/components/page-header';
import { getSession } from '@/lib/session';

/**
 * Requests — not built yet, but reachable from the sidebar, so it has to be a
 * real screen.
 *
 * It rendered a bare `<EmptyState>` with no shell before this: navigating to it
 * from the sidebar dropped a person onto a page with no navigation, no school
 * name and no way back except the browser's Back button. An unbuilt module is a
 * fine thing to say; stranding somebody is not.
 */
export default async function RequestsPage() {
  const session = await getSession();

  return (
    <AppShell
      user={{ name: session?.name ?? '', roleLabel: session?.roles.join(', ') ?? '' }}
      school={{ name: session?.school.name ?? '' }}
      permissions={session?.permissions ?? []}
      unverifiedEmail={session === undefined || session.emailVerified ? undefined : session.email}
    >
      <PageHeader
        title="Requests"
        description="Leave, transfers and approvals — the things a school routes to somebody for a decision."
      />

      <EmptyState
        title="Requests is not built yet"
        description="The foundations are in place — tenant isolation, authentication and the permission model. This module arrives with its phase in docs/14."
      />
    </AppShell>
  );
}
