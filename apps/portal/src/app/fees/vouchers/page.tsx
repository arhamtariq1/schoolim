import {
  MAX_PAGE_LIMIT,
  ROUTES,
  type AcademicSession,
  type ClassLevel,
  type VoucherSummary,
  type VoucherTotals,
} from '@ilm/contracts';
import type { Metadata } from 'next';

import { AppShell } from '@/components/app-shell';
import { FeesTabs } from '@/components/tab-links';
import { VouchersView } from '@/components/vouchers-view';
import { apiFetch } from '@/lib/api';
import { getSession } from '@/lib/session';

/**
 * Fees › Vouchers.
 *
 * Filters and paging live in the query string, so "unpaid vouchers for Grade 5"
 * is a link, and the server does the filtering — this screen must stay fast on
 * a school with four years of history behind it.
 */
export const metadata: Metadata = { title: 'Fee vouchers' };

export default async function VouchersPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const read = (key: string): string => (typeof params[key] === 'string' ? params[key] : '');

  const filters = {
    q: read('q'),
    grNo: read('grNo'),
    sessionId: read('sessionId'),
    classLevelId: read('classLevelId'),
    status: read('status'),
    from: read('from'),
    to: read('to'),
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
    apiFetch<{
      data: VoucherSummary[];
      meta: { page: { total: number; limit: number; offset: number }; totals: VoucherTotals };
    }>(`${ROUTES.vouchers.list}?${query.toString()}`),
    apiFetch<{ data: AcademicSession[] }>(ROUTES.academics.sessions),
    apiFetch<{ data: { session: { id: string } | null; classes: ClassLevel[] } }>(
      ROUTES.academics.setup,
    ),
  ]);

  const emptyTotals: VoucherTotals = {
    count: 0,
    netPayableMinor: 0,
    paidMinor: 0,
    outstandingMinor: 0,
  };

  return (
    <AppShell
      user={{ name: session?.name ?? '', roleLabel: session?.roles.join(', ') ?? '' }}
      school={{ name: session?.school.name ?? '' }}
      permissions={session?.permissions ?? []}
      unverifiedEmail={session === undefined || session.emailVerified ? undefined : session.email}
    >
      <div className="space-y-6">
        <FeesTabs />
        <VouchersView
          rows={listResult.ok ? listResult.data.data : []}
          sessions={sessionsResult.ok ? sessionsResult.data.data : []}
          classes={academicsResult.ok ? academicsResult.data.data.classes : []}
          totals={listResult.ok ? listResult.data.meta.totals : emptyTotals}
          total={listResult.ok ? listResult.data.meta.page.total : 0}
          limit={listResult.ok ? listResult.data.meta.page.limit : limit}
          offset={listResult.ok ? listResult.data.meta.page.offset : offset}
          filters={filters}
          school={{ name: session?.school.name ?? '' }}
          error={listResult.ok ? undefined : listResult.message}
          canCollect={session?.permissions.includes('fees.payment.create') ?? false}
          canCancel={session?.permissions.includes('fees.voucher.cancel') ?? false}
        />
      </div>
    </AppShell>
  );
}

/** A mangled URL becomes the nearest sensible page rather than an error. */
function clampInt(
  raw: string | string[] | undefined,
  fallback: number,
  min: number,
  max: number,
): number {
  const value = typeof raw === 'string' ? Number.parseInt(raw, 10) : Number.NaN;
  if (!Number.isFinite(value)) {
    return fallback;
  }
  return Math.min(max, Math.max(min, value));
}
