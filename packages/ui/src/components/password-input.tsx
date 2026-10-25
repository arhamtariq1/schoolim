'use client';

import type { LucideIcon } from 'lucide-react';
import { type ComponentProps, useState } from 'react';

import { HidePasswordIcon, ICON_SIZE, ShowPasswordIcon } from '../icons';
import { cn } from '../lib/cn';

import { Input } from './input';
import { Hint, TooltipProvider } from './tooltip';

/**
 * Password field with a show/hide control.
 *
 * Same surface as `<Input>` so it drops into `<Field>` unchanged — `id`,
 * `aria-*` and `required` land on the real input, not the wrapper. The toggle
 * is icon-only, so it carries both an `aria-label` and a tooltip (docs/16 §3).
 *
 * Carries its own `TooltipProvider` because auth screens sit outside the app
 * shell that normally provides one.
 */
export type PasswordInputProps = Omit<ComponentProps<'input'>, 'type'> & {
  /** Inset leading icon — use with `<Field leadingIcon={…}>`, not `InputIconWrap`. */
  readonly leadingIcon?: LucideIcon | false;
};

export function PasswordInput({
  className,
  disabled,
  leadingIcon,
  ...props
}: PasswordInputProps) {
  const [visible, setVisible] = useState(false);
  const label = visible ? 'Hide password' : 'Show password';
  const LeadingIcon = leadingIcon === false ? undefined : leadingIcon;

  return (
    <div className="relative">
      {LeadingIcon === undefined ? null : (
        <span
          className="pointer-events-none absolute start-0 top-0 flex h-10 w-10 items-center justify-center text-muted-foreground"
          aria-hidden="true"
        >
          <LeadingIcon className="size-4 shrink-0" />
        </span>
      )}
      <Input
        type={visible ? 'text' : 'password'}
        disabled={disabled}
        className={cn(LeadingIcon !== undefined && 'ps-10', 'pe-10', className)}
        {...props}
      />
      <TooltipProvider delayDuration={400}>
        <Hint label={label}>
          <button
            type="button"
            disabled={disabled}
            aria-label={label}
            aria-pressed={visible}
            className={cn(
              'absolute end-1 top-1/2 inline-flex size-8 -translate-y-1/2 items-center justify-center',
              'rounded-md text-muted-foreground transition-colors',
              'hover:bg-muted hover:text-foreground',
              'focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
              'disabled:pointer-events-none disabled:opacity-50',
            )}
            onClick={() => {
              setVisible((current) => !current);
            }}
          >
            {visible ? (
              <HidePasswordIcon className={ICON_SIZE.inline} aria-hidden="true" />
            ) : (
              <ShowPasswordIcon className={ICON_SIZE.inline} aria-hidden="true" />
            )}
          </button>
        </Hint>
      </TooltipProvider>
    </div>
  );
}

PasswordInput.displayName = 'PasswordInput';
