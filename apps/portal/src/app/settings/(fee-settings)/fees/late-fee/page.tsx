import { ROUTES, type FeeHead, type LateFeePolicy } from '@ilm/contracts';

import { LateFeePolicyCard } from '@/components/late-fee-policy-card';
import { WorkspacePageHeader } from '@/components/workspace-page-header';
import { apiFetch } from '@/lib/api';
import { getSession } from '@/lib/session';

/** Settings › Fee Settings › Late Fee. */
export default async function LateFeeSettingsPage() {
  const [session, headsResult, lateFeeResult] = await Promise.all([
    getSession(),
    apiFetch<{ data: FeeHead[] }>(ROUTES.fees.heads),
    apiFetch<{ data: LateFeePolicy }>(ROUTES.fees.lateFeePolicy),
  ]);

  const policy: LateFeePolicy = lateFeeResult.ok
    ? lateFeeResult.data.data
    : { percentBasisPoints: 0, flatMinor: 0, graceDays: 0, feeHeadIds: [] };

  const permissions = session?.permissions ?? [];
  const canConfigure = permissions.includes('fees.plan.configure');

  return (
    <>
      <WorkspacePageHeader
        title="Late Fee"
        description="Choose when a late fee applies, how it is calculated, and which fee types it is charged on."
      />

      <LateFeePolicyCard
        policy={policy}
        feeHeads={(headsResult.ok ? headsResult.data.data : []).map((head) => ({
          id: head.id,
          name: head.name,
        }))}
        canConfigure={canConfigure}
        error={lateFeeResult.ok ? undefined : lateFeeResult.message}
      />
    </>
  );
}
