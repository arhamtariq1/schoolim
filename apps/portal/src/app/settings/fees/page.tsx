import { ROUTES, type FeeHead, type LateFeePolicy, type SchoolLogoInfo } from '@ilm/contracts';

import { AppShell } from '@/components/app-shell';
import { FeeHeadsManager } from '@/components/fee-heads-manager';
import { LateFeePolicyCard } from '@/components/late-fee-policy-card';
import { SchoolLogoCard } from '@/components/school-logo-card';
import { apiFetch } from '@/lib/api';
import { getSession } from '@/lib/session';

/**
 * Settings › Fees — the catalogue a school charges from, and the late fee.
 *
 * The first screen in the fee flow and deliberately so: an admission form
 * cannot autofill anything until this list exists, so a school sets its prices
 * once here and then never retypes them per child.
 *
 * The late fee sits below the catalogue rather than inside it. It is not a
 * charge anybody is assigned — it is what happens when a due date passes — so
 * it is one setting for the school instead of a row in the price list.
 *
 * Fetched on the server so the first paint carries real rows — a settings page
 * that opens on a spinner, then a table, then a re-layout is three states for
 * data that was one query away (docs/16 §7).
 */
export default async function FeeSettingsPage() {
  const [session, result, lateFeeResult, logoResult] = await Promise.all([
    getSession(),
    apiFetch<{ data: FeeHead[] }>(ROUTES.fees.heads),
    apiFetch<{ data: LateFeePolicy }>(ROUTES.fees.lateFeePolicy),
    apiFetch<{ data: SchoolLogoInfo }>(ROUTES.schoolLogo.info),
  ]);

  // A school that has never set one charges nothing, which is also what the
  // columns default to — so a failed fetch renders the same thing the database
  // would have said, with the reason beside it.
  const policy: LateFeePolicy = lateFeeResult.ok
    ? lateFeeResult.data.data
    : { percentBasisPoints: 0, flatMinor: 0 };

  const canConfigure = session?.permissions.includes('fees.plan.configure') ?? false;

  return (
    <AppShell
      user={{ name: session?.name ?? '', email: session?.email ?? '', roleLabel: session?.roles.join(', ') ?? '' }}
      school={{ name: session?.school.name ?? '' }}
      permissions={session?.permissions ?? []}
      profileCompleted={session?.profileCompleted ?? true}
      unverifiedEmail={session === undefined || session.emailVerified ? undefined : session.email}
    >
      <div className="space-y-6">
        <FeeHeadsManager
          initialHeads={result.ok ? result.data.data : []}
          error={result.ok ? undefined : result.message}
          canConfigure={canConfigure}
        />
        <LateFeePolicyCard
          policy={policy}
          canConfigure={canConfigure}
          error={lateFeeResult.ok ? undefined : lateFeeResult.message}
        />
        <SchoolLogoCard
          info={
            logoResult.ok
              ? logoResult.data.data
              : { present: false, mimeType: null, byteSize: null, version: null }
          }
          canConfigure={session?.permissions.includes('settings.school.configure') ?? false}
          error={logoResult.ok ? undefined : logoResult.message}
        />
      </div>
    </AppShell>
  );
}
