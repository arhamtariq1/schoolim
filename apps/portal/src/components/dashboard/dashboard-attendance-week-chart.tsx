'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@ilm/ui';
import dynamic from 'next/dynamic';
import { useEffect, useMemo, useState } from 'react';
import type { ApexOptions } from 'apexcharts';

import type { DashboardWeeklyAttendance } from '@/lib/dashboard-data';

const ApexChart = dynamic(() => import('react-apexcharts'), { ssr: false });

const CHART_HEIGHT = 248;

type ChartThemeColors = {
  present: string;
  absent: string;
  leave: string;
  border: string;
  mutedForeground: string;
};

type DashboardAttendanceWeekChartProps = {
  weekly: DashboardWeeklyAttendance[];
};

/** ApexCharts SVG fills need computed sRGB — raw oklch/var() strings render black or fade out. */
function resolveCssColor(varName: string, fallback: string): string {
  if (typeof document === 'undefined') {
    return fallback;
  }

  const probe = document.createElement('span');
  probe.style.display = 'none';
  probe.style.color = varName.startsWith('--') ? `var(${varName})` : varName;
  document.documentElement.append(probe);
  const resolved = getComputedStyle(probe).color;
  probe.remove();

  return resolved !== '' ? resolved : fallback;
}

function readChartThemeColors(): ChartThemeColors {
  const fallbackPresent = 'rgb(20, 127, 138)';
  const fallbackAbsent = 'rgb(16, 100, 109)';
  const fallbackLeave = 'rgb(72, 160, 170)';
  const fallbackBorder = 'rgb(226, 232, 240)';
  const fallbackMuted = 'rgb(100, 116, 139)';

  if (typeof document === 'undefined') {
    return {
      present: fallbackPresent,
      absent: fallbackAbsent,
      leave: fallbackLeave,
      border: fallbackBorder,
      mutedForeground: fallbackMuted,
    };
  }

  return {
    present: resolveCssColor('--primary', fallbackPresent),
    absent: resolveCssColor('--color-brand-800', fallbackAbsent),
    leave: resolveCssColor('--color-brand-400', fallbackLeave),
    border: resolveCssColor('--border', fallbackBorder),
    mutedForeground: resolveCssColor('--muted-foreground', fallbackMuted),
  };
}

function shortDayLabel(entry: DashboardWeeklyAttendance): string {
  if (entry.date !== undefined && entry.date !== '') {
    const parsed = new Date(`${entry.date}T12:00:00Z`);
    return parsed.toLocaleDateString('en-PK', {
      weekday: 'short',
      day: 'numeric',
      timeZone: 'UTC',
    });
  }

  const parts = entry.label.trim().split(/\s+/);
  if (parts.length >= 2) {
    return `${parts[0]} ${parts[1]}`;
  }
  return entry.label;
}

const LEGEND = [
  { key: 'present', label: 'Present' },
  { key: 'absent', label: 'Absent' },
  { key: 'leave', label: 'Leave' },
] as const;

/**
 * Weekly attendance — grouped column chart (present / absent / leave).
 * @see https://apexcharts.com/javascript-chart-demos/column-charts/basic-column/
 */
export function DashboardAttendanceWeekChart({ weekly }: DashboardAttendanceWeekChartProps) {
  const [theme, setTheme] = useState<ChartThemeColors>(() => readChartThemeColors());

  useEffect(() => {
    setTheme(readChartThemeColors());

    const observer = new MutationObserver(() => {
      setTheme(readChartThemeColors());
    });
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class', 'style'],
    });
    return () => {
      observer.disconnect();
    };
  }, []);

  const categories = useMemo(() => weekly.map((entry) => shortDayLabel(entry)), [weekly]);

  const { options, series } = useMemo(() => {
    return {
      series: [
        { name: 'Present', data: weekly.map((entry) => entry.present) },
        { name: 'Absent', data: weekly.map((entry) => entry.absent) },
        { name: 'Leave', data: weekly.map((entry) => entry.leave) },
      ],
      options: {
        chart: {
          type: 'bar',
          height: CHART_HEIGHT,
          toolbar: { show: false },
          fontFamily: 'inherit',
          animations: { enabled: true },
          zoom: { enabled: false },
        },
        colors: [theme.present, theme.absent, theme.leave],
        plotOptions: {
          bar: {
            horizontal: false,
            columnWidth: '42%',
            borderRadius: 6,
            borderRadiusApplication: 'end',
          },
        },
        dataLabels: { enabled: false },
        stroke: {
          show: true,
          width: 2,
          colors: ['transparent'],
        },
        fill: {
          type: 'solid',
          opacity: 1,
        },
        states: {
          hover: { filter: { type: 'darken', value: 0.08 } },
          active: {
            allowMultipleDataPointsSelection: false,
            filter: { type: 'none' },
          },
        },
        xaxis: {
          type: 'category',
          categories,
          tickPlacement: 'on',
          labels: {
            style: { colors: theme.mutedForeground, fontSize: '12px' },
            rotate: 0,
            hideOverlappingLabels: true,
          },
          axisBorder: { show: false },
          axisTicks: { show: false },
          tooltip: { enabled: false },
        },
        yaxis: {
          min: 0,
          forceNiceScale: true,
          labels: {
            style: { colors: theme.mutedForeground, fontSize: '11px' },
            formatter: (value: number) => (Number.isFinite(value) ? String(Math.round(value)) : ''),
          },
          title: {
            text: 'Students',
            offsetX: -4,
            style: { color: theme.mutedForeground, fontSize: '11px', fontWeight: 500 },
          },
        },
        legend: { show: false },
        grid: {
          borderColor: theme.border,
          strokeDashArray: 4,
          padding: { left: 8, right: 12, top: 0, bottom: 0 },
        },
        tooltip: {
          shared: true,
          intersect: false,
          theme: 'light',
          x: { show: true },
          y: {
            formatter: (value: number) => (Number.isFinite(value) ? String(Math.round(value)) : ''),
          },
        },
      } satisfies ApexOptions,
    };
  }, [categories, theme, weekly]);

  return (
    <Card className="flex h-full w-full flex-col rounded-2xl shadow-raised">
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2 border-0 px-4 pb-0 pt-4 sm:px-6">
        <CardTitle className="shrink-0">Attendance overview</CardTitle>
        <ul className="flex flex-wrap items-center justify-end gap-x-4 gap-y-1 text-xs font-medium text-muted-foreground">
          {LEGEND.map((item) => {
            const swatch =
              item.key === 'present'
                ? theme.present
                : item.key === 'absent'
                  ? theme.absent
                  : theme.leave;
            return (
              <li key={item.key} className="inline-flex items-center gap-1.5 whitespace-nowrap">
                <span
                  aria-hidden="true"
                  className="size-2.5 shrink-0 rounded-sm"
                  style={{ backgroundColor: swatch }}
                />
                {item.label}
              </li>
            );
          })}
        </ul>
      </CardHeader>
      <CardContent className="flex min-h-0 flex-1 flex-col px-4 pb-4 pt-1 sm:px-6">
        <div className="min-h-0 flex-1" aria-hidden="true" />
        <div className="w-full shrink-0 overflow-hidden">
          <ApexChart type="bar" height={CHART_HEIGHT} width="100%" options={options} series={series} />
        </div>
      </CardContent>
    </Card>
  );
}
