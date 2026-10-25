'use client';

import type { LucideIcon } from 'lucide-react';
import { cloneElement, type ReactElement } from 'react';

import { cn } from '../lib/cn';

export interface InputIconWrapProps {
  /** Leading icon — decorative when the field has a visible label. */
  readonly icon: LucideIcon;
  /** Extra inset for multi-line controls (e.g. textarea). */
  readonly alignTop?: boolean;
  readonly children: ReactElement<{ className?: string; id?: string }>;
}

/**
 * Prefix icon inside text inputs, selects, and date pickers — one pattern for
 * admission forms, filters, and settings screens.
 */
/**
 * An `InputIconWrap` that can sit directly inside a `Field`.
 *
 * `Field` hands `id` and the aria props to its only child. With an icon wrapper
 * in between they would land on the `<div>`, not the input, so they are
 * forwarded on to the control here.
 */
export function FieldIconWrap({
  icon,
  alignTop = false,
  children,
  ...fieldControlProps
}: InputIconWrapProps & Record<string, unknown>) {
  return (
    <InputIconWrap icon={icon} alignTop={alignTop}>
      {cloneElement(children, fieldControlProps)}
    </InputIconWrap>
  );
}

export function InputIconWrap({ icon: Icon, alignTop = false, children }: InputIconWrapProps) {
  return (
    <div className="relative">
      <span
        className={cn(
          'pointer-events-none absolute start-0 flex w-10 justify-center text-muted-foreground',
          alignTop ? 'top-3' : 'inset-y-0 items-center',
        )}
      >
        <Icon className="size-4 shrink-0" aria-hidden="true" />
      </span>
      {cloneElement(children, {
        className: cn('ps-10', children.props.className),
      })}
    </div>
  );
}
