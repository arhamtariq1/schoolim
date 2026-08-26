'use client';

import * as AlertDialogPrimitive from '@radix-ui/react-alert-dialog';
import { useState, type ComponentProps, type ReactNode } from 'react';

import { DangerIcon } from '../icons';
import { cn } from '../lib/cn';

import { buttonVariants } from './button';

/**
 * "Are you sure?", done properly.
 *
 * `AlertDialog`, not `Dialog`. The difference is the whole point: an alert
 * dialog cannot be dismissed by clicking outside it, and focus lands on the
 * *cancel* action rather than the confirm. An accidental outside click or a
 * stray Enter must never be how a student is struck off the register.
 *
 * ## The rules this component enforces so no call site has to remember them
 *
 * - **Say what will happen, not "are you sure".** The description names the
 *   record and the consequence, because a dialog that says "Are you sure?" is
 *   read as noise and clicked through within a week.
 * - **The confirm button says the verb.** "Delete" or "Strike off", never "OK".
 *   Someone skimming reads only the button.
 * - **Pending state is built in.** The action cannot be double-fired, and the
 *   dialog does not close until it resolves — closing early is how a failure
 *   goes unnoticed.
 * - **An error keeps the dialog open** and shows it inline. Closing on failure
 *   leaves the person believing it worked.
 *
 * For an action that cannot be undone and destroys real data, use
 * `requireTyping` — the operator types the record's name. It is deliberately
 * annoying, and reserved for things that genuinely warrant it.
 */

export const AlertDialog = AlertDialogPrimitive.Root;
export const AlertDialogTrigger = AlertDialogPrimitive.Trigger;

export interface ConfirmDialogProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly title: string;
  /** What will happen, in plain words. Names the record and the consequence. */
  readonly description: ReactNode;
  /** The verb. "Delete", "Strike off", "Cancel voucher" — never "OK". */
  readonly confirmLabel: string;
  readonly cancelLabel?: string;
  readonly tone?: 'danger' | 'primary';
  /**
   * Resolve to run and close. Throw to keep the dialog open with the message
   * shown — a confirmation that closes on failure is worse than none.
   */
  readonly onConfirm: () => Promise<void> | void;
  /** Requires this exact text to be typed. For irreversible destruction only. */
  readonly requireTyping?: string | undefined;
}

export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  cancelLabel = 'Cancel',
  tone = 'danger',
  onConfirm,
  requireTyping,
}: ConfirmDialogProps) {
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);
  const [typed, setTyped] = useState('');

  const typingSatisfied = requireTyping === undefined || typed.trim() === requireTyping;

  async function confirm() {
    setError(undefined);
    setIsPending(true);
    try {
      await onConfirm();
      onOpenChange(false);
      setTyped('');
    } catch (thrown) {
      setError(thrown instanceof Error ? thrown.message : 'That did not work. Try again.');
    } finally {
      setIsPending(false);
    }
  }

  return (
    <AlertDialogPrimitive.Root
      open={open}
      onOpenChange={(next) => {
        // While the action is running, the dialog is not dismissable: closing
        // it would hide whether the thing actually happened.
        if (isPending) {
          return;
        }
        if (!next) {
          setError(undefined);
          setTyped('');
        }
        onOpenChange(next);
      }}
    >
      <AlertDialogPrimitive.Portal>
        <AlertDialogPrimitive.Overlay
          className={cn(
            'fixed inset-0 z-50 bg-black/50',
            'data-[state=open]:animate-in data-[state=open]:fade-in-0',
            'data-[state=closed]:animate-out data-[state=closed]:fade-out-0',
          )}
        />
        <AlertDialogPrimitive.Content
          className={cn(
            'fixed start-1/2 top-1/2 z-50 w-full max-w-md -translate-x-1/2 -translate-y-1/2',
            'rounded-lg border border-border bg-background p-5 shadow-lg',
            'data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95',
            'data-[state=closed]:animate-out data-[state=closed]:fade-out-0',
          )}
        >
          <div className="flex gap-3">
            {tone === 'danger' ? (
              <DangerIcon className="mt-0.5 size-6 shrink-0 text-danger" aria-hidden="true" />
            ) : null}

            <div className="min-w-0 flex-1 space-y-2">
              <AlertDialogPrimitive.Title className="text-base font-semibold text-balance">
                {title}
              </AlertDialogPrimitive.Title>
              <AlertDialogPrimitive.Description asChild>
                <div className="text-sm text-muted-foreground">{description}</div>
              </AlertDialogPrimitive.Description>
            </div>
          </div>

          {requireTyping === undefined ? null : (
            <div className="mt-4 space-y-1.5">
              <label htmlFor="confirm-typing" className="block text-sm">
                Type <span className="font-mono font-medium text-foreground">{requireTyping}</span>{' '}
                to confirm
              </label>
              <input
                id="confirm-typing"
                value={typed}
                autoComplete="off"
                onChange={(event) => {
                  setTyped(event.target.value);
                }}
                className={cn(
                  'h-10 w-full rounded-md border border-border bg-background px-3 text-sm',
                  'focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
                )}
              />
            </div>
          )}

          {error === undefined ? null : (
            <p
              role="alert"
              className="mt-4 rounded-md border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger"
            >
              {error}
            </p>
          )}

          <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <AlertDialogPrimitive.Cancel
              className={buttonVariants({ tone: 'outline' })}
              disabled={isPending}
            >
              {cancelLabel}
            </AlertDialogPrimitive.Cancel>

            {/* Not `AlertDialogPrimitive.Action`: that closes on click, and the
                dialog must stay open until the request resolves or fails. */}
            <button
              type="button"
              className={buttonVariants({ tone: tone === 'danger' ? 'danger' : 'primary' })}
              disabled={isPending || !typingSatisfied}
              aria-busy={isPending || undefined}
              onClick={() => {
                void confirm();
              }}
            >
              {isPending ? 'Working…' : confirmLabel}
            </button>
          </div>
        </AlertDialogPrimitive.Content>
      </AlertDialogPrimitive.Portal>
    </AlertDialogPrimitive.Root>
  );
}

export type AlertDialogTriggerProps = ComponentProps<typeof AlertDialogPrimitive.Trigger>;
