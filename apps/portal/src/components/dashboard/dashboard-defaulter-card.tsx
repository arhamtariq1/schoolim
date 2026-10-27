'use client';

import { CardContent, CardHeader, CardTitle } from '@ilm/ui';
import { OverdueIcon } from '@ilm/ui/icons';
import { formatMoney, minorUnits } from '@ilm/utils';

import { DashboardCard } from '@/components/dashboard/dashboard-card';
import { DashboardCardViewLink } from '@/components/dashboard/dashboard-card-view-link';
import { roundToNearest } from '@/components/dashboard/dashboard-chart-theme';
import type { DashboardDefaulters } from '@/lib/dashboard-data';

/**
 * The half-circle gauge, as one path drawn twice: the track, then the share
 * of defaulting families over it. `pathLength={100}` lets the dash pattern be
 * the percentage itself.
 */
const GAUGE_ARC = 'M 16 100 A 84 84 0 0 1 184 100';

type DashboardDefaulterCardProps = {
  defaulters: DashboardDefaulters;
  detailsHref: string;
};

/**
 * Families behind on fees, against all students, with the amount owed set in
 * the gauge's hollow. Drawn as an SVG rather than a chart library: the label
 * then sits in the same box as the arc, so the two cannot drift apart at any
 * size — the landing page shows this card shrunk with CSS `zoom`, which is
 * where a separately sized chart and its overlaid label used to collide.
 */
export function DashboardDefaulterCard({ defaulters, detailsHref }: DashboardDefaulterCardProps) {
  const totalStudents = defaulters.totalStudents ?? 0;
  const gaugePercent =
    totalStudents === 0
      ? 0
      : Math.min(100, roundToNearest((defaulters.families / totalStudents) * 100));

  return (
    <DashboardCard className="flex h-full w-full flex-col rounded-lg">
      <CardHeader className="flex flex-row items-center gap-2 border-0 px-4 pt-4 pb-0">
        <span className="flex size-8 items-center justify-center rounded-full bg-primary/10 text-primary">
          <OverdueIcon className="size-4" aria-hidden="true" />
        </span>
        <CardTitle className="text-base font-semibold">Defaulter</CardTitle>
      </CardHeader>
      <CardContent className="flex min-h-0 flex-1 flex-col px-4 pt-4 pb-4">
        <div className="relative mx-auto w-full max-w-56">
          <svg viewBox="0 0 200 108" className="block w-full" aria-hidden="true">
            <path
              d={GAUGE_ARC}
              pathLength={100}
              fill="none"
              strokeWidth={16}
              strokeLinecap="round"
              className="stroke-muted"
            />
            {gaugePercent > 0 ? (
              <path
                d={GAUGE_ARC}
                pathLength={100}
                fill="none"
                strokeWidth={16}
                strokeLinecap="round"
                strokeDasharray={`${String(gaugePercent)} 100`}
                className="stroke-primary"
              />
            ) : null}
          </svg>
          <div className="absolute inset-x-0 bottom-0 text-center">
            <p className="text-xs text-muted-foreground">Total amount</p>
            <p className="text-lg font-semibold text-foreground tabular-nums">
              {formatMoney(minorUnits(defaulters.totalOwedMinor), { withSymbol: true })}
            </p>
          </div>
        </div>

        <dl className="mt-4 grid grid-cols-2 gap-3 border-t border-border pt-3 text-center text-sm">
          <div>
            <dt className="text-xs text-muted-foreground">Defaulters</dt>
            <dd className="font-semibold text-foreground tabular-nums">{defaulters.families}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Total students</dt>
            <dd className="font-semibold text-foreground tabular-nums">
              {totalStudents === 0 ? '—' : totalStudents}
            </dd>
          </div>
        </dl>

        <div className="mt-auto flex justify-end pt-3">
          <DashboardCardViewLink href={detailsHref} />
        </div>
      </CardContent>
    </DashboardCard>
  );
}
