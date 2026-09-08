import type { ComponentProps } from 'react';

import { cn } from '../lib/cn';

/**
 * Multi-line text.
 *
 * `field-sizing-content` lets the box grow with what is typed without a resize
 * observer or a hidden mirror element — a note about why a fee was waived
 * should not be read through a three-line letterbox. Browsers that do not
 * support it fall back to the `min-h`, which is the old behaviour and fine.
 */
export function Textarea({ className, rows = 3, ...props }: ComponentProps<'textarea'>) {
  return (
    <textarea
      rows={rows}
      className={cn(
        'flex min-h-20 w-full rounded-md border border-input bg-background px-3 py-2 text-base',
        'field-sizing-content resize-y',
        'placeholder:text-muted-foreground',
        'focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
        'disabled:cursor-not-allowed disabled:opacity-50',
        'aria-[invalid=true]:border-danger aria-[invalid=true]:focus-visible:ring-danger',
        className,
      )}
      {...props}
    />
  );
}
