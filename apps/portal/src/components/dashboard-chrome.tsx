import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import type { ReactNode } from 'react';

import { ROUTES, type SchoolLogoInfo } from '@ilm/contracts';

import { AppShell } from '@/components/app-shell';
import { apiFetch } from '@/lib/api';
import { appShellPropsFromSession } from '@/lib/app-shell-props';
import { loadParentChildren } from '@/lib/parent-children';
import { ABSENT_SCHOOL_LOGO } from '@/lib/school-logo-shell';
import { pathUsesDashboardShell } from '@/lib/dashboard-shell-paths';
import { getSession } from '@/lib/session';
import { INNER_PATH_HEADER } from '@/proxy';

/**
 * Wraps authenticated workspace pages in the persistent AppShell.
 *
 * Lives in the root layout so sidebar and header survive navigations and
 * segment-level `loading.tsx` boundaries — only `{children}` swap.
 */
export async function DashboardChrome({ children }: { children: ReactNode }) {
  const headerStore = await headers();
  const innerPath = headerStore.get(INNER_PATH_HEADER);

  if (!pathUsesDashboardShell(innerPath)) {
    return children;
  }

  const session = await getSession();
  if (session === undefined) {
    return children;
  }

  if (session.mustChangePassword && innerPath !== '/settings/password') {
    redirect('/settings/password');
  }

  const allowIncompleteProfile = innerPath === '/profile/create';
  if (!session.profileCompleted && !allowIncompleteProfile) {
    redirect('/profile/create');
  }

  // A parent's children and the chosen one, for the header's child filter — on
  // every page, since the choice holds everywhere until the parent changes it.
  const [logoResult, family] = await Promise.all([
    apiFetch<{ data: SchoolLogoInfo }>(ROUTES.schoolLogo.info),
    session.permissions.includes('parent.child.read')
      ? loadParentChildren()
      : Promise.resolve(undefined),
  ]);
  const schoolLogo: SchoolLogoInfo = logoResult.ok ? logoResult.data.data : ABSENT_SCHOOL_LOGO;
  const parentChildren =
    family === undefined || family.error !== undefined
      ? undefined
      : {
          kids: family.kids.map((child) => ({ id: child.id, name: child.name })),
          selectedId: family.selected?.id,
        };

  return (
    <AppShell
      {...appShellPropsFromSession(session, { schoolLogo })}
      parentChildren={parentChildren}
    >
      {children}
    </AppShell>
  );
}
