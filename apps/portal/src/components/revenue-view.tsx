'use client';

import {
  PAYMENT_METHOD_LABELS,
  type ClassLevel,
  type PaymentMethod,
  type RevenueRow,
  type RevenueTotals,
} from '@ilm/contracts';
import {
  Button,
  DateDisplay,
  DatePicker,
  Field,
  Money,
  Popover,
  PopoverContent,
  PopoverTrigger,
  SimpleSelect,
  StatusBadge,
  TwoLineCell,
  type CardTableColumn,
  type StatusBadgeProps,
} from '@ilm/ui';
import {
  CalendarIcon,
  ClassIcon,
  DateRangeIcon,
  DepositIcon,
  FeesIcon,
  FinanceIcon,
  ICON_SIZE,
  StudentsIcon,
} from '@ilm/ui/icons';
import { minorUnits } from '@ilm/utils';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';

import { DashboardStatCard } from '@/components/dashboard/dashboard-stat-card';
import {
  FEE_LIST_TABLE_CELL,
  feeListSortableTableHeader,
  feeListTableHeader,
  useDebouncedSearchFilter,
} from '@/components/fees/fee-list-shared';
import { ListDataTable } from '@/components/list-data-table';
import { ListPageToolbar } from '@/components/list-page-toolbar';
import { ListTablePaginationFooter } from '@/components/list-table-pagination-footer';
import { ListTableScreen } from '@/components/list-table-screen';
import { WorkspacePageHeader } from '@/components/workspace-page-header';
import { formatInclusiveDateRange } from '@/lib/expense-date-range';
import { nextSortParams } from '@/lib/list-page';
import { pageIntro } from '@/lib/page-copy';
import { useTenantHref } from '@/lib/use-tenant-href';

/**
 * Finance › Revenue.
 *
 * One row per receipt: who paid, when, how, which vouchers it settled, and
 * what of it the school earned. A security deposit is shown on the row and
 * taken out of revenue, because it is the family's money held, not income
 * (docs/modules/fees-and-finance.md §10). The cards above follow the same rule
 * and agree with the dashboard's "collected" figure, which uses the same SQL.
 *
 * Read-only by design: a receipt is written by the Pay button on a voucher and
 * is append-only after that.
 */

const METHOD_TONES: Record<PaymentMethod, StatusBadgeProps['tone']> = {
  CASH: 'success',
  BANK_TRANSFER: 'info',
  CHEQUE: 'warning',
  CARD: 'info',
  OTHER: 'neutral',
};

export interface RevenueViewProps {
  readonly rows: RevenueRow[];
  readonly totals: RevenueTotals;
  readonly monthTotals: RevenueTotals;
  readonly lastMonthTotals: RevenueTotals;
  readonly classes: readonly ClassLevel[];
  readonly total: number;
  readonly limit: number;
  readonly offset: number;
  readonly filters: {
    q: string;
    method: string;
    classLevelId: string;
    from: string;
    to: string;
  };
  readonly sort: 'paidOn' | 'amount' | 'receiptNo' | 'name';
  readonly order: 'asc' | 'desc';
  readonly error?: string | undefined;
  readonly paymentMethods: readonly PaymentMethod[];
}

