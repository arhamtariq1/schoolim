'use client';

import { cn } from '@ilm/ui';
import { TrendDownIcon, TrendUpIcon } from '@ilm/ui/icons';
import Link from 'next/link';
import type { ReactNode } from 'react';

import { DashboardCard } from '@/components/dashboard/dashboard-card';
import {
  DASHBOARD_TREND_FAVORABLE_BADGE_CLASS,
  DASHBOARD_TREND_FAVORABLE_ICON_CLASS,
  DASHBOARD_TREND_NEUTRAL_BADGE_CLASS,
  DASHBOARD_TREND_NEUTRAL_ICON_CLASS,
  DASHBOARD_TREND_UNFAVORABLE_BADGE_CLASS,
  DASHBOARD_TREND_UNFAVORABLE_ICON_CLASS,
} from '@/components/dashboard/dashboard-trend-styles';

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

/** Shared number styling for KPIs and money in tables (size varies by context). */
export const DASHBOARD_STAT_NUMBER_CLASS =
  'font-medium tracking-tight text-foreground tabular-nums';

/** KPI figures on the home dashboard — reuse on other stat rows (e.g. Expenses). */
export const DASHBOARD_STAT_VALUE_CLASS = cn(
  DASHBOARD_STAT_NUMBER_CLASS,
  'text-2xl sm:text-4xl',
);

export const DASHBOARD_STAT_LABEL_CLASS = 'text-sm font-semibold text-foreground';

export const DASHBOARD_STAT_FOOTNOTE_CLASS = 'mt-2 text-xs leading-snug text-muted-foreground';

const DASHBOARD_STAT_CARD_CLASS = cn(
  'h-full bg-card transition-[border-color,transform] duration-200 ease-out',
  'hover:-translate-y-0.5 hover:border-primary/35',
  'focus-within:-translate-y-0.5 focus-within:border-primary/35',
);

type DashboardStatCardProps = {
  label: string;
  /** A figure, or a money / date component — shown in the same large type. */
  value: ReactNode;
  description?: string;
  href?: string;
  icon?: DashboardStatIconName;
  trend?: { label: string; positive: boolean };
  /** Makes the whole card a button, e.g. to filter the list beneath it. */
  onSelect?: () => void;
  /** Marks the card whose filter is currently applied. */
  selected?: boolean;
};

/** Reference-style KPI tile: title + pill, bold figure + trend dot, footnote. */
export function DashboardStatCard({
  label,
  value,
  description,
  href,
  trend,
  onSelect,
  selected = false,
}: DashboardStatCardProps) {
  const footnote = description ?? (trend === undefined ? undefined : trendFootnote(trend));
  const neutral = trend !== undefined && trend.label.toLowerCase().includes('stable');
  const trendUp = trend !== undefined && (neutral || trend.positive);

  const content = (
    <div className="flex h-full flex-col p-4">
      <div className="flex items-start justify-between gap-2">
        <p className={DASHBOARD_STAT_LABEL_CLASS}>{label}</p>
        {trend === undefined ? null : (
          <span
            className={
              neutral
                ? DASHBOARD_TREND_NEUTRAL_BADGE_CLASS
                : trend.positive
                  ? DASHBOARD_TREND_FAVORABLE_BADGE_CLASS
                  : DASHBOARD_TREND_UNFAVORABLE_BADGE_CLASS
            }
          >
            {trend.label}
          </span>
        )}
      </div>

      <div className="mt-3 flex items-center gap-2">
        <p className={DASHBOARD_STAT_VALUE_CLASS}>{value}</p>
        {trend === undefined ? null : (
          <span
            aria-hidden="true"
            className={
              neutral
                ? DASHBOARD_TREND_NEUTRAL_ICON_CLASS
                : trendUp
                  ? DASHBOARD_TREND_FAVORABLE_ICON_CLASS
                  : DASHBOARD_TREND_UNFAVORABLE_ICON_CLASS
            }
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
        <p className={DASHBOARD_STAT_FOOTNOTE_CLASS}>{footnote}</p>
      )}
    </div>
  );

  if (onSelect !== undefined) {
    return (
      <DashboardCard
        className={cn(
          DASHBOARD_STAT_CARD_CLASS,
          selected && 'border-primary',
          'focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2 focus-within:ring-offset-background',
        )}
      >
        <button
          type="button"
          aria-pressed={selected}
          onClick={onSelect}
          className="block h-full w-full text-start outline-none"
        >
          {content}
        </button>
      </DashboardCard>
    );
  }

  if (href === undefined) {
    return <DashboardCard className={DASHBOARD_STAT_CARD_CLASS}>{content}</DashboardCard>;
  }

  return (
    <DashboardCard
      className={cn(
        DASHBOARD_STAT_CARD_CLASS,
        'focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2 focus-within:ring-offset-background',
      )}
    >
      <Link href={href} className="block h-full outline-none">
        {content}
      </Link>
    </DashboardCard>
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
