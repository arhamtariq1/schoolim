import { SCHOOL_ROLE_LABELS, type SchoolLogoInfo, type SessionUser } from '@ilm/contracts';

import type { AppShellProps } from '@/components/app-shell';

/** Map session → AppShell props (shared by layout and legacy call sites). */
export function appShellPropsFromSession(
  session: SessionUser,
  options?: {
    schoolLogo?: SchoolLogoInfo;
  },
): Omit<AppShellProps, 'children'> {
  return {
    user: {
      name: session.name,
      email: session.email,
      roleLabel: [...new Set(session.roles.map((role) => SCHOOL_ROLE_LABELS[role]))].join(', '),
      avatarUrl: session.avatarUrl ?? null,
    },
    school: { name: session.school.name },
    permissions: session.permissions,
    profileCompleted: session.profileCompleted,
    unverifiedEmail: session.emailVerified ? undefined : session.email,
    brandColor: session.school.primaryColor ?? undefined,
    schoolLogo: options?.schoolLogo,
  };
}
