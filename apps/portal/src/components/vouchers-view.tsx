'use client';

import {
  MAX_BULK_VOUCHERS,
  type VoucherIds,
  ROUTES,
  type VoucherSettings,
  VOUCHER_STATUSES,
  VOUCHER_STATUS_LABELS,
  type AcademicSession,
  type ClassLevel,
  type FeeHead,
  type VoucherDetail,
  type VoucherStatus,
  type VoucherSummary,
  type VoucherTotals,
} from '@ilm/contracts';
import {
  Button,
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
  Pagination,
  SimpleSelect,
  StatusBadge,
  TwoLineCell,
  useToast,
  type CardTableColumn,
} from '@ilm/ui';
import {
  CalendarIcon,
  DeleteIcon,
  EditIcon,
  FeesIcon,
  ICON_SIZE,
  MoreIcon,
  PrintIcon,
  SpinnerIcon,
  StudentsIcon,
} from '@ilm/ui/icons';
import { systemClock } from '@ilm/utils';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react';

import { ListPageToolbar } from '@/components/list-page-toolbar';
import { WorkspacePageHeader } from '@/components/workspace-page-header';

const VOUCHER_TABLE_CELL = {
  headerClassName: 'whitespace-nowrap px-3 py-2.5',
  cellClassName: 'whitespace-nowrap px-3 py-2.5',
} as const;

type VoucherTableHeaderIcon = typeof StudentsIcon;

function voucherTableHeader(
  label: string,
  Icon?: VoucherTableHeaderIcon,
  leading?: ReactNode,
): ReactNode {
  return (
    <div className="flex items-center gap-2">
      {leading}
      {Icon === undefined ? null : (
        <Icon className="size-4 shrink-0 opacity-80" aria-hidden />
      )}
      <span className="text-xs leading-none font-medium text-muted-foreground">{label}</span>
    </div>
  );
}

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

import { VoucherBulkBar } from './voucher-bulk-bar';
import { VoucherChallan } from './voucher-challan';
import { VoucherEditDialog } from './voucher-edit-dialog';

