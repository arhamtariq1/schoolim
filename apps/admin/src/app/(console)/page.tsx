import { ROUTES, type PlatformOverview } from '@ilm/contracts';
import { ErrorState } from '@ilm/ui';
import { redirect } from 'next/navigation';

import { OverviewView } from '@/components/overview-view';
import { apiFetch, getPlatformSession } from '@/lib/api';

export const metadata = { title: 'Overview' };

/**
 * The console landing page: how many schools, in what state, and which trials
 * are about to lapse. Counts only: the same rule as the school list.
 */
export default async function OverviewPage() {
  const session = await getPlatformSession();
  if (session === undefined) {
    redirect('/login');
  }

  const result = await apiFetch<{ data: PlatformOverview }>(ROUTES.platform.overview);
  if (!result.ok) {
    return <ErrorState title="The overview did not load" description={result.message} />;
  }

  return <OverviewView overview={result.data.data} />;
}
