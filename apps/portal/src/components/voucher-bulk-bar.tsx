'use client';

import {
  BULK_SKIP_REASON_LABELS,
  MAX_BULK_VOUCHERS,
  ROUTES,
  type BulkDeleteResult,
  type BulkSkipReason,
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
  useToast,
} from '@ilm/ui';
import { DeleteIcon, ICON_SIZE, PrintIcon } from '@ilm/ui/icons';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { mutate } from '@/lib/mutate';
import { stashPrintSelection } from '@/lib/print-handoff';

/**
 * What you can do to a selection of vouchers.
 *
 * ## Why printing is the primary action
 *
 * No school prints a challan at a time. They print a class, or a month, hand
 * the stack to a teacher, and the teacher hands them out. The per-row printer
 * icon is the exception — for the parent who lost theirs — and this is the
 * normal path, so it is the filled button.
 *
 * ## Why there is a ceiling, and why it is stated rather than enforced silently
 *
 * A print run is paper: five hundred challans is five hundred sheets and three
 * times that many copies on the page. Past roughly that, a browser spends
 * minutes laying out a document nobody can check before it reaches a printer,
 * and a school with two thousand students is printing by class anyway, because
 * that is how the stack gets handed out.
 *
 * So the cap is the same number as the bulk delete, it is said out loud with
 * the count next to it, and the filter above is the way round it. Quietly
 * printing the first five hundred of a two thousand selection would be the
 * worst of the options: nobody would notice until fifteen hundred children had
 * no challan.
 */

export interface VoucherBulkBarProps {
  readonly selected: ReadonlySet<string>;
  readonly onClear: () => void;
  /** Every voucher behind the current filters, not just this page. */
  readonly matching: number;
  /** Select all rows behind the filters. Absent when there are too many. */
  readonly onSelectAllMatching?: (() => Promise<void>) | undefined;
  readonly canDelete: boolean;
}

export function VoucherBulkBar({
  selected,
  onClear,
  matching,
  onSelectAllMatching,
  canDelete,
}: VoucherBulkBarProps) {
  const router = useRouter();
  const toast = useToast();

  const [confirming, setConfirming] = useState(false);
  const [reason, setReason] = useState('');
  const [isBusy, setIsBusy] = useState(false);

  const count = selected.size;
  if (count === 0) {
    return null;
  }

  const overCap = count > MAX_BULK_VOUCHERS;

  /**
   * More match than can be selected, so there is no honest "select all".
   *
   * Offering it would take the first five hundred by sort order, which is an
   * arbitrary five hundred of two thousand — useless for printing, where the
   * stack has to be a class. So the bar says the limit and points at the
   * filter that makes the selection meaningful.
   */
  const tooManyMatching = matching > MAX_BULK_VOUCHERS && onSelectAllMatching === undefined;

  function print() {
    const token = stashPrintSelection([...selected]);

    if (token === undefined) {
      toast.error(
        'Could not open the print view',
        'This browser is blocking site storage. Allow it for this site, or print from the row menu.',
      );
      return;
    }

    window.open(`/fees/vouchers/print?h=${token}`, '_blank', 'noopener');
  }

  async function remove() {
    setIsBusy(true);
    const result = await mutate<BulkDeleteResult>(ROUTES.vouchers.bulkDelete, 'POST', {
      ids: [...selected],
      reason: reason.trim(),
    });
    setIsBusy(false);
    setConfirming(false);

    if (!result.ok) {
      toast.error(result.message);
      return;
    }

    const { deleted, skipped } = result.data;

    if (skipped.length === 0) {
      toast.success(`${String(deleted)} ${deleted === 1 ? 'voucher' : 'vouchers'} deleted`);
    } else {
      // Named, not counted. "3 could not be deleted" sends somebody hunting;
      // "SEP-0142 had a payment" is the answer they were about to look for.
      toast.warning(
        `${String(deleted)} deleted, ${String(skipped.length)} left alone`,
        summarise(skipped),
      );
    }

    setReason('');
    onClear();
    router.refresh();
  }

  return (
    <>
      <div
        role="status"
        className="sticky bottom-4 z-10 flex flex-wrap items-center gap-3 rounded-xl border border-border bg-card p-3 shadow-overlay"
      >
        {/*
          The header checkbox ticks the page in front of you and nothing else,
          which is the only scope it can honestly have — it cannot tick rows it
          has not loaded. So the bar says what is selected *and* what matches,
          and the difference between the two is where the next control goes.
          Leaving that difference unsaid is what made "does this select twenty
          or five hundred" a question somebody had to ask.
        */}
        <span className="text-sm text-foreground">
          <span className="font-medium">
            {count} selected
          </span>
          {matching > count ? (
            <span className="text-muted-foreground"> of {matching} matching these filters</span>
          ) : null}
        </span>

        {onSelectAllMatching === undefined ? null : (
          <Button
            tone="ghost"
            size="sm"
            onClick={() => {
              void onSelectAllMatching();
            }}
          >
            Select all {matching}
          </Button>
        )}

        {!tooManyMatching ? null : (
          <span className="text-sm text-warning">
            Only {MAX_BULK_VOUCHERS} can be handled at once — filter by class to print a stack.
          </span>
        )}

        <div className="ms-auto flex flex-wrap items-center gap-2">
          <Button size="sm" disabled={overCap} onClick={print}>
            <PrintIcon className={ICON_SIZE.inline} aria-hidden />
            Print {count} {count === 1 ? 'challan' : 'challans'}
          </Button>

          {!canDelete ? null : (
            <Button
              tone="outline"
              size="sm"
              disabled={overCap}
              onClick={() => {
                setConfirming(true);
              }}
            >
              <DeleteIcon className={`${ICON_SIZE.inline} text-danger`} aria-hidden />
              Delete
            </Button>
          )}

          <Button tone="ghost" size="sm" onClick={onClear}>
            Clear
          </Button>
        </div>
      </div>

      {/* A plain Dialog rather than ConfirmDialog, for the reason the
          single-voucher delete already found: that component takes no
          children, and a confirmation whose reason box lives somewhere else is
          a confirmation nobody reads. */}
      <Dialog
        open={confirming}
        onOpenChange={(open) => {
          if (!open) {
            setConfirming(false);
          }
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              Delete {count} {count === 1 ? 'voucher' : 'vouchers'}?
            </DialogTitle>
            <DialogDescription>
              Any that have been paid, or that collected a security deposit, are left where they
              are and named afterwards. The months on the rest become available to bill again.
            </DialogDescription>
          </DialogHeader>
          <DialogBody>
            <Field
              label="Reason"
              required
              hint="Recorded with the action so the change can be explained later."
            >
              <Input
                value={reason}
                autoFocus
                placeholder="Generated for the wrong month"
                onChange={(event) => {
                  setReason(event.target.value);
                }}
              />
            </Field>
          </DialogBody>
          <DialogFooter>
            <Button
              tone="outline"
              onClick={() => {
                setConfirming(false);
              }}
            >
              Cancel
            </Button>
            <Button
              tone="danger"
              isPending={isBusy}
              disabled={reason.trim().length < 3}
              onClick={() => {
                void remove();
              }}
            >
              Delete {count}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

/** "SEP-0142 and 2 others had a payment; SEP-0150 collected a deposit." */
function summarise(skipped: readonly { voucherNo: string | null; reason: BulkSkipReason }[]): string {
  const byReason = new Map<BulkSkipReason, string[]>();
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
      return `${subject}: ${BULK_SKIP_REASON_LABELS[reason].toLowerCase()}`;
    })
    .join('. ');
}
