'use client';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@ilm/ui';
import { ExpenseIcon } from '@ilm/ui/icons';
import { formatMoney, minorUnits } from '@ilm/utils';
import type { ApexOptions } from 'apexcharts';
import dynamic from 'next/dynamic';
import { useMemo } from 'react';

import {
  DASHBOARD_FINANCE_CHART_HEIGHT,
  dashboardChartAxisPadding,
  formatMinorCompact,
  formatRupeesCompact,
  minorToRupees,
  roundToNearest,
} from '@/components/dashboard/dashboard-chart-theme';
import { useDashboardChartTheme } from '@/components/dashboard/use-dashboard-chart-theme';
import type { DashboardMonthlyExpense } from '@/lib/dashboard-data';

const ApexChart = dynamic(() => import('react-apexcharts'), { ssr: false });

type DashboardMonthlyExpensesChartProps = {
  monthly: DashboardMonthlyExpense[];
};

/**
 * Monthly spend — spline area (same family as revenue chart).
 * @see https://apexcharts.com/javascript-chart-demos/area-charts/area-spline/
 */
export function DashboardMonthlyExpensesChart({ monthly }: DashboardMonthlyExpensesChartProps) {
  const theme = useDashboardChartTheme();

  const latest = monthly.at(-1);
  const previous = monthly.at(-2);
  const latestMinor = latest?.amountMinor ?? 0;
  const trendLabel =
    previous !== undefined && previous.amountMinor > 0
      ? formatMonthChange(latestMinor, previous.amountMinor)
      : null;

  const { options, series } = useMemo(() => {
    const categories = monthly.map((entry) => entry.label);
    const amounts = monthly.map((entry) => minorToRupees(entry.amountMinor));

    return {
      series: [{ name: 'Expenses', data: amounts }],
      options: {
        chart: {
          type: 'area',
          height: DASHBOARD_FINANCE_CHART_HEIGHT,
          toolbar: { show: false },
          fontFamily: 'inherit',
          zoom: { enabled: false },
          animations: { enabled: true, easing: 'easeinout', speed: 600 },
        },
        colors: [theme.primaryMid],
        stroke: {
          curve: 'smooth',
          width: 2.5,
        },
        fill: {
          type: 'gradient',
          gradient: {
            shade: 'light',
            type: 'vertical',
            shadeIntensity: 0.3,
            gradientToColors: [theme.primaryLight],
            opacityFrom: 0.5,
            opacityTo: 0.05,
            stops: [0, 90, 100],
          },
        },
        dataLabels: { enabled: false },
        markers: {
          size: 0,
          strokeWidth: 0,
          hover: { size: 5, sizeOffset: 2 },
        },
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
          tickAmount: 4,
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
              const index = opts.dataPointIndex;
              const minor = monthly[index]?.amountMinor ?? 0;
              return formatMoney(minorUnits(minor), { withSymbol: true });
            },
          },
        },
      } satisfies ApexOptions,
    };
  }, [monthly, theme]);

  return (
    <Card className="flex h-full w-full flex-col rounded-2xl shadow-raised">
      <CardHeader className="flex flex-row items-start justify-between gap-3 border-0 px-4 pb-0 pt-4">
        <div className="flex min-w-0 items-start gap-2.5">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
            <ExpenseIcon className="size-4" aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <CardTitle className="text-base font-semibold">Monthly expenses</CardTitle>
            <CardDescription className="text-xs leading-snug">
              Operating spend by month
            </CardDescription>
          </div>
        </div>
        <div className="shrink-0 text-end">
          {trendLabel !== null ? (
            <span
              className={
                trendLabel.positive
                  ? 'mb-1 inline-block rounded-full bg-success/10 px-2 py-0.5 text-[11px] font-semibold text-success'
                  : 'mb-1 inline-block rounded-full bg-warning/10 px-2 py-0.5 text-[11px] font-semibold text-warning'
              }
            >
              {trendLabel.label}
            </span>
          ) : null}
          <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            This month
          </p>
          <p className="text-sm font-semibold tabular-nums text-foreground">
            {formatMinorCompact(latestMinor)}
          </p>
        </div>
      </CardHeader>
      <CardContent className="px-1 pb-3 pt-0 sm:px-2">
        <div className="w-full overflow-hidden rounded-lg bg-muted/30 px-1 py-2 sm:px-2">
          <ApexChart
            type="area"
            height={DASHBOARD_FINANCE_CHART_HEIGHT}
            width="100%"
            options={options}
            series={series}
          />
        </div>
      </CardContent>
    </Card>
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
  const down = delta < 0;
  return {
    label: down ? `${pct}% vs last month` : `+${pct}% vs last month`,
    positive: down,
  };
}
