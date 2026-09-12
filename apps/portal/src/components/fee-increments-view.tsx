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
  DataTable,
  DateDisplay,
  DatePicker,
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
  useToast,
  type Column,
} from '@ilm/ui';
import {
  DeleteIcon,
  HistoryIcon,
  ICON_SIZE,
  SearchIcon,
  SpinnerIcon,
  TrendDownIcon,
  TrendUpIcon,
} from '@ilm/ui/icons';
import { systemClock } from '@ilm/utils';
import { useRouter, useSearchParams } from 'next/navigation';
import { useState, type FormEvent } from 'react';

import { rupeesToMinor } from '@/lib/money';
import { mutate } from '@/lib/mutate';
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
  readonly filters: {
    q: string;
    classLevelId: string;
    sessionId: string;
    status: string;
    gender: string;
    grFrom: string;
    grTo: string;
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
  filters,
  error,
  canApply,
}: FeeIncrementsViewProps) {
  const router = useRouter();
  const params = useSearchParams();
  const tenantHref = useTenantHref();
  const toast = useToast();

  const [draft, setDraft] = useState(filters);
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const [direction, setDirection] = useState<'INCREASE' | 'DECREASE' | undefined>(undefined);
  const [amount, setAmount] = useState('');
  const [startDate, setStartDate] = useState(firstOfNextMonth());
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | undefined>(undefined);

  const [historyFor, setHistoryFor] = useState<FeeIncrementRow | undefined>(undefined);
  const [history, setHistory] = useState<FeeHistory | undefined>(undefined);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const [removingId, setRemovingId] = useState<string | undefined>(undefined);

  const rows = page.rows;
  const chosen = rows.filter((row) => selected.has(row.studentId));
  const amountMinor = rupeesToMinor(amount);

  function apply(next: Partial<typeof filters>, resetPage = true): void {
    const merged = { ...draft, ...next };
    const query = new URLSearchParams();
    for (const [key, value] of Object.entries(merged)) {
      if (value !== '') {
        query.set(key, value);
      }
    }
    query.set('limit', String(limit));
    if (!resetPage) {
      query.set('offset', String(offset));
    }
    router.push(tenantHref(`/fees/increments?${query.toString()}`));
  }

  function reset(): void {
    const cleared = {
      q: '',
      classLevelId: '',
      sessionId: '',
      status: '',
      gender: '',
      grFrom: '',
      grTo: '',
    };
    setDraft(cleared);
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
    toast.success(
      replayed
        ? 'That change had already been applied.'
        : `${direction === 'INCREASE' ? 'Increased' : 'Decreased'} the fee for ${String(applied)} ${applied === 1 ? 'student' : 'students'}.`,
      // The students a batch left alone are named in the toast, not swallowed:
      // "raised 38 fees" when 40 were picked is the kind of silence that gets
      // found at the counter.
      skipped === 0 ? undefined : describeSkips(skips),
    );
    router.refresh();
  }

  function close(): void {
    setDirection(undefined);
    setAmount('');
    setFormError(undefined);
  }

  const columns: Column<FeeIncrementRow>[] = [
    {
      key: 'grNo',
      header: 'G.R No',
      render: (row) => <span className="font-mono text-xs select-all">{row.grNo}</span>,
    },
    {
      key: 'name',
      header: 'Student',
      render: (row) => (
        <div>
          <span className="text-balance">{row.name}</span>
          {row.sectionName === null && row.className === null ? null : (
            <span className="block text-xs text-muted-foreground">
              {[row.className, row.sectionName].filter((part) => part !== null).join(' · ')}
            </span>
          )}
        </div>
      ),
    },
    {
      key: 'fatherName',
      header: 'Father',
      hideOnMobile: true,
      render: (row) => <span className="text-balance">{row.fatherName ?? '—'}</span>,
    },
    {
      key: 'contact',
      header: 'Contact',
      hideOnMobile: true,
      render: (row) => (
        <span className="font-mono text-xs">{row.contact ?? '—'}</span>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      hideOnMobile: true,
      render: (row) => (
        <StatusBadge tone={row.status === 'ACTIVE' ? 'success' : 'neutral'}>
          {row.status === 'ACTIVE' ? 'Active' : titleCase(row.status)}
        </StatusBadge>
      ),
    },
    {
      key: 'currentFee',
      header: page.feeHead.name,
      align: 'end',
      render: (row) => {
        if (row.currentPayableMinor === null) {
          return (
            <span className="text-xs text-muted-foreground">
              none agreed
            </span>
          );
        }
        const hasDiscount = row.currentPayableMinor !== row.currentFeeMinor;
        return (
          <div className="font-mono text-sm tabular-nums">
            <Money valueMinor={row.currentPayableMinor} />
            {/* The gross is shown beside the discounted figure rather than
                instead of it: a parent holding a 4,500 voucher and a screen
                reading 6,000 is how a school loses an argument it should win. */}
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
      header: 'Scheduled',
      align: 'end',
      hideOnMobile: true,
      render: (row) =>
        row.pendingFrom === null || row.pendingPayableMinor === null ? (
          <span className="text-xs text-muted-foreground">—</span>
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
      header: 'Admitted',
      hideOnMobile: true,
      render: (row) =>
        row.admittedOn === null ? (
          <span className="text-muted-foreground">—</span>
        ) : (
          <DateDisplay value={row.admittedOn} />
        ),
    },
    {
      key: 'actions',
      header: '',
      align: 'end',
      render: (row) => (
        <Button
          tone="ghost"
          size="sm"
          aria-label={`Fee history of ${row.name}`}
          onClick={() => {
            void openHistory(row);
          }}
        >
          <HistoryIcon className={ICON_SIZE.inline} aria-hidden />
        </Button>
      ),
    },
  ];

  const isFiltered = Object.values(filters).some((value) => value !== '');

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-foreground">Fee increment</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Raise or lower {page.feeHead.name.toLowerCase()} for one student or a whole class. Each
            child keeps their own agreed amount.
          </p>
        </div>
      </header>

      <form
        className="grid gap-3 rounded-xl border border-border bg-card p-4 sm:grid-cols-2 lg:grid-cols-4"
        onSubmit={(event: FormEvent) => {
          event.preventDefault();
          apply({});
        }}
      >
        <Field label="Search">
          <div className="relative">
            <Input
              value={draft.q}
              placeholder="Name, father, GR number"
              onChange={(event) => {
                setDraft({ ...draft, q: event.target.value });
              }}
            />
            <SearchIcon
              className={`${ICON_SIZE.inline} pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-muted-foreground`}
              aria-hidden
            />
          </div>
        </Field>

        <Field label="Class">
          <SimpleSelect
            value={draft.classLevelId}
            emptyOption={{ value: '', label: 'Any class' }}
            options={classes.map((entry) => ({ value: entry.id, label: entry.name }))}
            onValueChange={(next) => {
              setDraft({ ...draft, classLevelId: next });
              apply({ classLevelId: next });
            }}
          />
        </Field>

        <Field label="Session">
          <SimpleSelect
            value={draft.sessionId}
            emptyOption={{ value: '', label: 'Any session' }}
            options={sessions.map((entry) => ({ value: entry.id, label: entry.name }))}
            onValueChange={(next) => {
              setDraft({ ...draft, sessionId: next });
              apply({ sessionId: next });
            }}
          />
        </Field>

        <Field label="Status">
          <SimpleSelect
            value={draft.status}
            emptyOption={{ value: '', label: 'Any status' }}
            options={[
              { value: 'ACTIVE', label: 'Active' },
              { value: 'INACTIVE', label: 'Inactive' },
              { value: 'LEFT', label: 'Left' },
            ]}
            onValueChange={(next) => {
              setDraft({ ...draft, status: next });
              apply({ status: next });
            }}
          />
        </Field>

        <Field label="Gender">
          <SimpleSelect
            value={draft.gender}
            emptyOption={{ value: '', label: 'Any' }}
            options={[
              { value: 'MALE', label: 'Male' },
              { value: 'FEMALE', label: 'Female' },
            ]}
            onValueChange={(next) => {
              setDraft({ ...draft, gender: next });
              apply({ gender: next });
            }}
          />
        </Field>

        {/* A school picks "GR 1 to 200" far more often than it ticks two
            hundred boxes. */}
        <Field label="GR number from" hint="Inclusive range">
          <Input
            value={draft.grFrom}
            placeholder="0001"
            onChange={(event) => {
              setDraft({ ...draft, grFrom: event.target.value });
            }}
          />
        </Field>

        <Field label="GR number to">
          <Input
            value={draft.grTo}
            placeholder="0200"
            onChange={(event) => {
              setDraft({ ...draft, grTo: event.target.value });
            }}
          />
        </Field>

        <div className="flex items-end gap-2">
          <Button type="submit" tone="outline" className="flex-1">
            Apply
          </Button>
          <Button type="button" tone="ghost" onClick={reset}>
            Reset
          </Button>
        </div>
      </form>

      {/* The bulk bar appears only when something is selected, so the buttons
          are never offered with nothing to act on. */}
      {canApply && selected.size > 0 ? (
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-primary/30 bg-primary/5 p-3">
          <p className="text-sm font-medium">
            {selected.size} {selected.size === 1 ? 'student' : 'students'} selected
          </p>
          <div className="ms-auto flex flex-wrap gap-2">
            <Button
              tone="ghost"
              size="sm"
              onClick={() => {
                setSelected(new Set());
              }}
            >
              Clear selection
            </Button>
            <Button
              size="sm"
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
              onClick={() => {
                setDirection('DECREASE');
              }}
            >
              <TrendDownIcon className={ICON_SIZE.inline} aria-hidden />
              Decrease fee
            </Button>
          </div>
        </div>
      ) : null}

      <DataTable
        rows={rows}
        columns={columns}
        rowKey={(row) => row.studentId}
        error={error}
        caption="Students and their current fee"
        isFiltered={isFiltered}
        onClearFilters={reset}
        {...(canApply
          ? { selection: { selected, onChange: setSelected, noun: 'student' } }
          : {})}
        empty={{
          title: 'No students yet',
          description:
            'Fee increments work on the students already admitted. Admit a student first, and their agreed fee will appear here.',
        }}
      />

      {total === 0 ? null : (
        <Pagination
          total={total}
          limit={limit}
          offset={offset}
          label="students"
          onChange={(next) => {
            const query = new URLSearchParams(params.toString());
            if (next === 0) {
              query.delete('offset');
            } else {
              query.set('offset', String(next));
            }
            router.push(tenantHref(`/fees/increments?${query.toString()}`));
          }}
        />
      )}

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
