'use client';

import { type ExpenseTotals } from '@ilm/contracts';
import { Card, cn, Money } from '@ilm/ui';
import {
  CreateIcon,
  ExpenseIcon,
  FeesIcon,
  FinanceIcon,
  ICON_SIZE,
  OverdueIcon,
  TrendUpIcon,
} from '@ilm/ui/icons';
import { minorUnits } from '@ilm/utils';
import Link from 'next/link';
import type { ReactNode } from 'react';

import {
  DASHBOARD_STAT_FOOTNOTE_CLASS,
  DASHBOARD_STAT_LABEL_CLASS,
  DASHBOARD_STAT_NUMBER_CLASS,
  DASHBOARD_STAT_VALUE_CLASS,
} from '@/components/dashboard/dashboard-stat-card';
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
            <ExpenseStatCard
              label="Total expenses"
              valueMinor={totalMinor}
              hint={trendLabel}
              icon={FinanceIcon}
              iconClassName="bg-primary/10 text-primary"
            />
            <ExpenseStatCard
              label="Paid"
              valueMinor={totalMinor}
              hint={totalMinor === 0 ? '0% of total' : '100% of total'}
              icon={TrendUpIcon}
              iconClassName="bg-success/10 text-success"
            />
            <ExpenseStatCard
              label="Unpaid"
              valueMinor={0}
              hint="0% of total"
              icon={OverdueIcon}
              iconClassName="bg-danger/10 text-danger"
            />
            <ExpenseStatCard
              label="This month"
              valueMinor={monthMinor}
              hint={`${String(monthTotals.count)} ${monthTotals.count === 1 ? 'expense' : 'expenses'}`}
              icon={ExpenseIcon}
              iconClassName="bg-info/10 text-info"
            />
          </div>

          <FinanceTabs />

          {children}
        </div>

        <aside className="space-y-4">
          <SidebarPanel title="Expense summary">
            <SummaryRow label="Total" valueMinor={totalMinor} />
            <SummaryRow label="Paid" valueMinor={totalMinor} />
            <SummaryRow label="Unpaid" valueMinor={0} />
            <SummaryRow label="This month" valueMinor={monthMinor} />
          </SidebarPanel>

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

function ExpenseStatCard({
  label,
  valueMinor,
  hint,
  icon: Icon,
  iconClassName,
}: {
  label: string;
  valueMinor: number;
  hint?: string;
  icon: typeof FinanceIcon;
  iconClassName: string;
}) {
  return (
    <Card className="h-full rounded-xl border border-border bg-card shadow-sm">
      <div className="flex h-full flex-col p-4">
        <div className="flex items-start justify-between gap-2">
          <p className={DASHBOARD_STAT_LABEL_CLASS}>{label}</p>
          <span
            className={cn(
              'inline-flex size-10 shrink-0 items-center justify-center rounded-lg',
              iconClassName,
            )}
          >
            <Icon className="size-5" aria-hidden />
          </span>
        </div>
        <Money valueMinor={minorUnits(valueMinor)} className={cn('mt-3', DASHBOARD_STAT_VALUE_CLASS)} />
        {hint === undefined ? null : <p className={DASHBOARD_STAT_FOOTNOTE_CLASS}>{hint}</p>}
      </div>
    </Card>
  );
}

function SidebarPanel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Card className="space-y-3 rounded-xl border border-border bg-card p-4 shadow-sm">
      <h2 className="text-sm font-semibold text-foreground">{title}</h2>
      {children}
    </Card>
  );
}

function SummaryRow({ label, valueMinor }: { label: string; valueMinor: number }) {
  return (
    <div className="flex items-center justify-between gap-2 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <Money valueMinor={minorUnits(valueMinor)} className={DASHBOARD_STAT_NUMBER_CLASS} />
    </div>
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
