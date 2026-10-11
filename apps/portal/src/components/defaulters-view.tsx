'use client';

import {
  VOUCHER_STATUS_LABELS,
  type ClassLevel,
  type DefaulterList,
  type DefaulterRow,
} from '@ilm/contracts';
import {
  Button,
  CardTable,
  DateDisplay,
  DatePicker,
  Money,
  Pagination,
  SimpleSelect,
  StatusBadge,
  TwoLineCell,
  type CardTableColumn,
} from '@ilm/ui';
import {
  AccountIcon,
  CalendarIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  ExportIcon,
  FeesIcon,
  ICON_SIZE,
  PhoneIcon,
  StudentsIcon,
} from '@ilm/ui/icons';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useMemo, useState, type ReactNode } from 'react';

import {
  FEE_LIST_TABLE_CELL,
  feeListTableHeader,
  useDebouncedSearchFilter,
} from '@/components/fees/fee-list-shared';
import { ListPageToolbar } from '@/components/list-page-toolbar';
import { WorkspacePageHeader } from '@/components/workspace-page-header';
import { pageIntro } from '@/lib/page-copy';
import { nextSortParams } from '@/lib/list-page';
import { useTenantHref } from '@/lib/use-tenant-href';

/**
 * Fees › Defaulters.
 *
 * A defaulter is a student whose voucher's **due date has passed** and who
 * still owes something on it. Not simply "unpaid": a voucher issued yesterday
 * and due next week is not late, and a list that says otherwise is one the
 * office stops trusting on its first morning — after which nobody uses it and
 * the money goes uncollected anyway.
 *
 * ## Expanding a row costs nothing
 *
 * The overdue vouchers behind each row arrive with the row. Opening one is a
 * local state change, not a request, which is what makes going down a list of
 * forty families on a phone bearable — and what keeps a page of fifty at three
 * queries instead of fifty-three.
 *
 * ## The total is the filter's, not the page's
 *
 * The figure at the top covers everybody matching the filters, not the rows on
 * screen. A school reads it to decide what to do, and a total that quietly
 * meant "these fifty" would be worse than showing none at all.
 */

export interface DefaultersViewProps {
  readonly page: DefaulterList;
  readonly classes: readonly ClassLevel[];
  readonly limit: number;
  readonly offset: number;
  readonly sort: 'amount' | 'months' | 'name' | 'grNo' | 'className';
  readonly order: 'asc' | 'desc';
  readonly filters: {
    q: string;
    classLevelId: string;
    status: string;
    gender: string;
    months: string;
    from: string;
    to: string;
  };
  readonly error?: string | undefined;
}

