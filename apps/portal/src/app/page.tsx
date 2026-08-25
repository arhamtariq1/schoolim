import { permissionsFor, type SchoolRole } from '@ilm/contracts';
import { EmptyState, Money, StatusBadge } from '@ilm/ui';
import { minorUnits } from '@ilm/utils';

import { AppShell } from '@/components/app-shell';
import { getSession } from '@/lib/session';

/**
 * Home is one route with a different workspace per role (docs/09 §3): the same
 * URL, six experiences, rather than one dashboard with six permission checks
 * inside it.
 *
 * The tiles below are **shape, not data** — Phase 0 has no students, fees or
 * attendance to count. They exist so the layout, the money rendering and the
 * permission-driven navigation are all visible and reviewable now, rather than
 * being designed for the first time under deadline in Phase 4.
 */
export default async function HomePage() {
  const session = await getSession();

  // Without a session the API is the thing that says so; this page only decides
  // what to render. Signing in is at /login.
  const roles: readonly SchoolRole[] = session?.roles ?? ['OWNER'];
  const permissions = session?.permissions ?? permissionsFor(roles);
  const isPreview = session === undefined;

  return (
    <AppShell
      user={{ name: session?.name ?? 'Not signed in', roleLabel: roles.join(', ') }}
      school={{ name: session?.school.name ?? 'Demo School' }}
      permissions={permissions}
    >
      <div className="space-y-6">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold">Today</h1>
            <p className="text-sm text-muted-foreground">
              {isPreview
                ? 'Preview — sign in to see your school’s real figures.'
                : `Signed in as ${session.name}`}
            </p>
          </div>
          {isPreview ? <StatusBadge tone="warning">Preview</StatusBadge> : null}
        </header>

        <section aria-label="Collection" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Tile label="Collected this month" valueMinor={0} tone="success" />
          <Tile label="Outstanding" valueMinor={0} tone="danger" />
          <Tile label="Issued this period" valueMinor={0} />
          <Tile label="Discounts given" valueMinor={0} />
        </section>

        <EmptyState
          title="No school data yet"
          description="Students, fee plans and attendance arrive in Phases 1–3. Everything above is laid out now so the shape is settled before the numbers are real."
        />
      </div>
    </AppShell>
  );
}

/**
 * Every figure is money, so every figure goes through `<Money>` — monospace,
 * right-aligned, two decimals, minor units in (docs/16 §10). Hand-formatting
 * one of these is a review rejection.
 */
function Tile({
  label,
  valueMinor,
  tone,
}: {
  label: string;
  valueMinor: number;
  tone?: 'success' | 'danger';
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-2">
        <Money
          valueMinor={minorUnits(valueMinor)}
          withSymbol
          className={
            tone === 'success' ? 'text-lg text-success' : tone === 'danger' ? 'text-lg' : 'text-lg'
          }
        />
      </p>
    </div>
  );
}
