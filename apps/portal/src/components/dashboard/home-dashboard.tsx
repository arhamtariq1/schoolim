import type { SessionUser } from '@ilm/contracts';
import { DEFAULT_TIMEZONE } from '@ilm/utils';
import type { Route } from 'next';
import type { ReactNode } from 'react';

import { DashboardAttendanceWeekChart } from '@/components/dashboard/dashboard-attendance-week-chart';
import { formatMinorExact } from '@/components/dashboard/dashboard-chart-theme';
import { DashboardDefaulterCard } from '@/components/dashboard/dashboard-defaulter-card';
import { DashboardExpenseBreakdownChart } from '@/components/dashboard/dashboard-expense-breakdown-chart';
import { DashboardFeesCollectionCard } from '@/components/dashboard/dashboard-fees-collection-card';
import {
  DashboardHeaderBand,
  timeBasedGreeting,
} from '@/components/dashboard/dashboard-header-band';
import { DashboardMonthCalendar } from '@/components/dashboard/dashboard-month-calendar';
import { DashboardMonthlyExpensesChart } from '@/components/dashboard/dashboard-monthly-expenses-chart';
import { DashboardRecentAdmissionsTable } from '@/components/dashboard/dashboard-recent-admissions-table';
import { DashboardRecentFeePaymentsTable } from '@/components/dashboard/dashboard-recent-fee-payments-table';
import { DashboardRevenueChart } from '@/components/dashboard/dashboard-revenue-chart';
import {
  DashboardStatCard,
  type DashboardStatIconName,
} from '@/components/dashboard/dashboard-stat-card';
import { DashboardVouchersCard } from '@/components/dashboard/dashboard-vouchers-card';
import type { DashboardSnapshot, DashboardStatTrend } from '@/lib/dashboard-data';
import { withTenantPrefix } from '@/lib/tenant-mode';

type HomeDashboardProps = {
  session: SessionUser;
  snapshot: DashboardSnapshot;
  tenantSlug: string | undefined;
  verifyBanner?: ReactNode;
  /**
   * Leaves out the attendance-and-calendar row. Only the landing page's
   * preview sets it, so its frame shows the finance cards instead; a school's
   * own dashboard always has the row.
   */
  omitAttendanceRow?: boolean;
};

function href(path: Route, tenantSlug: string | undefined): string {
  return withTenantPrefix(path, tenantSlug);
}

function can(permissions: readonly string[], permission: string): boolean {
  return permissions.includes(permission);
}

/**
 * Column classes for the summary row, by how many cards are actually shown.
 *
 * Whole class names, not interpolated ones, so Tailwind can see them. A row of
 * three cards on a four-column grid leaves a hole where the missing card was;
 * the grid follows the count instead, and the cards share the full width.
 */
function summaryColumns(count: number): string {
  if (count <= 1) {
    return 'grid-cols-1';
  }
  if (count === 2) {
    return 'grid-cols-1 sm:grid-cols-2';
  }
  if (count === 3) {
    return 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3';
  }
  return 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-4';
}

/** Revenue is the Admin's alone; everyone else gets the expenses half of the row. */
function showRevenue(snapshot: DashboardSnapshot, permissions: readonly string[]): boolean {
  return can(permissions, 'finance.revenue.read') && snapshot.revenueTrend.length > 0;
}

function showRevenueExpensesRow(
  snapshot: DashboardSnapshot,
  permissions: readonly string[],
): boolean {
  if (!can(permissions, 'finance.expense.read')) {
    return false;
  }
  return showRevenue(snapshot, permissions) || snapshot.monthlyExpenses.length > 0;
}

function showFeesCardsColumn(snapshot: DashboardSnapshot, permissions: readonly string[]): boolean {
  return (
    (can(permissions, 'fees.voucher.read') && snapshot.voucherSummary !== undefined) ||
    (can(permissions, 'fees.defaulter.read') && snapshot.defaulters !== undefined)
  );
}

