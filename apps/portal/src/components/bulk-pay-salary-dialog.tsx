'use client';

import {
  ROUTES,
  SALARY_PAYMENT_METHOD_LABELS,
  SALARY_PAYMENT_METHODS,
  type SalaryPaymentMethod,
  type StaffSalaryListItem,
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
  Money,
  SimpleSelect,
  useToast,
} from '@ilm/ui';
import { minorUnits } from '@ilm/utils';
import { useRef, useState, type FormEvent } from 'react';

import { salaryMonthLabel } from '@/components/salary-ui';
import { mutate } from '@/lib/mutate';

const METHOD_OPTIONS = SALARY_PAYMENT_METHODS.map((value) => ({
  value,
  label: SALARY_PAYMENT_METHOD_LABELS[value],
}));

/**
 * Pay the remaining balance for several people in one go.
 *
 * Each person is its own payment (so each has its own receipt and its own
 * history), made one after another with its own idempotency key. If some fail —
 * somebody was paid in the meantime — the rest still go through and the dialog
 * says who was skipped, rather than undoing the lot.
 */
export function BulkPaySalaryDialog({
  rows,
  month,
  today,
  onClose,
  onDone,
}: {
  /** Only people with something still owed. */
  rows: readonly StaffSalaryListItem[];
  /** `YYYY-MM`. */
  month: string;
  today: string;
  onClose: () => void;
  onDone: () => void;
}) {
  const toast = useToast();
  const runKey = useRef(crypto.randomUUID());
  const [paidOn, setPaidOn] = useState(today);
  const [method, setMethod] = useState<SalaryPaymentMethod>('CASH');
  const [isPending, setIsPending] = useState(false);
  const [failures, setFailures] = useState<string[]>([]);

  const totalMinor = rows.reduce((sum, row) => sum + row.remainingMinor, 0);

  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (isPending || paidOn === '') {
      return;
    }

    setIsPending(true);
    setFailures([]);
    const failed: string[] = [];
    let paid = 0;

    for (const row of rows) {
      const result = await mutate(ROUTES.staff.salaryPayments(row.staffId), 'POST', {
        month,
        paidOn,
        method,
        amountMinor: row.remainingMinor,
        idempotencyKey: `bulk-${runKey.current}-${row.staffId}`,
      });
      if (result.ok) {
        paid += 1;
      } else {
        failed.push(`${row.name}: ${result.message}`);
      }
    }
    setIsPending(false);

    if (paid > 0) {
      toast.success(`${String(paid)} salar${paid === 1 ? 'y' : 'ies'} paid.`);
    }
    if (failed.length > 0) {
      setFailures(failed);
      onDone();
      return;
    }
    onDone();
    onClose();
  }

  return (
    <Dialog
      open
      onOpenChange={(next) => {
        if (!next && !isPending) {
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
            <DialogTitle>Pay selected salaries</DialogTitle>
            <DialogDescription>
              {salaryMonthLabel(month)} · each person is paid what is still owed.
            </DialogDescription>
          </DialogHeader>

          <DialogBody className="space-y-4">
            {failures.length === 0 ? null : (
              <div
                role="alert"
                className="space-y-1 rounded-md border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger"
              >
                <p className="font-medium">Some could not be paid:</p>
                <ul className="list-disc ps-5">
                  {failures.map((line) => (
                    <li key={line}>{line}</li>
                  ))}
                </ul>
              </div>
            )}

            <dl className="grid grid-cols-2 gap-3 rounded-lg border border-border bg-muted/30 p-3 text-sm">
              <div>
                <dt className="text-xs text-muted-foreground">Staff</dt>
                <dd className="font-medium tabular-nums">{rows.length}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Total to pay</dt>
                <dd className="font-semibold tabular-nums">
                  <Money valueMinor={minorUnits(totalMinor)} withSymbol />
                </dd>
              </div>
            </dl>

            <ul className="max-h-40 divide-y divide-border overflow-y-auto overscroll-contain rounded-lg border border-border text-sm">
              {rows.map((row) => (
                <li key={row.staffId} className="flex items-center justify-between gap-3 px-3 py-2">
                  <span className="truncate">{row.name}</span>
                  <span className="shrink-0 tabular-nums">
                    <Money valueMinor={minorUnits(row.remainingMinor)} withSymbol />
                  </span>
                </li>
              ))}
            </ul>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Payment date" required>
                <DatePicker value={paidOn} onChange={setPaidOn} max={today} aria-label="Payment date" />
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
          </DialogBody>

          <DialogFooter>
            <Button type="button" tone="outline" onClick={onClose} disabled={isPending}>
              {failures.length > 0 ? 'Close' : 'Cancel'}
            </Button>
            {failures.length > 0 ? null : (
              <Button type="submit" isPending={isPending}>
                Pay {rows.length} salar{rows.length === 1 ? 'y' : 'ies'}
              </Button>
            )}
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
