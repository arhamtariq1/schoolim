import { Card, CardContent, CardHeader, CardTitle, cn } from '@ilm/ui';

import { formatMinorCompact } from '@/components/dashboard/dashboard-chart-theme';
import type { DashboardFeeCollection } from '@/lib/dashboard-data';

type DashboardFeesCollectionCardProps = {
  collection: DashboardFeeCollection;
};

export function DashboardFeesCollectionCard({ collection }: DashboardFeesCollectionCardProps) {
  return (
    <Card className="flex h-full w-full flex-col rounded-2xl shadow-raised">
      <CardHeader className="flex flex-row items-start justify-between gap-2 border-0 px-4 pb-0 pt-4">
        <CardTitle className="text-base">Fees collection</CardTitle>
        <span className="shrink-0 rounded-full bg-primary/10 px-2 py-0.5 text-xs font-semibold text-primary">
          {collection.trendLabel}
        </span>
      </CardHeader>
      <CardContent className="flex min-h-0 flex-1 flex-col gap-3 px-4 pb-4 pt-2">
        <div>
          <p className="text-xs font-medium text-muted-foreground">Collected this month</p>
          <p className="mt-0.5 text-xl font-semibold tracking-tight text-foreground">
            {formatMinorCompact(collection.collectedMinor)}
          </p>
        </div>

        <div className="mt-auto">
          <div className="mb-1 flex justify-between text-xs text-muted-foreground">
            <span>Progress</span>
            <span className="font-medium text-foreground">{collection.progressPercent}%</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-primary transition-all"
              style={{ width: `${collection.progressPercent}%` }}
            />
          </div>
        </div>

        <dl className="space-y-1.5 border-t border-border pt-3 text-xs">
          <FeeStat
            label="Collected"
            value={formatMinorCompact(collection.collectedMinor)}
            emphasis="primary"
          />
          <FeeStat
            label="Pending"
            value={formatMinorCompact(collection.pendingMinor)}
            emphasis="muted"
          />
          <FeeStat
            label="Total due"
            value={formatMinorCompact(collection.totalDueMinor)}
            emphasis="foreground"
          />
        </dl>
      </CardContent>
    </Card>
  );
}

function FeeStat({
  label,
  value,
  emphasis,
}: {
  label: string;
  value: string;
  emphasis: 'primary' | 'muted' | 'foreground';
}) {
  return (
    <div className="flex items-center justify-between gap-2 rounded-lg border border-border bg-muted/30 px-2 py-1.5">
      <dt className="shrink-0 text-muted-foreground">{label}</dt>
      <dd
        className={cn(
          'truncate text-xs font-semibold tabular-nums',
          emphasis === 'primary' && 'text-primary',
          emphasis === 'muted' && 'text-muted-foreground',
          emphasis === 'foreground' && 'text-foreground',
        )}
      >
        {value}
      </dd>
    </div>
  );
}
