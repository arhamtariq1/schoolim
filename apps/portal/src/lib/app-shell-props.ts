import type { SessionUser } from '@ilm/contracts';

import type { AppShellProps } from '@/components/app-shell';

/** Map session → AppShell props (shared by layout and legacy call sites). */
export function appShellPropsFromSession(
  session: SessionUser,
  options?: { contentWidth?: AppShellProps['contentWidth'] },
): Omit<AppShellProps, 'children'> {
  return {
    user: {
      name: session.name,
      email: session.email,
      roleLabel: session.roles.join(', '),
    },
    school: { name: session.school.name },
    permissions: session.permissions,
    profileCompleted: session.profileCompleted,
    unverifiedEmail: session.emailVerified ? undefined : session.email,
    brandColor: session.school.primaryColor ?? undefined,
    contentWidth: options?.contentWidth ?? 'default',
  };
}
