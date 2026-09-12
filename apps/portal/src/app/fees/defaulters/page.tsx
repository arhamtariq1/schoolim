import { MAX_PAGE_LIMIT, ROUTES, type ClassLevel, type DefaulterList } from '@ilm/contracts';
import { systemClock } from '@ilm/utils';
import type { Metadata } from 'next';

import { AppShell } from '@/components/app-shell';
import { DefaultersView } from '@/components/defaulters-view';
import { apiFetch } from '@/lib/api';
import { clampInt, readParam } from '@/lib/search-params';
import { getSession } from '@/lib/session';

/**
 * Fees › Defaulters.
 *
 * Sorted by what is owed, descending, by default: the largest debt is the first
 * phone call, and that is what this screen exists to start.
 */
export const metadata: Metadata = { title: 'Defaulters' };

export default async function DefaultersPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;

  const filters = {
    q: readParam(params, 'q'),
    classLevelId: readParam(params, 'classLevelId'),
    status: readParam(params, 'status'),
    gender: readParam(params, 'gender'),
    months: readParam(params, 'months'),
    from: readParam(params, 'from'),
    to: readParam(params, 'to'),
  };

  const limit = clampInt(params['limit'], 25, 1, MAX_PAGE_LIMIT);
  const offset = clampInt(params['offset'], 0, 0, Number.MAX_SAFE_INTEGER);

  const query = new URLSearchParams({
    limit: String(limit),
    offset: String(offset),
    sort: 'amount',
    order: 'desc',
  });
  for (const [key, value] of Object.entries(filters)) {
    if (value !== '') {
      query.set(key, value);
    }
  }

  const [session, listResult, academicsResult] = await Promise.all([
    getSession(),
    apiFetch<{ data: DefaulterList }>(`${ROUTES.defaulters.list}?${query.toString()}`),
    apiFetch<{ data: { session: { id: string } | null; classes: ClassLevel[] } }>(
      ROUTES.academics.setup,
    ),
  ]);

  // The screen still renders when the list fails, with the reason on it.
  const empty: DefaulterList = {
    rows: [],
    total: 0,
    totalOwedMinor: 0,
    asOf: systemClock.now().toISOString().slice(0, 10),
  };

  return (
    <AppShell
      user={{ name: session?.name ?? '', roleLabel: session?.roles.join(', ') ?? '' }}
      school={{ name: session?.school.name ?? '' }}
      permissions={session?.permissions ?? []}
      unverifiedEmail={session === undefined || session.emailVerified ? undefined : session.email}
    >
      <DefaultersView
        page={listResult.ok ? listResult.data.data : empty}
        classes={academicsResult.ok ? academicsResult.data.data.classes : []}
        limit={limit}
        offset={offset}
        filters={filters}
        error={listResult.ok ? undefined : listResult.message}
      />
    </AppShell>
  );
}
