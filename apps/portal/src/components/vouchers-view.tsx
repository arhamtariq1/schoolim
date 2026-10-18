'use client';

import {
  MAX_BULK_VOUCHERS,
  type VoucherIds,
  ROUTES,
  type VoucherSettings,
  VOUCHER_STATUSES,
  VOUCHER_STATUS_LABELS,
  type AcademicSession,
  type BankLogo,
  type ClassLevel,
  type FeeHead,
  type VoucherDetail,
  type VoucherStatus,
  type VoucherSummary,
  type VoucherTotals,
} from '@ilm/contracts';
import {
  Button,
  Card,
  CardTable,
  Checkbox,
  DateDisplay,
  DatePicker,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Field,
  Input,
  Money,
  Popover,
  PopoverContent,
  PopoverTrigger,
  SimpleSelect,
  StatusBadge,
  useToast,
  type CardTableColumn,
} from '@ilm/ui';
import {
  CalendarIcon,
  ClassIcon,
  CloseIcon,
  DateRangeIcon,
  DeleteIcon,
  EditIcon,
  ExportIcon,
  FeesIcon,
  FinanceIcon,
  ICON_SIZE,
  MoreIcon,
  MoreVerticalIcon,
  OverdueIcon,
  PrintIcon,
  RefundIcon,
  SearchIcon,
  SessionIcon,
  SpinnerIcon,
  StudentsIcon,
  SuccessIcon,
  WarningIcon,
} from '@ilm/ui/icons';
import { systemClock } from '@ilm/utils';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';


function afterMenuAction(action: () => void): void {
  action();
  const swallow = (event: MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
  };
  document.addEventListener('click', swallow, true);
  window.setTimeout(() => {
    document.removeEventListener('click', swallow, true);
  }, 100);
}

import { ListDataTable } from './list-data-table';
import { ListTablePaginationFooter } from './list-table-pagination-footer';
import { VoucherBulkBar } from './voucher-bulk-bar';
import { VoucherChallan } from './voucher-challan';
import { VoucherEditDialog } from './voucher-edit-dialog';

import { StudentAdmissionAvatar } from '@/components/dashboard/student-admission-avatar';
import {
  FEE_LIST_SELECT_COLUMN,
  FEE_LIST_TABLE_CELL,
  classBadgeTone,
  feeListSelectCheckboxWrap,
  feeListSortableTableHeader,
  feeListTableHeader,
  splitStudentDisplayName,
  useDebouncedSearchFilter,
} from '@/components/fees/fee-list-shared';
import { WorkspacePageHeader } from '@/components/workspace-page-header';
import { formatInclusiveDateRange } from '@/lib/expense-date-range';
import { nextSortParams } from '@/lib/list-page';
import { rupeesToMinor } from '@/lib/money';
import { mutate } from '@/lib/mutate';
import { pageIntro } from '@/lib/page-copy';
import { stashPrintSelection } from '@/lib/print-handoff';
import { selectionScope, useScopedSelection } from '@/lib/use-scoped-selection';
import { useTenantHref } from '@/lib/use-tenant-href';

/** Matches app header search (`md:max-w-xl` in app-shell). */
const VOUCHER_TABLE_SEARCH_CLASS = 'relative w-full min-w-0 md:max-w-xl';

/** Empty on purpose — the badge design lives in `StatusBadge`. */
const VOUCHER_TABLE_BADGE_CLASS = '';

/**
 * Fees › Vouchers.
 *
 * ## Every filter lives in the URL
 *
 * "Unpaid vouchers for Grade 5 in September" is then a link somebody can send
 * to the principal, and the back button behaves. It also means the server does
 * the filtering — the browser never holds a school's whole voucher history to
 * filter it client-side, which is what stops this screen dying in year four.
 *
 * ## The trash icon deletes
 *
 * Unpaid vouchers are hard-deleted so they leave the list and the months can
 * be billed again. A voucher with money against it cannot be deleted — the
 * server refuses, and the control is not offered. Payments stay append-only.
 */

