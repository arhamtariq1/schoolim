import type { ComponentProps } from 'react';

import { cn } from '../lib/cn';

/**
 * The surface everything sits on.
 *
 * Before this existed, every screen wrote its own
 * `rounded-xl border border-border bg-card p-4` and they drifted — some had
 * `p-4`, some `p-6`, some a shadow, some not. One card component is the
 * difference between a product and a set of pages.
 *
 * Elevation is a token (`shadow-raised`), never a Tailwind palette shadow, so
 * dark mode gets a border-led treatment instead of a black blur that is
 * invisible on a dark ground.
 */
export function Card({ className, ...props }: ComponentProps<'div'>) {
  return (
    <div
      className={cn(
        'rounded-xl border border-border bg-card text-card-foreground shadow-raised',
        className,
      )}
      {...props}
    />
  );
}

export function CardHeader({ className, ...props }: ComponentProps<'div'>) {
  return (
    <div
      className={cn('flex flex-col gap-1 border-b border-border px-4 py-3 sm:px-6', className)}
      {...props}
    />
  );
}

export function CardTitle({ className, ...props }: ComponentProps<'h2'>) {
  return (
    <h2
      className={cn('text-sm font-semibold tracking-tight text-foreground', className)}
      {...props}
    />
  );
}

export function CardDescription({ className, ...props }: ComponentProps<'p'>) {
  return <p className={cn('text-xs text-muted-foreground', className)} {...props} />;
}

export function CardContent({ className, ...props }: ComponentProps<'div'>) {
  return <div className={cn('px-4 py-4 sm:px-6', className)} {...props} />;
}

export function CardFooter({
  className,
  ...props
}: ComponentProps<'div'>) {
  return (
    <div
      className={cn(
        'flex items-center gap-2 border-t border-border bg-muted/30 px-4 py-3 sm:px-6',
        className,
      )}
      {...props}
    />
  );
}
