import { MAX_PAGE_LIMIT, ROUTES, type ClassLevel, type SecurityDepositList } from '@ilm/contracts';
import type { Metadata } from 'next';

import { AppShell } from '@/components/app-shell';
import { SecurityDepositsView } from '@/components/security-deposits-view';
import { apiFetch } from '@/lib/api';
import { clampInt, readParam } from '@/lib/search-params';
import { getSession } from '@/lib/session';

/**
 * Fees › Security deposits.
 *
 * Newest first: a deposit is looked at either when it comes in or when a family
 * leaves, and both of those are recent.
 */
export const metadata: Metadata = { title: 'Security deposits' };

export default async function SecurityDepositsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;

  const filters = {
    q: readParam(params, 'q'),
    classLevelId: readParam(params, 'classLevelId'),
    status: readParam(params, 'status'),
    state: readParam(params, 'state'),
  };

  const limit = clampInt(params['limit'], 25, 1, MAX_PAGE_LIMIT);
  const offset = clampInt(params['offset'], 0, 0, Number.MAX_SAFE_INTEGER);

  const query = new URLSearchParams({
    limit: String(limit),
    offset: String(offset),
    sort: 'receivedOn',
    order: 'desc',
  });
  for (const [key, value] of Object.entries(filters)) {
    if (value !== '') {
      query.set(key, value);
    }
  }

  const [session, listResult, academicsResult] = await Promise.all([
    getSession(),
    apiFetch<{ data: SecurityDepositList }>(`${ROUTES.securityDeposits.list}?${query.toString()}`),
    apiFetch<{ data: { session: { id: string } | null; classes: ClassLevel[] } }>(
      ROUTES.academics.setup,
    ),
  ]);

  const empty: SecurityDepositList = {
    rows: [],
    total: 0,
    totalDepositedMinor: 0,
    totalLeftMinor: 0,
  };

  return (
    <AppShell
      user={{ name: session?.name ?? '', roleLabel: session?.roles.join(', ') ?? '' }}
      school={{ name: session?.school.name ?? '' }}
      permissions={session?.permissions ?? []}
      unverifiedEmail={session === undefined || session.emailVerified ? undefined : session.email}
    >
      <SecurityDepositsView
        page={listResult.ok ? listResult.data.data : empty}
        classes={academicsResult.ok ? academicsResult.data.data.classes : []}
        limit={limit}
        offset={offset}
        filters={filters}
        error={listResult.ok ? undefined : listResult.message}
        canRefund={session?.permissions.includes('fees.deposit.update') ?? false}
      />
    </AppShell>
  );
}
