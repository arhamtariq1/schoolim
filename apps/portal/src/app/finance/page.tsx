import { redirect } from 'next/navigation';

import { getSession } from '@/lib/session';
import { tenantHref } from '@/lib/tenant-server';

/**
 * Finance has no landing page of its own: it is the sidebar group for
 * Revenue, Expense and Salaries.
 *
 * A bare `/finance` goes to the first of those the person may open — Revenue
 * for the owner, Expense for everybody else who reaches the group — so the
 * link never lands on a 403.
 */
export default async function FinancePage() {
  const session = await getSession();
  const canReadRevenue = session?.permissions.includes('finance.revenue.read') ?? false;
  redirect(await tenantHref(canReadRevenue ? '/finance/revenue' : '/finance/expenses'));
}
