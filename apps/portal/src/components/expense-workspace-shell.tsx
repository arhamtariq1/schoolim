'use client';

import { type ExpenseTotals } from '@ilm/contracts';
import { Card, Money } from '@ilm/ui';
import {
  CreateIcon,
  FeesIcon,
  ICON_SIZE,
} from '@ilm/ui/icons';
import { minorUnits } from '@ilm/utils';
import Link from 'next/link';
import type { ReactNode } from 'react';

import {
} from '@/components/dashboard/dashboard-stat-card';
import { DashboardStatCard } from '@/components/dashboard/dashboard-stat-card';
import { FinanceTabs } from '@/components/tab-links';
import { pageIntro } from '@/lib/page-copy';
import { useTenantHref } from '@/lib/use-tenant-href';

export interface ExpenseWorkspaceShellProps {
  readonly totals: ExpenseTotals;
  readonly monthTotals: ExpenseTotals;
  readonly lastMonthTotals?: ExpenseTotals;
  readonly canManage: boolean;
  readonly onAddExpense?: () => void;
  readonly children: ReactNode;
}

export function ExpenseWorkspaceShell({
  totals,
  monthTotals,
  lastMonthTotals,
  canManage,
  onAddExpense,
  children,
}: ExpenseWorkspaceShellProps) {
  const tenantHref = useTenantHref();
  const totalMinor = minorUnits(totals.totalMinor);
  const monthMinor = minorUnits(monthTotals.totalMinor);
  const trendLabel =
    lastMonthTotals === undefined
      ? undefined
      : monthTrendLabel(monthMinor, minorUnits(lastMonthTotals.totalMinor));

  return (
    <div className="w-full space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground md:text-3xl">Expenses</h1>
        <p className="mt-1 text-sm text-muted-foreground md:text-base">
          {pageIntro('/finance/expenses')}
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,4fr)_minmax(0,1fr)]">
        <div className="min-w-0 space-y-4">
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <DashboardStatCard
              label="Total expenses"
              value={<Money valueMinor={totalMinor} />}
              {...(trendLabel === undefined ? {} : { description: trendLabel })}
            />
            <DashboardStatCard
              label="Paid"
              value={<Money valueMinor={totalMinor} />}
              description={totalMinor === 0 ? '0% of total' : '100% of total'}
            />
            <DashboardStatCard
              label="Unpaid"
              value={<Money valueMinor={minorUnits(0)} />}
              description="0% of total"
            />
            <DashboardStatCard
              label="This month"
              value={<Money valueMinor={monthMinor} />}
              description={`${String(monthTotals.count)} ${monthTotals.count === 1 ? 'expense' : 'expenses'}`}
            />
          </div>

          <FinanceTabs />

          {children}
        </div>

        <aside className="space-y-4">
          <SidebarPanel title="Quick actions">
            {canManage && onAddExpense !== undefined ? (
              <button
                type="button"
                onClick={onAddExpense}
                className="flex w-full items-start gap-3 rounded-lg bg-primary/5 p-3 text-start transition-colors hover:bg-primary/10"
              >
                <span className="inline-flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground">
                  <CreateIcon className={ICON_SIZE.inline} aria-hidden />
                </span>
                <span>
                  <span className="block text-sm font-medium text-foreground">Add expense</span>
                  <span className="block text-xs text-muted-foreground">Record a new expense</span>
                </span>
              </button>
            ) : null}
            <Link
              href={tenantHref('/finance/expense-types')}
              className="flex w-full items-start gap-3 rounded-lg p-3 text-start transition-colors hover:bg-muted"
            >
              <span className="inline-flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                <FeesIcon className={ICON_SIZE.inline} aria-hidden />
              </span>
              <span>
                <span className="block text-sm font-medium text-foreground">Manage types</span>
                <span className="block text-xs text-muted-foreground">
                  Add, edit or disable expense types
                </span>
              </span>
            </Link>
          </SidebarPanel>
        </aside>
      </div>
    </div>
  );
}

function SidebarPanel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Card className="space-y-3 p-4">
      <h2 className="text-sm font-semibold text-foreground">{title}</h2>
      {children}
    </Card>
  );
}

function monthTrendLabel(currentMinor: number, previousMinor: number): string | undefined {
  if (previousMinor === 0) {
    return undefined;
  }
  const delta = Math.trunc(((currentMinor - previousMinor) / previousMinor) * 100);
  const sign = delta >= 0 ? '+' : '';
  return `${sign}${String(delta)}% vs last month`;
}
