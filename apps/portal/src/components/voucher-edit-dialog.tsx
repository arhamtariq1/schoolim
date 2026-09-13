'use client';

import {
  ROUTES,
  type FeeHead,
  type StudentFee,
  type VoucherDetail,
  type VoucherSummary,
} from '@ilm/contracts';
import {
  Button,
  CheckboxField,
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
  SimpleSelect,
  StatusBadge,
  useToast,
} from '@ilm/ui';
import { CreateIcon, DeleteIcon, ICON_SIZE, SpinnerIcon, UndoIcon } from '@ilm/ui/icons';
import { useEffect, useState } from 'react';

import { rupeesToMinor } from '@/lib/money';
import { mutate } from '@/lib/mutate';

/**
 * Editing a voucher that has already been issued.
 *
 * ## Why the whole edit is one request
 *
 * Every removal and every addition is staged here and sent as a single PATCH,
 * which the server applies in one transaction. Sending each change as it is
 * made would leave a voucher half-edited the moment one of them is refused —
 * and "the lab fee went on but the admission fee would not come off" is a state
 * nobody can reason about, least of all the parent holding the challan.
 *
 * ## Why some of it is read-only
 *
 * The lines may change only while nothing has been received. Once a rupee has
 * arrived there is a receipt naming a total, and editing the voucher makes the
 * two disagree — so the controls are absent rather than disabled-and-failing,
 * with a line of text saying why and what to do instead (docs/16 §7).
 *
 * There is no status dropdown and no payment date, deliberately. Status is what
 * the payment ledger adds up to; offering it as a choice would be money with no
 * receipt behind it. Pay, Waive and Cancel are on the row already and each
 * leaves a record of itself.
 */

export interface VoucherEditDialogProps {
  /** The row being edited. `undefined` closes the dialog. */
  readonly voucher: VoucherSummary | undefined;
  readonly heads: readonly FeeHead[];
  readonly onClose: () => void;
  readonly onSaved: () => void;
}

/** A fee staged to go on, before anything is sent. */
interface PendingHead {
  readonly key: string;
  readonly feeHeadId: string;
  readonly name: string;
  /** Blank means "whatever this family has agreed", resolved by the server. */
  readonly amount: string;
}