export function DefaultersView({
  page,
  classes,
  limit,
  offset,
  sort,
  order,
  filters,
  error,
}: DefaultersViewProps) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const tenantHref = useTenantHref();

  const [expanded, setExpanded] = useState<ReadonlySet<string>>(new Set());

  const { searchQuery, onSearchQueryChange } = useDebouncedSearchFilter(filters.q, (value) => {
    pushFilters({ q: value });
  });

  const isFiltered = Object.values(filters).some((value) => value !== '');

  function toggleSort(columnKey: string) {
    const next = nextSortParams(sort, order, columnKey);
    pushFilters({ sort: next.sort, order: next.order });
  }

  function pushFilters(next: Record<string, string>): void {
    const query = new URLSearchParams(params.toString());
    for (const [key, value] of Object.entries(next)) {
      if (value === '') {
        query.delete(key);
      } else {
        query.set(key, value);
      }
    }
    query.set('limit', String(limit));
    query.delete('offset');
    router.push(`${pathname}?${query.toString()}`);
  }

  function clearFilters(): void {
    router.push(tenantHref('/fees/defaulters'));
  }

  function toggle(studentId: string): void {
    const next = new Set(expanded);
    if (next.has(studentId)) {
      next.delete(studentId);
    } else {
      next.add(studentId);
    }
    setExpanded(next);
  }

  /**
   * The overdue vouchers behind one row.
   *
   * Returned to `<DataTable>` rather than rendered beside it, so the panel
   * opens directly beneath the row that was clicked. On a list of fifty, a
   * detail that appears below the whole table is one nobody connects to what
   * they just pressed.
   */
  function renderVouchers(row: DefaulterRow): ReactNode {
    return (
      <section
        aria-label={`Overdue vouchers for ${row.name}`}
        className="border-t border-border bg-card"
      >
        <header className="flex flex-wrap items-baseline justify-between gap-2 border-b border-border px-4 py-2">
          <h2 className="text-sm font-medium">
            {row.name}
            <span className="ms-2 font-mono text-xs text-muted-foreground">{row.grNo}</span>
          </h2>
          <p className="text-xs text-muted-foreground">
            {row.vouchers.length} overdue {row.vouchers.length === 1 ? 'voucher' : 'vouchers'} ·{' '}
            <Money valueMinor={row.totalOwedMinor} /> owed
          </p>
        </header>

        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead className="bg-muted/50">
              <tr>
                {['Voucher', 'Month', 'Issued', 'Due', 'Valid till', 'Status'].map((heading) => (
                  <th
                    key={heading}
                    scope="col"
                    className="px-3 py-2 text-start text-xs font-medium whitespace-nowrap text-muted-foreground"
                  >
                    {heading}
                  </th>
                ))}
                <th
                  scope="col"
                  className="px-3 py-2 text-end text-xs font-medium whitespace-nowrap text-muted-foreground"
                >
                  Amount
                </th>
              </tr>
            </thead>
            <tbody>
              {row.vouchers.map((voucher) => (
                <tr key={voucher.voucherId} className="border-t border-border">
                  <td className="px-3 py-2 font-mono text-xs select-all">{voucher.voucherNo}</td>
                  <td className="px-3 py-2 text-xs">
                    {voucher.billMonths.length === 0
                      ? 'arrears'
                      : voucher.billMonths.map(formatMonth).join(', ')}
                  </td>
                  <td className="px-3 py-2">
                    <DateDisplay value={voucher.issueDate} />
                  </td>
                  <td className="px-3 py-2 text-danger">
                    <DateDisplay value={voucher.dueDate} />
                  </td>
                  <td className="px-3 py-2">
                    <DateDisplay value={voucher.validTill} />
                  </td>
                  <td className="px-3 py-2">
                    <StatusBadge tone={voucher.status === 'UNPAID' ? 'danger' : 'warning'}>
                      {VOUCHER_STATUS_LABELS[voucher.status]}
                    </StatusBadge>
                  </td>
                  <td className="px-3 py-2 text-end font-mono text-sm tabular-nums">
                    <Money valueMinor={voucher.balanceMinor} />
                    {/* A part payment is shown rather than implied: "owes
                          3,000" and "owes 3,000 of 5,000" are different
                          conversations to have with a parent. */}
                    {voucher.paidMinor > 0 ? (
                      <span className="block text-xs font-normal text-muted-foreground">
                        paid <Money valueMinor={voucher.paidMinor} withSymbol={false} /> of{' '}
                        <Money valueMinor={voucher.netPayableMinor} withSymbol={false} />
                      </span>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    );
  }

  const columns = useMemo((): CardTableColumn<DefaulterRow>[] => {
    return [
      {
        key: 'grNo',
        label: 'GR No',
        ...FEE_LIST_TABLE_CELL,
        colStyle: { width: '6.5rem' },
        sortable: true,
        headerCell: feeListTableHeader('GR No', StudentsIcon),
        render: (row) => {
          const isOpen = expanded.has(row.studentId);
          return (
            <div className="flex items-center gap-1.5" data-stop-row-click>
              <Button
                tone="ghost"
                size="sm"
                className="size-8 shrink-0 p-0"
                aria-expanded={isOpen}
                aria-label={`${isOpen ? 'Hide' : 'Show'} the overdue vouchers for ${row.name}`}
                onClick={() => {
                  toggle(row.studentId);
                }}
              >
                {isOpen ? (
                  <ChevronDownIcon className={ICON_SIZE.inline} aria-hidden />
                ) : (
                  <ChevronRightIcon className={ICON_SIZE.inline} aria-hidden />
                )}
              </Button>
              <span className="font-mono text-sm leading-none tabular-nums">{row.grNo}</span>
            </div>
          );
        },
      },
      {
        key: 'name',
        label: 'Student',
        ...FEE_LIST_TABLE_CELL,
        width: 'w-[18%]',
        sortable: true,
        headerCell: feeListTableHeader('Student', StudentsIcon),
        render: (row) => (
          <TwoLineCell
            primary={row.name}
            secondary={
              [row.className, row.sectionName].filter((part) => part !== null).join(' · ') || '—'
            }
          />
        ),
      },
      {
        key: 'fatherName',
        label: 'Father',
        ...FEE_LIST_TABLE_CELL,
        width: 'w-[14%]',
        hideOnMobile: true,
        headerCell: feeListTableHeader('Father', AccountIcon),
        render: (row) => <span className="text-sm">{row.fatherName ?? '—'}</span>,
      },
      {
        key: 'contact',
        label: 'Contact',
        ...FEE_LIST_TABLE_CELL,
        width: 'w-[12%]',
        headerCell: feeListTableHeader('Contact', PhoneIcon),
        render: (row) => <span className="font-mono text-sm">{row.contact ?? '—'}</span>,
      },
      {
        key: 'status',
        label: 'Status',
        ...FEE_LIST_TABLE_CELL,
        width: 'w-[10%]',
        hideOnMobile: true,
        headerCell: feeListTableHeader('Status'),
        render: (row) => (
          <StatusBadge tone={row.status === 'ACTIVE' ? 'success' : 'warning'}>
            {row.status === 'ACTIVE' ? 'Active' : titleCase(row.status)}
          </StatusBadge>
        ),
      },
      {
        key: 'amount',
        label: 'Amount',
        ...FEE_LIST_TABLE_CELL,
        width: 'w-[12%]',
        sortable: true,
        headerCell: feeListTableHeader('Amount', FeesIcon),
        render: (row) => (
          <span className="font-mono text-sm font-medium text-danger tabular-nums">
            <Money valueMinor={row.totalOwedMinor} />
          </span>
        ),
      },
      {
        key: 'months',
        label: 'Months',
        ...FEE_LIST_TABLE_CELL,
        width: 'w-[8%]',
        headerCell: feeListTableHeader('Months'),
        render: (row) => <span className="font-mono text-sm tabular-nums">{row.monthsOwed}</span>,
      },
      {
        key: 'monthNames',
        label: 'Bill months',
        ...FEE_LIST_TABLE_CELL,
        width: 'w-[14%]',
        hideOnMobile: true,
        headerCell: feeListTableHeader('Bill months', CalendarIcon),
        render: (row) => (
          <span className="text-sm text-muted-foreground">
            {row.months.length === 0 ? 'arrears only' : row.months.map(formatMonth).join(', ')}
          </span>
        ),
      },
    ];
  }, [expanded]);

  return (
    <div className="w-full space-y-6">
      <WorkspacePageHeader
        title="Defaulters"
        description={pageIntro('/fees/defaulters')}
        actions={
          <>
            <div className="rounded-lg border border-danger/30 bg-danger/5 px-4 py-2">
              <p className="text-xs text-muted-foreground">Total outstanding</p>
              <p className="font-mono text-lg font-semibold text-danger tabular-nums">
                <Money valueMinor={page.totalOwedMinor} />
              </p>
            </div>
            <Button tone="outline" onClick={exportCsv(page)} disabled={page.rows.length === 0}>
              <ExportIcon className={ICON_SIZE.inline} aria-hidden />
              Export
            </Button>
          </>
        }
      />

      <ListPageToolbar
        searchQuery={searchQuery}
        onSearchQueryChange={onSearchQueryChange}
        searchPlaceholder="Name, father, GR number"
        searchAriaLabel="Search defaulters"
        filters={
          <>
            <SimpleSelect
              className="w-full sm:w-36"
              ariaLabel="Filter by class"
              value={filters.classLevelId}
              emptyOption={{ value: '', label: 'Any class' }}
              placeholder="Any class"
              options={classes.map((entry) => ({ value: entry.id, label: entry.name }))}
              onValueChange={(next) => {
                pushFilters({ classLevelId: next });
              }}
            />
            <SimpleSelect
              className="w-full sm:w-36"
              ariaLabel="Filter by status"
              value={filters.status}
              emptyOption={{ value: '', label: 'Any status' }}
              placeholder="Any status"
              options={[
                { value: 'ACTIVE', label: 'Active' },
                { value: 'INACTIVE', label: 'Inactive' },
                { value: 'LEFT', label: 'Left' },
              ]}
              onValueChange={(next) => {
                pushFilters({ status: next });
              }}
            />
            <SimpleSelect
              className="w-full sm:w-36"
              ariaLabel="Months behind"
              value={filters.months}
              emptyOption={{ value: '', label: 'Any months behind' }}
              placeholder="Any months behind"
              options={[
                { value: '1', label: 'At least 1 month' },
                { value: '2', label: 'At least 2 months' },
                { value: '3', label: 'At least 3 months' },
                { value: '6', label: 'At least 6 months' },
              ]}
              onValueChange={(next) => {
                pushFilters({ months: next });
              }}
            />
            <SimpleSelect
              className="w-full sm:w-32"
              ariaLabel="Filter by gender"
              value={filters.gender}
              emptyOption={{ value: '', label: 'Any gender' }}
              placeholder="Any gender"
              options={[
                { value: 'MALE', label: 'Male' },
                { value: 'FEMALE', label: 'Female' },
              ]}
              onValueChange={(next) => {
                pushFilters({ gender: next });
              }}
            />
            <div className="w-full min-w-[11rem] sm:w-44">
              <DatePicker
                value={
                  filters.from !== '' && (filters.to === '' || filters.to === filters.from)
                    ? filters.from
                    : ''
                }
                aria-label="Due date"
                onChange={(nextValue) => {
                  if (nextValue === '') {
                    pushFilters({ from: '', to: '' });
                    return;
                  }
                  pushFilters({ from: nextValue, to: nextValue });
                }}
              />
            </div>
          </>
        }
      />

      <CardTable
        title="All defaulters"
        caption="Students with overdue fees"
        rows={page.rows}
        columns={columns}
        rowKey={(row) => row.studentId}
        minWidthClass="min-w-[56rem]"
        error={error}
        isFiltered={isFiltered}
        onClearFilters={clearFilters}
        sort={{
          key: sort,
          direction: order,
          onToggle: toggleSort,
        }}
        renderExpanded={(row) =>
          expanded.has(row.studentId) ? renderVouchers(row) : null
        }
        empty={{
          title: 'Nobody is behind',
          description:
            'Every fee due before today has been paid. Vouchers that are not due yet are not counted here.',
        }}
      />

      {page.total === 0 ? null : (
        <Pagination
          total={page.total}
          limit={limit}
          offset={offset}
          label="defaulters"
          onChange={(next) => {
            const query = new URLSearchParams(params.toString());
            if (next === 0) {
              query.delete('offset');
            } else {
              query.set('offset', String(next));
            }
            router.push(tenantHref(`/fees/defaulters?${query.toString()}`));
          }}
        />
      )}
    </div>
  );
}

/**
 * U+FEFF, as an escape.
 *
 * Written this way rather than as the character itself so the source file
 * stays plain ASCII — an invisible byte-order mark sitting in the middle of a
 * line of code is a thing nobody can see to fix.
 */
const BYTE_ORDER_MARK = '\uFEFF';

/**
 * The list as a CSV, built in the browser from the rows already on screen.
 *
 * Deliberately the current page rather than the whole filter: it needs no
 * endpoint, no second query and no server memory, and a school exporting to
 * chase families wants the list they are looking at. A whole-filter export is a
 * streaming endpoint, and it belongs with the other report exports rather than
 * bolted on here.
 */
function exportCsv(page: DefaulterList): () => void {
  return () => {
    const header = [
      'GR No',
      'Student',
      'Father',
      'Class',
      'Section',
      'Contact',
      'Status',
      'Months owed',
      'Months',
      'Amount',
    ];

    const lines = page.rows.map((row) =>
      [
        row.grNo,
        row.name,
        row.fatherName ?? '',
        row.className ?? '',
        row.sectionName ?? '',
        row.contact ?? '',
        row.status,
        String(row.monthsOwed),
        row.months.join(' '),
        // Rupees with two decimals, from the integer paisa. Never a float.
        `${String(Math.trunc(row.totalOwedMinor / 100))}.${String(row.totalOwedMinor % 100).padStart(2, '0')}`,
      ].map(csvCell),
    );

    const csv = [header.map(csvCell).join(','), ...lines.map((line) => line.join(','))].join(
      '\r\n',
    );
    // Excel guesses the encoding of a .csv from its first bytes, and without
    // this it reads UTF-8 as the local codepage — which turns every Urdu name
    // into mojibake in the one place a school is most likely to notice.
    const blob = new Blob([BYTE_ORDER_MARK + csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `defaulters-${page.asOf}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  };
}

/**
 * One CSV cell.
 *
 * Quoted whenever it contains a comma, a quote or a newline — and a leading
 * `=`, `+`, `-` or `@` is prefixed with an apostrophe, because Excel treats
 * those as formulas. A name is not a formula.
 */
function csvCell(value: string): string {
  const guarded = /^[=+\-@]/.test(value) ? `'${value}` : value;
  return /[",\r\n]/.test(guarded) ? `"${guarded.replaceAll('"', '""')}"` : guarded;
}

/** `2026-05` → `May 2026`. */
function formatMonth(month: string): string {
  const [year, index] = month.split('-');
  const names = [
    'Jan',
    'Feb',
    'Mar',
    'Apr',
    'May',
    'Jun',
    'Jul',
    'Aug',
    'Sep',
    'Oct',
    'Nov',
    'Dec',
  ];
  const name = names[Number(index) - 1];
  return name === undefined ? month : `${name} ${year ?? ''}`;
}

function titleCase(value: string): string {
  return value.charAt(0) + value.slice(1).toLowerCase();
}
