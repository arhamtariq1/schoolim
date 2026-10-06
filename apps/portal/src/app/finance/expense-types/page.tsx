import { ROUTES, type ExpenseCategory } from '@ilm/contracts';

import { ExpenseCategoriesManager } from '@/components/expense-categories-manager';
import { FinanceTabs } from '@/components/tab-links';
import { apiFetch } from '@/lib/api';
import { getSession } from '@/lib/session';

/**
 * Finance › Expense types.
 *
 * The old "Expense Type" screen. Categories are school-configurable rather than
 * a fixed list, because every school groups its spending differently and a
 * hard-coded set is the school-specific branching CLAUDE.md R1 forbids.
 */
export default async function ExpenseTypesPage() {
  const [session, result] = await Promise.all([
    getSession(),
    apiFetch<{ data: ExpenseCategory[] }>(ROUTES.expenses.categories),
  ]);

  return (
    <div className="space-y-6">
        <FinanceTabs />
        <ExpenseCategoriesManager
          categories={result.ok ? result.data.data : []}
          error={result.ok ? undefined : result.message}
          canManage={session?.permissions.includes('finance.expense.create') ?? false}
        />
      </div>
  );
}
