import type { ReactNode } from 'react';

import { AppShell } from '@/components/app-shell';
import { requireSchoolSession } from '@/lib/require-session';

/**
 * Authenticated school chrome: session gate + AppShell in one place.
 *
 * Every protected page should render through this rather than calling
 * `getSession` and wiring AppShell props by hand — that is how profile and
 * password gates drift out of sync with the sidebar.
 */
export async function SchoolShell({
  children,
  allowIncompleteProfile = false,
}: {
  children: ReactNode;
  allowIncompleteProfile?: boolean;
}) {
  const session = await requireSchoolSession({ allowIncompleteProfile });

  return (
    <AppShell
      user={{
        name: session.name,
        email: session.email,
        roleLabel: session.roles.join(', '),
      }}
      school={{ name: session.school.name }}
      permissions={session.permissions}
      profileCompleted={session.profileCompleted}
      unverifiedEmail={session.emailVerified ? undefined : session.email}
    >
      {children}
    </AppShell>
  );
}
