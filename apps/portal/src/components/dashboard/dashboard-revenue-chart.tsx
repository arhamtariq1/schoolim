'use client';

import { CardContent, CardDescription, CardHeader, CardTitle } from '@ilm/ui';

import { DashboardCard } from '@/components/dashboard/dashboard-card';
import { FinanceIcon } from '@ilm/ui/icons';
import { formatMoney, minorUnits } from '@ilm/utils';
import type { ApexOptions } from 'apexcharts';
import dynamic from 'next/dynamic';
import { useMemo } from 'react';

import {
  DASHBOARD_FINANCE_CHART_HEIGHT,
  dashboardChartAxisPadding,
  formatMinorExact,
  formatRupeesCompact,
  minorToRupees,
  roundToNearest,
} from '@/components/dashboard/dashboard-chart-theme';
import {
  DASHBOARD_TREND_CAUTION_PILL_CLASS,
  DASHBOARD_TREND_FAVORABLE_PILL_CLASS,
} from '@/components/dashboard/dashboard-trend-styles';
import { useDashboardChartTheme } from '@/components/dashboard/use-dashboard-chart-theme';
import type { DashboardRevenueMonth } from '@/lib/dashboard-data';

const ApexChart = dynamic(() => import('react-apexcharts'), { ssr: false });

type DashboardRevenueChartProps = {
  trend: DashboardRevenueMonth[];
};

/**
 * Revenue by month: fees earned, security deposits excluded — the figure
 * Finance › Revenue shows. Never net of expenses: spending has its own chart
 * beside this one, and a "revenue" line that dives below zero in a month of
 * heavy spending reads as money the school lost from its fees.
 */
export function DashboardRevenueChart({ trend }: DashboardRevenueChartProps) {
  const theme = useDashboardChartTheme();

  const latest = trend.at(-1);
  const previous = trend.at(-2);
  const latestRevenue = latest?.collectedMinor ?? 0;
  const trendLabel =
    previous !== undefined && previous.collectedMinor > 0
      ? formatMonthChange(latestRevenue, previous.collectedMinor)
      : null;

  const { options, series } = useMemo(() => {
    const categories = trend.map((entry) => entry.label);
    const revenue = trend.map((entry) => minorToRupees(entry.collectedMinor));

    const axis = niceAxis(0, revenue.length === 0 ? 0 : Math.max(...revenue), 4);

    return {
      series: [{ name: 'Revenue', data: revenue }],
      options: {
        chart: {
          type: 'line',
          height: DASHBOARD_FINANCE_CHART_HEIGHT,
          toolbar: { show: false },
          fontFamily: 'inherit',
          zoom: { enabled: false },
          animations: { enabled: true, easing: 'easeinout', speed: 600 },
        },
        colors: [theme.primaryMid],
        stroke: {
          show: true,
          curve: 'smooth',
          width: 3,
          lineCap: 'round',
          colors: [theme.primaryMid],
          dashArray: 0,
        },
        fill: {
          type: 'solid',
          opacity: 0,
        },
        dataLabels: { enabled: false },
        markers: {
          size: 4,
          colors: [theme.primaryMid],
          strokeColors: theme.border,
          strokeWidth: 2,
          hover: { size: 6 },
        },
        legend: { show: false },
        xaxis: {
          categories,
          axisBorder: { show: false },
          axisTicks: { show: false },
          crosshairs: {
            stroke: { color: theme.border, width: 1, dashArray: 4 },
          },
          labels: {
            style: { colors: theme.mutedForeground, fontSize: '11px', fontWeight: 500 },
          },
        },
        yaxis: {
          // Round multiples of the step, so the ticks read 0, 2k, 4k… rather
          // than the raw maximum.
          tickAmount: axis.ticks,
          min: axis.min,
          max: axis.max,
          labels: {
            style: { colors: theme.mutedForeground, fontSize: '11px' },
            formatter: (value: number) => formatRupeesCompact(value),
          },
        },
        grid: {
          borderColor: theme.border,
          strokeDashArray: 4,
          padding: dashboardChartAxisPadding(),
          xaxis: { lines: { show: false } },
          yaxis: { lines: { show: true } },
        },
        tooltip: {
          theme: 'light',
          x: { show: true },
          y: {
            formatter: (_value: number, opts) => {
              if (opts === undefined) {
                return '';
              }
              const minor = trend[opts.dataPointIndex]?.collectedMinor ?? 0;
              return formatMoney(minorUnits(minor), { withSymbol: true });
            },
          },
        },
      } satisfies ApexOptions,
    };
  }, [theme, trend]);

  return (
    <DashboardCard className="flex h-full w-full flex-col rounded-2xl">
      <CardHeader className="flex flex-row items-start justify-between gap-3 border-0 px-4 pb-0 pt-4">
        <div className="flex min-w-0 items-start gap-2.5">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
            <FinanceIcon className="size-4" aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <CardTitle className="text-base font-semibold">Revenue</CardTitle>
            <CardDescription className="text-xs leading-snug">
              Fees earned each month, deposits excluded
            </CardDescription>
          </div>
        </div>
        <div className="shrink-0 text-end">
          {trendLabel !== null ? (
            <span
              className={
                trendLabel.positive
                  ? DASHBOARD_TREND_FAVORABLE_PILL_CLASS
                  : DASHBOARD_TREND_CAUTION_PILL_CLASS
              }
            >
              {trendLabel.label}
            </span>
          ) : null}
          <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            This month
          </p>
          <p className="text-sm font-semibold tabular-nums text-foreground">
            {formatMinorExact(latestRevenue)}
          </p>
        </div>
      </CardHeader>
      <CardContent className="px-1 pb-3 pt-0 sm:px-2">
        <div className="w-full overflow-hidden rounded-lg bg-muted/30 px-1 py-2 sm:px-2">
          <ApexChart
            key={theme.primaryMid}
            type="line"
            height={DASHBOARD_FINANCE_CHART_HEIGHT}
            width="100%"
            options={options}
            series={series}
          />
        </div>
      </CardContent>
    </DashboardCard>
  );
}

function formatMonthChange(
  latestMinor: number,
  previousMinor: number,
): { label: string; positive: boolean } {
  const delta = latestMinor - previousMinor;
  const pct = roundToNearest((Math.abs(delta) / previousMinor) * 100);
  if (delta === 0) {
    return { label: 'Flat vs last month', positive: true };
  }
  const up = delta > 0;
  return {
    label: up ? `+${pct}% vs last month` : `−${pct}% vs last month`,
    positive: up,
  };
}

/**
 * Round axis bounds: a step of 1, 2 or 5 × 10^n, and min/max on multiples of it.
 * Zero is always inside, so the axis starts from nothing.
 */
function niceAxis(low: number, high: number, targetTicks: number): { min: number; max: number; ticks: number } {
  const lo = Math.min(0, low);
  const hi = Math.max(0, high);
  if (hi - lo === 0) {
    return { min: 0, max: 1000, ticks: targetTicks };
  }
  const raw = (hi - lo) / targetTicks;
  const magnitude = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 5, 10].map((m) => m * magnitude).find((candidate) => candidate >= raw) ?? 10 * magnitude;
  const min = Math.floor(lo / step) * step;
  const max = Math.ceil(hi / step) * step;
  return { min, max, ticks: (max - min) / step };
}
