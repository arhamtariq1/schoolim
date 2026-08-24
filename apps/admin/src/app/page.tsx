import { EmptyState } from '@ilm/ui';

/**
 * The platform console (docs/modules/super-admin.md).
 *
 * A **separate application** from the school portal, deliberately: a
 * privilege-escalation bug in the portal cannot reach platform capability,
 * because platform routes reject any token whose type is not `platform`
 * (docs/00 §3, docs/04 §6).
 *
 * Built in Phase 5. The shell exists now so the separation is structural from
 * the first commit rather than a later split.
 */
export default function PlatformHomePage() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-2xl items-center px-6">
      <EmptyState
        className="w-full"
        title="Platform console"
        description="Schools, subscriptions, impersonation and platform health arrive in Phase 5. This app exists now so the boundary between it and the school portal is structural, not retrofitted."
      />
    </main>
  );
}
