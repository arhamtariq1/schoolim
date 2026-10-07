'use client';

import {
  ROUTES,
  setStudentFeesSchema,
  type FeeHead,
  type StudentFee,
  type StudentFeeLine,
} from '@ilm/contracts';
import {
  Button,
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
  SimpleSelect,
  useToast,
} from '@ilm/ui';
import { DeleteIcon, ICON_SIZE } from '@ilm/ui/icons';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';

import { minorToRupees, rupeesToMinor } from '@/lib/money';
import { mutate } from '@/lib/mutate';

/**
 * What this child is charged, and what their family actually agreed to pay.
 *
 * ## Why a whole-structure save
 *
 * The endpoint replaces the lot in one PUT, and this form matches it. A school
 * changes two lines as often as one — "put her on the sibling rate and drop the
 * transport" — and a per-line PATCH leaves no single audit row saying what the
 * structure became. One save, one before-and-after.
 *
 * ## Why the discount is the amount payable
 *
 * A school says "we agreed 10,000 instead of 25,000", not "we gave a 15,000
 * discount". Storing the sentence people actually say removes a subtraction
 * that can be got wrong in either direction — and it is what the contract
 * already holds, so the form asks for it the same way.
 *
 * Both figures are typed in rupees and stored in paisa. `rupeesToMinor` does
 * that conversion in one place, because `Number(value) * 100` is banned
 * (ADR-0007) and gets 1,234.56 wrong by a paisa about a third of the time.
 */

export interface EditStudentFeesDialogProps {
  readonly studentId: string;
  readonly studentName: string;
  readonly fees: readonly StudentFee[];
  readonly heads: readonly FeeHead[];
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
}

interface Row {
  /** Stable across re-orders, so React does not reuse the wrong input. */
  readonly key: string;
  feeHeadId: string;
  amount: string;
  discounted: string;
  reason: string;
}

