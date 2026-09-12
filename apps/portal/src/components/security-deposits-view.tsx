'use client';

import {
  ROUTES,
  type ClassLevel,
  type SecurityDepositList,
  type SecurityDepositRow,
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
  Textarea,
  useToast,
  type Column,
} from '@ilm/ui';
import {
  DepositIcon,
  ICON_SIZE,
  RefundIcon,
  SearchIcon,
  SpinnerIcon,
  ViewIcon,
} from '@ilm/ui/icons';
import { systemClock } from '@ilm/utils';
import { useRouter, useSearchParams } from 'next/navigation';
import { useState, type FormEvent } from 'react';

import { rupeesToMinor } from '@/lib/money';
import { mutate } from '@/lib/mutate';
import { useTenantHref } from '@/lib/use-tenant-href';

/**
 * Fees › Security deposits.
 *
 * ## This money is not the school's
 *
 * A deposit is a family's money that the school is holding and owes back, less
 * whatever the child breaks. It is deliberately kept apart from fee income:
 * counted together, a year's collection is overstated by the whole float, which
 * is the kind of error an accountant finds once and never forgets.
 *
 * Hence two figures at the top rather than one. **Deposited** is what came in.
 * **Left** is what is still owed back — the number that matters, because it is a
 * liability rather than a total.
 *
 * ## Refunding in pieces
 *
 * A child deposits 5,000 and breaks a window worth 2,000, so 3,000 goes back and
 * 2,000 stays. Each repayment is its own record with its own reason, never an
 * edit to a running balance: "who returned what, when, and why" is the only
 * thing anybody asks afterwards.
 */

export interface SecurityDepositsViewProps {
  readonly page: SecurityDepositList;
  readonly classes: readonly ClassLevel[];
  readonly limit: number;
  readonly offset: number;
  readonly filters: {
    q: string;
    classLevelId: string;
    status: string;
    state: string;
  };
  readonly error?: string | undefined;
  readonly canRefund: boolean;
}

