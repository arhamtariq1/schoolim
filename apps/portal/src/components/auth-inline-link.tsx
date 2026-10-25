import { cn } from '@ilm/ui';
import Link from 'next/link';
import type { ComponentProps, ReactNode } from 'react';

export const authInlineLinkClass =
  'font-medium text-primary hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none';

export function AuthInlineLink({
  className,
  ...props
}: ComponentProps<typeof Link>) {
  return <Link className={cn(authInlineLinkClass, className)} {...props} />;
}

/** Forgot password (left) and create account (right), above the primary button. */
export function AuthSecondaryNav({
  left,
  right,
}: {
  readonly left: ReactNode;
  readonly right?: ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-4 text-sm">
      <div className="min-w-0">{left}</div>
      {right === undefined || right === null ? null : (
        <div className="min-w-0 text-end">{right}</div>
      )}
    </div>
  );
}
