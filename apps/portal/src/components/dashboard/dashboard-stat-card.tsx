'use client';

import { Card, cn } from '@ilm/ui';
import { TrendDownIcon, TrendUpIcon } from '@ilm/ui/icons';
import Link from 'next/link';

export const DASHBOARD_STAT_ICON_NAMES = [
  'StudentsIcon',
  'AccountIcon',
  'ClassIcon',
  'FeesIcon',
  'FinanceIcon',
  'AttendanceIcon',
  'OverdueIcon',
] as const;

export type DashboardStatIconName = (typeof DASHBOARD_STAT_ICON_NAMES)[number];

type DashboardStatCardProps = {
  label: string;
  value: string;
  description?: string;
  href?: string;
  icon: DashboardStatIconName;
  trend?: { label: string; positive: boolean };
};

/** Reference-style KPI tile: title + pill, bold figure + trend dot, footnote. */
export function DashboardStatCard({
  label,
  value,
  description,
  href,
  trend,
}: DashboardStatCardProps) {
  const footnote = description ?? (trend === undefined ? undefined : trendFootnote(trend));
  const neutral = trend !== undefined && trend.label.toLowerCase().includes('stable');
  const trendUp = trend !== undefined && (neutral || trend.positive);

  const content = (
    <div className="flex h-full flex-col p-4">
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm font-semibold text-foreground">{label}</p>
        {trend === undefined ? null : (
          <span
            className={cn(
              'inline-flex shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold tabular-nums',
              neutral
                ? 'bg-muted text-muted-foreground'
                : trend.positive
                  ? 'bg-success/10 text-success'
                  : 'bg-danger/10 text-danger',
            )}
          >
            {trend.label}
          </span>
        )}
      </div>

      <div className="mt-3 flex items-center gap-2">
        <p className="text-2xl font-medium tracking-tight text-foreground tabular-nums sm:text-4xl">
          {value}
        </p>
        {trend === undefined ? null : (
          <span
            aria-hidden="true"
            className={cn(
              'inline-flex size-7 shrink-0 items-center justify-center rounded-full',
              neutral
                ? 'bg-muted text-muted-foreground'
                : trendUp
                  ? 'bg-success/10 text-success'
                  : 'bg-danger/10 text-danger',
            )}
          >
            {neutral ? (
              <span className="text-xs font-bold">—</span>
            ) : trendUp ? (
              <TrendUpIcon className="size-3.5" />
            ) : (
              <TrendDownIcon className="size-3.5" />
            )}
          </span>
        )}
      </div>

      {footnote === undefined ? null : (
        <p className="mt-2 text-xs leading-snug text-muted-foreground">{footnote}</p>
      )}
    </div>
  );

  if (href === undefined) {
    return (
      <Card className="h-full rounded-xl border border-border bg-card shadow-sm">{content}</Card>
    );
  }

  return (
    <Card
      className={cn(
        'h-full rounded-xl border border-border bg-card shadow-sm transition-shadow hover:shadow-md',
        'focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2 focus-within:ring-offset-background',
      )}
    >
      <Link href={href} className="block h-full outline-none">
        {content}
      </Link>
    </Card>
  );
}

function trendFootnote(trend: { label: string; positive: boolean }): string {
  const neutral = trend.label.toLowerCase().includes('stable');
  if (neutral) {
    return 'Stable compared to last month';
  }
  const stripped = trend.label.replace(/\s/g, '');
  return trend.positive ? `Up ${stripped} vs last month` : `Down ${stripped} vs last month`;
}
