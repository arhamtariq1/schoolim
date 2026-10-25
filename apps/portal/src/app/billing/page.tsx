import { EmptyState } from '@ilm/ui';
import { redirect } from 'next/navigation';

import { PageHeader } from '@/components/page-header';
import { requireSchoolSession } from '@/lib/require-session';

/**
 * Subscription invoices and payment method for the school tenant (docs/09 § settings/billing).
 *
 * Distinct from fee vouchers inside the school — this is what the school pays the platform.
 */
export default async function BillingPage() {
  // The school's dealings with the platform are the Admin's alone.
  const session = await requireSchoolSession();
  if (!session.permissions.includes('settings.billing.manage')) {
    redirect('/');
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Billing"
        description="Your subscription, invoices and payment details with the platform."
      />

      <EmptyState
        title="Billing is not built yet"
        description="Invoices, receipts and payment method management arrive with the subscription module in docs/14."
      />
    </div>
  );
}
