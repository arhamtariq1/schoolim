'use client';

import {
  BULK_PAY_SKIP_REASON_LABELS,
  ROUTES,
  type BulkPaymentResult,
  type BulkPaySkipReason,
  type Challan,
} from '@ilm/contracts';
import {
  Button,
  DatePicker,
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  ErrorState,
  Field,
  Input,
  Money,
  Skeleton,
  useToast,
} from '@ilm/ui';
import { FinanceIcon, ICON_SIZE } from '@ilm/ui/icons';
import { formatMoney, minorUnits, systemClock } from '@ilm/utils';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { mutate } from '@/lib/mutate';

/**
 * Recording payment for a selection of vouchers.
 *
 * ## A preview before anything is written
 *
 * This takes money for many families at once, so the dialog shows exactly
 * which vouchers will be settled, for how much, and which will be left out —
 * before the button that records them. The button says the count and the total
 * (docs/16 §11): "Record 11 payments · Rs 33,000", never "Confirm".
 *
 * ## Always in full
 *
 * Each voucher is settled for everything it owes, as the single Pay button does
 * without an amount. A part payment is a conversation with one family, and
 * belongs on that family's voucher.
 *
 * ## The figure here is a preview; the server's is the receipt
 *
 * Arrears are re-read and late fees decided when the payment is recorded — a
 * family may have paid at the counter since this list loaded. So the preview
 * marks the vouchers that may attract a late fee, and the toast afterwards
 * reports what was actually recorded.
 */
export interface BulkVoucherPaymentDialogProps {
  readonly ids: readonly string[];
  readonly onClose: () => void;
  /** After a run that recorded anything — the caller clears the selection and refreshes. */
  readonly onDone: () => void;
}

