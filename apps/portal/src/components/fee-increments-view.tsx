'use client';

import {
  ROUTES,
  type AcademicSession,
  type ClassLevel,
  type FeeHistory,
  type FeeIncrementList,
  type FeeIncrementResult,
  type FeeIncrementRow,
  type FeeIncrementSkipReason,
} from '@ilm/contracts';
import {
  Button,
  CardTable,
  DateDisplay,
  DatePicker,
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Field,
  Input,
  Money,
  SimpleSelect,
  StatusBadge,
  TwoLineCell,
  useToast,
  type CardTableColumn,
} from '@ilm/ui';
import {
  AccountIcon,
  CalendarIcon,
  ClassIcon,
  DeleteIcon,
  FeesIcon,
  SessionIcon,
  SuccessIcon,
  HistoryIcon,
  ICON_SIZE,
  MoreIcon,
  PhoneIcon,
  SpinnerIcon,
  StudentsIcon,
  TrendDownIcon,
  TrendUpIcon,
} from '@ilm/ui/icons';
import { systemClock } from '@ilm/utils';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useMemo, useState, type ReactElement } from 'react';

import {
  FEE_LIST_TABLE_CELL,
  afterMenuAction,
  feeListTableHeader,
  useDebouncedSearchFilter,
} from '@/components/fees/fee-list-shared';
import { ListDataTable } from '@/components/list-data-table';
import { ListTablePaginationFooter } from '@/components/list-table-pagination-footer';
import { ListTableScreen } from '@/components/list-table-screen';
import { ListPageToolbar } from '@/components/list-page-toolbar';
import { TableSelectionBar } from '@/components/table-selection-bar';
import { WorkspacePageHeader } from '@/components/workspace-page-header';
import { listTableSelectColumn, useRowSelection } from '@/lib/use-row-selection';
import { pageIntro } from '@/lib/page-copy';
import { rupeesToMinor } from '@/lib/money';
import { mutate } from '@/lib/mutate';
import { nextSortParams } from '@/lib/list-page';
import { useTenantHref } from '@/lib/use-tenant-href';

/**
 * Fees › Fee increment.
 *
 * ## The amount is a change, not a target
 *
 * The box says "increase by", never "set to". A class of thirty children is
 * normally on thirty different agreed fees — siblings, staff children,
 * hardship cases — and one target figure would flatten every one of those
 * arrangements into the same number. Nobody would notice until the vouchers
 * went out, and by then the concessions are gone.
 *
 * So the table shows each child's own amount, the modal restates those amounts
 * beside the new ones, and nothing is written until that list has been read.
 *
 * ## Why a date and not "now"
 *
 * A fee change starts on a day. Applying it from the 1st of next month leaves
 * this month's vouchers exactly as issued, which is the difference between a
 * rise and a retrospective correction to money parents have already paid.
 */

const SKIP_REASONS: Record<FeeIncrementSkipReason, string> = {
  NO_AGREED_AMOUNT: 'no agreed amount for this fee',
  WOULD_GO_NEGATIVE: 'the decrease would take the fee below zero',
  BEFORE_ADMISSION: 'the date is before they were admitted',
  ALREADY_APPLIED: 'already has a change dated that day',
  NOT_FOUND: 'no longer in this school',
};

export interface FeeIncrementsViewProps {
  readonly page: FeeIncrementList;
  readonly sessions: readonly AcademicSession[];
  readonly classes: readonly ClassLevel[];
  readonly total: number;
  readonly limit: number;
  readonly offset: number;
  readonly sort: 'name' | 'grNo' | 'className' | 'currentFee';
  readonly order: 'asc' | 'desc';
  readonly filters: {
    q: string;
    classLevelId: string;
    sessionId: string;
    status: string;
    gender: string;
  };
  readonly error?: string | undefined;
  readonly canApply: boolean;
}

