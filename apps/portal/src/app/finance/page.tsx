import { redirect } from 'next/navigation';

/**
 * Finance has no landing page of its own yet.
 *
 * Expenses is the only screen built, so sending people straight there beats an
 * index listing one item — and when reports and the day book arrive this
 * becomes a real page rather than a redirect.
 */
export default function FinancePage() {
  redirect('/finance/expenses');
}