export function BulkVoucherPaymentDialog({ ids, onClose, onDone }: BulkVoucherPaymentDialogProps) {
  const toast = useToast();
  // One key per opening of the dialog: a double click, or a retry after a
  // dropped connection, resends the same batch and pays nobody twice.
  const batchKey = useRef(`bulk-pay-${crypto.randomUUID()}`);

  const [vouchers, setVouchers] = useState<Challan[] | undefined>(undefined);
  const [loadError, setLoadError] = useState<string | undefined>(undefined);
  const [paidOn, setPaidOn] = useState(() => systemClock.now().toISOString().slice(0, 10));
  const [reference, setReference] = useState('');
  const [formError, setFormError] = useState<string | undefined>(undefined);
  const [isPending, setIsPending] = useState(false);

  const load = useCallback(async () => {
    setLoadError(undefined);
    setVouchers(undefined);
    const result = await mutate<Challan[]>(ROUTES.vouchers.challans, 'POST', { ids: [...ids] });
    if (!result.ok) {
      setLoadError(result.message);
      return;
    }
    setVouchers(result.data);
  }, [ids]);

  useEffect(() => {
    void load();
  }, [load]);

  const plan = useMemo(() => (vouchers === undefined ? undefined : planPayments(vouchers)), [vouchers]);
  const lateCount =
    plan?.payable.filter((row) => row.lateFeeMinor > 0 && paidOn > row.dueDate).length ?? 0;

  async function submit(): Promise<void> {
    if (plan === undefined || plan.payable.length === 0) {
      return;
    }
    setFormError(undefined);
    setIsPending(true);

    const result = await mutate<BulkPaymentResult>(ROUTES.vouchers.bulkPay, 'POST', {
      ids: plan.payable.map((row) => row.id),
      paidOn,
      ...(reference.trim() === '' ? {} : { reference: reference.trim() }),
      idempotencyKey: batchKey.current,
    });
    setIsPending(false);

    if (!result.ok) {
      setFormError(result.message);
      return;
    }

    const { paid, totalMinor, skipped } = result.data;
    const headline = `${String(paid)} ${paid === 1 ? 'payment' : 'payments'} recorded · ${formatMoney(minorUnits(totalMinor))}`;
    if (skipped.length === 0) {
      toast.success(headline);
    } else {
      // Named, not counted: "WH-V-06: already settled" is the answer somebody
      // was about to go looking for.
      toast.warning(`${headline}. ${summarise(skipped)}`);
    }
    onDone();
  }

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !isPending) {
          onClose();
        }
      }}
    >
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Record payment for {ids.length} {ids.length === 1 ? 'voucher' : 'vouchers'}</DialogTitle>
          <DialogDescription>
            Each voucher is settled in full — its own balance and any arrears it carries, oldest
            first. One receipt per voucher.
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
            <Field label="Paid on" required>
              <DatePicker value={paidOn} onChange={setPaidOn} />
            </Field>
            <Field label="Reference" hint="Bank slip or cheque number, if one.">
              <Input
                maxLength={80}
                value={reference}
                onChange={(event) => {
                  setReference(event.target.value);
                }}
              />
            </Field>
          </div>

          {loadError !== undefined ? (
            <ErrorState
              title="Could not load the selected vouchers"
              description={loadError}
              onRetry={() => void load()}
            />
          ) : plan === undefined ? (
            <div className="space-y-2" role="status" aria-label="Loading the selected vouchers">
              {Array.from({ length: 4 }, (_, index) => (
                <Skeleton key={index} className="h-10 w-full rounded-md" />
              ))}
            </div>
          ) : (
            <PaymentPreview plan={plan} paidOn={paidOn} lateCount={lateCount} />
          )}
        </DialogBody>

        <DialogFooter>
          <Button type="button" tone="ghost" disabled={isPending} onClick={onClose}>
            Cancel
          </Button>
          <Button
            type="button"
            isPending={isPending}
            disabled={plan === undefined || plan.payable.length === 0}
            onClick={() => void submit()}
          >
            <FinanceIcon className={ICON_SIZE.inline} aria-hidden />
            {plan === undefined || plan.payable.length === 0 ? (
              'Record payments'
            ) : (
              <>
                Record {plan.payable.length} {plan.payable.length === 1 ? 'payment' : 'payments'} ·{' '}
                <Money valueMinor={plan.totalMinor} withSymbol />
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function PaymentPreview({
  plan,
  paidOn,
  lateCount,
}: {
  readonly plan: PaymentPlan;
  readonly paidOn: string;
  readonly lateCount: number;
}) {
  if (plan.payable.length === 0) {
    return (
      <p className="rounded-md border border-border bg-muted/40 px-3 py-3 text-sm text-muted-foreground">
        Nothing to collect — every selected voucher is already settled or cancelled.
      </p>
    );
  }

  return (
    <div className="space-y-2">
      <div className="max-h-72 overflow-y-auto rounded-md border border-border">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-muted text-xs text-muted-foreground">
            <tr>
              <th scope="col" className="px-3 py-2 text-start font-medium">
                Voucher
              </th>
              <th scope="col" className="px-3 py-2 text-start font-medium">
                Student
              </th>
              <th scope="col" className="px-3 py-2 text-end font-medium">
                Amount
              </th>
            </tr>
          </thead>
          <tbody>
            {plan.payable.map((row) => (
              <tr key={row.id} className="border-t border-border">
                <td className="px-3 py-2 font-mono text-xs">{row.voucherNo}</td>
                <td className="px-3 py-2">
                  <span className="text-balance">{row.studentName}</span>
                  {row.lateFeeMinor > 0 && paidOn > row.dueDate ? (
                    <span className="ms-2 text-xs text-warning">+ late fee</span>
                  ) : null}
                </td>
                <td className="px-3 py-2 text-end tabular-nums">
                  <Money valueMinor={row.amountMinor} withSymbol />
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t border-border bg-muted/40 font-semibold">
              <td className="px-3 py-2" colSpan={2}>
                Total
              </td>
              <td className="px-3 py-2 text-end tabular-nums">
                <Money valueMinor={plan.totalMinor} withSymbol />
              </td>
            </tr>
          </tfoot>
        </table>
      </div>

      {lateCount === 0 ? null : (
        <p className="text-xs text-muted-foreground">
          {lateCount} {lateCount === 1 ? 'voucher is' : 'vouchers are'} past due on this date, so
          the school’s late fee is added when recorded. The receipt shows the final figure.
        </p>
      )}
      {plan.excluded.length === 0 ? null : (
        <p className="text-xs text-muted-foreground">
          Left out: {plan.excluded.map((row) => row.voucherNo).join(', ')} — already settled or
          cancelled.
        </p>
      )}
    </div>
  );
}

export interface PlannedPayment {
  readonly id: string;
  readonly voucherNo: string;
  readonly studentName: string;
  readonly dueDate: string;
  readonly lateFeeMinor: number;
  readonly amountMinor: number;
}

export interface PaymentPlan {
  readonly payable: readonly PlannedPayment[];
  readonly excluded: readonly { readonly id: string; readonly voucherNo: string }[];
  readonly totalMinor: number;
}

/**
 * What each selected voucher will be settled for.
 *
 * A voucher's own balance, plus the arrears it carries — unless the voucher
 * those arrears came from is itself in the selection, in which case it is paid
 * there (oldest first) and counting it again here would double the total.
 */
export function planPayments(vouchers: readonly Challan[]): PaymentPlan {
  const open = vouchers.filter(
    (voucher) =>
      (voucher.status === 'UNPAID' || voucher.status === 'PARTIALLY_PAID') &&
      voucher.totalPayableMinor - voucher.paidMinor > 0,
  );
  const selected = new Set(open.map((voucher) => voucher.id));

  const payable = open
    .map((voucher) => {
      const carriedElsewhere = voucher.arrears
        .filter((arrear) => selected.has(arrear.sourceVoucherId))
        .reduce((sum, arrear) => sum + arrear.amountMinor, 0);
      return {
        id: voucher.id,
        voucherNo: voucher.voucherNo,
        studentName: voucher.studentName,
        dueDate: voucher.dueDate,
        lateFeeMinor: voucher.lateFeeMinor,
        amountMinor: Math.max(voucher.totalPayableMinor - voucher.paidMinor - carriedElsewhere, 0),
      };
    })
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate) || a.voucherNo.localeCompare(b.voucherNo));

  return {
    payable,
    excluded: vouchers
      .filter((voucher) => !selected.has(voucher.id))
      .map((voucher) => ({ id: voucher.id, voucherNo: voucher.voucherNo })),
    totalMinor: payable.reduce((sum, row) => sum + row.amountMinor, 0),
  };
}

/** "WH-V-06 and 1 more: already settled." */
function summarise(skipped: BulkPaymentResult['skipped']): string {
  const byReason = new Map<BulkPaySkipReason, string[]>();
  for (const entry of skipped) {
    const list = byReason.get(entry.reason) ?? [];
    list.push(entry.voucherNo ?? 'one');
    byReason.set(entry.reason, list);
  }
  return [...byReason.entries()]
    .map(([reason, numbers]) => {
      const named = numbers.slice(0, 2).join(', ');
      const rest = numbers.length - 2;
      const subject = rest > 0 ? `${named} and ${String(rest)} more` : named;
      return `${subject}: ${BULK_PAY_SKIP_REASON_LABELS[reason].toLowerCase()}`;
    })
    .join('. ');
}
