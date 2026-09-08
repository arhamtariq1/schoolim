'use client';

import * as CheckboxPrimitive from '@radix-ui/react-checkbox';
import type { ComponentProps } from 'react';

import { ApproveIcon } from '../icons';
import { cn } from '../lib/cn';

/**
 * The checkbox.
 *
 * A bare `<input type="checkbox">` is painted by the OS: it ignores every token
 * in the theme, cannot show an indeterminate state that looks like anything,
 * and is a different size and colour on Windows, macOS and Android. The Radix
 * primitive keeps the real input semantics — label association, form
 * participation, `Space` to toggle — and lets the tick be ours.
 *
 * `checked="indeterminate"` is what a table's select-all header uses when only
 * some rows on the page are picked.
 */
export function Checkbox({ className, ...props }: ComponentProps<typeof CheckboxPrimitive.Root>) {
  return (
    <CheckboxPrimitive.Root
      className={cn(
        'peer size-4 shrink-0 rounded border border-input bg-background transition-colors',
        'focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background focus-visible:outline-none',
        'disabled:cursor-not-allowed disabled:opacity-50',
        'data-[state=checked]:border-primary data-[state=checked]:bg-primary data-[state=checked]:text-primary-foreground',
        'data-[state=indeterminate]:border-primary data-[state=indeterminate]:bg-primary data-[state=indeterminate]:text-primary-foreground',
        'aria-[invalid=true]:border-danger',
        className,
      )}
      {...props}
    >
      <CheckboxPrimitive.Indicator className="flex items-center justify-center text-current">
        {props.checked === 'indeterminate' ? (
          <span className="h-0.5 w-2.5 rounded-full bg-current" aria-hidden="true" />
        ) : (
          <ApproveIcon className="size-4" aria-hidden="true" />
        )}
      </CheckboxPrimitive.Indicator>
    </CheckboxPrimitive.Root>
  );
}

export interface CheckboxFieldProps
  extends Omit<ComponentProps<typeof CheckboxPrimitive.Root>, 'children'> {
  label: string;
  hint?: string | undefined;
}

/**
 * A checkbox with its label, wired.
 *
 * The whole row is the hit target, which matters on a phone: docs/16 §5 asks
 * for 44px, and a bare 18px box is a quarter of that.
 */
export function CheckboxField({ label, hint, className, id, ...props }: CheckboxFieldProps) {
  const inputId = id ?? `cb-${label.replace(/\W+/g, '-').toLowerCase()}`;
  const hintId = `${inputId}-hint`;

  return (
    <div className={cn('flex items-start gap-2.5 py-1.5', className)}>
      <Checkbox
        id={inputId}
        className="mt-0.5"
        {...(hint === undefined ? {} : { 'aria-describedby': hintId })}
        {...props}
      />
      <div className="min-w-0">
        <label
          htmlFor={inputId}
          className="cursor-pointer text-sm leading-tight font-medium text-foreground select-none"
        >
          {label}
        </label>
        {hint === undefined ? null : (
          <p id={hintId} className="mt-0.5 text-xs text-muted-foreground">
            {hint}
          </p>
        )}
      </div>
    </div>
  );
}
