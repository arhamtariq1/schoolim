'use client';

import * as PopoverPrimitive from '@radix-ui/react-popover';
import type { ComponentProps } from 'react';

import { cn } from '../lib/cn';

/**
 * The floating panel primitive.
 *
 * Everything that hangs off a trigger and is not a menu or a select lands here:
 * the date picker's calendar, a column-visibility list, a filter panel. Radix
 * handles the parts that are tedious and easy to get subtly wrong — collision
 * detection so the panel never opens off the bottom of a phone, focus trapping,
 * `Esc` to close, and focus returning to the trigger afterwards.
 */

export const Popover = PopoverPrimitive.Root;
export const PopoverTrigger = PopoverPrimitive.Trigger;
export const PopoverAnchor = PopoverPrimitive.Anchor;

export function PopoverContent({
  className,
  align = 'start',
  sideOffset = 6,
  ...props
}: ComponentProps<typeof PopoverPrimitive.Content>) {
  return (
    <PopoverPrimitive.Portal>
      <PopoverPrimitive.Content
        align={align}
        sideOffset={sideOffset}
        className={cn(
          'z-50 w-auto rounded-xl border border-border bg-popover p-3 text-popover-foreground shadow-overlay',
          'origin-[var(--radix-popover-content-transform-origin)]',
          'data-[state=open]:animate-in data-[state=closed]:animate-out',
          'data-[state=open]:fade-in-0 data-[state=closed]:fade-out-0',
          'data-[state=open]:zoom-in-95 data-[state=closed]:zoom-out-95',
          className,
        )}
        {...props}
      />
    </PopoverPrimitive.Portal>
  );
}