export function SecurityDepositsView({
  page,
  classes,
  limit,
  offset,
  filters,
  error,
  canRefund,
}: SecurityDepositsViewProps) {
  const router = useRouter();
  const params = useSearchParams();
  const tenantHref = useTenantHref();
  const toast = useToast();

  const [draft, setDraft] = useState(filters);
  const [refunding, setRefunding] = useState<SecurityDepositRow | undefined>(undefined);
  const [viewing, setViewing] = useState<SecurityDepositRow | undefined>(undefined);
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const [refundedOn, setRefundedOn] = useState(() =>
    systemClock.now().toISOString().slice(0, 10),
  );
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | undefined>(undefined);

  const amountMinor = rupeesToMinor(amount);
  const available = refunding?.leftMinor ?? 0;

  function apply(next: Partial<typeof filters>): void {
    const merged = { ...draft, ...next };
    const query = new URLSearchParams();
    for (const [key, value] of Object.entries(merged)) {
      if (value !== '') {
        query.set(key, value);
      }
    }
    query.set('limit', String(limit));
    router.push(tenantHref(`/fees/security-deposits?${query.toString()}`));
  }

  function reset(): void {
    const cleared = { q: '', classLevelId: '', status: '', state: '' };
    setDraft(cleared);
    router.push(tenantHref('/fees/security-deposits'));
  }

  function openRefund(row: SecurityDepositRow): void {
    setRefunding(row);
    setAmount('');
    setReason('');
    setFormError(undefined);
  }

  async function submitRefund(): Promise<void> {
    if (refunding === undefined || amountMinor === undefined) {
      return;
    }
    setIsSubmitting(true);
    setFormError(undefined);

    const result = await mutate<{ id: string }>(
      ROUTES.securityDeposits.refund(refunding.id),
      'POST',
      {
        amountMinor,
        reason: reason.trim(),
        refundedOn,
        // Keyed on the deposit, the amount and the day, so a double-clicked
        // Confirm returns the first refund rather than sending money twice.
        idempotencyKey: `refund-${refunding.id}-${refundedOn}-${String(amountMinor)}`,
      },
    );

    setIsSubmitting(false);

    if (!result.ok) {
      setFormError(result.message);
      return;
    }

    const student = refunding.name;
    setRefunding(undefined);
    toast.success(`Refunded ${formatRupees(amountMinor)} to ${student}.`);
    router.refresh();
  }

  const columns: Column<SecurityDepositRow>[] = [
    {
      key: 'grNo',
      header: 'G.R No',
      render: (row) => <span className="font-mono text-xs select-all">{row.grNo}</span>,
    },
    {
      key: 'month',
      header: 'Month',
      render: (row) => (
        <span className="text-xs">
          <DateDisplay value={row.receivedOn} />
          {row.voucherNo === null ? null : (
            <span className="block font-mono text-xs text-muted-foreground">{row.voucherNo}</span>
          )}
        </span>
      ),
    },
    {
      key: 'name',
      header: 'Student',
      render: (row) => (
        <div>
          <span className="text-balance">{row.name}</span>
          {row.className === null ? null : (
            <span className="block text-xs text-muted-foreground">{row.className}</span>
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
      render: (row) => <span className="font-mono text-xs">{row.contact ?? '—'}</span>,
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
      key: 'deposited',
      header: 'Deposited',
      align: 'end',
      render: (row) => (
        <span className="font-mono text-sm tabular-nums">
          <Money valueMinor={row.depositedMinor} />
        </span>
      ),
    },
    {
      key: 'refunded',
      header: 'Refunded',
      align: 'end',
      render: (row) => (
        <span className="font-mono text-sm tabular-nums text-muted-foreground">
          <Money valueMinor={row.refundedMinor} dashOnZero />
        </span>
      ),
    },
    {
      key: 'left',
      header: 'Left',
      align: 'end',
      render: (row) => (
        <span
          className={`font-mono text-sm font-medium tabular-nums ${
            row.leftMinor === 0 ? 'text-muted-foreground' : ''
          }`}
        >
          <Money valueMinor={row.leftMinor} />
        </span>
      ),
    },
    {
      key: 'actions',
      header: '',
      align: 'end',
      render: (row) => (
        <div className="flex items-center justify-end gap-1">
          <Button
            tone="ghost"
            size="sm"
            aria-label={`Refunds from ${row.name}'s deposit`}
            disabled={row.refunds.length === 0}
            onClick={() => {
              setViewing(row);
            }}
          >
            <ViewIcon className={ICON_SIZE.inline} aria-hidden />
          </Button>
          {/* Absent once nothing is left: the server refuses, and a button that
              always fails is worse than no button (docs/16 §7). */}
          {canRefund && row.leftMinor > 0 ? (
            <Button
              tone="outline"
              size="sm"
              onClick={() => {
                openRefund(row);
              }}
            >
              <RefundIcon className={ICON_SIZE.inline} aria-hidden />
              Refund
            </Button>
          ) : null}
        </div>
      ),
    },
  ];

  const isFiltered = Object.values(filters).some((value) => value !== '');

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-foreground">Security deposits</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Money the school is holding for families, and what has been given back.
          </p>
        </div>

        <div className="flex flex-wrap gap-3">
          <div className="rounded-xl border border-border bg-card px-4 py-2">
            <p className="text-xs text-muted-foreground">Total deposited</p>
            <p className="font-mono text-lg font-semibold tabular-nums">
              <Money valueMinor={page.totalDepositedMinor} />
            </p>
          </div>
          {/* The liability, which is the figure that matters — it is what the
              school would owe if every family left tomorrow. */}
          <div className="rounded-xl border border-warning/30 bg-warning/5 px-4 py-2">
            <p className="text-xs text-muted-foreground">Total left to refund</p>
            <p className="font-mono text-lg font-semibold tabular-nums text-warning">
              <Money valueMinor={page.totalLeftMinor} />
            </p>
          </div>
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

        <Field label="Deposit" hint="Still held, or fully returned">
          <SimpleSelect
            value={draft.state}
            emptyOption={{ value: '', label: 'All deposits' }}
            options={[
              { value: 'held', label: 'Still held' },
              { value: 'settled', label: 'Fully refunded' },
            ]}
            onValueChange={(next) => {
              setDraft({ ...draft, state: next });
              apply({ state: next });
            }}
          />
        </Field>

        <div className="flex items-end gap-2 lg:col-start-4">
          <Button type="submit" tone="outline" className="flex-1">
            Apply
          </Button>
          <Button type="button" tone="ghost" onClick={reset}>
            Reset
          </Button>
        </div>
      </form>

      <DataTable
        rows={page.rows}
        columns={columns}
        rowKey={(row) => row.id}
        error={error}
        caption="Security deposits held"
        isFiltered={isFiltered}
        onClearFilters={reset}
        empty={{
          title: 'No deposits recorded',
          description:
            'A security deposit is recorded when it is collected — on a fee voucher, or at the counter. None have been taken yet.',
        }}
      />

      {page.total === 0 ? null : (
        <Pagination
          total={page.total}
          limit={limit}
          offset={offset}
          label="deposits"
          onChange={(next) => {
            const query = new URLSearchParams(params.toString());
            if (next === 0) {
              query.delete('offset');
            } else {
              query.set('offset', String(next));
            }
            router.push(tenantHref(`/fees/security-deposits?${query.toString()}`));
          }}
        />
      )}

      {/* Money leaving the building, so the dialog states the three figures
          rather than asking "are you sure?" (docs/16 §11), and the reason is in
          the same box as the amount — a confirmation whose reason field lives
          elsewhere is a reason nobody fills in. */}
      <Dialog
        open={refunding !== undefined}
        onOpenChange={(open) => {
          if (!open) {
            setRefunding(undefined);
          }
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Refund security deposit</DialogTitle>
            <DialogDescription>
              {refunding?.name ?? ''}
              {refunding?.className === null || refunding === undefined
                ? ''
                : ` · ${refunding.className ?? ''}`}
              {refunding === undefined ? '' : ` · G.R ${refunding.grNo}`}
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

            <dl className="grid grid-cols-3 gap-3 rounded-xl border border-border bg-muted/30 p-3 text-center">
              <div>
                <dt className="text-xs text-muted-foreground">Deposited</dt>
                <dd className="font-mono text-sm tabular-nums">
                  <Money valueMinor={refunding?.depositedMinor ?? 0} />
                </dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Already refunded</dt>
                <dd className="font-mono text-sm tabular-nums">
                  <Money valueMinor={refunding?.refundedMinor ?? 0} dashOnZero />
                </dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Available</dt>
                <dd className="font-mono text-sm font-semibold tabular-nums text-warning">
                  <Money valueMinor={available} />
                </dd>
              </div>
            </dl>

            <Field
              label="Refund amount"
              required
              hint="What is being returned now, not the balance to leave behind"
              error={
                amountMinor !== undefined && amountMinor > available
                  ? `That is more than the ${formatRupees(available)} available.`
                  : undefined
              }
            >
              <Input
                inputMode="decimal"
                value={amount}
                placeholder="3000"
                autoFocus
                onChange={(event) => {
                  setAmount(event.target.value);
                }}
              />
            </Field>

            <Field
              label="Reason"
              required
              hint="Kept with the refund. “Broken window, Class V” is the difference between a refund and an unexplained withdrawal."
            >
              <Textarea
                rows={2}
                value={reason}
                onChange={(event) => {
                  setReason(event.target.value);
                }}
              />
            </Field>

            <Field label="Refunded on" required>
              <DatePicker value={refundedOn} onChange={setRefundedOn} />
            </Field>
          </DialogBody>

          <DialogFooter>
            <Button
              tone="ghost"
              disabled={isSubmitting}
              onClick={() => {
                setRefunding(undefined);
              }}
            >
              Cancel
            </Button>
            <Button
              onClick={() => {
                void submitRefund();
              }}
              disabled={
                isSubmitting ||
                amountMinor === undefined ||
                amountMinor <= 0 ||
                amountMinor > available ||
                reason.trim() === ''
              }
            >
              {isSubmitting ? (
                <SpinnerIcon className={`${ICON_SIZE.inline} animate-spin`} aria-hidden />
              ) : null}
              Refund {amountMinor === undefined ? '' : formatRupees(amountMinor)}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={viewing !== undefined}
        onOpenChange={(open) => {
          if (!open) {
            setViewing(undefined);
          }
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              <DepositIcon className={`${ICON_SIZE.heading} inline`} aria-hidden /> Refunds from this
              deposit
            </DialogTitle>
            <DialogDescription>
              {viewing?.name ?? ''} · deposited <Money valueMinor={viewing?.depositedMinor ?? 0} />{' '}
              on <DateDisplay value={viewing?.receivedOn ?? ''} />
            </DialogDescription>
          </DialogHeader>

          <DialogBody>
            <ul className="divide-y divide-border rounded-xl border border-border">
              {(viewing?.refunds ?? []).map((refund) => (
                <li key={refund.id} className="px-3 py-2">
                  <div className="flex items-baseline justify-between gap-3">
                    <DateDisplay value={refund.refundedOn} />
                    <span className="font-mono text-sm tabular-nums">
                      <Money valueMinor={refund.amountMinor} />
                    </span>
                  </div>
                  <p className="mt-0.5 text-xs text-balance text-muted-foreground">
                    {refund.reason}
                  </p>
                </li>
              ))}
            </ul>
          </DialogBody>

          <DialogFooter>
            <p className="me-auto text-xs text-muted-foreground">
              <Money valueMinor={viewing?.leftMinor ?? 0} /> still held
            </p>
            <Button
              tone="ghost"
              onClick={() => {
                setViewing(undefined);
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

/**
 * Rupees for a sentence, from integer paisa.
 *
 * `<Money>` is the component for a figure in a column; this is for the middle of
 * a message, where a React element cannot go. The arithmetic is integer
 * division, never a float.
 */
function formatRupees(minor: number): string {
  const rupees = Math.trunc(minor / 100);
  const paisa = minor % 100;
  const grouped = rupees.toLocaleString('en-PK');
  return paisa === 0 ? `PKR ${grouped}` : `PKR ${grouped}.${String(paisa).padStart(2, '0')}`;
}

function titleCase(value: string): string {
  return value.charAt(0) + value.slice(1).toLowerCase();
}
