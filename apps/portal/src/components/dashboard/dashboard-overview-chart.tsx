'use client';

import { Card, CardContent, CardDescription, CardHeader, CardTitle, cn } from '@ilm/ui';
import dynamic from 'next/dynamic';
import { useMemo, useState } from 'react';
import type { ApexOptions } from 'apexcharts';

import type {
  DashboardClassAttendance,
  DashboardFees,
  DashboardStudents,
} from '@/lib/dashboard-data';

const ApexChart = dynamic(() => import('react-apexcharts'), { ssr: false });

type ChartTab = 'attendance' | 'fees' | 'students';

type DashboardOverviewChartProps = {
  attendanceByClass: DashboardClassAttendance[];
  attendanceTotals?: { present: number; absent: number; leave: number };
  fees?: DashboardFees;
  students?: DashboardStudents;
  isWorkingDay: boolean;
};

const CHART_PRIMARY = '#147F8A';
const CHART_SUCCESS = '#16a34a';
const CHART_DANGER = '#dc2626';
const CHART_MUTED = '#94a3b8';

export function DashboardOverviewChart({
  attendanceByClass,
  attendanceTotals,
  fees,
  students,
  isWorkingDay,
}: DashboardOverviewChartProps) {
  const tabs = useMemo(() => {
    const items: ChartTab[] = [];
    if (attendanceByClass.length > 0 && isWorkingDay) {
      items.push('attendance');
    }
    if (fees !== undefined) {
      items.push('fees');
    }
    if (students !== undefined) {
      items.push('students');
    }
    return items;
  }, [attendanceByClass.length, fees, isWorkingDay, students]);

  const [active, setActive] = useState<ChartTab>(tabs[0] ?? 'fees');

  const effectiveTab = tabs.includes(active) ? active : (tabs[0] ?? 'fees');

  const { options, series, type } = useMemo(() => {
    if (effectiveTab === 'attendance') {
      const categories = attendanceByClass.map((row) => row.label);
      return {
        type: 'bar' as const,
        series: [
          { name: 'Present', data: attendanceByClass.map((row) => row.present) },
          { name: 'Absent', data: attendanceByClass.map((row) => row.absent) },
          { name: 'Leave', data: attendanceByClass.map((row) => row.leave) },
        ],
        options: barOptions(categories),
      };
    }

    if (effectiveTab === 'fees' && fees !== undefined) {
      return {
        type: 'donut' as const,
        series: [fees.paidMinor / 100, fees.outstandingMinor / 100],
        options: donutOptions(['Collected', 'Outstanding'], [CHART_SUCCESS, CHART_DANGER], true),
      };
    }

    const activeCount = students?.active ?? 0;
    const other = Math.max(0, (students?.total ?? 0) - activeCount);
    return {
      type: 'donut' as const,
      series: [activeCount, other],
      options: donutOptions(['Active', 'Other statuses'], [CHART_PRIMARY, CHART_MUTED], false),
    };
  }, [attendanceByClass, effectiveTab, fees, students]);

  if (tabs.length === 0) {
    return (
      <Card className="h-full">
        <CardHeader className="border-0 pb-0">
          <CardTitle>Overview</CardTitle>
          <CardDescription>Charts appear when attendance, fee or student data is available.</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <Card className="flex h-full flex-col">
      <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3 border-0 pb-0">
        <div>
          <CardTitle>School overview</CardTitle>
          <CardDescription>
            {effectiveTab === 'attendance'
              ? 'Student attendance by class for today.'
              : effectiveTab === 'fees'
                ? 'Collected versus outstanding across all vouchers.'
                : 'Active students compared with other statuses.'}
          </CardDescription>
        </div>
        <div className="flex flex-wrap gap-1 rounded-lg bg-muted/60 p-1">
          {tabs.map((tab) => (
            <button
              key={tab}
              type="button"
              onClick={() => {
                setActive(tab);
              }}
              className={cn(
                'rounded-md px-3 py-1.5 text-xs font-medium transition-colors',
                effectiveTab === tab
                  ? 'bg-card text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {tab === 'attendance' ? 'Attendance' : tab === 'fees' ? 'Fees' : 'Students'}
            </button>
          ))}
        </div>
      </CardHeader>
      <CardContent className="flex flex-1 flex-col pt-2">
        {effectiveTab === 'attendance' && attendanceTotals !== undefined ? (
          <dl className="mb-3 grid grid-cols-3 gap-2 text-center text-xs">
            <div className="rounded-lg bg-success/10 py-2">
              <dt className="text-muted-foreground">Present</dt>
              <dd className="text-lg font-semibold text-success">{attendanceTotals.present}</dd>
            </div>
            <div className="rounded-lg bg-danger/10 py-2">
              <dt className="text-muted-foreground">Absent</dt>
              <dd className="text-lg font-semibold text-danger">{attendanceTotals.absent}</dd>
            </div>
            <div className="rounded-lg bg-muted py-2">
              <dt className="text-muted-foreground">Leave</dt>
              <dd className="text-lg font-semibold">{attendanceTotals.leave}</dd>
            </div>
          </dl>
        ) : null}

        <div className="min-h-80 w-full flex-1">
          <ApexChart options={options} series={series} type={type} height={320} width="100%" />
        </div>
      </CardContent>
    </Card>
  );
}

function barOptions(categories: string[]): ApexOptions {
  return {
    chart: {
      type: 'bar',
      stacked: true,
      toolbar: { show: false },
      fontFamily: 'inherit',
    },
    plotOptions: {
      bar: {
        horizontal: false,
        columnWidth: '55%',
        borderRadius: 4,
      },
    },
    colors: [CHART_SUCCESS, CHART_DANGER, CHART_MUTED],
    dataLabels: { enabled: false },
    stroke: { show: true, width: 1, colors: ['transparent'] },
    xaxis: {
      categories,
      labels: {
        rotate: -35,
        trim: true,
        style: { fontSize: '11px' },
      },
    },
    yaxis: {
      labels: { style: { fontSize: '11px' } },
    },
    legend: {
      position: 'top',
      horizontalAlign: 'right',
      labels: { colors: CHART_MUTED },
    },
    grid: {
      borderColor: '#e2e8f0',
      strokeDashArray: 4,
    },
    tooltip: {
      theme: 'light',
      y: { formatter: (value: number) => `${value} students` },
    },
    fill: { opacity: 1 },
  };
}

function donutOptions(labels: string[], colors: string[], money: boolean): ApexOptions {
  return {
    chart: { type: 'donut', fontFamily: 'inherit' },
    labels,
    colors,
    legend: { position: 'bottom' },
    dataLabels: { enabled: true },
    stroke: { width: 0 },
    plotOptions: {
      pie: {
        donut: {
          size: '68%',
          labels: {
            show: true,
            total: {
              show: true,
              label: 'Total',
              formatter: (w) => {
                const sum = w.globals.seriesTotals.reduce((a: number, b: number) => a + b, 0);
                if (money) {
                  return `Rs ${sum.toLocaleString('en-PK', { maximumFractionDigits: 0 })}`;
                }
                return String(Math.round(sum));
              },
            },
          },
        },
      },
    },
  };
}
