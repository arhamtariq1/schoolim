import { ROUTES, type Plan } from '@ilm/contracts';
import { ErrorState, PermissionDeniedState } from '@ilm/ui';

import { PlansManager } from '@/components/plans-manager';
import { apiFetch, getPlatformSession } from '@/lib/api';

export const metadata = { title: 'Plans' };

/**
 * Subscription plans and prices.
 *
 * The capability is checked here for the page and again by the API for every
 * write. The page decides whether the edit controls render at all; the API is
 * what actually refuses a SUPPORT operator who goes around it.
 */
export default async function PlansPage() {
  const session = await getPlatformSession();
  if (session === undefined || !session.capabilities.includes('plans.read')) {
    return <PermissionDeniedState />;
  }

  const result = await apiFetch<{ data: Plan[] }>(ROUTES.platform.plans.list);
  if (!result.ok) {
    return <ErrorState title="Plans did not load" description={result.message} />;
  }

  return (
    <PlansManager plans={result.data.data} canWrite={session.capabilities.includes('plans.write')} />
  );
}