export function EditStudentFeesDialog({
  studentId,
  studentName,
  fees,
  heads,
  open,
  onOpenChange,
}: EditStudentFeesDialogProps) {
  const router = useRouter();
  const toast = useToast();

  const [rows, setRows] = useState<Row[]>(() => fees.map(toRow));
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | undefined>(undefined);
  const [isPending, setIsPending] = useState(false);

  const used = new Set(rows.map((row) => row.feeHeadId));
  const available = heads.filter((head) => head.isActive || used.has(head.id));

  function patch(key: string, change: Partial<Row>): void {
    setRows((current) => current.map((row) => (row.key === key ? { ...row, ...change } : row)));
    setFormError(undefined);
  }

  function addRow(): void {
    // The first head not already on the structure. Charging the same head
    // twice is not a thing a school means to do, and the server's own unique
    // constraint would refuse it anyway.
    const next = available.find((head) => !used.has(head.id));
    if (next === undefined) {
      return;
    }
    setRows((current) => [
      ...current,
      {
        key: `new-${String(current.length)}-${next.id}`,
        feeHeadId: next.id,
        amount: String(minorToRupees(next.defaultAmountMinor)),
        discounted: '',
        reason: '',
      },
    ]);
  }

  const totals = rows.reduce(
    (sum, row) => {
      const gross = rupeesToMinor(row.amount) ?? 0;
      const payable = row.discounted.trim() === '' ? gross : (rupeesToMinor(row.discounted) ?? 0);
      return { gross: sum.gross + gross, payable: sum.payable + payable };
    },
    { gross: 0, payable: 0 },
  );

  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setFormError(undefined);
    setFieldErrors({});

    const lines: StudentFeeLine[] = [];
    const errors: Record<string, string> = {};

    for (const [index, row] of rows.entries()) {
      const amountMinor = rupeesToMinor(row.amount);
      if (amountMinor === undefined) {
        errors[`lines.${String(index)}.amountMinor`] = 'Enter an amount, for example 5000.';
        continue;
      }

      const hasDiscount = row.discounted.trim() !== '';
      const discountedMinor = hasDiscount ? rupeesToMinor(row.discounted) : undefined;
      if (hasDiscount && discountedMinor === undefined) {
        errors[`lines.${String(index)}.discountedAmountMinor`] = 'Enter an amount, or leave blank.';
        continue;
      }

      lines.push({
        feeHeadId: row.feeHeadId,
        amountMinor,
        ...(discountedMinor === undefined ? {} : { discountedAmountMinor: discountedMinor }),
        ...(row.reason.trim() === '' ? {} : { discountReason: row.reason.trim() }),
      });
    }

    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      return;
    }

    const parsed = setStudentFeesSchema.safeParse({ lines });
    if (!parsed.success) {
      const next: Record<string, string> = {};
      for (const issue of parsed.error.issues) {
        next[issue.path.join('.')] = issue.message;
      }
      setFieldErrors(next);
      setFormError('Check the amounts below.');
      return;
    }

    setIsPending(true);
    const result = await mutate(ROUTES.fees.studentFees(studentId), 'PUT', parsed.data);
    setIsPending(false);

    if (!result.ok) {
      setFormError(result.message);
      setFieldErrors(result.fieldErrors);
      return;
    }

    toast.success(
      `Fees saved for ${studentName}`,
      'Vouchers generated from now on use these amounts; ones already issued are unchanged.',
    );
    onOpenChange(false);
    router.refresh();
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!isPending) {
          onOpenChange(next);
        }
      }}
    >
      <DialogContent className="max-w-3xl">
        <form
          onSubmit={(event) => {
            void submit(event);
          }}
          noValidate
        >
          <DialogHeader>
            <DialogTitle>Fees for {studentName}</DialogTitle>
            <DialogDescription>
              What this child is charged. Leave the agreed amount blank unless the family was given
              a different figure — vouchers already issued are not changed.
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

            {rows.length === 0 ? (
              <p className="rounded-md border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
                No fees agreed yet. Nothing will be billed for this child until one is added.
              </p>
            ) : (
              <ul className="space-y-3">
                {rows.map((row, index) => (
                  <li
                    key={row.key}
                    className="grid gap-3 rounded-lg border border-border p-3 sm:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_minmax(0,1fr)_auto]"
                  >
                    <Field label="Fee">
                      <SimpleSelect
                        value={row.feeHeadId}
                        onValueChange={(value) => {
                          patch(row.key, { feeHeadId: value });
                        }}
                        options={available
                          .filter((head) => head.id === row.feeHeadId || !used.has(head.id))
                          .map((head) => ({ value: head.id, label: head.name }))}
                      />
                    </Field>

                    <Field
                      label="Standard (Rs)"
                      error={fieldErrors[`lines.${String(index)}.amountMinor`]}
                    >
                      <Input
                        inputMode="decimal"
                        className="text-right font-mono"
                        value={row.amount}
                        onChange={(event) => {
                          patch(row.key, { amount: event.target.value });
                        }}
                      />
                    </Field>

                    <Field
                      label="Agreed (Rs)"
                      hint="Blank = charge the standard."
                      error={fieldErrors[`lines.${String(index)}.discountedAmountMinor`]}
                    >
                      <Input
                        inputMode="decimal"
                        className="text-right font-mono"
                        value={row.discounted}
                        onChange={(event) => {
                          patch(row.key, { discounted: event.target.value });
                        }}
                      />
                    </Field>

                    <div className="flex items-end pb-1">
                      <Button
                        type="button"
                        tone="ghost"
                        size="icon"
                        aria-label="Remove this fee"
                        onClick={() => {
                          setRows((current) => current.filter((entry) => entry.key !== row.key));
                        }}
                      >
                        <DeleteIcon className={ICON_SIZE.inline} aria-hidden />
                      </Button>
                    </div>

                    {row.discounted.trim() === '' ? null : (
                      <Field
                        label="Why"
                        hint="Blank is allowed; unanswerable is not."
                        className="sm:col-span-4"
                      >
                        <Input
                          value={row.reason}
                          placeholder="Sibling discount"
                          onChange={(event) => {
                            patch(row.key, { reason: event.target.value });
                          }}
                        />
                      </Field>
                    )}
                  </li>
                ))}
              </ul>
            )}

            <div className="flex flex-wrap items-center justify-between gap-3">
              <Button
                type="button"
                tone="outline"
                size="sm"
                disabled={available.every((head) => used.has(head.id))}
                onClick={addRow}
              >
                Add a fee
              </Button>

              <dl className="flex gap-6 text-sm">
                <div className="flex gap-2">
                  <dt className="text-muted-foreground">Standard</dt>
                  <dd className="font-mono tabular-nums">
                    <Money valueMinor={totals.gross} />
                  </dd>
                </div>
                <div className="flex gap-2">
                  <dt className="text-muted-foreground">Payable</dt>
                  <dd className="font-mono font-semibold tabular-nums">
                    <Money valueMinor={totals.payable} />
                  </dd>
                </div>
              </dl>
            </div>
          </DialogBody>

          <DialogFooter>
            <Button
              type="button"
              tone="ghost"
              disabled={isPending}
              onClick={() => {
                onOpenChange(false);
              }}
            >
              Cancel
            </Button>
            <Button type="submit" isPending={isPending}>
              Save fees
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function toRow(fee: StudentFee, index: number): Row {
  return {
    key: `${fee.feeHeadId}-${String(index)}`,
    feeHeadId: fee.feeHeadId,
    amount: String(minorToRupees(fee.amountMinor)),
    discounted:
      fee.discountedAmountMinor === null ? '' : String(minorToRupees(fee.discountedAmountMinor)),
    reason: fee.discountReason ?? '',
  };
}
