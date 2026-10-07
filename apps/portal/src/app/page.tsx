import { Suspense } from 'react';

import { DashboardLoading } from '@/components/dashboard/dashboard-loading';
import { HomeDashboard } from '@/components/dashboard/home-dashboard';
import { loadDashboardSnapshot } from '@/lib/dashboard-data';
import { requireSchoolSession } from '@/lib/require-session';
import { tenantSlugFromHeaders } from '@/lib/tenant-from-request';

async function HomeDashboardContent({
  verifyOutcome,
}: {
  verifyOutcome: string | undefined;
}) {
  const session = await requireSchoolSession();
  const [snapshot, tenantSlug] = await Promise.all([
    loadDashboardSnapshot(session),
    tenantSlugFromHeaders(),
  ]);

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
 * ## Real figures only
 *
 * This reads `loadDashboardSnapshot`, which asks the same list endpoints the
 * rest of the portal uses. It briefly rendered `loadDashboardDemoSnapshot`
 * instead — invented revenue, invented admissions, invented defaulters — which
 * is the one thing a fee-management product must never do: a head teacher has
 * no way to tell a placeholder from a collection figure, and "Rs 1,250,000
 * collected" is a number somebody acts on.
 *
 * The widgets with no endpoint behind them yet (revenue trend, expense
 * breakdown, weekly attendance) are each guarded on `.length > 0` in
 * `HomeDashboard`, so they stay hidden rather than drawing an empty chart. The
 * demo loader is kept for designing those screens; it must not be imported
 * here.
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
