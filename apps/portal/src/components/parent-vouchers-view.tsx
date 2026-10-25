'use client';

import {
  PARENT_VOUCHER_STATUS_LABELS,
  PARENT_VOUCHER_STATUSES,
  type ParentVoucherItem,
} from '@ilm/contracts';
import {
  Button,
  DateDisplay,
  Money,
  SimpleSelect,
  StatusBadge,
  type CardTableColumn,
} from '@ilm/ui';
import {
  CalendarIcon,
  ExportIcon,
  FilterIcon,
  ICON_SIZE,
  StudentsIcon,
  ViewIcon,
} from '@ilm/ui/icons';
import { minorUnits } from '@ilm/utils';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';

import {
  feeListSortableTableHeader,
  FEE_LIST_TABLE_CELL,
  useDebouncedSearchFilter,
} from '@/components/fees/fee-list-shared';
import { ListDataTable } from '@/components/list-data-table';
import { ListPageToolbar } from '@/components/list-page-toolbar';
import { ListTablePaginationFooter } from '@/components/list-table-pagination-footer';
import { ListTableScreen } from '@/components/list-table-screen';
import { PageHeader } from '@/components/page-header';
import { ParentVoucherDialog, ParentVoucherPdfJob } from '@/components/parent-voucher-viewer';
import { nextSortParams } from '@/lib/list-page';
import {
  feeMonthLabel,
  PARENT_VOUCHER_STATUS_TONES,
  voucherMonthsLabel,
} from '@/lib/parent-vouchers-ui';

export interface ParentVouchersFilters {
  readonly q: string;
  readonly studentId: string;
  readonly month: string;
  readonly status: string;
}

/** How often an open page asks again, so a new voucher or a payment shows without a reload. */
const REFRESH_MS = 60_000;

/**
 * A parent's fee vouchers, for all their children.
 *
 * The list is a plain server render, so it is always what the database says —
 * there is no client copy to go stale or duplicate. While the page is open it
 * asks the server again once a minute, and whenever the tab comes back into
 * view, so a voucher the office has just generated, or a payment it has just
 * recorded, appears without anyone pressing reload.
 */
