'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@ilm/ui';
import { OverdueIcon } from '@ilm/ui/icons';
import { formatMoney, minorUnits } from '@ilm/utils';
import type { ApexOptions } from 'apexcharts';
import dynamic from 'next/dynamic';
import { useEffect, useMemo, useState } from 'react';

import { DashboardCardViewLink } from '@/components/dashboard/dashboard-card-view-link';
import {
  readDashboardChartTheme,
  type DashboardChartTheme,
  roundToNearest,
} from '@/components/dashboard/dashboard-chart-theme';
import type { DashboardDefaulters } from '@/lib/dashboard-data';

const ApexChart = dynamic(() => import('react-apexcharts'), { ssr: false });

const CHART_HEIGHT = 200;

type DashboardDefaulterCardProps = {
  defaulters: DashboardDefaulters;
  detailsHref: string;
};

export function DashboardDefaulterCard({ defaulters, detailsHref }: DashboardDefaulterCardProps) {
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

  const totalStudents = defaulters.totalStudents ?? 0;
  const gaugePercent =
    totalStudents === 0
      ? 0
      : Math.min(100, roundToNearest((defaulters.families / totalStudents) * 100));

  const { options, series } = useMemo(() => {
    return {
      series: [gaugePercent],
      options: {
        chart: {
          type: 'radialBar',
          height: CHART_HEIGHT,
          sparkline: { enabled: false },
          fontFamily: 'inherit',
        },
        colors: [theme.primary],
        plotOptions: {
          radialBar: {
            startAngle: -90,
            endAngle: 90,
            hollow: {
              size: '62%',
            },
            track: {
              background: theme.border,
              strokeWidth: '100%',
            },
            dataLabels: {
              name: { show: false },
              value: {
                show: false,
              },
            },
          },
        },
        stroke: { lineCap: 'round' },
        labels: ['Defaulters'],
      } satisfies ApexOptions,
    };
  }, [gaugePercent, theme]);

  return (
    <Card className="flex h-full w-full flex-col rounded-lg shadow-raised">
      <CardHeader className="flex flex-row items-center gap-2 border-0 px-4 pb-0 pt-4">
        <span className="flex size-8 items-center justify-center rounded-full bg-primary/10 text-primary">
          <OverdueIcon className="size-4" aria-hidden="true" />
        </span>
        <CardTitle className="text-base font-semibold">Defaulter</CardTitle>
      </CardHeader>
      <CardContent className="flex min-h-0 flex-1 flex-col px-4 pb-4 pt-2">
        <div className="relative mx-auto w-full max-w-xs">
          <ApexChart type="radialBar" height={CHART_HEIGHT} width="100%" options={options} series={series} />
          <div className="pointer-events-none absolute inset-x-0 top-[42%] text-center">
            <p className="text-xs text-muted-foreground">Total amount</p>
            <p className="text-base font-semibold tabular-nums text-foreground">
              {formatMoney(minorUnits(defaulters.totalOwedMinor), { withSymbol: true })}
            </p>
          </div>
        </div>

        <dl className="mt-1 grid grid-cols-2 gap-3 border-t border-border pt-3 text-center text-sm">
          <div>
            <dt className="text-xs text-muted-foreground">Defaulters</dt>
            <dd className="font-semibold tabular-nums text-foreground">{defaulters.families}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Total students</dt>
            <dd className="font-semibold tabular-nums text-foreground">
              {totalStudents === 0 ? '—' : totalStudents}
            </dd>
          </div>
        </dl>

        <div className="mt-auto flex justify-end pt-3">
          <DashboardCardViewLink href={detailsHref} />
        </div>
      </CardContent>
    </Card>
  );
}
