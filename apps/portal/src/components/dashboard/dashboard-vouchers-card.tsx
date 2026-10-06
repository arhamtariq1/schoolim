import { Card, CardContent, CardHeader, CardTitle, StatusBadge, cn } from '@ilm/ui';
import { FeesIcon } from '@ilm/ui/icons';
import { formatMoney, minorUnits } from '@ilm/utils';

import { DashboardCardViewLink } from '@/components/dashboard/dashboard-card-view-link';
import type { DashboardVoucherSummary } from '@/lib/dashboard-data';

type DashboardVouchersCardProps = {
  summary: DashboardVoucherSummary;
  detailsHref: string;
};

export function DashboardVouchersCard({ summary, detailsHref }: DashboardVouchersCardProps) {
  return (
    <Card className="flex h-full w-full flex-col rounded-lg shadow-raised">
      <CardHeader className="flex flex-row items-center justify-between gap-2 border-0 px-4 pb-0 pt-4">
        <div className="flex items-center gap-2">
          <span className="flex size-8 items-center justify-center rounded-full bg-primary/10 text-primary">
            <FeesIcon className="size-4" aria-hidden="true" />
          </span>
          <CardTitle className="text-base font-semibold">Vouchers</CardTitle>
        </div>
        <span className="text-xs font-medium text-muted-foreground tabular-nums">
          {summary.monthLabel}
        </span>
      </CardHeader>
      <CardContent className="flex min-h-0 flex-1 flex-col gap-4 px-4 pb-4 pt-3">
        <div className="space-y-1">
          <p className="text-xs text-muted-foreground">
            Total vouchers:{' '}
            <span className="font-semibold text-foreground tabular-nums">{summary.totalCount}</span>
          </p>
          <p className="text-lg font-semibold tracking-tight text-foreground">
            {formatMoney(minorUnits(summary.totalAmountMinor), { withSymbol: true })}
          </p>
          <StatusBadge tone="success" className="mt-1">
            {summary.paidPercent.toFixed(2)}% paid
          </StatusBadge>
        </div>

        <dl className="mt-auto space-y-2 text-sm">
          <VoucherRow
            tone="success"
            label="Paid"
            count={summary.paidCount}
            amountMinor={summary.paidAmountMinor}
          />
          <VoucherRow
            tone="warning"
            label="Unpaid"
            count={summary.unpaidCount}
            amountMinor={summary.unpaidAmountMinor}
          />
        </dl>

        <div className="flex justify-end border-t border-border pt-3">
          <DashboardCardViewLink href={detailsHref} />
        </div>
      </CardContent>
    </Card>
  );
}

function VoucherRow({
  tone,
  label,
  count,
  amountMinor,
}: {
  tone: 'success' | 'warning';
  label: string;
  count: number;
  amountMinor: number;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <div className="flex min-w-0 items-center gap-2">
        <span
          aria-hidden="true"
          className={cn(
            'size-2 shrink-0 rounded-full',
            tone === 'success' ? 'bg-success' : 'bg-warning',
          )}
        />
        <dt className="text-muted-foreground">
          {label}: <span className="font-medium text-foreground tabular-nums">{count}</span>
        </dt>
      </div>
      <dd className="shrink-0 text-sm font-medium tabular-nums text-foreground">
        {formatMoney(minorUnits(amountMinor), { withSymbol: true })}
      </dd>
    </div>
  );
}
