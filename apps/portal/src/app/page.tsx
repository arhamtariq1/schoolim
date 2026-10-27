import { EmptyState } from '@ilm/ui';
import { redirect } from 'next/navigation';
import { Suspense } from 'react';

import { DashboardLoading } from '@/components/dashboard/dashboard-loading';
import { HomeDashboard } from '@/components/dashboard/home-dashboard';
import { TeacherDashboard } from '@/components/dashboard/teacher-dashboard';
import { loadDashboard } from '@/lib/dashboard-data';
import { requireSchoolSession } from '@/lib/require-session';
import { tenantSlugFromHeaders } from '@/lib/tenant-from-request';

async function HomeDashboardContent({ verifyOutcome }: { verifyOutcome: string | undefined }) {
  const session = await requireSchoolSession();

  // A guardian's home is the parent portal, not the school dashboard.
  if (session.roles.length > 0 && session.roles.every((role) => role === 'PARENT')) {
    redirect('/parent');
  }

  const tenantSlug = await tenantSlugFromHeaders();

  // One call: the API decides by role what comes back — revenue for the Admin
  // alone, a teacher's own classes for a teacher. Nothing is filtered here.
  const dashboard = await loadDashboard(session);

  if (dashboard.kind === 'error') {
    return <EmptyState title="The dashboard did not load" description={dashboard.message} />;
  }

  if (dashboard.kind === 'teacher') {
    return <TeacherDashboard session={session} tenantSlug={tenantSlug} data={dashboard.data} />;
  }

  const snapshot = dashboard.snapshot;

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
 * Every figure comes from `GET /api/v1/dashboard`, computed from the school's
 * own rows in one transaction; `loadDashboard` in `@/lib/dashboard-data` is the
 * only place that calls it.
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
