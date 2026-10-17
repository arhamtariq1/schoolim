'use client';

import {
  ROUTES,
  SALARY_PAYMENT_METHOD_LABELS,
  SALARY_PAYMENT_METHODS,
  type SalaryPaymentMethod,
  type StaffSalaryDetail,
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
  Field,
  FieldIconWrap,
  Input,
  Money,
  SimpleSelect,
  useToast,
} from '@ilm/ui';
import { CreateIcon, FeesIcon } from '@ilm/ui/icons';
import { minorUnits } from '@ilm/utils';
import { useRef, useState, type FormEvent } from 'react';

import { salaryMonthLabel } from '@/components/salary-ui';
import { decimalOnly } from '@/lib/input-filters';
import { minorToRupees, rupeesToMinor } from '@/lib/money';
import { mutate } from '@/lib/mutate';

const ADJUSTMENT_OPTIONS = [
  { value: 'BONUS', label: 'Bonus' },
  { value: 'ALLOWANCE', label: 'Allowance' },
  { value: 'DEDUCTION', label: 'Deduction' },
] as const;

type InlineAdjustmentKind = (typeof ADJUSTMENT_OPTIONS)[number]['value'];

const METHOD_OPTIONS = SALARY_PAYMENT_METHODS.map((value) => ({
  value,
  label: SALARY_PAYMENT_METHOD_LABELS[value],
}));

export interface PaySalaryTarget {
  readonly staffId: string;
  readonly staffName: string;
  /** `YYYY-MM`. */
  readonly month: string;
  readonly netMinor: number;
  readonly paidMinor: number;
}

/**
 * Pay a month's salary, in full or in part.
 *
 * The amount starts as the whole balance and may be lowered for a part payment;
 * it can never be raised above what is owed, and the server refuses it too. The
 * `idempotencyKey` is made once per open dialog, so a double click — or a retry
 * after a response that never arrived — is one payment, not two.
 */
