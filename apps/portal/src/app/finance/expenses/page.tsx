import {
  MAX_PAGE_LIMIT,
  ROUTES,
  type AcademicSession,
  type Expense,
  type ExpenseCategory,
  type ExpenseTotals,
} from '@ilm/contracts';

import { AppShell } from '@/components/app-shell';
import { ExpensesView } from '@/components/expenses-view';
import { FinanceTabs } from '@/components/tab-links';
import { apiFetch } from '@/lib/api';
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

  const filters = {
    q: read('q'),
    categoryId: read('categoryId'),
    sessionId: read('sessionId'),
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

  // Three requests in parallel rather than in sequence: the list, and the two
  // lookups the filters and the form need. Sequentially this page would wait
  // for three round trips before painting anything.
  const [session, listResult, categoriesResult, sessionsResult] = await Promise.all([
    getSession(),
    apiFetch<{
      data: Expense[];
      meta: { page: { total: number; limit: number; offset: number }; totals: ExpenseTotals };
    }>(`${ROUTES.expenses.list}?${query.toString()}`),
    apiFetch<{ data: ExpenseCategory[] }>(ROUTES.expenses.categories),
    apiFetch<{ data: AcademicSession[] }>(ROUTES.academics.sessions),
  ]);

  const emptyTotals: ExpenseTotals = { totalMinor: 0, count: 0 };

  return (
    <AppShell
      user={{ name: session?.name ?? '', roleLabel: session?.roles.join(', ') ?? '' }}
      school={{ name: session?.school.name ?? '' }}
      permissions={session?.permissions ?? []}
      unverifiedEmail={session === undefined || session.emailVerified ? undefined : session.email}
    >
      <div className="space-y-6">
        <FinanceTabs />
        <ExpensesView
          rows={listResult.ok ? listResult.data.data : []}
          categories={categoriesResult.ok ? categoriesResult.data.data : []}
          sessions={sessionsResult.ok ? sessionsResult.data.data : []}
          totals={listResult.ok ? listResult.data.meta.totals : emptyTotals}
          total={listResult.ok ? listResult.data.meta.page.total : 0}
          limit={listResult.ok ? listResult.data.meta.page.limit : limit}
          offset={listResult.ok ? listResult.data.meta.page.offset : offset}
          filters={filters}
          error={listResult.ok ? undefined : listResult.message}
          canManage={session?.permissions.includes('finance.expense.create') ?? false}
        />
      </div>
    </AppShell>
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
