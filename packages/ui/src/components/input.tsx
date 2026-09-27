import type { ComponentProps } from 'react';

import { cn } from '../lib/cn';

/**
 * docs/16 §8: every input has a `<Label>` with `htmlFor`, and errors are linked
 * with `aria-describedby`. `<Field>` below wires all three so a call site
 * cannot forget one.
 */
export function Input({ className, ...props }: ComponentProps<'input'>) {
  return (
    <input
      className={cn(
        'flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-base',
        // Explicit opacity — some browsers wash muted placeholders out against
        // a white field until they are effectively invisible.
        'placeholder:text-muted-foreground/80 placeholder:opacity-100',
        'focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
        'disabled:cursor-not-allowed disabled:opacity-50',
        'aria-[invalid=true]:border-danger aria-[invalid=true]:focus-visible:ring-danger',
        className,
      )}
      {...props}
    />
  );
}

export function Label({ className, ...props }: ComponentProps<'label'>) {
  return (
    <label
      className={cn('text-sm leading-none font-medium text-foreground', className)}
      {...props}
    />
  );
}