export function FeeIncrementsView({
  page,
  sessions,
  classes,
  total,
  limit,
  offset,
  sort,
  order,
  filters,
  error,
  canApply,
}: FeeIncrementsViewProps) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const tenantHref = useTenantHref();
  const toast = useToast();

  const { searchQuery, onSearchQueryChange } = useDebouncedSearchFilter(filters.q, (value) => {
    pushFilters({ q: value });
  });

  const rows = page.rows;

  const {
    selected,
    setSelected,
    clearSelection,
    allOnPageSelected,
    someOnPageSelected,
    toggleAllOnPage,
    toggleRowSelected,
  } = useRowSelection(rows, (row) => row.studentId);

  const [direction, setDirection] = useState<'INCREASE' | 'DECREASE' | undefined>(undefined);
  const [amount, setAmount] = useState('');
  const [startDate, setStartDate] = useState(firstOfNextMonth());
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | undefined>(undefined);

  const [historyFor, setHistoryFor] = useState<FeeIncrementRow | undefined>(undefined);
  const [history, setHistory] = useState<FeeHistory | undefined>(undefined);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const [removingId, setRemovingId] = useState<string | undefined>(undefined);

  const chosen = rows.filter((row) => selected.has(row.studentId));
  const amountMinor = rupeesToMinor(amount);

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
    if (!Object.hasOwn(next, 'limit')) {
      query.set('limit', String(limit));
    }
    if (!Object.hasOwn(next, 'offset')) {
      query.delete('offset');
      clearSelection();
    }
    router.push(`${pathname}?${query.toString()}`);
  }

  function clearFilters(): void {
    router.push(tenantHref('/fees/increments'));
  }

  async function openHistory(row: FeeIncrementRow): Promise<void> {
    setHistoryFor(row);
    setHistory(undefined);
    setIsLoadingHistory(true);
    const response = await fetch(ROUTES.feeIncrements.history(row.studentId), {
      credentials: 'include',
    });
    setIsLoadingHistory(false);
    if (response.ok) {
      const body = (await response.json()) as { data: FeeHistory };
      setHistory(body.data);
    } else {
      toast.error('Could not load that fee history.');
      setHistoryFor(undefined);
    }
  }

  async function removeHistoryEntry(entryId: string): Promise<void> {
    setRemovingId(entryId);
    const result = await mutate<{ removed: true }>(
      ROUTES.feeIncrements.historyEntry(entryId),
      'DELETE',
    );
    setRemovingId(undefined);

    if (!result.ok) {
      toast.error(result.message);
      return;
    }
    toast.success('That fee change was removed.');
    if (historyFor !== undefined) {
      void openHistory(historyFor);
    }
    router.refresh();
  }

  async function submit(): Promise<void> {
    if (direction === undefined || amountMinor === undefined) {
      return;
    }
    setIsSubmitting(true);
    setFormError(undefined);

    const result = await mutate<FeeIncrementResult>(ROUTES.feeIncrements.apply, 'POST', {
      studentIds: chosen.map((row) => row.studentId),
      feeHeadId: page.feeHead.id,
      direction,
      amountMinor,
      effectiveFrom: startDate,
      // Keyed on what the batch *is*, so a double-clicked Submit or a retried
      // request is the same change rather than a second one.
      idempotencyKey: `inc-${startDate}-${direction}-${String(amountMinor)}-${fingerprint(chosen)}`,
    });

    setIsSubmitting(false);

    if (!result.ok) {
      setFormError(result.message);
      return;
    }

    const { applied, skipped, skips, replayed } = result.data;

    if (applied === 0) {
      setFormError(
        skips.length === 0
          ? 'Nothing was changed.'
          : `Nothing was changed. ${describeSkips(skips)}`,
      );
      return;
    }

    close();
    setSelected(new Set());
    const verb = direction === 'INCREASE' ? 'Increased' : 'Decreased';
    const appliedLine = `${verb} the fee for ${String(applied)} ${applied === 1 ? 'student' : 'students'}.`;
    toast.success(
      replayed
        ? 'That change had already been applied.'
        : skipped === 0
          ? appliedLine
          : `${appliedLine} ${describeSkips(skips)}`,
    );
    router.refresh();
  }

  function close(): void {
    setDirection(undefined);
    setAmount('');
    setFormError(undefined);
  }

  const feeHeadLabel = page.feeHead.name;

  const columns = useMemo((): CardTableColumn<FeeIncrementRow>[] => {
    return [
      ...(canApply
        ? [
            listTableSelectColumn<FeeIncrementRow>({
              selected,
              allOnPageSelected,
              someOnPageSelected,
              toggleAllOnPage,
              toggleRowSelected,
              getRowId: (row) => row.studentId,
              rowAriaLabel: (row) => row.name,
              selectAllAriaLabel: 'Select every student on this page',
            }),
          ]
        : []),
      {
        key: 'grNo',
        label: 'GR No',
        ...FEE_LIST_TABLE_CELL,
        colStyle: { width: '5.75rem' },
        sortable: true,
        headerCell: feeListTableHeader('GR No', StudentsIcon),
        render: (row) => (
          <span className="font-mono text-sm leading-none tabular-nums">{row.grNo}</span>
        ),
      },
      {
        key: 'name',
        label: 'Student',
        ...FEE_LIST_TABLE_CELL,
        width: 'w-[16%]',
        sortable: true,
        headerCell: feeListTableHeader('Student', StudentsIcon),
        render: (row) => (
          <TwoLineCell
            primary={row.name}
            secondary={
              row.sectionName === null && row.className === null
                ? '—'
                : [row.className, row.sectionName].filter((part) => part !== null).join(' · ')
            }
          />
        ),
      },
      {
        key: 'fatherName',
        label: 'Father',
        ...FEE_LIST_TABLE_CELL,
        width: 'w-[12%]',
        hideOnMobile: true,
        headerCell: feeListTableHeader('Father', AccountIcon),
        render: (row) => <span className="text-sm">{row.fatherName ?? '—'}</span>,
      },
      {
        key: 'contact',
        label: 'Contact',
        ...FEE_LIST_TABLE_CELL,
        width: 'w-[11%]',
        hideOnMobile: true,
        headerCell: feeListTableHeader('Contact', PhoneIcon),
        render: (row) => <span className="font-mono text-sm">{row.contact ?? '—'}</span>,
      },
      {
        key: 'status',
        label: 'Status',
        ...FEE_LIST_TABLE_CELL,
        width: 'w-[9%]',
        hideOnMobile: true,
        headerCell: feeListTableHeader('Status'),
        render: (row) => (
          <StatusBadge tone={row.status === 'ACTIVE' ? 'success' : 'neutral'}>
            {row.status === 'ACTIVE' ? 'Active' : titleCase(row.status)}
          </StatusBadge>
        ),
      },
      {
        key: 'currentFee',
        label: feeHeadLabel,
        ...FEE_LIST_TABLE_CELL,
        width: 'w-[12%]',
        sortable: true,
        headerCell: feeListTableHeader(feeHeadLabel, FeesIcon),
        render: (row) => {
          if (row.currentPayableMinor === null) {
            return <span className="text-xs text-muted-foreground">none agreed</span>;
          }
          const hasDiscount = row.currentPayableMinor !== row.currentFeeMinor;
          return (
            <div className="font-mono text-sm tabular-nums">
              <Money valueMinor={row.currentPayableMinor} />
              {hasDiscount && row.currentFeeMinor !== null ? (
                <span className="block text-xs font-normal text-muted-foreground">
                  of <Money valueMinor={row.currentFeeMinor} withSymbol={false} />
                  {row.discountReason === null ? '' : ` · ${row.discountReason}`}
                </span>
              ) : null}
            </div>
          );
        },
      },
      {
        key: 'pending',
        label: 'Scheduled',
        ...FEE_LIST_TABLE_CELL,
        width: 'w-[11%]',
        hideOnMobile: true,
        headerCell: feeListTableHeader('Scheduled', CalendarIcon),
        render: (row) =>
          row.pendingFrom === null || row.pendingPayableMinor === null ? (
            <span className="text-sm text-muted-foreground">—</span>
          ) : (
            <div className="font-mono text-sm tabular-nums text-warning">
              <Money valueMinor={row.pendingPayableMinor} />
              <span className="block text-xs font-normal">
                from <DateDisplay value={row.pendingFrom} />
              </span>
            </div>
          ),
      },
      {
        key: 'admittedOn',
        label: 'Admitted',
        ...FEE_LIST_TABLE_CELL,
        width: 'w-[10%]',
        hideOnMobile: true,
        headerCell: feeListTableHeader('Admitted', CalendarIcon),
        render: (row) =>
          row.admittedOn === null ? (
            <span className="text-muted-foreground">—</span>
          ) : (
            <DateDisplay value={row.admittedOn} />
          ),
      },
      {
        key: 'actions',
        label: 'Actions',
        ...FEE_LIST_TABLE_CELL,
        width: 'w-[8%]',
        headerCell: feeListTableHeader('Actions'),
        render: (row) => (
          <IncrementRowActions
            row={row}
            onHistory={() => {
              void openHistory(row);
            }}
          />
        ),
      },
    ];
  }, [allOnPageSelected, canApply, feeHeadLabel, selected, someOnPageSelected]);

  return (
    <div className="w-full space-y-6">
      <WorkspacePageHeader title="Fee increment" description={pageIntro('/fees/increments')} />

      <ListTableScreen
        tableTitle="All students"
        filters={
          <ListPageToolbar
            searchQuery={searchQuery}
            onSearchQueryChange={onSearchQueryChange}
            searchPlaceholder="Name, father, GR number"
            searchAriaLabel="Search students for fee increment"
            filters={
          <>
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
              ariaLabel="Filter by session"
              value={filters.sessionId}
              triggerIcon={SessionIcon}
              emptyOption={{ value: '', label: 'Any session' }}
              placeholder="Any session"
              options={sessions.map((entry) => ({ value: entry.id, label: entry.name }))}
              onValueChange={(next) => {
                pushFilters({ sessionId: next });
              }}
            />
            <SimpleSelect
              className="w-full min-w-32 sm:w-36"
              ariaLabel="Filter by status"
              value={filters.status}
              triggerIcon={SuccessIcon}
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
              className="w-full min-w-32 sm:w-36"
              ariaLabel="Filter by gender"
              value={filters.gender}
              triggerIcon={AccountIcon}
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
              </>
            }
          />
        }
        footer={
          <ListTablePaginationFooter
            total={total}
            limit={limit}
            offset={offset}
            label="students"
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
          title="All students"
          caption="Students and their current fee"
          rows={rows}
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
          empty={{
            title: 'No students yet',
            description:
              'Fee increments work on the students already admitted. Admit a student first, and their agreed fee will appear here.',
          }}
        />
      </ListTableScreen>

      {canApply ? (
        <TableSelectionBar
          count={selected.size}
          noun="student"
          onClear={clearSelection}
          actions={
            <>
              <Button
                size="sm"
                disabled={selected.size === 0}
                onClick={() => {
                  setDirection('INCREASE');
                }}
              >
                <TrendUpIcon className={ICON_SIZE.inline} aria-hidden />
                Increase fee
              </Button>
              <Button
                tone="outline"
                size="sm"
                disabled={selected.size === 0}
                onClick={() => {
                  setDirection('DECREASE');
                }}
              >
                <TrendDownIcon className={ICON_SIZE.inline} aria-hidden />
                Decrease fee
              </Button>
            </>
          }
        />
      ) : null}

      {/* Applying a change to many rows is financial, so docs/16 §11 asks for a
          preview naming the specifics rather than "Are you sure?". Every
          selected child is listed with what they pay now and what they would
          pay — nothing is written until that has been read. */}
      <Dialog
        open={direction !== undefined}
        onOpenChange={(open) => {
          if (!open) {
            close();
          }
        }}
      >
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {direction === 'DECREASE' ? 'Decrease' : 'Increase'} {page.feeHead.name.toLowerCase()}{' '}
              for {chosen.length} {chosen.length === 1 ? 'student' : 'students'}
            </DialogTitle>
            <DialogDescription>
              Every child moves by the same amount from their own fee. Discounts are carried
              forward unchanged.
            </DialogDescription>
          </DialogHeader>

          <DialogBody className="space-y-4">
            {formError === undefined ? null : (
              <p
                role="alert"
                className="rounded-md border border-danger/30 bg-danger/10 p-3 text-sm text-danger"
              >
                {formError}
              </p>
            )}

            <div className="grid gap-3 sm:grid-cols-2">
              <Field
                label={direction === 'DECREASE' ? 'Decrease by' : 'Increase by'}
                required
                hint="Rupees"
              >
                <Input
                  inputMode="decimal"
                  value={amount}
                  placeholder="500"
                  autoFocus
                  onChange={(event) => {
                    setAmount(event.target.value);
                  }}
                />
              </Field>

              <Field label="Starts from" required hint="Vouchers before this are untouched">
                <DatePicker value={startDate} onChange={setStartDate} />
              </Field>
            </div>

            <div className="rounded-xl border border-border">
              <p className="border-b border-border px-3 py-2 text-xs font-medium text-muted-foreground">
                What each student will pay
              </p>
              <ul className="max-h-56 divide-y divide-border overflow-y-auto">
                {chosen.map((row) => {
                  const next = nextAmountFor(row, direction, amountMinor);
                  return (
                    <li
                      key={row.studentId}
                      className="flex items-baseline justify-between gap-3 px-3 py-2 text-sm"
                    >
                      <span className="text-balance">
                        {row.name}
                        <span className="ms-2 font-mono text-xs text-muted-foreground">
                          {row.grNo}
                        </span>
                      </span>
                      <span className="font-mono text-xs tabular-nums whitespace-nowrap">
                        {row.currentPayableMinor === null ? (
                          <span className="text-danger">no agreed amount</span>
                        ) : (
                          <>
                            <Money valueMinor={row.currentPayableMinor} withSymbol={false} />
                            {next === undefined ? null : (
                              <>
                                <span aria-hidden> → </span>
                                <span className="sr-only"> becomes </span>
                                <span
                                  className={
                                    next < row.currentPayableMinor ? 'text-danger' : 'text-success'
                                  }
                                >
                                  <Money valueMinor={next} withSymbol={false} />
                                </span>
                              </>
                            )}
                          </>
                        )}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </div>
          </DialogBody>

          <DialogFooter>
            <Button tone="ghost" onClick={close} disabled={isSubmitting}>
              Cancel
            </Button>
            <Button
              onClick={() => {
                void submit();
              }}
              // Disabled until the amount is a real number, so the server is
              // never asked to decide what a half-typed box meant.
              disabled={isSubmitting || amountMinor === undefined || amountMinor <= 0}
            >
              {isSubmitting ? (
                <SpinnerIcon className={`${ICON_SIZE.inline} animate-spin`} aria-hidden />
              ) : null}
              {/* The button says what it does (docs/16 §8). */}
              {direction === 'DECREASE' ? 'Decrease' : 'Increase'} {chosen.length}{' '}
              {chosen.length === 1 ? 'fee' : 'fees'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={historyFor !== undefined}
        onOpenChange={(open) => {
          if (!open) {
            setHistoryFor(undefined);
            setHistory(undefined);
          }
        }}
      >
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Fee history of {historyFor?.name ?? ''}</DialogTitle>
            <DialogDescription>
              Every amount agreed for this student, and the day it started. Vouchers already issued
              keep the amount they were billed at.
            </DialogDescription>
          </DialogHeader>

          <DialogBody>
            {isLoadingHistory ? (
              <p className="py-6 text-center text-sm text-muted-foreground">Loading…</p>
            ) : history === undefined || history.entries.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">
                No fees agreed for this student yet.
              </p>
            ) : (
              <ul className="divide-y divide-border rounded-xl border border-border">
                {history.entries.map((entry) => (
                  <li key={entry.id} className="flex items-center gap-3 px-3 py-2">
                    <div className="min-w-0 flex-1">
                      <p className="flex flex-wrap items-center gap-2 text-sm">
                        <DateDisplay value={entry.effectiveFrom} />
                        <StatusBadge tone="neutral">{entry.feeHeadType}</StatusBadge>
                        {entry.isScheduled ? (
                          <StatusBadge tone="warning">Scheduled</StatusBadge>
                        ) : entry.isCurrent ? (
                          <StatusBadge tone="success">Current</StatusBadge>
                        ) : null}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {entry.feeHeadName}
                        {entry.discountReason === null ? '' : ` · ${entry.discountReason}`}
                      </p>
                    </div>

                    <span className="font-mono text-sm tabular-nums whitespace-nowrap">
                      <Money valueMinor={entry.payableMinor} />
                      {entry.payableMinor === entry.amountMinor ? null : (
                        <span className="block text-xs font-normal text-muted-foreground">
                          of <Money valueMinor={entry.amountMinor} withSymbol={false} />
                        </span>
                      )}
                    </span>

                    <Button
                      tone="ghost"
                      size="sm"
                      aria-label={`Remove the amount starting ${entry.effectiveFrom}`}
                      disabled={removingId !== undefined}
                      onClick={() => {
                        void removeHistoryEntry(entry.id);
                      }}
                    >
                      {removingId === entry.id ? (
                        <SpinnerIcon className={`${ICON_SIZE.inline} animate-spin`} aria-hidden />
                      ) : (
                        <DeleteIcon className={`${ICON_SIZE.inline} text-danger`} aria-hidden />
                      )}
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </DialogBody>

          <DialogFooter>
            <p className="me-auto text-xs text-muted-foreground">
              Total records: {history?.entries.length ?? 0}
            </p>
            <Button
              tone="ghost"
              onClick={() => {
                setHistoryFor(undefined);
                setHistory(undefined);
              }}
            >
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function IncrementRowActions({
  row,
  onHistory,
}: {
  readonly row: FeeIncrementRow;
  readonly onHistory: () => void;
}): ReactElement {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button tone="ghost" size="sm" aria-label={`Actions for ${row.name}`}>
          <MoreIcon className={ICON_SIZE.inline} aria-hidden />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuLabel>{row.name}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onSelect={() => {
            afterMenuAction(onHistory);
          }}
        >
          <HistoryIcon className={ICON_SIZE.inline} aria-hidden />
          Fee history
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** What a row would become, for the preview list. */
function nextAmountFor(
  row: FeeIncrementRow,
  direction: 'INCREASE' | 'DECREASE' | undefined,
  amountMinor: number | undefined,
): number | undefined {
  if (row.currentPayableMinor === null || amountMinor === undefined || direction === undefined) {
    return undefined;
  }
  const next = row.currentPayableMinor + (direction === 'INCREASE' ? amountMinor : -amountMinor);
  // The server refuses a negative fee; showing one here would promise something
  // that is about to be declined.
  return next < 0 ? undefined : next;
}

/**
 * A stable fingerprint of the chosen students.
 *
 * The idempotency key has to be the same for a retry of *this* batch and
 * different for the next one. Sorted, so the same students picked in a
 * different order are recognised as the same change.
 */
function fingerprint(rows: readonly FeeIncrementRow[]): string {
  const ids = rows.map((row) => row.studentId).sort();
  let hash = 0;
  for (const character of ids.join(',')) {
    hash = (hash * 31 + character.charCodeAt(0)) | 0;
  }
  return `${String(rows.length)}-${(hash >>> 0).toString(36)}`;
}

/** Plain language for the students a batch left alone (docs/16 §7). */
function describeSkips(skips: FeeIncrementResult['skips']): string {
  const byReason = new Map<FeeIncrementSkipReason, number>();
  for (const skip of skips) {
    byReason.set(skip.reason, (byReason.get(skip.reason) ?? 0) + 1);
  }
  return [...byReason.entries()]
    .map(([reason, count]) => `${String(count)} skipped — ${SKIP_REASONS[reason]}`)
    .join('. ');
}

/**
 * The first of next month.
 *
 * Almost always what a school means by "from when", and it keeps the current
 * month's issued vouchers out of the change by default.
 */
function firstOfNextMonth(): string {
  const now = systemClock.now();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;
  return month === 12
    ? `${String(year + 1)}-01-01`
    : `${String(year)}-${String(month + 1).padStart(2, '0')}-01`;
}

function titleCase(value: string): string {
  return value.charAt(0) + value.slice(1).toLowerCase();
}
