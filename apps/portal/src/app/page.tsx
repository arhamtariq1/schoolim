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
 * Home — the dashboard.
 *
 * ## Deliberately static, for now
 *
 * This renders `loadDashboardDemoSnapshot`: a fixed payload, not the school's
 * own figures. That is a decision, not an oversight. Half of this screen —
 * revenue trend, monthly expenses, expense breakdown, weekly attendance, recent
 * fee payments — has no endpoint behind it yet, and `HomeDashboard` hides any
 * widget whose data is empty. Wired to the live loader today it would show four
 * cards and a lot of white space, which is not the product being demonstrated.
 *
 * `loadDashboardSnapshot` in `@/lib/dashboard-data` is the real thing and is
 * already written: it asks the same list endpoints the rest of the portal uses,
 * permission-gated and in parallel. **Swap the import below for it once the
 * summary endpoints exist** — nothing else on this page has to change, because
 * both return the same `DashboardSnapshot`.
 *
 * Until then the figures here are invented, so this screen must not be used to
 * answer a question about a real school's money.
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
