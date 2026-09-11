'use client';


import {
  ROUTES,
  VOUCHER_STATUSES,
  VOUCHER_STATUS_LABELS,
  type AcademicSession,
  type ClassLevel,
  type VoucherDetail,
  type VoucherStatus,
  type VoucherSummary,
  type VoucherTotals,
} from '@ilm/contracts';
import { Button, DataTable, DateDisplay, DatePicker, Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, Field, Input, Money, Pagination, SimpleSelect, StatusBadge, type Column, useToast } from '@ilm/ui';
import { DeleteIcon, ICON_SIZE, PrintIcon, SearchIcon, SpinnerIcon } from '@ilm/ui/icons';
import { systemClock } from '@ilm/utils';
import { useRouter, useSearchParams } from 'next/navigation';
import { useState, type FormEvent } from 'react';

import { VoucherChallan } from './voucher-challan';

import { rupeesToMinor } from '@/lib/money';
import { mutate } from '@/lib/mutate';
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
 * ## The trash icon cancels
 *
 * Financial records are append-only (CLAUDE.md R4). Cancelling keeps the row,
 * records who did it and why, and releases the month so it can be billed again.
 * A voucher with money against it cannot be cancelled at all — the server
 * refuses, and the control is not offered.
 */

export interface VouchersViewProps {
  rows: VoucherSummary[];
  sessions: AcademicSession[];
  classes: ClassLevel[];
  totals: VoucherTotals;
  total: number;
  limit: number;
  offset: number;
  filters: {
    q: string;
    grNo: string;
    sessionId: string;
    classLevelId: string;
    status: string;
    from: string;
    to: string;
  };
  school: { name: string; address?: string | undefined; phone?: string | undefined };
  error?: string | undefined;
  canCollect: boolean;
  canCancel: boolean;
}

