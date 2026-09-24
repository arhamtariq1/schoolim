import { Card, EmptyState, Money } from '@ilm/ui';
import { minorUnits } from '@ilm/utils';

import { PageHeader } from '@/components/page-header';
import { SchoolShell } from '@/components/school-shell';

/**
 * Home is one route with a different workspace per role (docs/09 §3): the same
 * URL, six experiences, rather than one dashboard with six permission checks
 * inside it.
 *
 * The tiles below are **shape, not data**. There is no summary endpoint yet —
 * `ROUTES` has no dashboard entry — so nothing here can show a real figure, and
 * a tile that invents one is worse than a tile that says it is a placeholder.
 * They exist so the layout, the money rendering and the permission-driven
 * navigation are all visible and reviewable now, rather than being designed for
 * the first time under deadline in Phase 4.
 */
export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const query = await searchParams;

  // Set by /verify-email after following the link from the confirmation
  // message. Expired, already used and address-since-changed are one outcome —
  // the next step is the same for all three (ADR-0012).
  const verifyOutcome = typeof query['verify'] === 'string' ? query['verify'] : undefined;

  return (
    <SchoolShell>
      {verifyOutcome === undefined ? null : (
        <div
          role="status"
          className={
            verifyOutcome === 'ok'
              ? 'rounded-lg border border-success/30 bg-success/10 px-4 py-3 text-sm'
              : 'rounded-lg border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-danger'
          }
        >
          {verifyOutcome === 'ok'
            ? 'Email address confirmed. You can now reset your password if you ever lose it.'
            : verifyOutcome === 'unreachable'
              ? 'Could not reach the server. Open the link again in a moment.'
              : 'That confirmation link has expired or was already used. Ask for a new one above.'}
        </div>
      )}

      <PageHeader title="Today" description="Your school workspace for the day." />

      <section aria-label="Collection" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Tile label="Collected this month" valueMinor={0} tone="success" />
        <Tile label="Outstanding" valueMinor={0} tone="danger" />
        <Tile label="Issued this period" valueMinor={0} />
        <Tile label="Vouchers cancelled" valueMinor={0} />
      </section>

      <EmptyState
        title="These figures are not wired up yet"
        description="Students, fees and attendance all record real data now, but there is no summary endpoint behind this screen — so every tile above reads zero whatever the school has done. Open Fees or Attendance for the real numbers."
      />
    </SchoolShell>
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
    <Card className="p-4">
      <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">{label}</p>
      <p className="mt-2">
        <Money
          valueMinor={minorUnits(valueMinor)}
          withSymbol
          className={
            tone === 'success'
              ? 'text-lg font-semibold text-success'
              : tone === 'danger'
                ? 'text-lg font-semibold text-danger'
                : 'text-lg font-semibold'
          }
        />
      </p>
    </Card>
  );
}