export function HomeDashboard({
  session,
  snapshot,
  tenantSlug,
  verifyBanner,
  omitAttendanceRow = false,
}: HomeDashboardProps) {
  const permissions = session.permissions;
  const firstName = session.name.trim().split(/\s+/)[0] ?? '';
  const greeting = timeBasedGreeting(firstName, session.school.timezone ?? DEFAULT_TIMEZONE);
  const statCards = buildStatCards(snapshot, permissions, tenantSlug);

  return (
    // No padding and no background of its own: the shell owns both. The
    // `bg-slate-50` that used to be here stayed light in dark mode, which is a
    // white sheet behind dark cards.
    <div className="w-full space-y-3">
      {verifyBanner}

      <DashboardHeaderBand greeting={greeting} schoolName={session.school.name} />

      {snapshot.issues.length > 0 ? (
        <div
          role="status"
          className="rounded-xl border border-warning/30 bg-warning/10 px-4 py-3 text-sm text-foreground"
        >
          Some figures could not be loaded. Open the relevant module for full detail.
        </div>
      ) : null}

      {statCards.length > 0 ? (
        <section
          aria-label="Summary"
          className={`grid auto-rows-fr gap-3 ${summaryColumns(statCards.length)}`}
        >
          {statCards.map(({ key, ...card }) => (
            <DashboardStatCard key={key} {...card} />
          ))}
        </section>
      ) : null}

      {showRevenueExpensesRow(snapshot, permissions) ? (
        <section
          aria-label="Revenue and monthly expenses"
          className={`grid w-full gap-3 lg:items-stretch ${
            showRevenue(snapshot, permissions) && snapshot.monthlyExpenses.length > 0
              ? 'lg:grid-cols-2'
              : 'grid-cols-1'
          }`}
        >
          {showRevenue(snapshot, permissions) ? (
            <div className="flex h-full min-h-0 w-full min-w-0">
              <DashboardRevenueChart trend={snapshot.revenueTrend} />
            </div>
          ) : null}
          {snapshot.monthlyExpenses.length > 0 ? (
            <div className="flex h-full min-h-0 w-full min-w-0">
              <DashboardMonthlyExpensesChart monthly={snapshot.monthlyExpenses} />
            </div>
          ) : null}
        </section>
      ) : null}

      {omitAttendanceRow ? null : (
        <section
          aria-label="Attendance and calendar"
          className="grid w-full gap-3 lg:grid-cols-[minmax(0,1.65fr)_minmax(0,1fr)] lg:items-stretch"
        >
          <div className="flex h-full w-full min-w-0">
            {snapshot.weeklyAttendance.length > 0 && snapshot.attendance !== undefined ? (
              <DashboardAttendanceWeekChart weekly={snapshot.weeklyAttendance} />
            ) : null}
          </div>
          <div className="flex h-full w-full min-w-0">
            <DashboardMonthCalendar
              today={snapshot.todayDate}
              holidays={snapshot.calendarHolidays}
              events={snapshot.upcomingEvents}
              calendarHref={
                can(permissions, 'academics.structure.read')
                  ? href('/academics/holidays', tenantSlug)
                  : undefined
              }
            />
          </div>
        </section>
      )}

      {snapshot.feeCollection !== undefined ||
      showFeesCardsColumn(snapshot, permissions) ||
      (can(permissions, 'finance.expense.read') && snapshot.expenseBreakdown.length > 0) ? (
        <section
          aria-label="Finance overview"
          className="grid w-full gap-3 lg:grid-cols-4 lg:items-stretch"
        >
          {showFeesCardsColumn(snapshot, permissions) ? (
            <div className="grid min-w-0 gap-3 sm:grid-cols-2 lg:col-span-2">
              {can(permissions, 'fees.voucher.read') && snapshot.voucherSummary !== undefined ? (
                <div className="flex h-full w-full min-w-0">
                  <DashboardVouchersCard
                    summary={snapshot.voucherSummary}
                    detailsHref={href('/fees/vouchers', tenantSlug)}
                  />
                </div>
              ) : null}
              {can(permissions, 'fees.defaulter.read') && snapshot.defaulters !== undefined ? (
                <div className="flex h-full w-full min-w-0">
                  <DashboardDefaulterCard
                    defaulters={snapshot.defaulters}
                    detailsHref={href('/fees/defaulters', tenantSlug)}
                  />
                </div>
              ) : null}
            </div>
          ) : null}
          {snapshot.feeCollection !== undefined ? (
            <div className="flex h-full w-full min-w-0 lg:col-span-1">
              <DashboardFeesCollectionCard collection={snapshot.feeCollection} />
            </div>
          ) : null}
          {can(permissions, 'finance.expense.read') && snapshot.expenseBreakdown.length > 0 ? (
            <div className="flex h-full w-full min-w-0 lg:col-span-1">
              <DashboardExpenseBreakdownChart segments={snapshot.expenseBreakdown} />
            </div>
          ) : null}
        </section>
      ) : null}

      {can(permissions, 'students.student.read') ? (
        <DashboardRecentAdmissionsTable
          rows={snapshot.recentAdmissions}
          listHref={href('/students', tenantSlug)}
        />
      ) : null}

      {can(permissions, 'fees.voucher.read') && snapshot.recentFeePayments.length > 0 ? (
        <DashboardRecentFeePaymentsTable
          rows={snapshot.recentFeePayments}
          vouchersHref={href('/fees/vouchers', tenantSlug)}
        />
      ) : null}
    </div>
  );
}

