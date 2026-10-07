import type { SessionUser } from '@ilm/contracts';
import { DEFAULT_TIMEZONE } from '@ilm/utils';
import type { Route } from 'next';
import type { ReactNode } from 'react';

import { DashboardAttendanceWeekChart } from '@/components/dashboard/dashboard-attendance-week-chart';
import { formatMinorCompact } from '@/components/dashboard/dashboard-chart-theme';
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
};

function href(path: Route, tenantSlug: string | undefined): string {
  return withTenantPrefix(path, tenantSlug);
}

function can(permissions: readonly string[], permission: string): boolean {
  return permissions.includes(permission);
}

function showRevenueExpensesRow(
  snapshot: DashboardSnapshot,
  permissions: readonly string[],
): boolean {
  if (!can(permissions, 'finance.expense.read')) {
    return false;
  }
  return snapshot.revenueTrend.length > 0 || snapshot.monthlyExpenses.length > 0;
}

function showFeesCardsColumn(
  snapshot: DashboardSnapshot,
  permissions: readonly string[],
): boolean {
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
}: HomeDashboardProps) {
  const permissions = session.permissions;
  const firstName = session.name.trim().split(/\s+/)[0] ?? '';
  const greeting = timeBasedGreeting(firstName, session.school.timezone ?? DEFAULT_TIMEZONE);
  const statCards = buildStatCards(snapshot, permissions, tenantSlug);

  return (
    <div className="w-full space-y-3 bg-slate-50 p-2 sm:p-2.5 md:p-3 lg:p-4">
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
          className="grid auto-rows-fr grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4"
        >
          {statCards.map(({ key, ...card }) => (
            <DashboardStatCard key={key} {...card} />
          ))}
        </section>
      ) : null}

      {showRevenueExpensesRow(snapshot, permissions) ? (
        <section
          aria-label="Revenue and monthly expenses"
          className="grid w-full gap-3 lg:grid-cols-2 lg:items-stretch"
        >
          {snapshot.revenueTrend.length > 0 ? (
            <div className="flex h-full min-h-0 min-w-0 w-full">
              <DashboardRevenueChart trend={snapshot.revenueTrend} />
            </div>
          ) : null}
          {snapshot.monthlyExpenses.length > 0 ? (
            <div className="flex h-full min-h-0 min-w-0 w-full">
              <DashboardMonthlyExpensesChart monthly={snapshot.monthlyExpenses} />
            </div>
          ) : null}
        </section>
      ) : null}

      <section
        aria-label="Attendance and calendar"
        className="grid w-full gap-3 lg:grid-cols-[minmax(0,1.65fr)_minmax(0,1fr)] lg:items-stretch"
      >
        <div className="flex h-full min-w-0 w-full">
          {snapshot.weeklyAttendance.length > 0 && snapshot.attendance !== undefined ? (
            <DashboardAttendanceWeekChart weekly={snapshot.weeklyAttendance} />
          ) : null}
        </div>
        <div className="flex h-full min-w-0 w-full">
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
                <div className="flex h-full min-w-0 w-full">
                  <DashboardVouchersCard
                    summary={snapshot.voucherSummary}
                    detailsHref={href('/fees/vouchers', tenantSlug)}
                  />
                </div>
              ) : null}
              {can(permissions, 'fees.defaulter.read') && snapshot.defaulters !== undefined ? (
                <div className="flex h-full min-w-0 w-full">
                  <DashboardDefaulterCard
                    defaulters={snapshot.defaulters}
                    detailsHref={href('/fees/defaulters', tenantSlug)}
                  />
                </div>
              ) : null}
            </div>
          ) : null}
          {snapshot.feeCollection !== undefined ? (
            <div className="flex h-full min-w-0 w-full lg:col-span-1">
              <DashboardFeesCollectionCard collection={snapshot.feeCollection} />
            </div>
          ) : null}
          {can(permissions, 'finance.expense.read') && snapshot.expenseBreakdown.length > 0 ? (
            <div className="flex h-full min-w-0 w-full lg:col-span-1">
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

  const latestNetMinor = snapshot.revenueTrend.at(-1)?.netRevenueMinor;
  if (
    latestNetMinor !== undefined &&
    can(permissions, 'finance.expense.read') &&
    snapshot.revenueTrend.length > 0
  ) {
    cards.push({
      key: 'revenue',
      label: 'Total revenue',
      value: formatMinorCompact(latestNetMinor),
      description: 'Net after operating expenses this month',
      href: href('/finance', tenantSlug),
      icon: 'FinanceIcon',
      trend: trends.revenue,
    });
  }

  return cards;
}