export function PaySalaryDialog({
  target,
  today,
  onClose,
  onSaved,
}: {
  target: PaySalaryTarget;
  /** `YYYY-MM-DD` — the latest date a payment can be recorded as made. */
  today: string;
  onClose: () => void;
  onSaved: (detail: StaffSalaryDetail) => void;
}) {
  const toast = useToast();
  const remainingMinor = Math.max(0, target.netMinor - target.paidMinor);

  const idempotencyKey = useRef(`pay-${crypto.randomUUID()}`);
  const [amount, setAmount] = useState(minorToRupees(remainingMinor));
  const [amountTouched, setAmountTouched] = useState(false);
  const [adjusting, setAdjusting] = useState(false);
  const [adjKind, setAdjKind] = useState<InlineAdjustmentKind>('BONUS');
  const [adjAmount, setAdjAmount] = useState('');
  // Once the adjustment is saved it must not be saved again if the payment that
  // follows it fails and the person tries once more.
  const adjustmentSaved = useRef(false);
  const [paidOn, setPaidOn] = useState(today);
  const [method, setMethod] = useState<SalaryPaymentMethod>('CASH');
  const [reference, setReference] = useState('');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState<string | undefined>(undefined);
  const [isPending, setIsPending] = useState(false);

  const adjustmentAbs = adjusting ? (rupeesToMinor(adjAmount) ?? 0) : 0;
  const adjustmentMinor = adjKind === 'DEDUCTION' ? -adjustmentAbs : adjustmentAbs;
  const totalPayableMinor = Math.max(0, remainingMinor + adjustmentMinor);

  function setAdjustment(kind: InlineAdjustmentKind, value: string): void {
    setAdjKind(kind);
    setAdjAmount(value);
    if (!amountTouched) {
      const abs = rupeesToMinor(value) ?? 0;
      const signed = kind === 'DEDUCTION' ? -abs : abs;
      setAmount(minorToRupees(Math.max(0, remainingMinor + signed)));
    }
  }

  const amountMinor = rupeesToMinor(amount);
  const amountError =
    amount.trim() === ''
      ? 'Enter the amount paid.'
      : amountMinor === undefined || amountMinor <= 0
        ? 'Enter an amount above zero, for example 25000.'
        : amountMinor > totalPayableMinor
          ? 'That is more than the balance still owed.'
          : undefined;

  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (isPending) {
      return;
    }
    if (amountError !== undefined || amountMinor === undefined) {
      setError(amountError ?? 'Enter the amount paid.');
      return;
    }
    if (paidOn === '') {
      setError('Choose the date it was paid.');
      return;
    }

    setIsPending(true);
    setError(undefined);

    if (adjusting && adjustmentAbs > 0 && !adjustmentSaved.current) {
      const adjusted = await mutate<{ data: StaffSalaryDetail }>(
        ROUTES.staff.salaryAdjustments(target.staffId),
        'POST',
        {
          month: target.month,
          kind: adjKind,
          amountMinor: adjustmentAbs,
          reason: `${adjKind.charAt(0)}${adjKind.slice(1).toLowerCase()} added while paying salary`,
        },
      );
      if (!adjusted.ok) {
        setIsPending(false);
        setError(adjusted.message);
        return;
      }
      adjustmentSaved.current = true;
    }

    const result = await mutate<{ data: StaffSalaryDetail }>(
      ROUTES.staff.salaryPayments(target.staffId),
      'POST',
      {
        month: target.month,
        paidOn,
        amountMinor,
        method,
        idempotencyKey: idempotencyKey.current,
        ...(reference.trim() === '' ? {} : { reference: reference.trim() }),
        ...(notes.trim() === '' ? {} : { notes: notes.trim() }),
      },
    );
    setIsPending(false);

    if (!result.ok) {
      setError(result.message);
      return;
    }

    toast.success(`Salary payment recorded for ${target.staffName}.`);
    onSaved(result.data.data);
  }

  const locked = adjustmentSaved.current;

  return (
    <Dialog
      open
      onOpenChange={(next) => {
        if (!next && !isPending) {
          onClose();
        }
      }}
    >
      <DialogContent className="max-w-3xl">
        <form
          noValidate
          onSubmit={(event) => {
            void submit(event);
          }}
        >
          <DialogHeader>
            <DialogTitle>Pay salary</DialogTitle>
            <DialogDescription>
              A payment can be part of the salary. Once saved it cannot be changed.
            </DialogDescription>
          </DialogHeader>

          <DialogBody className="space-y-4">
            {error === undefined ? null : (
              <div
                role="alert"
                className="rounded-md border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger"
              >
                {error}
              </div>
            )}

            <div className="grid gap-4 sm:grid-cols-3">
              <Field label="Staff">
                <Input value={target.staffName} readOnly disabled />
              </Field>
              <Field label="Salary month">
                <Input value={salaryMonthLabel(target.month)} readOnly disabled />
              </Field>
              <Field label="Payment method" required>
                <SimpleSelect
                  value={method}
                  onValueChange={(next) => {
                    setMethod(next as SalaryPaymentMethod);
                  }}
                  options={METHOD_OPTIONS}
                  ariaLabel="Payment method"
                />
              </Field>
            </div>

            <dl className="grid grid-cols-3 gap-3 rounded-lg border border-border bg-muted/30 px-4 py-2.5 text-sm">
              <div>
                <dt className="text-xs text-muted-foreground">Monthly salary</dt>
                <dd className="font-medium tabular-nums">
                  <Money valueMinor={minorUnits(target.netMinor)} withSymbol />
                </dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Already paid</dt>
                <dd className="font-medium tabular-nums">
                  <Money valueMinor={minorUnits(target.paidMinor)} withSymbol dashOnZero />
                </dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Remaining</dt>
                <dd className="font-semibold tabular-nums">
                  <Money valueMinor={minorUnits(remainingMinor)} withSymbol />
                </dd>
              </div>
            </dl>

            {adjusting ? (
              <div className="space-y-3 rounded-lg border border-dashed border-primary bg-primary/5 p-3">
                <div className="grid gap-4 sm:grid-cols-3">
                  <Field label="Adjustment type">
                    <SimpleSelect
                      value={adjKind}
                      onValueChange={(next) => {
                        setAdjustment(next as InlineAdjustmentKind, adjAmount);
                      }}
                      options={[...ADJUSTMENT_OPTIONS]}
                      ariaLabel="Adjustment type"
                      disabled={locked}
                    />
                  </Field>
                  <Field label="Adjustment amount (PKR)">
                    <FieldIconWrap icon={FeesIcon}>
                      <Input
                        value={adjAmount}
                        inputMode="decimal"
                        placeholder="0.00"
                        disabled={locked}
                        onChange={(event) => {
                          setAdjustment(adjKind, decimalOnly(event.target.value));
                        }}
                      />
                    </FieldIconWrap>
                  </Field>
                  <Field label="Total amount to pay">
                    <div className="flex h-10 items-center justify-between rounded-md border border-primary/30 bg-background px-3 text-sm font-semibold tabular-nums">
                      <Money valueMinor={minorUnits(totalPayableMinor)} withSymbol />
                    </div>
                  </Field>
                </div>
                {locked ? null : (
                  <button
                    type="button"
                    className="text-sm font-medium text-primary underline-offset-2 hover:underline"
                    onClick={() => {
                      setAdjusting(false);
                      setAdjAmount('');
                      if (!amountTouched) {
                        setAmount(minorToRupees(remainingMinor));
                      }
                    }}
                  >
                    Remove adjustment
                  </button>
                )}
              </div>
            ) : (
              <Button
                type="button"
                tone="outline"
                size="sm"
                onClick={() => {
                  setAdjusting(true);
                }}
              >
                <CreateIcon className="size-4" aria-hidden="true" />
                Add adjustment
              </Button>
            )}

            <div className="grid gap-4 sm:grid-cols-3">
              <Field label="Payment amount (PKR)" error={amountError} required>
                <FieldIconWrap icon={FeesIcon}>
                  <Input
                    value={amount}
                    inputMode="decimal"
                    autoFocus
                    onChange={(event) => {
                      setAmountTouched(true);
                      setAmount(decimalOnly(event.target.value));
                    }}
                  />
                </FieldIconWrap>
              </Field>
              <Field label="Payment date" required>
                <DatePicker value={paidOn} onChange={setPaidOn} max={today} aria-label="Payment date" />
              </Field>
              <Field label="Transaction reference">
                <Input
                  value={reference}
                  maxLength={120}
                  placeholder="Optional"
                  onChange={(event) => {
                    setReference(event.target.value);
                  }}
                />
              </Field>
            </div>

            <Field label="Notes">
              <Input
                value={notes}
                maxLength={500}
                placeholder="Optional"
                onChange={(event) => {
                  setNotes(event.target.value);
                }}
              />
            </Field>
          </DialogBody>

          <DialogFooter>
            <Button type="button" tone="outline" onClick={onClose} disabled={isPending}>
              Cancel
            </Button>
            <Button type="submit" isPending={isPending} disabled={amountError !== undefined}>
              Pay salary
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
