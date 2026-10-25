import { headers } from 'next/headers';

import { DashboardLoading } from '@/components/dashboard/dashboard-loading';
import { pathUsesDashboardShell } from '@/lib/dashboard-shell-paths';
import { INNER_PATH_HEADER } from '@/proxy';

/**
 * Workspace routes only — auth and other pre-shell screens render with no
 * segment loader so login/sign-up paint the real layout on refresh.
 */
export default async function RootLoading() {
  const headerStore = await headers();
  const innerPath = headerStore.get(INNER_PATH_HEADER);

  if (!pathUsesDashboardShell(innerPath)) {
    return null;
  }

  return <DashboardLoading />;
}