export function RevenueView({
  rows,
  totals,
  monthTotals,
  lastMonthTotals,
  classes,
  total,
  limit,
  offset,
  filters,
  sort,
  order,
  error,
  paymentMethods,
}: RevenueViewProps) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const tenantHref = useTenantHref();

  const [rangeDraft, setRangeDraft] = useState({ from: filters.from, to: filters.to });
  useEffect(() => {
    setRangeDraft({ from: filters.from, to: filters.to });
  }, [filters.from, filters.to]);

  function pushFilters(next: Record<string, string>) {
    const query = new URLSearchParams(params.toString());
    for (const [key, value] of Object.entries(next)) {
      if (value === '') {
        query.delete(key);
      } else {
        query.set(key, value);
      }
    }
    if (!Object.hasOwn(next, 'offset')) {
      query.delete('offset');
    }
    router.push(`${pathname}?${query.toString()}`);
  }

  const { searchQuery, onSearchQueryChange } = useDebouncedSearchFilter(filters.q, (value) => {
    pushFilters({ q: value });
  });

  function toggleSort(columnKey: string) {
    const next = nextSortParams(sort, order, columnKey);
    pushFilters({ sort: next.sort, order: next.order });
  }

  const sortState = useMemo(() => ({ key: sort, direction: order }), [sort, order]);

  // The date range always has a value (this month by default), so it does not
  // by itself make the view "filtered".
  const isFiltered = filters.q !== '' || filters.method !== '' || filters.classLevelId !== '';

  // A range in the to/from boxes the wrong way round would return nothing and
  // look like "no revenue". Refused at the button instead.
  const rangeInvalid = rangeDraft.from !== '' && rangeDraft.to !== '' && rangeDraft.from > rangeDraft.to;

  const columns = useMemo((): CardTableColumn<RevenueRow>[] => {
    return [
      {
        key: 'receiptNo',
        label: 'Receipt #',
        ...FEE_LIST_TABLE_CELL,
        colStyle: { width: '7.5rem' },
        sortable: true,
        headerCell: feeListSortableTableHeader('Receipt #', 'receiptNo', sortState, toggleSort, FeesIcon),
        render: (row) => <span className="font-mono text-sm tabular-nums">{row.receiptNo}</span>,
      },
      {
        key: 'name',
        label: 'Student',
        ...FEE_LIST_TABLE_CELL,
        width: 'w-[18%]',
        sortable: true,
        headerCell: feeListSortableTableHeader('Student', 'name', sortState, toggleSort, StudentsIcon),
        render: (row) => (
          <TwoLineCell
            primary={row.studentName}
            secondary={[`GR ${row.grNo}`, row.className].filter((part) => part !== null).join(' · ')}
          />
        ),
      },
      {
        key: 'paidOn',
        label: 'Date',
        ...FEE_LIST_TABLE_CELL,
        width: 'w-[10%]',
        sortable: true,
        headerCell: feeListSortableTableHeader('Date', 'paidOn', sortState, toggleSort, CalendarIcon),
        render: (row) => (
          <span className="text-sm">
            <DateDisplay value={row.paidOn} />
          </span>
        ),
      },
      {
        key: 'method',
        label: 'Method',
        ...FEE_LIST_TABLE_CELL,
        width: 'w-[12%]',
        hideOnMobile: true,
        headerCell: feeListTableHeader('Method'),
        render: (row) => (
          <span className="flex flex-col items-start gap-1">
            <StatusBadge tone={METHOD_TONES[row.method]}>{PAYMENT_METHOD_LABELS[row.method]}</StatusBadge>
            {row.reference === null ? null : (
              <span className="text-xs text-muted-foreground">{row.reference}</span>
            )}
          </span>
        ),
      },
      {
        key: 'vouchers',
        label: 'Vouchers',
        ...FEE_LIST_TABLE_CELL,
        width: 'w-[12%]',
        hideOnMobile: true,
        headerCell: feeListTableHeader('Vouchers'),
        render: (row) =>
          row.voucherNos.length === 0 ? (
            <span className="text-muted-foreground">—</span>
          ) : (
            <span className="font-mono text-xs tabular-nums">{row.voucherNos.join(', ')}</span>
          ),
      },
      {
        key: 'amount',
        label: 'Received',
        ...FEE_LIST_TABLE_CELL,
        width: 'w-[10%]',
        sortable: true,
        headerCell: feeListSortableTableHeader('Received', 'amount', sortState, toggleSort, FeesIcon),
        render: (row) => <Money valueMinor={minorUnits(row.receivedMinor)} className="tabular-nums" />,
      },
      {
        key: 'deposit',
        label: 'Deposit held',
        ...FEE_LIST_TABLE_CELL,
        width: 'w-[10%]',
        hideOnMobile: true,
        headerCell: feeListTableHeader('Deposit held'),
        render: (row) =>
          row.depositMinor === 0 ? (
            <span className="text-muted-foreground">—</span>
          ) : (
            <Money valueMinor={minorUnits(row.depositMinor)} className="tabular-nums text-muted-foreground" />
          ),
      },
      {
        key: 'revenue',
        label: 'Revenue',
        ...FEE_LIST_TABLE_CELL,
        width: 'w-[10%]',
        headerCell: feeListTableHeader('Revenue'),
        render: (row) => (
          <Money valueMinor={minorUnits(row.revenueMinor)} className="font-medium tabular-nums" />
        ),
      },
    ];
  }, [sortState]);

  return (
    <div className="w-full space-y-6">
      <WorkspacePageHeader title="Revenue" description={pageIntro('/finance/revenue')} />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <DashboardStatCard
          label="Revenue"
          value={<Money valueMinor={minorUnits(totals.revenueMinor)} />}
          description={formatInclusiveDateRange(filters.from, filters.to)}
        />
        <DashboardStatCard
          label="Received"
          value={<Money valueMinor={minorUnits(totals.receivedMinor)} />}
          description={`${String(totals.count)} ${totals.count === 1 ? 'receipt' : 'receipts'}`}
        />
        <DashboardStatCard
          label="Security deposits held"
          value={<Money valueMinor={minorUnits(totals.depositMinor)} />}
          description="Owed back to families — not revenue"
        />
        <DashboardStatCard
          label="Revenue this month"
          value={<Money valueMinor={minorUnits(monthTotals.revenueMinor)} />}
          {...monthTrend(monthTotals.revenueMinor, lastMonthTotals.revenueMinor)}
        />
      </div>

      <ListTableScreen
        tableTitle="All receipts"
        filters={
          <ListPageToolbar
            searchQuery={searchQuery}
            onSearchQueryChange={onSearchQueryChange}
            searchPlaceholder="Search by student, GR number, receipt or reference…"
            searchAriaLabel="Search receipts"
            searchClassName="md:max-w-xs lg:max-w-sm"
            filters={
              <>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button tone="outline" className="shrink-0 gap-2">
                      <DateRangeIcon className={ICON_SIZE.inline} aria-hidden />
                      {formatInclusiveDateRange(filters.from, filters.to)}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent align="end" className="w-auto space-y-3 p-4">
                    <Field label="From">
                      <DatePicker
                        value={rangeDraft.from}
                        aria-label="From date"
                        onChange={(next) => {
                          setRangeDraft((prev) => ({ ...prev, from: next }));
                        }}
                      />
                    </Field>
                    <Field
                      label="To"
                      error={rangeInvalid ? 'The end date is before the start date.' : undefined}
                    >
                      <DatePicker
                        value={rangeDraft.to}
                        aria-label="To date"
                        onChange={(next) => {
                          setRangeDraft((prev) => ({ ...prev, to: next }));
                        }}
                      />
                    </Field>
                    <Button
                      className="w-full"
                      disabled={rangeInvalid}
                      onClick={() => {
                        pushFilters({ from: rangeDraft.from, to: rangeDraft.to });
                      }}
                    >
                      Apply range
                    </Button>
                  </PopoverContent>
                </Popover>
                <SimpleSelect
                  className="w-full min-w-32 sm:w-40"
                  ariaLabel="Filter by payment method"
                  value={filters.method}
                  triggerIcon={FinanceIcon}
                  emptyOption={{ value: '', label: 'All payment methods' }}
                  placeholder="All payment methods"
                  options={paymentMethods.map((method) => ({
                    value: method,
                    label: PAYMENT_METHOD_LABELS[method],
                  }))}
                  onValueChange={(next) => {
                    pushFilters({ method: next });
                  }}
                />
                {classes.length === 0 ? null : (
                  <SimpleSelect
                    className="w-full min-w-32 sm:w-36"
                    ariaLabel="Filter by class"
                    value={filters.classLevelId}
                    triggerIcon={ClassIcon}
                    emptyOption={{ value: '', label: 'All classes' }}
                    placeholder="All classes"
                    options={classes.map((entry) => ({ value: entry.id, label: entry.name }))}
                    onValueChange={(next) => {
                      pushFilters({ classLevelId: next });
                    }}
                  />
                )}
              </>
            }
          />
        }
        footer={
          <ListTablePaginationFooter
            total={total}
            limit={limit}
            offset={offset}
            label="receipts"
            onPageChange={(next) => {
              pushFilters({ offset: next === 0 ? '' : String(next) });
            }}
            onLimitChange={(next) => {
              pushFilters({ limit: next, offset: '' });
            }}
          />
        }
      >
        <ListDataTable
          title="Receipts"
          rows={rows}
          columns={columns}
          rowKey={(row) => row.id}
          tableLayout="auto"
          minWidthClass="min-w-[64rem]"
          error={error}
          isFiltered={isFiltered}
          onClearFilters={() => {
            router.push(tenantHref('/finance/revenue'));
          }}
          sort={{ key: sort, direction: order, onToggle: toggleSort }}
          empty={{
            title: 'No fees received in this period',
            description:
              'Every payment recorded against a fee voucher appears here, with any security deposit kept apart from revenue.',
          }}
        />
      </ListTableScreen>

      <p className="flex items-start gap-2 text-xs text-muted-foreground">
        <DepositIcon className={`${ICON_SIZE.inline} mt-0.5 shrink-0`} aria-hidden />
        Revenue is what was received less security deposits. A deposit is the family&apos;s money,
        held until it is refunded; it is listed under Fees › Security deposits.
      </p>
    </div>
  );
}

/** "+12% vs last month", or nothing when last month had none to compare with. */
function monthTrend(currentMinor: number, previousMinor: number): { description?: string } {
  if (previousMinor <= 0) {
    return {};
  }
  const delta = Math.trunc(((currentMinor - previousMinor) / previousMinor) * 100);
  return { description: `${delta >= 0 ? '+' : ''}${String(delta)}% vs last month` };
}
