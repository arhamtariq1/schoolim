import { ROUTES, type FeeHead } from '@ilm/contracts';

import { AppShell } from '@/components/app-shell';
import { FeeHeadsManager } from '@/components/fee-heads-manager';
import { apiFetch } from '@/lib/api';
import { getSession } from '@/lib/session';

/**
 * Settings › Fees — the catalogue a school charges from.
 *
 * The first screen in the fee flow and deliberately so: an admission form
 * cannot autofill anything until this list exists, so a school sets its prices
 * once here and then never retypes them per child.
 *
 * Fetched on the server so the first paint carries real rows — a settings page
 * that opens on a spinner, then a table, then a re-layout is three states for
 * data that was one query away (docs/16 §7).
 */
export default async function FeeSettingsPage() {
  const [session, result] = await Promise.all([
    getSession(),
    apiFetch<{ data: FeeHead[] }>(ROUTES.fees.heads),
  ]);

  return (
    <AppShell
      user={{ name: session?.name ?? '', roleLabel: session?.roles.join(', ') ?? '' }}
      school={{ name: session?.school.name ?? '' }}
      permissions={session?.permissions ?? []}
      unverifiedEmail={session === undefined || session.emailVerified ? undefined : session.email}
    >
      <FeeHeadsManager
        initialHeads={result.ok ? result.data.data : []}
        error={result.ok ? undefined : result.message}
        canConfigure={session?.permissions.includes('fees.plan.configure') ?? false}
      />
    </AppShell>
  );
}
