'use client';

import { cn } from '@ilm/ui';
import { SuccessIcon, ICON_SIZE } from '@ilm/ui/icons';

/**
 * Live password rule checklist — mirrors `passwordSchema` in `@ilm/contracts`
 * without duplicating validation logic on submit.
 */
const RULES = [
  {
    id: 'length',
    label: 'Minimum 8 characters',
    test: (value: string) => value.length >= 8,
  },
  {
    id: 'upper',
    label: 'Uppercase letter',
    test: (value: string) => /[A-Z]/.test(value),
  },
  {
    id: 'lower',
    label: 'Lowercase letter',
    test: (value: string) => /[a-z]/.test(value),
  },
  {
    id: 'number',
    label: 'Number',
    test: (value: string) => /[0-9]/.test(value),
  },
  {
    id: 'special',
    label: 'Special character',
    test: (value: string) => /[^A-Za-z0-9]/.test(value),
  },
] as const;

export function PasswordRequirements({
  password,
  className,
  dense = false,
}: {
  readonly password: string;
  readonly className?: string;
  /** Tighter layout for sign-up so the form stays within one viewport. */
  readonly dense?: boolean;
}) {
  if (password.length === 0) {
    return null;
  }

  return (
    <ul
      className={cn(
        'grid gap-1 rounded-md border border-border bg-muted/30 px-3 py-2',
        dense && 'sm:grid-cols-2 sm:gap-x-4 sm:gap-y-1',
        className,
      )}
      aria-live="polite"
    >
      {RULES.map((rule) => {
        const met = rule.test(password);
        return (
          <li key={rule.id} className="flex items-center gap-2 text-xs">
            {met ? (
              <SuccessIcon
                className={cn(ICON_SIZE.inline, 'shrink-0 text-success')}
                aria-hidden="true"
              />
            ) : (
              <span
                className={cn(ICON_SIZE.inline, 'shrink-0 rounded-full border border-muted-foreground/50')}
                aria-hidden="true"
              />
            )}
            <span className={met ? 'text-foreground' : 'text-muted-foreground'}>{rule.label}</span>
          </li>
        );
      })}
    </ul>
  );
}