export function ParentVouchersView({
  rows,
  total,
  months,
  filters,
  limit,
  offset,
  sort,
  order,
  openId,
  error,
}: {
  readonly rows: readonly ParentVoucherItem[];
  readonly total: number;
  readonly months: readonly string[];
  readonly filters: ParentVouchersFilters;
  readonly limit: number;
  readonly offset: number;
  readonly sort: string;
  readonly order: 'asc' | 'desc';
  /** A voucher to open on arrival — what a notification links to. */
  readonly openId?: string | undefined;
  readonly error?: string | undefined;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [viewing, setViewing] = useState<string | undefined>(openId);
  const [downloading, setDownloading] = useState<string | undefined>(undefined);

  const closeViewer = useCallback((): void => {
    setViewing(undefined);
    // A link from a notification carries the id; leave it out so a reload does not reopen it.
    if (params.has('open')) {
      const query = new URLSearchParams(params.toString());
      query.delete('open');
      router.replace(query.size === 0 ? pathname : `${pathname}?${query.toString()}`);
    }
  }, [params, pathname, router]);

  useEffect(() => {
    const refresh = (): void => {
      if (document.visibilityState === 'visible') {
        router.refresh();
      }
    };
    const timer = window.setInterval(refresh, REFRESH_MS);
    document.addEventListener('visibilitychange', refresh);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', refresh);
    };
  }, [router]);

  function pushFilters(next: Record<string, string>): void {
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

  function toggleSort(columnKey: string): void {
    const next = nextSortParams(sort, order, columnKey);
    pushFilters({ sort: next.sort, order: next.order });
  }

  const { searchQuery, onSearchQueryChange } = useDebouncedSearchFilter(filters.q, (value) => {
    pushFilters({ q: value });
  });

  // The child comes from the header's filter, which this page's "Clear filters" does not
  // reach — so only the filters this page owns count here.
  const isFiltered = [filters.q, filters.month, filters.status].some((value) => value !== '');

  const columns = useMemo((): CardTableColumn<ParentVoucherItem>[] => {
    const sortState = { key: sort, direction: order };
    return [
      {
        key: 'voucherNo',
        label: 'Voucher',
        ...FEE_LIST_TABLE_CELL,
        sortable: true,
        headerCell: feeListSortableTableHeader('Voucher', 'voucherNo', sortState, toggleSort),
        render: (row) => (
          <span className="text-sm font-medium text-foreground">{row.voucherNo}</span>
        ),
      },
      {
        key: 'studentName',
        label: 'Student',
        ...FEE_LIST_TABLE_CELL,
        sortable: true,
        headerCell: feeListSortableTableHeader(
          'Student',
          'studentName',
          sortState,
          toggleSort,
          StudentsIcon,
        ),
        render: (row) => (
          <div className="min-w-0">
            <p className="truncate text-sm text-foreground">{row.studentName}</p>
            <p className="text-xs text-muted-foreground">
              {row.className === null ? '—' : row.className}
              {row.sectionName === null ? '' : ` · ${row.sectionName}`}
            </p>
          </div>
        ),
      },
      {
        key: 'issueDate',
        label: 'Fee month',
        ...FEE_LIST_TABLE_CELL,
        sortable: true,
        headerCell: feeListSortableTableHeader(
          'Fee month',
          'issueDate',
          sortState,
          toggleSort,
          CalendarIcon,
        ),
        render: (row) => (
          <span className="text-sm">{voucherMonthsLabel(row.billMonths, row.issueDate)}</span>
        ),
      },
      {
        key: 'amount',
        label: 'Total amount',
        ...FEE_LIST_TABLE_CELL,
        sortable: true,
        headerCell: feeListSortableTableHeader('Total amount', 'amount', sortState, toggleSort),
        render: (row) => (
          <div>
            <Money
              valueMinor={minorUnits(row.totalPayableMinor)}
              withSymbol
              className="text-sm font-medium"
            />
            {row.paidMinor > 0 && row.balanceMinor > 0 ? (
              <p className="text-xs text-muted-foreground">
                <Money valueMinor={minorUnits(row.balanceMinor)} withSymbol /> left
              </p>
            ) : null}
          </div>
        ),
      },
      {
        key: 'dueDate',
        label: 'Due date',
        ...FEE_LIST_TABLE_CELL,
        sortable: true,
        headerCell: feeListSortableTableHeader('Due date', 'dueDate', sortState, toggleSort),
        render: (row) => <DateDisplay value={row.dueDate} className="text-sm" />,
      },
      {
        key: 'status',
        label: 'Status',
        ...FEE_LIST_TABLE_CELL,
        sortable: true,
        headerCell: feeListSortableTableHeader('Status', 'status', sortState, toggleSort),
        render: (row) => (
          <StatusBadge tone={PARENT_VOUCHER_STATUS_TONES[row.paymentStatus]}>
            {PARENT_VOUCHER_STATUS_LABELS[row.paymentStatus]}
          </StatusBadge>
        ),
      },
      {
        key: 'actions',
        label: 'Actions',
        headerClassName: 'w-40 px-2 py-2.5',
        cellClassName: 'w-40 px-2 py-2.5',
        render: (row) => (
          <div className="flex gap-1.5">
            <Button
              size="sm"
              tone="outline"
              aria-label={`View voucher ${row.voucherNo}`}
              onClick={(event) => {
                event.stopPropagation();
                setViewing(row.id);
              }}
            >
              <ViewIcon className={ICON_SIZE.inline} aria-hidden />
              View
            </Button>
            <Button
              size="sm"
              tone="outline"
              isPending={downloading === row.id}
              disabled={downloading !== undefined}
              aria-label={`Download voucher ${row.voucherNo} as PDF`}
              onClick={(event) => {
                event.stopPropagation();
                setDownloading(row.id);
              }}
            >
              <ExportIcon className={ICON_SIZE.inline} aria-hidden />
              PDF
            </Button>
          </div>
        ),
      },
    ];
  }, [downloading, sort, order, params]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Fee vouchers"
        description="Every fee voucher the school has issued for your children. View one to see it as the school prints it, or download it as a PDF."
      />

      <ListTableScreen
        tableTitle="All vouchers"
        filters={
          <ListPageToolbar
            searchQuery={searchQuery}
            onSearchQueryChange={onSearchQueryChange}
            searchPlaceholder="Search by voucher number or child…"
            searchAriaLabel="Search vouchers"
            searchClassName="md:max-w-xs lg:max-w-sm"
            filters={
              <>
                <SimpleSelect
                  className="w-full min-w-40 sm:w-48"
                  ariaLabel="Filter by fee month"
                  value={filters.month}
                  triggerIcon={CalendarIcon}
                  emptyOption={{ value: '', label: 'All months' }}
                  placeholder="All months"
                  options={months.map((month) => ({ value: month, label: feeMonthLabel(month) }))}
                  onValueChange={(next) => {
                    pushFilters({ month: next });
                  }}
                />
                <SimpleSelect
                  className="w-full min-w-40 sm:w-44"
                  ariaLabel="Filter by payment status"
                  value={filters.status}
                  triggerIcon={FilterIcon}
                  emptyOption={{ value: '', label: 'All statuses' }}
                  placeholder="All statuses"
                  options={PARENT_VOUCHER_STATUSES.map((value) => ({
                    value,
                    label: PARENT_VOUCHER_STATUS_LABELS[value],
                  }))}
                  onValueChange={(next) => {
                    pushFilters({ status: next });
                  }}
                />
              </>
            }
          />
        }
        footer={
          <ListTablePaginationFooter
            total={total}
            limit={limit}
            offset={offset}
            label="vouchers"
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
          title="Fee vouchers"
          rows={rows}
          columns={columns}
          rowKey={(row) => row.id}
          tableLayout="auto"
          minWidthClass="min-w-[56rem]"
          error={error}
          isFiltered={isFiltered}
          sort={{ key: sort, direction: order, onToggle: toggleSort }}
          onClearFilters={() => {
            router.push(pathname);
          }}
          onRowClick={(row) => {
            setViewing(row.id);
          }}
          renderMobileRow={(row) => (
            <div className="space-y-1.5 p-4">
              <div className="flex items-start justify-between gap-2">
                <p className="min-w-0 text-sm font-medium text-foreground">{row.voucherNo}</p>
                <StatusBadge tone={PARENT_VOUCHER_STATUS_TONES[row.paymentStatus]}>
                  {PARENT_VOUCHER_STATUS_LABELS[row.paymentStatus]}
                </StatusBadge>
              </div>
              <p className="text-xs text-muted-foreground">
                {row.studentName}
                {row.className === null ? '' : ` · ${row.className}`}
              </p>
              <p className="text-xs text-muted-foreground">
                {voucherMonthsLabel(row.billMonths, row.issueDate)} · Due{' '}
                <DateDisplay value={row.dueDate} />
              </p>
              <p className="text-sm font-medium text-foreground">
                <Money valueMinor={minorUnits(row.totalPayableMinor)} withSymbol />
              </p>
            </div>
          )}
          empty={{
            title: 'No vouchers yet',
            description:
              'When the school issues a fee voucher for one of your children, it appears here and you are notified.',
          }}
        />
      </ListTableScreen>

      {viewing === undefined ? null : (
        <ParentVoucherDialog key={viewing} id={viewing} onClose={closeViewer} />
      )}
      {downloading === undefined ? null : (
        <ParentVoucherPdfJob
          key={downloading}
          id={downloading}
          onDone={() => {
            setDownloading(undefined);
          }}
        />
      )}
    </div>
  );
}
