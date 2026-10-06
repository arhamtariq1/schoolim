import { EmptyState } from '@ilm/ui';

import { PageHeader } from '@/components/page-header';

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
  return (
    <div className="space-y-6">
      <PageHeader
        title="Requests"
        description="Leave, transfers and approvals — the things a school routes to somebody for a decision."
      />

      <EmptyState
        title="Requests is not built yet"
        description="The foundations are in place — tenant isolation, authentication and the permission model. This module arrives with its phase in docs/14."
      />
    </div>
  );
}