import { rupeesToMinor } from '@/lib/money';
import { mutate } from '@/lib/mutate';
import { stashPrintSelection } from '@/lib/print-handoff';
import { useTenantHref } from '@/lib/use-tenant-href';

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
  school: {
    name: string;
    address?: string | undefined;
    phone?: string | undefined;
    logoVersion?: string | undefined;
    bankLogoVersion?: string | undefined;
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

  const [searchQuery, setSearchQuery] = useState(filters.q);
  const searchDebounce = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const [busyId, setBusyId] = useState<string | undefined>(undefined);
  const [cancelling, setCancelling] = useState<VoucherSummary | undefined>(undefined);
  const [cancelReason, setCancelReason] = useState('');
  const [paying, setPaying] = useState<VoucherSummary | undefined>(undefined);
  const [previewing, setPreviewing] = useState<VoucherDetail | undefined>(undefined);
  const [isLoadingPreview, setIsLoadingPreview] = useState(false);
  const [editing, setEditing] = useState<VoucherSummary | undefined>(undefined);
  const [selected, setSelected] = useState<ReadonlySet<string>>(() => new Set());

  useEffect(() => {
    setSearchQuery(filters.q);
  }, [filters.q]);

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
      toast.error(
        'Could not open the print view',
        'This browser is blocking site storage. Allow it for this site and try again.',
      );
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

  function pushFilters(next: Record<string, string>, resetPage = true) {
    if (resetPage) {
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

    query.set('limit', String(limit));
    if (resetPage) {
      query.delete('offset');
    } else if (offset > 0) {
      query.set('offset', String(offset));
    }

    router.push(`${pathname}?${query.toString()}`);
  }

  function onSearchQueryChange(value: string) {
    setSearchQuery(value);
    if (searchDebounce.current !== undefined) {
      clearTimeout(searchDebounce.current);
    }
    searchDebounce.current = setTimeout(() => {
      pushFilters({ q: value });
    }, 350);
  }

  function clearFilters() {
    setSearchQuery('');
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
    toast.success(`${cancelling.voucherNo} deleted`, 'Those months can be billed again.');
    setCancelling(undefined);
    setCancelReason('');
    router.refresh();
  }

  const columns = useMemo((): CardTableColumn<VoucherSummary>[] => {
    return [
      {
        key: 'grNo',
        label: 'GR No',
        ...VOUCHER_TABLE_CELL,
        colStyle: { width: '5.75rem' },
        headerCell: voucherTableHeader(
          'GR No',
          undefined,
          <Checkbox
            className="shrink-0"
            checked={allOnPageSelected ? true : someOnPageSelected ? 'indeterminate' : false}
            aria-label="Select every voucher on this page"
            onCheckedChange={(next) => {
              toggleAllOnPage(next === true);
            }}
          />,
        ),
        render: (row) => (
          <div className="flex items-center gap-2" data-stop-row-click>
            <Checkbox
              className="shrink-0"
              checked={selected.has(row.id)}
              aria-label={`Select voucher ${row.voucherNo}`}
              onCheckedChange={(next) => {
                toggleRowSelected(row.id, next === true);
              }}
            />
            <span className="font-mono text-sm leading-none tabular-nums text-foreground">
              {row.grNo ?? '—'}
            </span>
          </div>
        ),
      },
      {
        key: 'student',
        label: 'Student',
        ...VOUCHER_TABLE_CELL,
        width: 'w-[19%]',
        headerCell: voucherTableHeader('Student', StudentsIcon),
        render: (row) => (
          <TwoLineCell
            primary={row.studentName}
            secondary={`${row.className ?? '—'}${row.sectionName === null ? '' : ` ${row.sectionName}`}`}
          />
        ),
      },
      {
        key: 'issueDate',
        label: 'Issued',
        ...VOUCHER_TABLE_CELL,
        width: 'w-[12%]',
        hideOnMobile: true,
        headerCell: voucherTableHeader('Issued', CalendarIcon),
        render: (row) => (
          <span className="text-sm leading-none text-foreground">
            <DateDisplay value={row.issueDate} />
          </span>
        ),
      },
      {
        key: 'dueDate',
        label: 'Due',
        ...VOUCHER_TABLE_CELL,
        width: 'w-[12%]',
        hideOnMobile: true,
        headerCell: voucherTableHeader('Due', CalendarIcon),
        render: (row) => (
          <span className="text-sm leading-none text-foreground">
            <DateDisplay value={row.dueDate} />
          </span>
        ),
      },
      {
        key: 'months',
        label: 'Bill months',
        ...VOUCHER_TABLE_CELL,
        width: 'w-[12%]',
        hideOnMobile: true,
        headerCell: voucherTableHeader('Bill months', CalendarIcon),
        render: (row) => (
          <span className="text-sm leading-none text-muted-foreground">
            {row.billMonths.length === 0
              ? '—'
              : row.billMonths.map((month) => formatMonth(month)).join(', ')}
          </span>
        ),
      },
      {
        key: 'amount',
        label: 'Amount',
        ...VOUCHER_TABLE_CELL,
        width: 'w-[13%]',
        headerCell: voucherTableHeader('Amount', FeesIcon),
        render: (row) => (
          <TwoLineCell
            primary={
              <span className="font-mono tabular-nums">
                <Money valueMinor={row.totalPayableMinor} />
              </span>
            }
            secondary={
              row.arrearsMinor > 0 ? (
                <span className="text-warning">
                  incl. <Money valueMinor={row.arrearsMinor} withSymbol={false} /> arrears
                </span>
              ) : (
                ''
              )
            }
          />
        ),
      },
      {
        key: 'status',
        label: 'Status',
        ...VOUCHER_TABLE_CELL,
        width: 'w-[11%]',
        headerCell: voucherTableHeader('Status'),
        render: (row) => (
          <StatusBadge tone={toneFor(row.status)}>{VOUCHER_STATUS_LABELS[row.status]}</StatusBadge>
        ),
      },
      {
        key: 'actions',
        label: 'Actions',
        ...VOUCHER_TABLE_CELL,
        width: 'w-[9%]',
        headerCell: voucherTableHeader('Actions'),
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
  ]);

  return (
    <div className="w-full space-y-6">
      <WorkspacePageHeader
        title="Fee vouchers"
        description={
          <>
            {totals.count} {totals.count === 1 ? 'voucher' : 'vouchers'} ·{' '}
            <Money valueMinor={totals.outstandingMinor} /> outstanding
          </>
        }
      />

      {error !== undefined ? (
        <div
          role="alert"
          className="rounded-md border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-danger"
        >
          {error}
        </div>
      ) : null}

      <ListPageToolbar
        searchQuery={searchQuery}
        onSearchQueryChange={onSearchQueryChange}
        searchPlaceholder="Name, father, voucher no, GR number"
        searchAriaLabel="Search vouchers"
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
              options={VOUCHER_STATUSES.map((status) => ({
                value: status,
                label: VOUCHER_STATUS_LABELS[status],
              }))}
              onValueChange={(next) => {
                pushFilters({ status: next });
              }}
            />
            <SimpleSelect
              className="w-full sm:w-40"
              ariaLabel="Filter by session"
              value={filters.sessionId}
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
            <div className="w-full min-w-[11rem] sm:w-44">
              <DatePicker
                value={
                  filters.from !== '' &&
                  (filters.to === '' || filters.to === filters.from)
                    ? filters.from
                    : ''
                }
                aria-label="Issued date"
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
        title="All vouchers"
        caption="Fee vouchers"
        rows={rows}
        columns={columns}
        rowKey={(row) => row.id}
        minWidthClass="min-w-[52rem]"
        error={undefined}
        isFiltered={isFiltered}
        onClearFilters={clearFilters}
        empty={{
          title: 'No vouchers here',
          description:
            'Nothing matches these filters. Generate a month of fees, or clear the filters to see everything.',
        }}
      />

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
      />

      {total === 0 ? null : (
        <Pagination
          total={total}
          limit={limit}
          offset={offset}
          label="vouchers"
          onChange={(next) => {
            const query = new URLSearchParams(params.toString());
            query.delete('grNo');
            if (next === 0) {
              query.delete('offset');
            } else {
              query.set('offset', String(next));
            }
            router.push(`${pathname}?${query.toString()}`);
          }}
        />
      )}

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
            <DialogTitle>Fee challan</DialogTitle>
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
                className={`mx-auto [zoom:0.6] ${
                  voucherSettings.copyCount === 4 ? 'w-[194mm]' : 'w-[281mm]'
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
    <div className="flex justify-end" data-stop-row-click>
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
            <MoreIcon className={ICON_SIZE.inline} aria-hidden />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="end"
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
    toast.success('Payment recorded', `Receipt for ${voucher.studentName}.`);
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