type StatCardConfig = {
  label: string;
  value: string;
  description?: string;
  href?: string;
  icon: DashboardStatIconName;
  trend?: DashboardStatTrend;
};

function buildStatCards(
  snapshot: DashboardSnapshot,
  permissions: readonly string[],
  tenantSlug: string | undefined,
): (StatCardConfig & { key: string })[] {
  const cards: (StatCardConfig & { key: string })[] = [];
  const trends = snapshot.statTrends;

  if (snapshot.students !== undefined && can(permissions, 'students.student.read')) {
    cards.push({
      key: 'students',
      label: 'Students',
      value: String(snapshot.students.total),
      description: `${snapshot.students.active} active on the register`,
      href: href('/students', tenantSlug),
      icon: 'StudentsIcon',
      trend: trends.students,
    });
  }

  if (snapshot.staff !== undefined && can(permissions, 'staff.record.read')) {
    cards.push({
      key: 'teachers',
      label: 'Teachers',
      value: String(snapshot.staff.teachers),
      description: 'Teaching staff on payroll',
      href: href('/staff', tenantSlug),
      icon: 'AccountIcon',
      trend: trends.teachers,
    });

    const supportStaff = Math.max(0, snapshot.staff.total - snapshot.staff.teachers);
    cards.push({
      key: 'staff',
      label: 'Staff',
      value: String(supportStaff),
      description: 'Non-teaching staff',
      href: href('/staff', tenantSlug),
      icon: 'AccountIcon',
      trend: trends.staff,
    });
  }

  // Revenue this month — fees earned, deposits excluded — the same figure as
  // Finance › Revenue. Not net of expenses: that is a profit figure, and it
  // reads as "revenue" going negative in any month of heavy spending.
  const latestRevenueMinor = snapshot.revenueTrend.at(-1)?.collectedMinor;
  if (
    latestRevenueMinor !== undefined &&
    can(permissions, 'finance.revenue.read') &&
    snapshot.revenueTrend.length > 0
  ) {
    cards.push({
      key: 'revenue',
      label: 'Total revenue',
      value: formatMinorExact(latestRevenueMinor),
      description: 'Fees earned this month, deposits excluded',
      href: href('/finance/revenue', tenantSlug),
      icon: 'FinanceIcon',
      trend: trends.revenue,
    });
  }

  return cards;
}
