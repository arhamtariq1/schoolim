import {
  ROUTES,
  type Expense,
  type ExpenseCategory,
  type ExpenseTotals,
} from '@ilm/contracts';

import { ExpenseCategoriesManager } from '@/components/expense-categories-manager';
import { apiFetch } from '@/lib/api';
import { calendarMonthRange, previousCalendarMonthRange } from '@/lib/expense-date-range';
import { getSession } from '@/lib/session';

/**
 * Finance › Expense types.
 *
 * The old "Expense Type" screen. Categories are school-configurable rather than
 * a fixed list, because every school groups its spending differently and a
 * hard-coded set is the school-specific branching CLAUDE.md R1 forbids.
 */
export default async function ExpenseTypesPage() {
  const thisMonth = calendarMonthRange();
  const lastMonth = previousCalendarMonthRange();
  const monthQuery = (from: string, to: string) =>
    new URLSearchParams({ from, to, limit: '1', offset: '0' }).toString();

  const emptyTotals: ExpenseTotals = { totalMinor: 0, count: 0 };

  const [session, result, monthResult, lastMonthResult] = await Promise.all([
    getSession(),
    apiFetch<{ data: ExpenseCategory[] }>(ROUTES.expenses.categories),
    apiFetch<{
      data: Expense[];
      meta: { page: { total: number; limit: number; offset: number }; totals: ExpenseTotals };
    }>(`${ROUTES.expenses.list}?${monthQuery(thisMonth.from, thisMonth.to)}`),
    apiFetch<{
      data: Expense[];
      meta: { page: { total: number; limit: number; offset: number }; totals: ExpenseTotals };
    }>(`${ROUTES.expenses.list}?${monthQuery(lastMonth.from, lastMonth.to)}`),
  ]);

  const monthTotals = monthResult.ok ? monthResult.data.meta.totals : emptyTotals;

  return (
    <ExpenseCategoriesManager
      categories={result.ok ? result.data.data : []}
      totals={monthTotals}
      monthTotals={monthTotals}
      lastMonthTotals={lastMonthResult.ok ? lastMonthResult.data.meta.totals : emptyTotals}
      error={result.ok ? undefined : result.message}
      canManage={session?.permissions.includes('finance.expense.create') ?? false}
    />
  );
}
