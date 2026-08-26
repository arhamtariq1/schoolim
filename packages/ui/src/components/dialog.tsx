'use client';

import * as DialogPrimitive from '@radix-ui/react-dialog';
import { type ComponentProps } from 'react';

import { CloseIcon } from '../icons';
import { cn } from '../lib/cn';

/**
 * The modal dialog.
 *
 * Radix rather than a hand-rolled overlay, because the parts that are easy to
 * forget are the parts that matter: focus is trapped inside and returned to the
 * trigger on close, the page behind is inert to a screen reader, Escape closes,
 * the scrollbar is compensated so the page does not shift, and the title is
 * wired to `aria-labelledby` automatically.
 *
 * **Forms live in dialogs; destructive confirmations do not.** A confirmation
 * uses `ConfirmDialog`, which is `AlertDialog` underneath — it takes focus more
 * insistently and cannot be dismissed by clicking away, because an accidental
 * outside click must never be how a record is deleted.
 */

export const Dialog = DialogPrimitive.Root;
export const DialogTrigger = DialogPrimitive.Trigger;
export const DialogClose = DialogPrimitive.Close;

function DialogOverlay({ className, ...props }: ComponentProps<typeof DialogPrimitive.Overlay>) {
  return (
    <DialogPrimitive.Overlay
      className={cn(
        'fixed inset-0 z-50 bg-black/50',
        'data-[state=open]:animate-in data-[state=open]:fade-in-0',
        'data-[state=closed]:animate-out data-[state=closed]:fade-out-0',
        className,
      )}
      {...props}
    />
  );
}

export interface DialogContentProps extends ComponentProps<typeof DialogPrimitive.Content> {
  /** Hides the corner close button, for a dialog that must be resolved. */
  readonly hideClose?: boolean;
}

export function DialogContent({
  className,
  children,
  hideClose = false,
  ...props
}: DialogContentProps) {
  return (
    <DialogPrimitive.Portal>
      <DialogOverlay />
      <DialogPrimitive.Content
        className={cn(
          'fixed start-1/2 top-1/2 z-50 w-full max-w-lg -translate-x-1/2 -translate-y-1/2',
          'rounded-lg border border-border bg-background shadow-lg',
          // A long form must scroll inside the dialog, never take the page with
          // it, and never push its own footer off the bottom of a laptop.
          'flex max-h-[calc(100dvh-2rem)] flex-col',
          'data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95',
          'data-[state=closed]:animate-out data-[state=closed]:fade-out-0',
          className,
        )}
        {...props}
      >
        {children}

        {hideClose ? null : (
          <DialogPrimitive.Close
            className={cn(
              'absolute end-3 top-3 rounded-md p-1 text-muted-foreground',
              'transition-colors hover:bg-muted hover:text-foreground',
              'focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
            )}
          >
            <CloseIcon className="size-4" aria-hidden="true" />
            <span className="sr-only">Close</span>
          </DialogPrimitive.Close>
        )}
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  );
}

export function DialogHeader({ className, ...props }: ComponentProps<'div'>) {
  return (
    <div className={cn('shrink-0 space-y-1 border-b border-border p-5', className)} {...props} />
  );
}

/** The scrolling middle. A form belongs here, not in the header or footer. */
export function DialogBody({ className, ...props }: ComponentProps<'div'>) {
  return <div className={cn('min-h-0 flex-1 overflow-y-auto p-5', className)} {...props} />;
}

export function DialogFooter({ className, ...props }: ComponentProps<'div'>) {
  return (
    <div
      className={cn(
        // Reversed on mobile so the primary action sits under the thumb.
        'flex shrink-0 flex-col-reverse gap-2 border-t border-border p-5 sm:flex-row sm:justify-end',
        className,
      )}
      {...props}
    />
  );
}

export function DialogTitle({ className, ...props }: ComponentProps<typeof DialogPrimitive.Title>) {
  return (
    <DialogPrimitive.Title
      className={cn('pe-8 text-base font-semibold text-balance', className)}
      {...props}
    />
  );
}

export function DialogDescription({
  className,
  ...props
}: ComponentProps<typeof DialogPrimitive.Description>) {
  return (
    <DialogPrimitive.Description
      className={cn('text-sm text-muted-foreground', className)}
      {...props}
    />
  );
}
