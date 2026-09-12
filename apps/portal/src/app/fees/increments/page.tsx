import {
  MAX_PAGE_LIMIT,
  ROUTES,
  type AcademicSession,
  type ClassLevel,
  type FeeIncrementList,
} from '@ilm/contracts';
import type { Metadata } from 'next';

import { AppShell } from '@/components/app-shell';
import { FeeIncrementsView } from '@/components/fee-increments-view';
import { apiFetch } from '@/lib/api';
import { clampInt, readParam } from '@/lib/search-params';
import { getSession } from '@/lib/session';

/**
 * Fees › Fee increment.
 *
 * Every filter is in the query string, so "Grade 5, GR 1–200" is a link and the
 * filtering happens in the database. A school four years in has thousands of
 * students, and a screen that fetched them all to filter in the browser would
 * be the one that stops opening.
 */
export const metadata: Metadata = { title: 'Fee increment' };

export default async function FeeIncrementsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;

  const filters = {
    q: readParam(params, 'q'),
    classLevelId: readParam(params, 'classLevelId'),
    sessionId: readParam(params, 'sessionId'),
    status: readParam(params, 'status'),
    gender: readParam(params, 'gender'),
    grFrom: readParam(params, 'grFrom'),
    grTo: readParam(params, 'grTo'),
  };

  const limit = clampInt(params['limit'], 25, 1, MAX_PAGE_LIMIT);
  const offset = clampInt(params['offset'], 0, 0, Number.MAX_SAFE_INTEGER);

  const query = new URLSearchParams({ limit: String(limit), offset: String(offset) });
  for (const [key, value] of Object.entries(filters)) {
    if (value !== '') {
      query.set(key, value);
    }
  }

  const [session, listResult, sessionsResult, academicsResult] = await Promise.all([
    getSession(),
    apiFetch<{ data: FeeIncrementList; meta: { page: { total: number } } }>(
      `${ROUTES.feeIncrements.list}?${query.toString()}`,
    ),
    apiFetch<{ data: AcademicSession[] }>(ROUTES.academics.sessions),
    apiFetch<{ data: { session: { id: string } | null; classes: ClassLevel[] } }>(
      ROUTES.academics.setup,
    ),
  ]);

  // A failed list still renders the screen, with the reason on it — a blank page
  // and a console error is the outcome docs/16 §7 exists to prevent.
  const empty: FeeIncrementList = {
    rows: [],
    total: 0,
    feeHead: { id: '', name: 'Tuition fee' },
  };
  const page = listResult.ok ? listResult.data.data : empty;

  return (
    <AppShell
      user={{ name: session?.name ?? '', roleLabel: session?.roles.join(', ') ?? '' }}
      school={{ name: session?.school.name ?? '' }}
      permissions={session?.permissions ?? []}
      unverifiedEmail={session === undefined || session.emailVerified ? undefined : session.email}
    >
      <FeeIncrementsView
        page={page}
        sessions={sessionsResult.ok ? sessionsResult.data.data : []}
        classes={academicsResult.ok ? academicsResult.data.data.classes : []}
        total={page.total}
        limit={limit}
        offset={offset}
        filters={filters}
        error={listResult.ok ? undefined : listResult.message}
        canApply={session?.permissions.includes('fees.increment.generate') ?? false}
      />
    </AppShell>
  );
}
