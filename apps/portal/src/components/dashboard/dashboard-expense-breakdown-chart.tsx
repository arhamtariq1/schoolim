'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@ilm/ui';
import { formatMoney, minorUnits } from '@ilm/utils';
import dynamic from 'next/dynamic';
import { useEffect, useMemo, useState } from 'react';
import type { ApexOptions } from 'apexcharts';

import {
  formatRupeesCompact,
  readDashboardChartTheme,
  resolveCssColor,
  type DashboardChartTheme,
} from '@/components/dashboard/dashboard-chart-theme';
import type { DashboardExpenseSegment } from '@/lib/dashboard-data';

const ApexChart = dynamic(() => import('react-apexcharts'), { ssr: false });

const CHART_HEIGHT = 220;

type DashboardExpenseBreakdownChartProps = {
  segments: DashboardExpenseSegment[];
};

export function DashboardExpenseBreakdownChart({ segments }: DashboardExpenseBreakdownChartProps) {
  const [theme, setTheme] = useState<DashboardChartTheme>(() => readDashboardChartTheme());

  useEffect(() => {
    setTheme(readDashboardChartTheme());
    const observer = new MutationObserver(() => {
      setTheme(readDashboardChartTheme());
    });
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class', 'style'],
    });
    return () => {
      observer.disconnect();
    };
  }, []);

  const { options, series } = useMemo(() => {
    const chartLabels = segments.map((entry) => entry.label);
    const values = segments.map((entry) => Math.round(entry.amountMinor / 100));
    const palette = [theme.primary, theme.primaryMid, theme.primaryLight, theme.mutedForeground];

    return {
      series: values,
      options: {
        chart: {
          type: 'donut',
          height: CHART_HEIGHT,
          fontFamily: 'inherit',
        },
        colors: palette,
        labels: chartLabels,
        stroke: { width: 2, colors: [resolveCssColor('--card', '#ffffff')] },
        dataLabels: { enabled: false },
        legend: {
          position: 'bottom',
          fontSize: '11px',
          labels: { colors: theme.mutedForeground },
          markers: { size: 6 },
        },
        plotOptions: {
          pie: {
            donut: {
              size: '68%',
              labels: {
                show: true,
                name: { show: true, fontSize: '11px', color: theme.mutedForeground },
                value: {
                  show: true,
                  fontSize: '14px',
                  fontWeight: 600,
                  color: theme.primary,
                  formatter: (value: string) => {
                    const minor = Math.round(Number(value) * 100);
                    return formatRupeesCompact(Math.round(minor / 100));
                  },
                },
                total: {
                  show: true,
                  label: 'This month',
                  fontSize: '11px',
                  color: theme.mutedForeground,
                  formatter: (w) => {
                    const total = w.globals.seriesTotals.reduce(
                      (sum: number, n: number) => sum + n,
                      0,
                    );
                    return formatRupeesCompact(Math.round(total));
                  },
                },
              },
            },
          },
        },
        tooltip: {
          y: {
            formatter: (_value: number, opts) => {
              if (opts === undefined) {
                return '';
              }
              const minor = segments[opts.seriesIndex]?.amountMinor ?? 0;
              return formatMoney(minorUnits(minor), { withSymbol: true });
            },
          },
        },
      } satisfies ApexOptions,
    };
  }, [segments, theme]);

  return (
    <Card className="flex h-full w-full flex-col rounded-2xl shadow-raised">
      <CardHeader className="border-0 px-4 pb-0 pt-4">
        <CardTitle className="text-base">Expense breakdown</CardTitle>
      </CardHeader>
      <CardContent className="px-2 pb-3 pt-0">
        <div className="w-full overflow-hidden">
          <ApexChart
            type="donut"
            height={CHART_HEIGHT}
            width="100%"
            options={options}
            series={series}
          />
        </div>
      </CardContent>
    </Card>
  );
}
