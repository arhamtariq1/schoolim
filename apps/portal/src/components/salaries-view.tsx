'use client';

import {
  ROUTES,
  SALARY_STATUS_LABELS,
  STAFF_ROLE_LABELS,
  type SalaryStatus,
  type StaffSalaryList,
  type StaffSalaryListItem,
} from '@ilm/contracts';
import {
  Button,
  DateDisplay,
  DropdownMenuItem,
  Money,
  SimpleSelect,
  StatusBadge,
  type CardTableColumn,
} from '@ilm/ui';
import {
  AccountIcon,
  CalendarIcon,
  CreateIcon,
  FeesIcon,
  ICON_SIZE,
  SearchIcon,
  StudentsIcon,
} from '@ilm/ui/icons';
import { minorUnits } from '@ilm/utils';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';

import { BulkPaySalaryDialog } from './bulk-pay-salary-dialog';
import { ListDataTable } from './list-data-table';
import { ListTablePaginationFooter } from './list-table-pagination-footer';
import { ListTableRowActions } from './list-table-row-actions';
import { ListTableScreen } from './list-table-screen';
import { PaySalaryDialog, type PaySalaryTarget } from './pay-salary-dialog';
import { SalaryAvatar, SalaryStatusBadge, salaryMonthLabel } from './salary-ui';
import { SalariesPageSkeleton } from './salary-skeletons';

import { DashboardStatCard } from '@/components/dashboard/dashboard-stat-card';
import { formatMinorExact } from '@/components/dashboard/dashboard-chart-theme';
import { afterMenuAction } from '@/components/fees/fee-list-shared';
import { ListPageToolbar } from '@/components/list-page-toolbar';
import { TableSelectionBar } from '@/components/table-selection-bar';
import { WorkspacePageHeader } from '@/components/workspace-page-header';
import { fetchJson } from '@/lib/mutate';
import { STAFF_ROLE_TONE } from '@/lib/staff-badge-tones';
import { listTableSelectColumn, useRowSelection } from '@/lib/use-row-selection';
import { useTenantHref } from '@/lib/use-tenant-href';

const PAGE_SIZE = 20;

const MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
] as const;

const STATUS_OPTIONS = (['UNPAID', 'PARTIAL', 'PAID'] as const).map((value) => ({
  value,
  label: SALARY_STATUS_LABELS[value],
}));

type SortKey = 'name' | 'role' | 'net' | 'paid' | 'remaining' | 'status' | 'lastPaidOn';

function money(minor: number, dashOnZero = false) {
  return <Money valueMinor={minorUnits(minor)} withSymbol dashOnZero={dashOnZero} />;
}

/**
 * Salaries — everybody's pay for one month.
 *
 * Month first, because that is the question: who has been paid for October, and
 * who has not. The figures above the table are for the whole month, not the
 * page or the filter, so they stay true while someone searches.
 */
