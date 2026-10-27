import {
  MAX_PAGE_LIMIT,
  PAYMENT_METHODS,
  ROUTES,
  type AcademicSession,
  type Expense,
  type ExpenseCategory,
  type ExpenseTotals,
} from '@ilm/contracts';

import { ExpensesView } from '@/components/expenses-view';
import { apiFetch } from '@/lib/api';
import { calendarMonthRange, previousCalendarMonthRange } from '@/lib/expense-date-range';
import { DEFAULT_LIST_PAGE_SIZE, parseNewestFirstOrder, parseSortField } from '@/lib/list-page';
import { getSession } from '@/lib/session';

/**
 * Finance › Expenses.
 *
 * Filters and paging all live in the query string, so a filtered view — "utility
 * bills in August" — is a link somebody can send to the principal.
 */
export default async function ExpensesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const read = (key: string): string => (typeof params[key] === 'string' ? params[key] : '');

  const defaultMonth = calendarMonthRange();
  const filters = {
    q: read('q'),
    categoryId: read('categoryId'),
    sessionId: read('sessionId'),
    method: read('method'),
    from: read('from') !== '' ? read('from') : defaultMonth.from,
    to: read('to') !== '' ? read('to') : defaultMonth.to,
  };

  const limit = clampInt(params['limit'], DEFAULT_LIST_PAGE_SIZE, 1, MAX_PAGE_LIMIT);
  const offset = clampInt(params['offset'], 0, 0, Number.MAX_SAFE_INTEGER);
  const sort = parseSortField(
    params['sort'],
    ['paidOn', 'amount', 'voucherNo', 'createdAt'] as const,
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

  const thisMonth = calendarMonthRange();
  const lastMonth = previousCalendarMonthRange();

  const monthQuery = (from: string, to: string) =>
    new URLSearchParams({ from, to, limit: '1', offset: '0' }).toString();

  const [session, listResult, categoriesResult, sessionsResult, monthResult, lastMonthResult] =
    await Promise.all([
      getSession(),
      apiFetch<{
        data: Expense[];
        meta: { page: { total: number; limit: number; offset: number }; totals: ExpenseTotals };
      }>(`${ROUTES.expenses.list}?${listQuery.toString()}`),
      apiFetch<{ data: ExpenseCategory[] }>(ROUTES.expenses.categories),
      apiFetch<{ data: AcademicSession[] }>(ROUTES.academics.sessions),
      apiFetch<{
        data: Expense[];
        meta: { page: { total: number; limit: number; offset: number }; totals: ExpenseTotals };
      }>(`${ROUTES.expenses.list}?${monthQuery(thisMonth.from, thisMonth.to)}`),
      apiFetch<{
        data: Expense[];
        meta: { page: { total: number; limit: number; offset: number }; totals: ExpenseTotals };
      }>(`${ROUTES.expenses.list}?${monthQuery(lastMonth.from, lastMonth.to)}`),
    ]);

  const emptyTotals: ExpenseTotals = { totalMinor: 0, count: 0 };

  return (
    <ExpensesView
      rows={listResult.ok ? listResult.data.data : []}
      categories={categoriesResult.ok ? categoriesResult.data.data : []}
      sessions={sessionsResult.ok ? sessionsResult.data.data : []}
      totals={listResult.ok ? listResult.data.meta.totals : emptyTotals}
      monthTotals={monthResult.ok ? monthResult.data.meta.totals : emptyTotals}
      lastMonthTotals={lastMonthResult.ok ? lastMonthResult.data.meta.totals : emptyTotals}
      total={listResult.ok ? listResult.data.meta.page.total : 0}
      limit={listResult.ok ? listResult.data.meta.page.limit : limit}
      offset={listResult.ok ? listResult.data.meta.page.offset : offset}
      filters={filters}
      sort={sort}
      order={order}
      error={listResult.ok ? undefined : listResult.message}
      canManage={session?.permissions.includes('finance.expense.create') ?? false}
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