export function VoucherEditDialog({ voucher, heads, onClose, onSaved }: VoucherEditDialogProps) {
  const toast = useToast();

  const [detail, setDetail] = useState<VoucherDetail | undefined>(undefined);
  const [agreed, setAgreed] = useState<readonly StudentFee[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | undefined>(undefined);

  const [issueDate, setIssueDate] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [validTill, setValidTill] = useState('');
  const [applyLateFee, setApplyLateFee] = useState(true);

  const [removed, setRemoved] = useState<ReadonlySet<string>>(new Set());
  const [pending, setPending] = useState<readonly PendingHead[]>([]);
  const [headToAdd, setHeadToAdd] = useState('');
  const [amountToAdd, setAmountToAdd] = useState('');

  const [isSaving, setIsSaving] = useState(false);
  const [formError, setFormError] = useState<string | undefined>(undefined);

  const voucherId = voucher?.id;

  useEffect(() => {
    if (voucherId === undefined) {
      return;
    }

    let cancelled = false;
    setIsLoading(true);
    setLoadError(undefined);
    setDetail(undefined);
    setRemoved(new Set());
    setPending([]);
    setHeadToAdd('');
    setAmountToAdd('');
    setFormError(undefined);

    void (async () => {
      const response = await fetch(ROUTES.vouchers.detail(voucherId), { credentials: 'include' });
      if (cancelled) {
        return;
      }
      if (!response.ok) {
        setIsLoading(false);
        setLoadError('Could not load that voucher. Close this and try again.');
        return;
      }

      const body = (await response.json()) as { data: VoucherDetail };
      if (cancelled) {
        return;
      }

      setDetail(body.data);
      setIssueDate(body.data.issueDate);
      setDueDate(body.data.dueDate);
      setValidTill(body.data.validTill);
      setApplyLateFee(body.data.lateFeeAuto);

      // The family's agreed amounts, so an added line shows the figure that
      // will actually be billed rather than the catalogue price. Fetched
      // alongside rather than guessed: a screen that shows 1,000 and bills
      // 1,200 is worse than one that shows nothing.
      const fees = await fetch(ROUTES.fees.studentFees(body.data.studentId), {
        credentials: 'include',
      });
      if (cancelled) {
        return;
      }
      if (fees.ok) {
        const feeBody = (await fees.json()) as { data: StudentFee[] };
        setAgreed(feeBody.data);
      }
      setIsLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [voucherId]);

  // Nothing received, nothing forgiven: the only state in which what is owed
  // may still be corrected.
  const canEditLines =
    detail !== undefined &&
    detail.status === 'UNPAID' &&
    detail.paidMinor === 0 &&
    detail.waiverMinor === 0;

  const feeLines = (detail?.lines ?? []).filter((line) => line.kind === 'FEE');
  const otherLines = (detail?.lines ?? []).filter((line) => line.kind !== 'FEE');

  /** What a head would be billed at: this family's rate, or the catalogue's. */
  function amountFor(feeHeadId: string): number | undefined {
    const own = agreed.find((fee) => fee.feeHeadId === feeHeadId);
    if (own !== undefined) {
      return own.payableMinor;
    }
    return heads.find((head) => head.id === feeHeadId)?.defaultAmountMinor;
  }

  /**
   * The total this edit would produce.
   *
   * Computed the way the server computes it — from the lines — so the figure on
   * the button is the figure that lands. Arrears and any waiver are carried
   * through untouched because neither can be edited here.
   */
  const projectedMinor = (() => {
    if (detail === undefined) {
      return 0;
    }
    const kept = feeLines
      .filter((line) => !removed.has(line.id))
      .reduce((sum, line) => sum + line.amountMinor - line.discountMinor, 0);

    const added = pending.reduce((sum, entry) => {
      const typed = rupeesToMinor(entry.amount);
      return sum + (typed ?? amountFor(entry.feeHeadId) ?? 0);
    }, 0);

    return kept + added + detail.arrearsMinor - detail.waiverMinor;
  })();

  const hasLineChanges = removed.size > 0 || pending.length > 0;
  const hasDateChanges =
    detail !== undefined &&
    (issueDate !== detail.issueDate ||
      dueDate !== detail.dueDate ||
      validTill !== detail.validTill ||
      applyLateFee !== detail.lateFeeAuto);
  const isDirty = hasLineChanges || hasDateChanges;

  // The server checks this too; catching it here turns a round trip into an
  // inline message beside the field that is wrong.
  const datesOutOfOrder = dueDate < issueDate || validTill < dueDate;

  /** Heads not already on the voucher and not already staged. */
  const addableHeads = heads.filter((head) => {
    if (!head.isActive) {
      return false;
    }
    const onVoucher = feeLines.some((line) => line.feeHeadId === head.id && !removed.has(line.id));
    const staged = pending.some((entry) => entry.feeHeadId === head.id);
    return !onVoucher && !staged;
  });

  function stageHead(): void {
    const head = heads.find((entry) => entry.id === headToAdd);
    if (head === undefined) {
      return;
    }
    setPending([
      ...pending,
      {
        key: `${head.id}-${String(pending.length)}`,
        feeHeadId: head.id,
        name: head.name,
        amount: amountToAdd,
      },
    ]);
    setHeadToAdd('');
    setAmountToAdd('');
  }

  async function save(): Promise<void> {
    if (voucherId === undefined || detail === undefined) {
      return;
    }
    setIsSaving(true);
    setFormError(undefined);

    const payload: Record<string, unknown> = {};
    if (issueDate !== detail.issueDate) payload['issueDate'] = issueDate;
    if (dueDate !== detail.dueDate) payload['dueDate'] = dueDate;
    if (validTill !== detail.validTill) payload['validTill'] = validTill;
    if (applyLateFee !== detail.lateFeeAuto) payload['applyLateFee'] = applyLateFee;
    if (removed.size > 0) payload['removeLineIds'] = [...removed];
    if (pending.length > 0) {
      payload['addHeads'] = pending.map((entry) => {
        const typed = rupeesToMinor(entry.amount);
        return typed === undefined
          ? { feeHeadId: entry.feeHeadId }
          : { feeHeadId: entry.feeHeadId, amountMinor: typed };
      });
    }

    const result = await mutate<VoucherDetail>(ROUTES.vouchers.update(voucherId), 'PATCH', payload);
    setIsSaving(false);

    if (!result.ok) {
      setFormError(result.message);
      return;
    }

    toast.success(`Voucher ${detail.voucherNo} updated.`);
    onClose();
    onSaved();
  }

  return (
    <Dialog
      open={voucher !== undefined}
      onOpenChange={(open) => {
        if (!open) {
          onClose();
        }
      }}
    >
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Edit voucher {voucher?.voucherNo ?? ''}</DialogTitle>
          <DialogDescription>
            {voucher?.studentName ?? ''}
            {voucher?.grNo === null || voucher === undefined ? '' : ` · G.R ${voucher.grNo}`}
            {voucher?.className === null || voucher === undefined ? '' : ` · ${voucher.className}`}
          </DialogDescription>
        </DialogHeader>

        <DialogBody className="space-y-4">
          {isLoading ? (
            <p className="py-8 text-center text-sm text-muted-foreground">Loading the voucher…</p>
          ) : loadError !== undefined ? (
            <p
              role="alert"
              className="rounded-md border border-danger/30 bg-danger/10 p-3 text-sm text-danger"
            >
              {loadError}
            </p>
          ) : detail === undefined ? null : (
            <>
              {formError === undefined ? null : (
                <p
                  role="alert"
                  className="rounded-md border border-danger/30 bg-danger/10 p-3 text-sm text-danger"
                >
                  {formError}
                </p>
              )}

              {canEditLines ? null : (
                <p className="rounded-md border border-warning/30 bg-warning/10 p-3 text-sm">
                  {detail.waiverMinor > 0
                    ? 'Part of this voucher has been waived, so its fees can no longer be changed — only the dates.'
                    : 'Money has already been received against this voucher, so its fees can no longer be changed — only the dates. To change what is owed, record a further payment, waive the balance, or cancel it and issue a new one.'}
                </p>
              )}

              <div className="grid gap-3 sm:grid-cols-3">
                <Field label="Issue date" required>
                  <DatePicker value={issueDate} onChange={setIssueDate} />
                </Field>
                <Field
                  label="Due date"
                  required
                  error={
                    dueDate < issueDate
                      ? 'The due date cannot be before the issue date.'
                      : undefined
                  }
                >
                  <DatePicker value={dueDate} onChange={setDueDate} />
                </Field>
                <Field
                  label="Valid till"
                  required
                  error={
                    validTill < dueDate ? 'The challan cannot expire before it is due.' : undefined
                  }
                >
                  <DatePicker value={validTill} onChange={setValidTill} />
                </Field>
              </div>

              <CheckboxField
                label="Apply the late fee automatically"
                hint="Charged after the due date, at the rate in Settings."
                checked={applyLateFee}
                onCheckedChange={(checked) => {
                  setApplyLateFee(checked === true);
                }}
              />

              <div className="overflow-hidden rounded-xl border border-border">
                <table className="w-full border-collapse text-sm">
                  <caption className="sr-only">Fees on this voucher</caption>
                  <thead className="bg-muted/50">
                    <tr>
                      <th
                        scope="col"
                        className="px-3 py-2 text-start text-xs font-medium text-muted-foreground"
                      >
                        Fee
                      </th>
                      <th
                        scope="col"
                        className="px-3 py-2 text-end text-xs font-medium text-muted-foreground"
                      >
                        Amount
                      </th>
                      <th scope="col" className="w-12 px-3 py-2" />
                    </tr>
                  </thead>
                  <tbody>
                    {feeLines.map((line) => {
                      const isRemoved = removed.has(line.id);
                      return (
                        <tr
                          key={line.id}
                          className={`border-t border-border ${isRemoved ? 'opacity-50' : ''}`}
                        >
                          <td className="px-3 py-2">
                            <span className={isRemoved ? 'line-through' : ''}>{line.label}</span>
                            {line.discountMinor > 0 ? (
                              <span className="block text-xs text-muted-foreground">
                                less <Money valueMinor={line.discountMinor} withSymbol={false} />{' '}
                                discount
                              </span>
                            ) : null}
                          </td>
                          <td className="px-3 py-2 text-end font-mono tabular-nums">
                            <Money valueMinor={line.amountMinor - line.discountMinor} />
                          </td>
                          <td className="px-3 py-2 text-end">
                            {!canEditLines ? null : isRemoved ? (
                              <Button
                                tone="ghost"
                                size="sm"
                                aria-label={`Keep ${line.label}`}
                                onClick={() => {
                                  const next = new Set(removed);
                                  next.delete(line.id);
                                  setRemoved(next);
                                }}
                              >
                                <UndoIcon className={ICON_SIZE.inline} aria-hidden />
                              </Button>
                            ) : (
                              <Button
                                tone="ghost"
                                size="sm"
                                aria-label={`Remove ${line.label}`}
                                onClick={() => {
                                  setRemoved(new Set(removed).add(line.id));
                                }}
                              >
                                <DeleteIcon
                                  className={`${ICON_SIZE.inline} text-danger`}
                                  aria-hidden
                                />
                              </Button>
                            )}
                          </td>
                        </tr>
                      );
                    })}

                    {pending.map((entry) => {
                      const typed = rupeesToMinor(entry.amount);
                      const value = typed ?? amountFor(entry.feeHeadId);
                      return (
                        <tr key={entry.key} className="border-t border-border bg-success/5">
                          <td className="px-3 py-2">
                            {entry.name}
                            <StatusBadge tone="success" className="ms-2">
                              Adding
                            </StatusBadge>
                            {typed === undefined ? (
                              <span className="block text-xs text-muted-foreground">
                                at this family’s agreed rate
                              </span>
                            ) : null}
                          </td>
                          <td className="px-3 py-2 text-end font-mono tabular-nums">
                            {value === undefined ? '—' : <Money valueMinor={value} />}
                          </td>
                          <td className="px-3 py-2 text-end">
                            <Button
                              tone="ghost"
                              size="sm"
                              aria-label={`Do not add ${entry.name}`}
                              onClick={() => {
                                setPending(pending.filter((other) => other.key !== entry.key));
                              }}
                            >
                              <DeleteIcon
                                className={`${ICON_SIZE.inline} text-danger`}
                                aria-hidden
                              />
                            </Button>
                          </td>
                        </tr>
                      );
                    })}

                    {/* Arrears, waivers and late fees are shown because they are
                        part of what is owed, and greyed because none of them is
                        editable here — each records a decision of its own. */}
                    {otherLines.map((line) => (
                      <tr key={line.id} className="border-t border-border text-muted-foreground">
                        <td className="px-3 py-2">{line.label}</td>
                        <td className="px-3 py-2 text-end font-mono tabular-nums">
                          <Money valueMinor={line.amountMinor} />
                        </td>
                        <td className="px-3 py-2" />
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="border-t-2 border-border bg-muted/30 font-medium">
                      <td className="px-3 py-2">Total payable</td>
                      <td className="px-3 py-2 text-end font-mono tabular-nums">
                        <Money valueMinor={projectedMinor} />
                        {hasLineChanges ? (
                          <span className="block text-xs font-normal text-muted-foreground">
                            was <Money valueMinor={detail.netPayableMinor} withSymbol={false} />
                          </span>
                        ) : null}
                      </td>
                      <td className="px-3 py-2" />
                    </tr>
                  </tfoot>
                </table>
              </div>

              {canEditLines ? (
                <div className="flex flex-wrap items-end gap-3 rounded-xl border border-dashed border-border p-3">
                  <Field label="Add a fee" className="min-w-48 flex-1">
                    <SimpleSelect
                      value={headToAdd}
                      emptyOption={{ value: '', label: 'Choose a fee…' }}
                      options={addableHeads.map((head) => ({ value: head.id, label: head.name }))}
                      onValueChange={setHeadToAdd}
                    />
                  </Field>
                  <Field label="Amount" hint="Blank uses the agreed rate" className="w-40">
                    <Input
                      inputMode="decimal"
                      value={amountToAdd}
                      placeholder={headToAdd === '' ? '' : formatPlain(amountFor(headToAdd))}
                      onChange={(event) => {
                        setAmountToAdd(event.target.value);
                      }}
                    />
                  </Field>
                  <Button tone="outline" disabled={headToAdd === ''} onClick={stageHead}>
                    <CreateIcon className={ICON_SIZE.inline} aria-hidden />
                    Add
                  </Button>
                </div>
              ) : null}
            </>
          )}
        </DialogBody>

        <DialogFooter>
          <Button tone="ghost" disabled={isSaving} onClick={onClose}>
            Cancel
          </Button>
          <Button
            disabled={isSaving || !isDirty || datesOutOfOrder || detail === undefined}
            onClick={() => {
              void save();
            }}
          >
            {isSaving ? (
              <SpinnerIcon className={`${ICON_SIZE.inline} animate-spin`} aria-hidden />
            ) : null}
            Update voucher
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** A placeholder figure for the amount box. Plain digits, not a formatted total. */
function formatPlain(minor: number | undefined): string {
  if (minor === undefined) {
    return '';
  }
  const paisa = minor % 100;
  return paisa === 0
    ? String(Math.trunc(minor / 100))
    : `${String(Math.trunc(minor / 100))}.${String(paisa).padStart(2, '0')}`;
}
