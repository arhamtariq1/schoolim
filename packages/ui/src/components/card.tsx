import type { ComponentProps } from 'react';

import { cn } from '../lib/cn';

/** Card surface — white ground, hairline border, very light elevation. */
export const cardSurfaceClassName =
  'rounded-xl border border-border/70 bg-card text-card-foreground shadow-xs';

/**
 * The surface everything sits on.
 *
 * Before this existed, every screen wrote its own
 * `rounded-xl border border-border bg-card p-4` and they drifted — some had
 * `p-4`, some `p-6`, some a shadow, some not. One card component is the
 * difference between a product and a set of pages.
 *
 * Elevation is the `shadow-raised` token only — never a raw Tailwind shadow.
 */
export function Card({ className, ...props }: ComponentProps<'div'>) {
  return <div className={cn(cardSurfaceClassName, className)} {...props} />;
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
