import { EmptyState } from '@ilm/ui';

import { PageHeader } from '@/components/page-header';

/**
 * In-app view of subscription plans for the signed-in school.
 *
 * Public list pricing lives on the welcome page at the apex; this route is the
 * tenant-scoped place to compare plans and upgrade once billing is wired (docs/14).
 */
export default function PricingPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Pricing"
        description="Plans and limits for your school on the platform."
      />

      <EmptyState
        title="Plan comparison is not built yet"
        description="Subscription tiers and upgrades arrive with billing in docs/14. Your current trial or plan will show here when it is live."
      />
    </div>
  );
}
