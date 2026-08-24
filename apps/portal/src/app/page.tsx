import { EmptyState } from '@ilm/ui';

/**
 * Home is one route with a different workspace per role (docs/09 §3): the same
 * URL, six experiences, rather than one dashboard with six permission checks
 * inside it.
 *
 * Phase 0 ships the shell only. Each workspace fills in as its module lands.
 */
export default function HomePage() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-2xl items-center px-6">
      <EmptyState
        className="w-full"
        title="Your workspace is not built yet"
        description="Phase 0 proves the foundations: tenant isolation, authentication and the guard chain. Screens arrive with Phase 1."
      />
    </main>
  );
}
