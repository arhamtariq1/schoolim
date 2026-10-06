import { Suspense } from 'react';

import { DashboardLoading } from '@/components/dashboard/dashboard-loading';
import { HomeDashboard } from '@/components/dashboard/home-dashboard';
import { loadDashboardDemoSnapshot } from '@/lib/dashboard-demo-data';
import { requireSchoolSession } from '@/lib/require-session';
import { tenantSlugFromHeaders } from '@/lib/tenant-from-request';

async function HomeDashboardContent({
  verifyOutcome,
}: {
  verifyOutcome: string | undefined;
}) {
  const session = await requireSchoolSession();
  const snapshot = loadDashboardDemoSnapshot(session);
  const tenantSlug = await tenantSlugFromHeaders();

  const verifyBanner =
    verifyOutcome === undefined ? null : (
      <div
        role="status"
        className={
          verifyOutcome === 'ok'
            ? 'rounded-xl border border-success/30 bg-success/10 px-4 py-3 text-sm'
            : 'rounded-xl border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-danger'
        }
      >
        {verifyOutcome === 'ok'
          ? 'Email address confirmed. You can now reset your password if you ever lose it.'
          : verifyOutcome === 'unreachable'
            ? 'Could not reach the server. Open the link again in a moment.'
            : 'That confirmation link has expired or was already used. Ask for a new one above.'}
      </div>
    );

  return (
    <HomeDashboard
      session={session}
      snapshot={snapshot}
      tenantSlug={tenantSlug}
      verifyBanner={verifyBanner}
    />
  );
}

/**
 * Home — permission-aware summary built from existing list endpoints.
 *
 * Demo data (`loadDashboardDemoSnapshot`) until a summary API ships — swap in
 * `loadDashboardSnapshot` from `@/lib/dashboard-data` when endpoints are ready.
 */
export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const query = await searchParams;
  const verifyOutcome = typeof query['verify'] === 'string' ? query['verify'] : undefined;

  return (
    <Suspense fallback={<DashboardLoading />}>
      <HomeDashboardContent verifyOutcome={verifyOutcome} />
    </Suspense>
  );
}
