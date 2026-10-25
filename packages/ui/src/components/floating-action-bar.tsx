'use client';

import type { ReactNode } from 'react';

import { cn } from '../lib/cn';

export interface FloatingActionBarProps {
  /** Primary status text — selection count, unsaved hint, etc. */
  readonly message: ReactNode;
  /** Optional controls beside the message — e.g. select all matching. */
  readonly leadingActions?: ReactNode;
  /** Right-side actions — typically dismiss then primary. */
  readonly actions: ReactNode;
  readonly className?: string;
}

/**
 * Centered pill bar fixed to the viewport bottom — bulk selection, unsaved
 * forms, and other “act on this before you leave” moments.
 */
export function FloatingActionBar({
  message,
  leadingActions,
  actions,
  className,
}: FloatingActionBarProps) {
  return (
    <div
      className={cn(
        'pointer-events-none fixed inset-x-0 bottom-6 z-50 flex justify-center px-4',
        className,
      )}
    >
      <div
        role="status"
        className={cn(
          'pointer-events-auto flex w-full max-w-3xl items-center justify-between gap-4',
          'rounded-full border border-border bg-card px-5 py-2.5 shadow-overlay',
        )}
      >
        <div className="flex min-w-0 flex-1 items-center gap-2.5">
          <span className="size-2 shrink-0 rounded-full bg-primary" aria-hidden />
          <div className="min-w-0 text-sm text-foreground">{message}</div>
          {leadingActions ? (
            <div className="hidden shrink-0 items-center gap-2 sm:flex">{leadingActions}</div>
          ) : null}
        </div>

        <div className="flex shrink-0 items-center gap-2">{actions}</div>
      </div>
    </div>
  );
}