export interface VouchersViewProps {
  rows: VoucherSummary[];
  sessions: AcademicSession[];
  classes: ClassLevel[];
  heads: FeeHead[];
  totals: VoucherTotals;
  total: number;
  limit: number;
  offset: number;
  filters: {
    q: string;
    sessionId: string;
    classLevelId: string;
    status: string;
    from: string;
    to: string;
  };
  sort: 'issueDate' | 'dueDate' | 'voucherNo' | 'amount' | 'studentName' | 'status';
  order: 'asc' | 'desc';
  school: {
    name: string;
    address?: string | undefined;
    phone?: string | undefined;
    logoVersion?: string | undefined;
    bankLogos?: readonly BankLogo[] | undefined;
    accentColor?: string | undefined;
  };
  /** How this school’s challan is laid out. Defaults until they change it. */
  voucherSettings: VoucherSettings;
  error?: string | undefined;
  canCollect: boolean;
  canCancel: boolean;
  canEdit: boolean;
  /** Whether to offer the way to the challan's own settings from the preview. */
  canConfigureChallan: boolean;
}

export function VouchersView({
  rows,
  sessions,
  classes,
  heads,
  totals,
  total,
  limit,
  offset,
  filters,
  sort,
  order,
  school,
  voucherSettings,
  error,
  canCollect,
  canCancel,
  canEdit,
  canConfigureChallan,
}: VouchersViewProps) {
  const router = useRouter();
  const tenantHref = useTenantHref();
  const pathname = usePathname();
  const params = useSearchParams();

  const toast = useToast();

  const [busyId, setBusyId] = useState<string | undefined>(undefined);
  const [cancelling, setCancelling] = useState<VoucherSummary | undefined>(undefined);
  const [cancelReason, setCancelReason] = useState('');
  const [paying, setPaying] = useState<VoucherSummary | undefined>(undefined);
  const [previewing, setPreviewing] = useState<VoucherDetail | undefined>(undefined);
  const [isLoadingPreview, setIsLoadingPreview] = useState(false);
  const [editing, setEditing] = useState<VoucherSummary | undefined>(undefined);
  // Survives moving between pages — see use-scoped-selection for why useState cannot.
  const [selected, setSelected] = useScopedSelection(
    'fee-vouchers',
    selectionScope(new URLSearchParams(params.toString())),
  );
  const [rangeDraft, setRangeDraft] = useState({ from: filters.from, to: filters.to });

  useEffect(() => {
    setRangeDraft({ from: filters.from, to: filters.to });
  }, [filters.from, filters.to]);

  const isFiltered =
    filters.q !== '' ||
    filters.classLevelId !== '' ||
    filters.status !== '' ||
    filters.sessionId !== '' ||
    filters.from !== '' ||
    filters.to !== '';

  /**
   * Take every voucher behind the current filters, not just this page.
   *
   * Offered only when the whole filtered set fits in one run — otherwise the
   * button is a promise the next screen cannot keep, and a school would tick
   * two thousand and find out at the printer.
   *
   * Asks for the ids alone rather than paging the list. The list caps at two
   * hundred rows, so doing this through it would be three requests carrying
   * three hundred kilobytes of rows whose only useful field is the id.
   */
  /**
   * Hand a selection to the print page, the same way the bulk bar does.
   *
   * The ids go through storage rather than the query string: a print run can be
   * five hundred of them, which is a URL no browser will accept.
   */
  function openPrintPage(ids: readonly string[]): void {
    const token = stashPrintSelection(ids);

    if (token === undefined) {
      toast.error('Could not open print view. Allow site storage for this site and try again.');
      return;
    }

    window.open(`/fees/vouchers/print?h=${token}`, '_blank', 'noopener');
  }

  async function selectAllMatching() {
    const query = new URLSearchParams(params.toString());
    query.delete('offset');
    query.delete('limit');

    const response = await fetch(`${ROUTES.vouchers.ids}?${query.toString()}`, {
      credentials: 'include',
    });

    if (!response.ok) {
      toast.error('Could not select them all. Try again.');
      return;
    }

    const body = (await response.json()) as { data: VoucherIds };
    setSelected(new Set(body.data.ids));
  }

  const pushFilters = useCallback(
    (next: Record<string, string>) => {
      const keepsPage = Object.hasOwn(next, 'offset');
      if (!keepsPage) {
        setSelected(new Set());
      }

      const query = new URLSearchParams(params.toString());
      query.delete('grNo');

      for (const [key, value] of Object.entries(next)) {
        if (value === '') {
          query.delete(key);
        } else {
          query.set(key, value);
        }
      }

      if (!keepsPage) {
        query.delete('offset');
      }

      router.push(`${pathname}?${query.toString()}`);
    },
    [params, pathname, router],
  );

  const { searchQuery, onSearchQueryChange } = useDebouncedSearchFilter(filters.q, (value) => {
    pushFilters({ q: value });
  });

  function toggleSort(columnKey: string) {
    const next = nextSortParams(sort, order, columnKey);
    pushFilters({ sort: next.sort, order: next.order });
  }

  function clearFilters() {
    setSelected(new Set());
    router.push(tenantHref('/fees/vouchers'));
  }

  function toggleRowSelected(id: string, checked: boolean) {
    const next = new Set(selected);
    if (checked) {
      next.add(id);
    } else {
      next.delete(id);
    }
    setSelected(next);
  }

  function toggleAllOnPage(checked: boolean) {
    if (!checked) {
      const next = new Set(selected);
      for (const row of rows) {
        next.delete(row.id);
      }
      setSelected(next);
      return;
    }
    const next = new Set(selected);
    for (const row of rows) {
      next.add(row.id);
    }
    setSelected(next);
  }

  const allOnPageSelected = rows.length > 0 && rows.every((row) => selected.has(row.id));
  const someOnPageSelected = rows.some((row) => selected.has(row.id));

  async function openChallan(row: VoucherSummary) {
    setIsLoadingPreview(true);
    setBusyId(row.id);
    const response = await fetch(ROUTES.vouchers.detail(row.id), { credentials: 'include' });
    setIsLoadingPreview(false);
    setBusyId(undefined);

    if (!response.ok) {
      toast.error('Could not load that voucher.');
      return;
    }
    const body = (await response.json()) as { data: VoucherDetail };
    setPreviewing(body.data);
  }

  async function confirmCancel() {
    if (cancelling === undefined) {
      return;
    }
    const result = await mutate(ROUTES.vouchers.detail(cancelling.id), 'DELETE', {
      reason: cancelReason,
    });
    if (!result.ok) {
      toast.error(result.message);
      return;
    }
    toast.success(`${cancelling.voucherNo} deleted.`);
    setCancelling(undefined);
    setCancelReason('');
    router.refresh();
  }

  const sortState = useMemo(() => ({ key: sort, direction: order }), [sort, order]);

  const columns = useMemo((): CardTableColumn<VoucherSummary>[] => {
    return [
      {
        key: 'select',
        label: '',
        ...FEE_LIST_SELECT_COLUMN,
        colStyle: { width: '3.25rem' },
        headerCell: feeListSelectCheckboxWrap(
          <Checkbox
            checked={allOnPageSelected ? true : someOnPageSelected ? 'indeterminate' : false}
            aria-label="Select every voucher on this page"
            onCheckedChange={(next) => {
              toggleAllOnPage(next === true);
            }}
          />,
        ),
        render: (row) =>
          feeListSelectCheckboxWrap(
            <Checkbox
              checked={selected.has(row.id)}
              aria-label={`Select voucher ${row.voucherNo}`}
              onCheckedChange={(next) => {
                toggleRowSelected(row.id, next === true);
              }}
            />,
            { stopRowClick: true },
          ),
      },
      {
        key: 'voucherNo',
        label: 'Voucher #',
        ...FEE_LIST_TABLE_CELL,
        colStyle: { width: '7.5rem' },
        sortable: true,
        headerCell: feeListSortableTableHeader('Voucher #', 'voucherNo', sortState, toggleSort, FeesIcon),
        render: (row) => (
          <span className="text-sm font-medium leading-none tabular-nums text-foreground">
            {row.voucherNo}
          </span>
        ),
      },
      {
        key: 'studentName',
        label: 'Student',
        ...FEE_LIST_TABLE_CELL,
        width: 'w-[20%]',
        sortable: true,
        headerCell: feeListSortableTableHeader('Student', 'studentName', sortState, toggleSort, StudentsIcon),
        render: (row) => {
          const { firstName, lastName } = splitStudentDisplayName(row.studentName);
          return (
            <div className="flex min-w-0 items-center gap-3">
              <StudentAdmissionAvatar
                firstName={firstName}
                lastName={lastName}
                photoUrl={null}
                className="size-9 text-[11px]"
              />
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-foreground">{row.studentName}</p>
                <p className="truncate text-xs tabular-nums text-muted-foreground">
                  {row.grNo === null ? '—' : `GR ${row.grNo}`}
                </p>
              </div>
            </div>
          );
        },
      },
      {
        key: 'className',
        label: 'Class',
        ...FEE_LIST_TABLE_CELL,
        width: 'w-[10%]',
        hideOnMobile: true,
        headerCell: feeListTableHeader('Class', StudentsIcon),
        render: (row) =>
          row.className === null ? (
            <span className="text-sm text-muted-foreground">—</span>
          ) : (
            <StatusBadge
              tone={classBadgeTone(row.className)}
              size="sm"
              icon={ClassIcon}
              className={VOUCHER_TABLE_BADGE_CLASS}
            >
              {row.className}
            </StatusBadge>
          ),
      },
      {
        key: 'issueDate',
        label: 'Issued',
        ...FEE_LIST_TABLE_CELL,
        width: 'w-[11%]',
        hideOnMobile: true,
        sortable: true,
        headerCell: feeListSortableTableHeader('Issued', 'issueDate', sortState, toggleSort, CalendarIcon),
        render: (row) => (
          <span className="inline-flex items-center gap-2 text-sm leading-none text-foreground">
            <CalendarIcon className="size-4 shrink-0 text-muted-foreground" aria-hidden />
            <DateDisplay value={row.issueDate} />
          </span>
        ),
      },
      {
        key: 'dueDate',
        label: 'Due',
        ...FEE_LIST_TABLE_CELL,
        width: 'w-[11%]',
        hideOnMobile: true,
        sortable: true,
        headerCell: feeListSortableTableHeader('Due', 'dueDate', sortState, toggleSort, CalendarIcon),
        render: (row) => (
          <span className="inline-flex items-center gap-2 text-sm leading-none text-foreground">
            <CalendarIcon className="size-4 shrink-0 text-muted-foreground" aria-hidden />
            <DateDisplay value={row.dueDate} />
          </span>
        ),
      },
      {
        key: 'months',
        label: 'Bill months',
        ...FEE_LIST_TABLE_CELL,
        width: 'w-[11%]',
        hideOnMobile: true,
        headerCell: feeListTableHeader('Bill months', CalendarIcon),
        render: (row) =>
          row.billMonths.length === 0 ? (
            <span className="text-sm text-muted-foreground">—</span>
          ) : (
            <span className="inline-flex flex-wrap gap-1">
              {row.billMonths.map((month) => (
                <StatusBadge key={month} tone="neutral" size="sm" icon={CalendarIcon}>
                  {formatMonth(month)}
                </StatusBadge>
              ))}
            </span>
          ),
      },
      {
        key: 'amount',
        label: 'Amount',
        ...FEE_LIST_TABLE_CELL,
        width: 'w-[11%]',
        sortable: true,
        headerCell: feeListSortableTableHeader('Amount', 'amount', sortState, toggleSort, FeesIcon),
        render: (row) => <Money valueMinor={row.totalPayableMinor} withSymbol />,
      },
      {
        key: 'status',
        label: 'Status',
        ...FEE_LIST_TABLE_CELL,
        width: 'w-[11%]',
        sortable: true,
        headerCell: feeListSortableTableHeader('Status', 'status', sortState, toggleSort),
        render: (row) => (
          <StatusBadge
            tone={toneFor(row.status)}
            size="sm"
            icon={voucherStatusIcon(row.status)}
            className={VOUCHER_TABLE_BADGE_CLASS}
          >
            {VOUCHER_STATUS_LABELS[row.status]}
          </StatusBadge>
        ),
      },
      {
        key: 'actions',
        label: 'Actions',
        ...FEE_LIST_TABLE_CELL,
        width: 'w-[9%]',
        headerCell: feeListTableHeader('Actions'),
        render: (row) => (
          <VoucherRowActions
            row={row}
            busyId={busyId}
            isLoadingPreview={isLoadingPreview}
            canEdit={canEdit}
            canCollect={canCollect}
            canCancel={canCancel}
            onEdit={() => {
              setEditing(row);
            }}
            onPay={() => {
              setPaying(row);
            }}
            onPrint={() => {
              void openChallan(row);
            }}
            onDelete={() => {
              setCancelling(row);
              setCancelReason('');
            }}
          />
        ),
      },
    ];
  }, [
    allOnPageSelected,
    busyId,
    canCancel,
    canCollect,
    canEdit,
    isLoadingPreview,
    selected,
    someOnPageSelected,
    sortState,
  ]);

  return (
    <div className="w-full space-y-6">
      <WorkspacePageHeader title="Fee Vouchers" description={pageIntro('/fees/vouchers')} />

      {error !== undefined ? (
        <div
          role="alert"
          className="rounded-md border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-danger"
        >
          {error}
        </div>
      ) : null}

      <Card className="overflow-hidden">
        <div className="border-b border-border p-4">
          <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
            <div className={`${VOUCHER_TABLE_SEARCH_CLASS} shrink-0`}>
              <SearchIcon
                className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
                aria-hidden="true"
              />
              <input
                type="search"
                value={searchQuery}
                onChange={(event) => {
                  onSearchQueryChange(event.target.value);
                }}
                placeholder="Search by student name, GR number or voucher no…"
                aria-label="Search vouchers"
                className="h-10 w-full rounded-md border border-border bg-field ps-9 pe-3 text-sm focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
              />
            </div>
            <div className="flex flex-wrap items-center gap-2 xl:ms-auto xl:justify-end">
              <SimpleSelect
                className="w-full min-w-32 sm:w-36"
                ariaLabel="Filter by class"
                value={filters.classLevelId}
                triggerIcon={ClassIcon}
                emptyOption={{ value: '', label: 'Any class' }}
                placeholder="Any class"
                options={classes.map((entry) => ({ value: entry.id, label: entry.name }))}
                onValueChange={(next) => {
                  pushFilters({ classLevelId: next });
                }}
              />
              <SimpleSelect
                className="w-full min-w-32 sm:w-36"
                ariaLabel="Filter by status"
                value={filters.status}
                triggerIcon={FeesIcon}
                emptyOption={{ value: '', label: 'Any status' }}
                placeholder="Any status"
                options={VOUCHER_STATUSES.map((status) => ({
                  value: status,
                  label: VOUCHER_STATUS_LABELS[status],
                }))}
                onValueChange={(next) => {
                  pushFilters({ status: next });
                }}
              />
              <SimpleSelect
                className="w-full min-w-32 sm:w-40"
                ariaLabel="Filter by session"
                value={filters.sessionId}
                triggerIcon={SessionIcon}
                emptyOption={{ value: '', label: 'Any session' }}
                placeholder="Any session"
                options={sessions.map((entry) => ({
                  value: entry.id,
                  label: entry.isCurrent ? `${entry.name} (current)` : entry.name,
                }))}
                onValueChange={(next) => {
                  pushFilters({ sessionId: next });
                }}
              />
              <Popover>
                <PopoverTrigger asChild>
                  <Button tone="outline" className="w-full gap-2 sm:w-auto">
                    <DateRangeIcon className={ICON_SIZE.inline} aria-hidden />
                    {filters.from !== '' && filters.to !== ''
                      ? formatInclusiveDateRange(filters.from, filters.to)
                      : 'Issued dates'}
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
                  <Field label="To">
                    <DatePicker
                      value={rangeDraft.to}
                      aria-label="To date"
                      onChange={(next) => {
                        setRangeDraft((prev) => ({ ...prev, to: next }));
                      }}
                    />
                  </Field>
                  <div className="flex flex-col gap-2">
                    <Button
                      className="w-full"
                      onClick={() => {
                        pushFilters({ from: rangeDraft.from, to: rangeDraft.to });
                      }}
                    >
                      Apply range
                    </Button>
                    <Button
                      tone="ghost"
                      size="sm"
                      className="w-full"
                      onClick={() => {
                        pushFilters({ from: '', to: '' });
                      }}
                    >
                      Clear dates
                    </Button>
                  </div>
                </PopoverContent>
              </Popover>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border bg-card px-4 py-3">
          <h2 className="text-sm font-semibold text-foreground">All Fee Vouchers</h2>
          <div className="flex items-center gap-2">
            <Button
              tone="outline"
              size="sm"
              className="gap-2"
              disabled={rows.length === 0}
              onClick={exportVouchersCsv(rows)}
            >
              <ExportIcon className={ICON_SIZE.inline} aria-hidden />
              Export
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  type="button"
                  tone="outline"
                  size="icon"
                  className="size-9 shrink-0"
                  aria-label="More voucher actions"
                >
                  <MoreIcon className={ICON_SIZE.inline} aria-hidden />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                {canEdit ? (
                  <DropdownMenuItem asChild>
                    <Link href={tenantHref('/fees/generate')}>Generate fees</Link>
                  </DropdownMenuItem>
                ) : null}
                <DropdownMenuItem
                  disabled={selected.size === 0}
                  onSelect={() => {
                    openPrintPage([...selected]);
                  }}
                >
                  <PrintIcon className={ICON_SIZE.inline} aria-hidden />
                  Print selected
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        <ListDataTable
          title="Fee Vouchers"
          caption="Fee Vouchers"
          rows={rows}
          columns={columns}
          rowKey={(row) => row.id}
          minWidthClass="min-w-[64rem]"
          error={undefined}
          isFiltered={isFiltered}
          onClearFilters={clearFilters}
          sort={{
            key: sort,
            direction: order,
            onToggle: toggleSort,
          }}
          empty={{
            title: 'No vouchers here',
            description:
              'Nothing matches these filters. Generate a month of fees, or clear the filters to see everything.',
          }}
        />

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
      </Card>

      <VoucherBulkBar
        selected={selected}
        onClear={() => {
          setSelected(new Set());
        }}
        matching={total}
        onSelectAllMatching={
          total > rows.length && total <= MAX_BULK_VOUCHERS ? selectAllMatching : undefined
        }
        canDelete={canCancel}
        canCollect={canCollect}
      />

      <VoucherEditDialog
        voucher={editing}
        heads={heads}
        onClose={() => {
          setEditing(undefined);
        }}
        onSaved={() => {
          router.refresh();
        }}
      />

      {/* A reason is mandatory, so this is a form rather than a ConfirmDialog —
          that component takes no children, and a confirmation whose reason box
          lives somewhere else is a confirmation nobody reads. */}
      <Dialog
        open={cancelling !== undefined}
        onOpenChange={(open) => {
          if (!open) {
            setCancelling(undefined);
          }
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Delete {cancelling?.voucherNo ?? ''}?</DialogTitle>
            <DialogDescription>
              The voucher is removed from the list, and those months become available to bill again.
            </DialogDescription>
          </DialogHeader>
          <DialogBody>
            <Field
              label="Reason"
              required
              hint="Recorded with the action so the change can be explained later."
            >
              <Input
                value={cancelReason}
                placeholder="Issued with the wrong due date"
                onChange={(event) => {
                  setCancelReason(event.target.value);
                }}
              />
            </Field>
          </DialogBody>
          <DialogFooter>
            <Button
              tone="ghost"
              onClick={() => {
                setCancelling(undefined);
              }}
            >
              Keep it
            </Button>
            <Button
              tone="danger"
              disabled={cancelReason.trim().length < 3}
              onClick={() => {
                void confirmCancel();
              }}
            >
              Delete voucher
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {paying === undefined ? null : (
        <CollectDialog
          voucher={paying}
          onClose={() => {
            setPaying(undefined);
          }}
          onDone={() => {
            setPaying(undefined);
            router.refresh();
          }}
        />
      )}

      <Dialog
        open={previewing !== undefined}
        onOpenChange={(open) => {
          if (!open) {
            setPreviewing(undefined);
          }
        }}
      >
        <DialogContent className="max-w-5xl">
          <DialogHeader>
            <DialogTitle>Fee voucher</DialogTitle>
            <DialogDescription>
              {/* The three copies are named by the school, so this no longer
                  says "school, bank and parent" — that was true of the old
                  fixed labels and is a sentence that can now be wrong. */}
              Three copies on one page, which is what a bank counter accepts.
            </DialogDescription>
          </DialogHeader>
          <DialogBody>
            {previewing === undefined ? null : (
              // The sheet at its printable size, zoomed to fit the dialog. What
              // is on screen is then the paper, not an approximation of it.
              <div
                className={`mx-auto [zoom:0.6] ${voucherSettings.copyCount === 4 ? 'w-[194mm]' : 'w-[281mm]'
                  }`}
              >
                <VoucherChallan voucher={previewing} school={school} settings={voucherSettings} />
              </div>
            )}
          </DialogBody>
          <DialogFooter>
            {/* Looking at the challan is when somebody notices the logo is
                missing or the Kuickpay ID is wrong, so the way to change it
                belongs here rather than only under Settings. */}
            {canConfigureChallan ? (
              <Button tone="ghost" asChild className="me-auto">
                <Link href={tenantHref('/settings/voucher')}>Customise this challan</Link>
              </Button>
            ) : null}
            <Button
              tone="ghost"
              onClick={() => {
                setPreviewing(undefined);
              }}
            >
              Close
            </Button>
            {/* Opens the same print page a bulk run uses, rather than printing
                the dialog. Printing in place meant lifting the challan out of a
                centred modal with `position: absolute`, which put it a third of
                the way down the sheet — and dragged the preview's own zoom onto
                the paper, which is what made the type unreadable. One print
                path, and it is the one that was already correct. */}
            <Button
              onClick={() => {
                openPrintPage(previewing === undefined ? [] : [previewing.id]);
              }}
            >
              <PrintIcon className={ICON_SIZE.inline} aria-hidden />
              Print or download
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function VoucherRowActions({
  row,
  busyId,
  isLoadingPreview,
  canEdit,
  canCollect,
  canCancel,
  onEdit,
  onPay,
  onPrint,
  onDelete,
}: {
  row: VoucherSummary;
  busyId: string | undefined;
  isLoadingPreview: boolean;
  canEdit: boolean;
  canCollect: boolean;
  canCancel: boolean;
  onEdit: () => void;
  onPay: () => void;
  onPrint: () => void;
  onDelete: () => void;
}) {
  const showEdit = canEdit && row.status !== 'CANCELLED' && row.status !== 'PAID';
  const showPay = canCollect && row.balanceMinor > 0 && row.status !== 'CANCELLED';
  const showDelete = canCancel && row.paidMinor === 0;
  const disabled = busyId !== undefined;

  return (
    <div className="flex justify-start" data-stop-row-click>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            tone="ghost"
            size="icon"
            className="size-8 text-muted-foreground hover:text-foreground"
            aria-label={`Actions for voucher ${row.voucherNo}`}
            disabled={disabled}
            onClick={(event) => {
              event.stopPropagation();
            }}
          >
            <MoreVerticalIcon className={ICON_SIZE.inline} aria-hidden />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          side="bottom"
          align="end"
          sideOffset={8}
          collisionPadding={12}
          className="w-48"
          onCloseAutoFocus={(event) => {
            event.preventDefault();
          }}
        >
          <DropdownMenuLabel>{row.voucherNo}</DropdownMenuLabel>
          <DropdownMenuSeparator />
          {showEdit ? (
            <DropdownMenuItem
              onSelect={() => {
                afterMenuAction(onEdit);
              }}
            >
              <EditIcon className={ICON_SIZE.inline} aria-hidden />
              Edit voucher
            </DropdownMenuItem>
          ) : null}
          {showPay ? (
            <DropdownMenuItem
              onSelect={() => {
                afterMenuAction(onPay);
              }}
            >
              <FinanceIcon className={ICON_SIZE.inline} aria-hidden />
              Record payment
            </DropdownMenuItem>
          ) : null}
          <DropdownMenuItem
            disabled={disabled}
            onSelect={() => {
              afterMenuAction(onPrint);
            }}
          >
            {busyId === row.id && isLoadingPreview ? (
              <SpinnerIcon className={`${ICON_SIZE.inline} animate-spin`} aria-hidden />
            ) : (
              <PrintIcon className={ICON_SIZE.inline} aria-hidden />
            )}
            Preview challan
          </DropdownMenuItem>
          {showDelete ? (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                destructive
                onSelect={() => {
                  afterMenuAction(onDelete);
                }}
              >
                <DeleteIcon className={ICON_SIZE.inline} aria-hidden />
                Delete voucher
              </DropdownMenuItem>
            </>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

/**
 * Taking money at the counter.
 *
 * The amount defaults to everything outstanding — including arrears carried
 * from earlier vouchers, which the server settles oldest-first. Editable,
 * because part payments are ordinary here rather than an exception.
 */
function CollectDialog({
  voucher,
  onClose,
  onDone,
}: {
  voucher: VoucherSummary;
  onClose: () => void;
  onDone: () => void;
}) {
  const toast = useToast();
  const due = voucher.totalPayableMinor - voucher.paidMinor;

  const [amount, setAmount] = useState(String(due / 100));
  const [method, setMethod] = useState('CASH');
  const [paidOn, setPaidOn] = useState(() => systemClock.now().toISOString().slice(0, 10));
  const [reference, setReference] = useState('');
  const [formError, setFormError] = useState<string | undefined>(undefined);
  const [isPending, setIsPending] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(undefined);
    setIsPending(true);

    const result = await mutate(ROUTES.vouchers.pay(voucher.id), 'POST', {
      amountMinor: rupeesToMinor(amount) ?? 0,
      method,
      paidOn,
      ...(reference.trim() === '' ? {} : { reference: reference.trim() }),
      // Fixed for this dialog, so a double-submitted form is one payment.
      idempotencyKey: `pay-${voucher.id}-${paidOn}-${String(rupeesToMinor(amount) ?? 0)}`,
    });
    setIsPending(false);

    if (!result.ok) {
      setFormError(result.message);
      return;
    }
    toast.success(`Payment recorded for ${voucher.studentName}.`);
    onDone();
  }

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) {
          onClose();
        }
      }}
    >
      <DialogContent className="max-w-lg">
        <form
          noValidate
          onSubmit={(event) => {
            void submit(event);
          }}
        >
          <DialogHeader>
            <DialogTitle>Collect from {voucher.studentName}</DialogTitle>
            <DialogDescription>
              Voucher {voucher.voucherNo} · {formatCurrency(due)} outstanding
            </DialogDescription>
          </DialogHeader>
          <DialogBody className="space-y-4">
            {formError === undefined ? null : (
              <div
                role="alert"
                className="rounded-md border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger"
              >
                {formError}
              </div>
            )}

            <div className="grid gap-4 sm:grid-cols-2">
              <Field
                label="Amount"
                required
                hint={
                  voucher.arrearsMinor > 0
                    ? 'Arrears are settled first, oldest voucher before newest.'
                    : undefined
                }
              >
                <Input
                  type="number"
                  min="1"
                  step="1"
                  inputMode="numeric"
                  value={amount}
                  onChange={(event) => {
                    setAmount(event.target.value);
                  }}
                />
              </Field>
              <Field label="Paid on" required>
                <DatePicker value={paidOn} onChange={setPaidOn} />
              </Field>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Method" required>
                <SimpleSelect
                  value={method}
                  options={[
                    { value: 'CASH', label: 'Cash' },
                    { value: 'BANK_TRANSFER', label: 'Bank transfer' },
                    { value: 'CHEQUE', label: 'Cheque' },
                    { value: 'CARD', label: 'Card' },
                    { value: 'OTHER', label: 'Other' },
                  ]}
                  onValueChange={setMethod}
                />
              </Field>
              <Field label="Reference" hint="Cheque or transaction number.">
                <Input
                  value={reference}
                  onChange={(event) => {
                    setReference(event.target.value);
                  }}
                />
              </Field>
            </div>
          </DialogBody>
          <DialogFooter>
            <Button type="button" tone="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" isPending={isPending}>
              Record payment
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function toneFor(status: VoucherStatus): 'success' | 'danger' | 'warning' | 'neutral' {
  switch (status) {
    case 'PAID':
      return 'success';
    case 'PARTIALLY_PAID':
      return 'warning';
    case 'UNPAID':
      return 'danger';
    default:
      return 'neutral';
  }
}

function voucherStatusIcon(status: VoucherStatus): typeof SuccessIcon {
  switch (status) {
    case 'PAID':
      return SuccessIcon;
    case 'PARTIALLY_PAID':
      return FeesIcon;
    case 'UNPAID':
      return OverdueIcon;
    case 'WAIVED':
      return RefundIcon;
    case 'CANCELLED':
      return CloseIcon;
    default:
      return WarningIcon;
  }
}

const VOUCHER_CSV_BOM = '\uFEFF';

function exportVouchersCsv(rows: readonly VoucherSummary[]): () => void {
  return () => {
    const header = [
      'Voucher #',
      'GR No',
      'Student',
      'Class',
      'Issued',
      'Due',
      'Bill months',
      'Amount (PKR)',
      'Status',
    ];

    const lines = rows.map((row) =>
      [
        row.voucherNo,
        row.grNo ?? '',
        row.studentName,
        row.className ?? '',
        row.issueDate,
        row.dueDate,
        row.billMonths.map(formatMonth).join(' '),
        `${String(Math.trunc(row.totalPayableMinor / 100))}.${String(Math.abs(row.totalPayableMinor) % 100).padStart(2, '0')}`,
        VOUCHER_STATUS_LABELS[row.status],
      ].map(voucherCsvCell),
    );

    const csv = [header.map(voucherCsvCell).join(','), ...lines.map((line) => line.join(','))].join(
      '\r\n',
    );
    const blob = new Blob([VOUCHER_CSV_BOM + csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `fee-vouchers-${systemClock.now().toISOString().slice(0, 10)}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  };
}

function voucherCsvCell(value: string): string {
  const guarded = /^[=+\-@]/.test(value) ? `'${value}` : value;
  return /[",\r\n]/.test(guarded) ? `"${guarded.replaceAll('"', '""')}"` : guarded;
}

function formatMonth(iso: string): string {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-GB', {
    month: 'short',
    year: '2-digit',
    timeZone: 'UTC',
  });
}

function formatCurrency(minor: number): string {
  return `PKR ${(minor / 100).toLocaleString('en-PK')}`;
}
