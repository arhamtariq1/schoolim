import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import type { ReactNode } from 'react';

import { ROUTES, type SchoolLogoInfo } from '@ilm/contracts';

import { AppShell } from '@/components/app-shell';
import { apiFetch } from '@/lib/api';
import { appShellPropsFromSession } from '@/lib/app-shell-props';
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

  const logoResult = await apiFetch<{ data: SchoolLogoInfo }>(ROUTES.schoolLogo.info);
  const schoolLogo: SchoolLogoInfo = logoResult.ok ? logoResult.data.data : ABSENT_SCHOOL_LOGO;

  return (
    <AppShell {...appShellPropsFromSession(session, { schoolLogo })}>
      {children}
    </AppShell>
  );
}