export function SalariesView({
  canPay,
  today,
  preview,
}: {
  canPay: boolean;
  /** `YYYY-MM-DD`. */
  today: string;
  /**
   * Fixed data instead of a request — for the landing page's product preview
   * only (ADR-0022), where there is no session to fetch with. Never set inside
   * a school.
   */
  preview?: StaffSalaryList | undefined;
}) {
  const router = useRouter();
  const tenantHref = useTenantHref();

  const currentYear = Number(today.slice(0, 4));
  const currentMonthIndex = Number(today.slice(5, 7));

  const [year, setYear] = useState(currentYear);
  const [monthIndex, setMonthIndex] = useState(currentMonthIndex);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [status, setStatus] = useState<SalaryStatus | ''>('');
  const [sort, setSort] = useState<SortKey>('name');
  const [order, setOrder] = useState<'asc' | 'desc'>('asc');
  const [limit, setLimit] = useState(PAGE_SIZE);
  const [offset, setOffset] = useState(0);

  const [data, setData] = useState<StaffSalaryList | undefined>(preview);
  const [loading, setLoading] = useState(preview === undefined);
  const [error, setError] = useState<string | undefined>(undefined);
  const [paying, setPaying] = useState<PaySalaryTarget | undefined>(undefined);
  const [bulkPaying, setBulkPaying] = useState(false);

  const month = `${String(year)}-${String(monthIndex).padStart(2, '0')}`;

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebouncedSearch(search.trim());
      setOffset(0);
    }, 350);
    return () => {
      window.clearTimeout(timer);
    };
  }, [search]);

  const load = useCallback(async () => {
    setLoading(true);
    const query = new URLSearchParams({
      month,
      sort,
      order,
      limit: String(limit),
      offset: String(offset),
    });
    if (debouncedSearch !== '') {
      query.set('q', debouncedSearch);
    }
    if (status !== '') {
      query.set('status', status);
    }
    const result = await fetchJson<{ data: StaffSalaryList }>(
      `${ROUTES.staffSalaries.list}?${query.toString()}`,
    );
    setLoading(false);
    if (!result.ok) {
      setError(result.message);
      return;
    }
    setError(undefined);
    setData(result.data.data);
  }, [month, sort, order, limit, offset, debouncedSearch, status]);

  useEffect(() => {
    if (preview !== undefined) {
      return;
    }
    void load();
  }, [load, preview]);

  const yearOptions = useMemo(
    () =>
      [currentYear, currentYear - 1, currentYear - 2, currentYear - 3].map((value) => ({
        value: String(value),
        label: String(value),
      })),
    [currentYear],
  );
  const monthOptions = useMemo(
    () =>
      MONTH_NAMES.map((label, index) => ({ value: String(index + 1), label, index: index + 1 }))
        .filter((entry) => year < currentYear || entry.index <= currentMonthIndex)
        .map(({ value, label }) => ({ value, label })),
    [year, currentYear, currentMonthIndex],
  );

  function toggleSort(key: string): void {
    const next = key as SortKey;
    if (next === sort) {
      setOrder(order === 'asc' ? 'desc' : 'asc');
    } else {
      setSort(next);
      setOrder('asc');
    }
    setOffset(0);
  }

  const rows = data?.items ?? [];
  const {
    selected,
    clearSelection,
    allOnPageSelected,
    someOnPageSelected,
    toggleAllOnPage,
    toggleRowSelected,
  } = useRowSelection(rows, (row) => row.staffId);
  const payable = rows.filter((row) => selected.has(row.staffId) && row.remainingMinor > 0);
  const isFiltered = debouncedSearch !== '' || status !== '';

  const columns: CardTableColumn<StaffSalaryListItem>[] = [
    ...(canPay
      ? [
          listTableSelectColumn<StaffSalaryListItem>({
            selected,
            allOnPageSelected,
            someOnPageSelected,
            toggleAllOnPage,
            toggleRowSelected,
            getRowId: (row) => row.staffId,
            rowAriaLabel: (row) => row.name,
            selectAllAriaLabel: 'Select every member of staff on this page',
          }),
        ]
      : []),
    {
      key: 'name',
      label: 'Staff',
      icon: AccountIcon,
      width: 'w-[22%]',
      sortable: true,
      render: (row) => (
        <div className="flex min-w-0 items-center gap-3">
          <SalaryAvatar name={row.name} photoUrl={row.photoUrl} />
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-foreground">{row.name}</p>
            <p className="truncate text-xs text-muted-foreground">{row.employeeNo}</p>
          </div>
        </div>
      ),
    },
    {
      key: 'role',
      label: 'Role',
      icon: StudentsIcon,
      width: 'w-[12%]',
      sortable: true,
      render: (row) => <StatusBadge tone={STAFF_ROLE_TONE[row.role]}>{STAFF_ROLE_LABELS[row.role]}</StatusBadge>,
    },
    {
      key: 'net',
      label: 'Monthly salary',
      icon: FeesIcon,
      width: 'w-[13%]',
      sortable: true,
      render: (row) => (
        <div className="text-sm">
          {money(row.netMinor)}
          {row.adjustmentsMinor === 0 ? null : (
            <p className="text-xs text-muted-foreground">
              {row.adjustmentsMinor > 0 ? '+' : '−'}
              {money(Math.abs(row.adjustmentsMinor))} adjusted
            </p>
          )}
        </div>
      ),
    },
    {
      key: 'paid',
      label: 'Paid',
      width: 'w-[11%]',
      sortable: true,
      render: (row) => <span className="text-sm">{money(row.paidMinor, true)}</span>,
    },
    {
      key: 'remaining',
      label: 'Remaining',
      width: 'w-[11%]',
      sortable: true,
      render: (row) => <span className="text-sm">{money(row.remainingMinor, true)}</span>,
    },
    {
      key: 'status',
      label: 'Status',
      width: 'w-[13%]',
      sortable: true,
      render: (row) => <SalaryStatusBadge status={row.status} />,
    },
    {
      key: 'lastPaidOn',
      label: 'Payment date',
      width: 'w-[12%]',
      sortable: true,
      hideOnMobile: true,
      render: (row) =>
        row.lastPaidOn === null ? (
          <span className="text-sm text-muted-foreground">—</span>
        ) : (
          <DateDisplay value={row.lastPaidOn} className="text-sm" />
        ),
    },
    {
      key: 'actions',
      label: 'Actions',
      width: 'w-[6%]',
      render: (row) => (
        <ListTableRowActions ariaLabel={`Actions for ${row.name}`}>
          <DropdownMenuItem
            onSelect={() => {
              afterMenuAction(() => {
                router.push(tenantHref(`/salaries/${row.staffId}`));
              });
            }}
          >
            <AccountIcon aria-hidden="true" />
            View details
          </DropdownMenuItem>
          {canPay && row.remainingMinor > 0 ? (
            <DropdownMenuItem
              onSelect={() => {
                afterMenuAction(() => {
                  setPaying({
                    staffId: row.staffId,
                    staffName: row.name,
                    month: row.month,
                    netMinor: row.netMinor,
                    paidMinor: row.paidMinor,
                  });
                });
              }}
            >
              <CreateIcon aria-hidden="true" />
              Pay salary
            </DropdownMenuItem>
          ) : null}
          <DropdownMenuItem
            onSelect={() => {
              afterMenuAction(() => {
                router.push(tenantHref(`/salaries/${row.staffId}#payment-history`));
              });
            }}
          >
            <FeesIcon aria-hidden="true" />
            View history
          </DropdownMenuItem>
        </ListTableRowActions>
      ),
    },
  ];

  if (loading && data === undefined) {
    return <SalariesPageSkeleton />;
  }

  const summary = data?.summary;

  return (
    <div className="w-full space-y-6">
      <WorkspacePageHeader
        title="Staff Salaries"
        description="Manage monthly staff salaries and payment records."
      />

      {error === undefined ? null : (
        <div
          role="alert"
          className="rounded-md border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-danger"
        >
          {error}
        </div>
      )}

      <section
        aria-label="Salary summary"
        className="grid auto-rows-fr grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4"
      >
        <DashboardStatCard
          label="Total monthly payroll"
          value={formatMinorExact(summary?.totalPayrollMinor ?? 0)}
          description={salaryMonthLabel(month)}
          icon="FinanceIcon"
        />
        <DashboardStatCard
          label="Total paid"
          value={formatMinorExact(summary?.totalPaidMinor ?? 0)}
          description="Paid out for the month"
          icon="FeesIcon"
        />
        <DashboardStatCard
          label="Total pending"
          value={formatMinorExact(summary?.totalPendingMinor ?? 0)}
          description="Still to be paid"
          icon="OverdueIcon"
        />
        <DashboardStatCard
          label="Staff with unpaid salaries"
          value={String(summary?.unpaidStaffCount ?? 0)}
          description="Unpaid or partly paid"
          icon="AccountIcon"
        />
      </section>

      <ListTableScreen
        tableTitle={`Salaries — ${salaryMonthLabel(month)}`}
        filters={
          <ListPageToolbar
            searchQuery={search}
            onSearchQueryChange={setSearch}
            searchPlaceholder="Name or staff ID"
            searchAriaLabel="Search staff salaries"
            filters={
              <>
              <SimpleSelect
                className="w-full min-w-32 sm:w-36"
                value={String(monthIndex)}
                triggerIcon={CalendarIcon}
                onValueChange={(next) => {
                  setMonthIndex(Number(next));
                  setOffset(0);
                  clearSelection();
                }}
                options={monthOptions}
                ariaLabel="Salary month"
              />
              <SimpleSelect
                className="w-full min-w-24 sm:w-28"
                value={String(year)}
                onValueChange={(next) => {
                  const nextYear = Number(next);
                  setYear(nextYear);
                  if (nextYear === currentYear && monthIndex > currentMonthIndex) {
                    setMonthIndex(currentMonthIndex);
                  }
                  setOffset(0);
                  clearSelection();
                }}
                options={yearOptions}
                ariaLabel="Salary year"
              />
              <SimpleSelect
                className="w-full min-w-36 sm:w-40"
                value={status}
                triggerIcon={SearchIcon}
                onValueChange={(next) => {
                  setStatus(next as SalaryStatus | '');
                  setOffset(0);
                }}
                options={STATUS_OPTIONS}
                ariaLabel="Filter by status"
                emptyOption={{ value: '', label: 'Any status' }}
              />
              </>
            }
          />
        }
        footer={
          <ListTablePaginationFooter
            total={data?.total ?? 0}
            limit={limit}
            offset={offset}
            label="staff"
            onPageChange={setOffset}
            onLimitChange={(next) => {
              setLimit(Number(next));
              setOffset(0);
            }}
          />
        }
      >
        <ListDataTable
          title="Salaries"
          caption="Staff salaries"
          rows={rows}
          columns={columns}
          rowKey={(row) => row.staffId}
          isLoading={loading && data === undefined}
          isFiltered={isFiltered}
          onClearFilters={() => {
            setSearch('');
            setDebouncedSearch('');
            setStatus('');
            setOffset(0);
          }}
          onRowClick={(row) => {
            router.push(tenantHref(`/salaries/${row.staffId}`));
          }}
          sort={{ key: sort, direction: order, onToggle: toggleSort }}
          minWidthClass="min-w-[60rem]"
          empty={{
            title: 'No salaries to show for this month',
            description:
              'Salaries appear for staff with a monthly salary set. Add the salary on the staff record.',
          }}
          renderMobileRow={(row) => (
            <button
              type="button"
              className="flex w-full items-center justify-between gap-3 px-4 py-3 text-start"
              onClick={() => {
                router.push(tenantHref(`/salaries/${row.staffId}`));
              }}
            >
              <span className="flex min-w-0 items-center gap-3">
                <SalaryAvatar name={row.name} photoUrl={row.photoUrl} />
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium">{row.name}</span>
                  <span className="block text-xs text-muted-foreground">
                    {money(row.paidMinor, true)} of {money(row.netMinor)}
                  </span>
                </span>
              </span>
              <SalaryStatusBadge status={row.status} />
            </button>
          )}
        />
      </ListTableScreen>

      {canPay ? (
        <TableSelectionBar
          count={selected.size}
          noun="staff member"
          onClear={clearSelection}
          actions={
            <Button
              size="sm"
              disabled={payable.length === 0}
              onClick={() => {
                setBulkPaying(true);
              }}
            >
              <CreateIcon className={ICON_SIZE.inline} aria-hidden />
              Pay selected{payable.length === 0 ? '' : ` (${String(payable.length)})`}
            </Button>
          }
        />
      ) : null}

      {bulkPaying ? (
        <BulkPaySalaryDialog
          rows={payable}
          month={month}
          today={today}
          onClose={() => {
            setBulkPaying(false);
          }}
          onDone={() => {
            clearSelection();
            void load();
          }}
        />
      ) : null}

      {paying === undefined ? null : (
        <PaySalaryDialog
          target={paying}
          today={today}
          onClose={() => {
            setPaying(undefined);
          }}
          onSaved={() => {
            setPaying(undefined);
            void load();
          }}
        />
      )}
    </div>
  );
}
