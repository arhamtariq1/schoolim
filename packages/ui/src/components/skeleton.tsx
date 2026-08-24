import type { ComponentProps } from 'react';

import { cn } from '../lib/cn';

/**
 * docs/16 section 7: loading is a **skeleton matching the real layout**, never
 * a centred spinner. A spinner tells a person nothing about what is coming; a
 * skeleton lets them start reading the page before the data lands, and stops
 * the layout jumping when it does.
 *
 * Animation is opacity only, and it respects `prefers-reduced-motion`
 * (docs/16 section 12).
 */
export function Skeleton({ className, ...props }: ComponentProps<'div'>) {
  return (
    <div
      className={cn('animate-pulse rounded-md bg-muted motion-reduce:animate-none', className)}
      aria-hidden="true"
      {...props}
    />
  );
}

/** A skeleton shaped like a table, for a list that is still loading. */
export function TableSkeleton({ rows = 8, columns = 5 }: { rows?: number; columns?: number }) {
  return (
    <div className="space-y-2" role="status" aria-label="Loading">
      {Array.from({ length: rows }, (_, row) => (
        <div key={row} className="flex gap-3">
          {Array.from({ length: columns }, (_, column) => (
            <Skeleton key={column} className={cn('h-8 flex-1', column === 0 && 'max-w-[3rem]')} />
          ))}
        </div>
      ))}
    </div>
  );
}