export function VouchersView({
  rows,
  sessions,
  classes,
  totals,
  total,
  limit,
  offset,
  filters,
  school,
  error,
  canCollect,
  canCancel,
}: VouchersViewProps) {
  const router = useRouter();
  const tenantHref = useTenantHref();
  const params = useSearchParams();
  const toast = useToast();

  const [draft, setDraft] = useState(filters);
  const [busyId, setBusyId] = useState<string | undefined>(undefined);
  const [cancelling, setCancelling] = useState<VoucherSummary | undefined>(undefined);
  const [cancelReason, setCancelReason] = useState('');
  const [paying, setPaying] = useState<VoucherSummary | undefined>(undefined);
  const [previewing, setPreviewing] = useState<VoucherDetail | undefined>(undefined);
  const [isLoadingPreview, setIsLoadingPreview] = useState(false);

  function apply(next: Partial<typeof filters>, resetPage = true) {
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
    router.push(tenantHref(`/fees/vouchers?${query.toString()}`));
  }

  function reset() {
    const cleared = {
      q: '',
      grNo: '',
      sessionId: '',
      classLevelId: '',
      status: '',
      from: '',
      to: '',
    };
    setDraft(cleared);
    router.push(tenantHref('/fees/vouchers'));
  }

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
    toast.success(`${cancelling.voucherNo} cancelled`, 'Those months can be billed again.');
    setCancelling(undefined);
    setCancelReason('');
    router.refresh();
  }

  const columns: Column<VoucherSummary>[] = [
    {
      key: 'grNo',
      header: 'GR No',
      render: (row) => <span className="font-mono text-sm">{row.grNo ?? '—'}</span>,
    },
    {
      key: 'student',
      header: 'Student',
      render: (row) => (
        <span className="min-w-0">
          <span className="block truncate font-medium text-foreground">{row.studentName}</span>
          <span className="block truncate text-xs text-muted-foreground">
            {row.className ?? '—'}
            {row.sectionName === null ? '' : ` ${row.sectionName}`}
          </span>
        </span>
      ),
    },
    {
      key: 'issueDate',
      header: 'Issued',
      render: (row) => <DateDisplay value={row.issueDate} />,
    },
    {
      key: 'dueDate',
      header: 'Due',
      render: (row) => <DateDisplay value={row.dueDate} />,
    },
    {
      key: 'months',
      header: 'Bill months',
      render: (row) => (
        <span className="text-sm text-muted-foreground">
          {row.billMonths.length === 0
            ? '—'
            : row.billMonths.map((month) => formatMonth(month)).join(', ')}
        </span>
      ),
    },
    {
      key: 'amount',
      header: 'Amount',
      align: 'end',
      render: (row) => (
        <span className="font-mono text-sm tabular-nums">
          <Money valueMinor={row.totalPayableMinor} />
          {row.arrearsMinor > 0 ? (
            <span className="block text-xs font-normal text-warning">
              incl. <Money valueMinor={row.arrearsMinor} withSymbol={false} /> arrears
            </span>
          ) : null}
        </span>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (row) => (
        <StatusBadge tone={toneFor(row.status)}>{VOUCHER_STATUS_LABELS[row.status]}</StatusBadge>
      ),
    },
    {
      key: 'actions',
      header: '',
      align: 'end',
      render: (row) => (
        <div className="flex items-center justify-end gap-1">
          {canCollect && row.balanceMinor > 0 && row.status !== 'CANCELLED' ? (
            <Button
              tone="ghost"
              size="sm"
              disabled={busyId !== undefined}
              onClick={() => {
                setPaying(row);
              }}
            >
              Pay
            </Button>
          ) : null}
          <Button
            tone="ghost"
            size="sm"
            aria-label={`Print ${row.voucherNo}`}
            disabled={busyId !== undefined}
            onClick={() => {
              void openChallan(row);
            }}
          >
            {busyId === row.id && isLoadingPreview ? (
              <SpinnerIcon className={`${ICON_SIZE.inline} animate-spin`} aria-hidden />
            ) : (
              <PrintIcon className={ICON_SIZE.inline} aria-hidden />
            )}
          </Button>
          {/* Absent once money has arrived — the server refuses, and offering a
              control that always fails is worse than not offering it. */}
          {canCancel && row.paidMinor === 0 && row.status !== 'CANCELLED' ? (
            <Button
              tone="ghost"
              size="sm"
              aria-label={`Cancel ${row.voucherNo}`}
              disabled={busyId !== undefined}
              onClick={() => {
                setCancelling(row);
                setCancelReason('');
              }}
            >
              <DeleteIcon className={`${ICON_SIZE.inline} text-danger`} aria-hidden />
            </Button>
          ) : null}
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-foreground">Fee vouchers</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {totals.count} {totals.count === 1 ? 'voucher' : 'vouchers'} ·{' '}
            <Money valueMinor={totals.outstandingMinor} /> outstanding
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
              placeholder="Name, father, voucher no"
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

        <Field label="GR number">
          <Input
            value={draft.grNo}
            placeholder="1081"
            onChange={(event) => {
              setDraft({ ...draft, grNo: event.target.value });
            }}
          />
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

        <Field label="Status">
          <SimpleSelect
            value={draft.status}
            emptyOption={{ value: '', label: 'Any status' }}
            options={VOUCHER_STATUSES.map((status) => ({
              value: status,
              label: VOUCHER_STATUS_LABELS[status],
            }))}
            onValueChange={(next) => {
              setDraft({ ...draft, status: next });
              apply({ status: next });
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

        <Field label="Issued from">
          <DatePicker
            value={draft.from}
            onChange={(nextValue) => {
              setDraft({ ...draft, from: nextValue });
            }}
          />
        </Field>

        <Field label="Issued to">
          <DatePicker
            value={draft.to}
            onChange={(nextValue) => {
              setDraft({ ...draft, to: nextValue });
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

      <DataTable
        rows={rows}
        columns={columns}
        rowKey={(row) => row.id}
        error={error}
        caption="Fee vouchers"
        empty={{
          title: 'No vouchers here',
          description:
            'Nothing matches these filters. Generate a month of fees, or clear the filters to see everything.',
        }}
      />

      {total === 0 ? null : (
        <Pagination
          total={total}
          limit={limit}
          offset={offset}
          label="vouchers"
          onChange={(next) => {
            apply({}, false);
            const query = new URLSearchParams(params.toString());
            if (next === 0) {
              query.delete('offset');
            } else {
              query.set('offset', String(next));
            }
            router.push(tenantHref(`/fees/vouchers?${query.toString()}`));
          }}
        />
      )}

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
            <DialogTitle>Cancel {cancelling?.voucherNo ?? ''}?</DialogTitle>
            <DialogDescription>
              The voucher stays on record with the reason, and those months become available to bill
              again.
            </DialogDescription>
          </DialogHeader>
          <DialogBody>
            <Field
              label="Reason"
              required
              hint="Kept with the voucher, so the change can be explained later."
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
              Cancel voucher
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
              Three copies on one page — school, bank and parent, which is what a counter accepts.
            </DialogDescription>
          </DialogHeader>
          <DialogBody>
            {previewing === undefined ? null : (
              <VoucherChallan voucher={previewing} school={school} />
            )}
          </DialogBody>
          <DialogFooter>
            <Button
              tone="ghost"
              onClick={() => {
                setPreviewing(undefined);
              }}
            >
              Close
            </Button>
            <Button
              onClick={() => {
                window.print();
              }}
            >
              <PrintIcon className={ICON_SIZE.inline} aria-hidden />
              Print
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
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
                <DatePicker
                  value={paidOn}
                  onChange={setPaidOn}
                />
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
