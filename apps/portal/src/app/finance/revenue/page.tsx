import {
  MAX_PAGE_LIMIT,
  PAYMENT_METHODS,
  ROUTES,
  type ClassLevel,
  type RevenueRow,
  type RevenueTotals,
} from '@ilm/contracts';
import { PermissionDeniedState } from '@ilm/ui';

import { RevenueView } from '@/components/revenue-view';
import { WorkspacePageHeader } from '@/components/workspace-page-header';
import { apiFetch } from '@/lib/api';
import { calendarMonthRange, previousCalendarMonthRange } from '@/lib/expense-date-range';
import { DEFAULT_LIST_PAGE_SIZE, parseNewestFirstOrder, parseSortField } from '@/lib/list-page';
import { pageIntro } from '@/lib/page-copy';
import { getSession } from '@/lib/session';

/**
 * Finance › Revenue.
 *
 * Every fee receipt in the range, and what the school earned from it. Filters
 * and paging live in the query string, so "bank transfers in October" is a
 * link somebody can send.
 */
export default async function RevenuePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await getSession();
  // The sidebar hides the link, but a URL can still be typed: the owner alone
  // reads revenue, and the API refuses everybody else regardless.
  if (!(session?.permissions.includes('finance.revenue.read') ?? false)) {
    return (
      <div className="w-full space-y-6">
        <WorkspacePageHeader title="Revenue" description={pageIntro('/finance/revenue')} />
        <PermissionDeniedState />
      </div>
    );
  }

  const params = await searchParams;
  const read = (key: string): string => (typeof params[key] === 'string' ? params[key] : '');

  const thisMonth = calendarMonthRange();
  const lastMonth = previousCalendarMonthRange();
  const filters = {
    q: read('q'),
    method: read('method'),
    classLevelId: read('classLevelId'),
    from: read('from') !== '' ? read('from') : thisMonth.from,
    to: read('to') !== '' ? read('to') : thisMonth.to,
  };

  const limit = clampInt(params['limit'], DEFAULT_LIST_PAGE_SIZE, 1, MAX_PAGE_LIMIT);
  const offset = clampInt(params['offset'], 0, 0, Number.MAX_SAFE_INTEGER);
  const sort = parseSortField(
    params['sort'],
    ['paidOn', 'amount', 'receiptNo', 'name'] as const,
    'paidOn',
  );
  const order = parseNewestFirstOrder(params);

  const listQuery = new URLSearchParams({
    limit: String(limit),
    offset: String(offset),
    sort,
    order,
  });
  for (const [key, value] of Object.entries(filters)) {
    if (value !== '') {
      listQuery.set(key, value);
    }
  }

  // The month cards are this month and last, whatever the table is filtered
  // to, so "how are we doing" does not move when somebody searches a name.
  const monthQuery = (from: string, to: string) =>
    new URLSearchParams({ from, to, limit: '1', offset: '0' }).toString();

  type RevenueResponse = {
    data: RevenueRow[];
    meta: { page: { total: number; limit: number; offset: number }; totals: RevenueTotals };
  };

  const [listResult, monthResult, lastMonthResult, classesResult] = await Promise.all([
    apiFetch<RevenueResponse>(`${ROUTES.revenue.list}?${listQuery.toString()}`),
    apiFetch<RevenueResponse>(`${ROUTES.revenue.list}?${monthQuery(thisMonth.from, thisMonth.to)}`),
    apiFetch<RevenueResponse>(`${ROUTES.revenue.list}?${monthQuery(lastMonth.from, lastMonth.to)}`),
    apiFetch<{ data: ClassLevel[] }>(ROUTES.academics.classes),
  ]);

  const emptyTotals: RevenueTotals = {
    count: 0,
    receivedMinor: 0,
    depositMinor: 0,
    revenueMinor: 0,
  };

  return (
    <RevenueView
      rows={listResult.ok ? listResult.data.data : []}
      totals={listResult.ok ? listResult.data.meta.totals : emptyTotals}
      monthTotals={monthResult.ok ? monthResult.data.meta.totals : emptyTotals}
      lastMonthTotals={lastMonthResult.ok ? lastMonthResult.data.meta.totals : emptyTotals}
      classes={classesResult.ok ? classesResult.data.data : []}
      total={listResult.ok ? listResult.data.meta.page.total : 0}
      limit={listResult.ok ? listResult.data.meta.page.limit : limit}
      offset={listResult.ok ? listResult.data.meta.page.offset : offset}
      filters={filters}
      sort={sort}
      order={order}
      error={listResult.ok ? undefined : listResult.message}
      paymentMethods={PAYMENT_METHODS}
    />
  );
}

/** See the students page: a mangled URL becomes the nearest sensible page. */
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
