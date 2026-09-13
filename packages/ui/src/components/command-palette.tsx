'use client';

import * as DialogPrimitive from '@radix-ui/react-dialog';
import { Command as CommandPrimitive } from 'cmdk';
import type { ComponentProps, ReactNode } from 'react';

import { SearchIcon, SpinnerIcon } from '../icons';
import { cn } from '../lib/cn';

/**
 * The command palette.
 *
 * docs/16 §2 locks this to `cmdk`, and §13 asks for `⌘K` by name. What cmdk
 * brings is the part that is tedious to get right and invisible when it is:
 * the listbox semantics, arrow keys that skip group headings, a selection that
 * survives the list changing under it, and scrolling the highlighted item into
 * view. Rebuilding that on a plain input is how a palette ends up almost
 * keyboard-operable.
 *
 * ## Presentation only
 *
 * Nothing here knows what a student or a voucher is, or that this product has
 * pages. It renders groups of items and reports which one was chosen (§4.6:
 * `@ilm/ui` may not import `@ilm/contracts`, fetch anything, or read global
 * state). The palette that knows about the product lives in the portal.
 *
 * ## Filtering is the caller's job
 *
 * cmdk's own fuzzy filter is switched off. Half of what this searches comes
 * from the server, already matched, and a client-side filter running a second
 * time over those results would hide rows the server just said were relevant —
 * the classic "I searched for it and it disappeared as I typed".
 */

export interface CommandPaletteProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly value: string;
  readonly onValueChange: (value: string) => void;
  readonly placeholder?: string;
  /** Announced to screen readers when the dialog opens. */
  readonly label?: string;
  /** True while results are on their way; shown without blanking the list. */
  readonly isLoading?: boolean;
  readonly children: ReactNode;
  /**
   * The hint strip along the bottom.
   *
   * Its own slot rather than part of `children`, because children are rendered
   * inside cmdk's scrolling list — a footer there scrolls away with the results,
   * which is the opposite of what a persistent key hint is for, and it would
   * also sit inside the listbox as a row screen readers have to step over.
   */
  readonly footer?: ReactNode;
}

export function CommandPalette({
  open,
  onOpenChange,
  value,
  onValueChange,
  placeholder = 'Search…',
  label = 'Search',
  isLoading = false,
  children,
  footer,
}: CommandPaletteProps) {
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:animate-in data-[state=open]:fade-in-0" />

        <DialogPrimitive.Content
          // Seated above centre rather than in the middle of the screen. A
          // palette drops from the top; centring it means the list grows
          // downward from a box that is already halfway down, and on a laptop
          // the last results fall off the bottom.
          className={cn(
            'fixed start-1/2 top-[12vh] z-50 w-[calc(100vw-2rem)] max-w-xl -translate-x-1/2',
            'overflow-hidden rounded-xl border border-border bg-card shadow-overlay',
            'data-[state=closed]:animate-out data-[state=open]:animate-in',
            'data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0',
            'data-[state=open]:slide-in-from-bottom-4',
          )}
        >
          {/* Radix requires a title on every dialog; this one is visually the
              search field itself, so the title is for screen readers only. */}
          <DialogPrimitive.Title className="sr-only">{label}</DialogPrimitive.Title>
          <DialogPrimitive.Description className="sr-only">
            Type to search. Use the arrow keys to move, Enter to open, Escape to close.
          </DialogPrimitive.Description>

          <CommandPrimitive
            // The caller has already filtered. See the note above.
            shouldFilter={false}
            // The palette's own loop is confined to its list, and closing is
            // Radix's job — so Escape is left to bubble.
            loop
            className="flex w-full flex-col"
          >
            <div className="flex items-center gap-3 border-b border-border px-4">
              {isLoading ? (
                <SpinnerIcon
                  className="size-4 shrink-0 animate-spin text-muted-foreground"
                  aria-hidden="true"
                />
              ) : (
                <SearchIcon className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
              )}
              <CommandPrimitive.Input
                value={value}
                onValueChange={onValueChange}
                placeholder={placeholder}
                className="h-14 w-full bg-transparent text-base text-foreground outline-none placeholder:text-muted-foreground"
              />
            </div>

            <CommandPrimitive.List className="max-h-[min(60vh,26rem)] overflow-y-auto overscroll-contain p-2">
              {children}
            </CommandPrimitive.List>

            {footer}
          </CommandPrimitive>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

/** Shown when nothing matched. Its own component so the copy is the caller's. */
export function CommandEmpty({
  className,
  ...props
}: ComponentProps<typeof CommandPrimitive.Empty>) {
  return (
    <CommandPrimitive.Empty
      className={cn('px-3 py-10 text-center text-sm text-muted-foreground', className)}
      {...props}
    />
  );
}

export function CommandGroup({
  className,
  ...props
}: ComponentProps<typeof CommandPrimitive.Group>) {
  return (
    <CommandPrimitive.Group
      className={cn(
        'overflow-hidden p-1 text-foreground',
        // The heading is cmdk's own element, styled through it rather than
        // wrapped, so the group stays one accessible unit.
        '[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:pt-2 [&_[cmdk-group-heading]]:pb-1.5',
        '[&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:font-medium',
        '[&_[cmdk-group-heading]]:text-muted-foreground',
        className,
      )}
      {...props}
    />
  );
}

/**
 * One row.
 *
 * Highlighted through `data-[selected=true]` rather than `:hover`, because the
 * keyboard and the mouse have to agree: arrowing onto a row and pointing at it
 * must look identical, or the palette has two cursors.
 */
export function CommandItem({ className, ...props }: ComponentProps<typeof CommandPrimitive.Item>) {
  return (
    <CommandPrimitive.Item
      className={cn(
        'relative flex cursor-pointer items-center gap-3 rounded-md px-2 py-2 text-sm',
        'outline-none select-none',
        'data-[selected=true]:bg-primary/10 data-[selected=true]:text-foreground',
        'data-[disabled=true]:pointer-events-none data-[disabled=true]:opacity-50',
        className,
      )}
      {...props}
    />
  );
}

/** The hint strip along the bottom: what the keys do. */
export function CommandFooter({ children }: { children: ReactNode }) {
  return (
    <div className="flex items-center gap-4 border-t border-border bg-muted/30 px-4 py-2.5 text-xs text-muted-foreground">
      {children}
    </div>
  );
}

/** A key, drawn as one. */
export function CommandKey({ children }: { children: ReactNode }) {
  return (
    <kbd className="rounded border border-border bg-card px-1.5 py-0.5 font-mono text-[0.6875rem] text-muted-foreground">
      {children}
    </kbd>
  );
}
