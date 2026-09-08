'use client';

import * as RadioGroupPrimitive from '@radix-ui/react-radio-group';
import type { ComponentProps, ReactNode } from 'react';

import { cn } from '../lib/cn';

/**
 * One of a few mutually exclusive choices, all visible at once.
 *
 * Use this rather than a `<Select>` when the options are few and the choice
 * changes what the rest of the form looks like — "Student wise / Class wise /
 * All students", where the shape of everything below depends on the answer.
 * Hiding that behind a closed dropdown makes people open it just to find out
 * what their options are.
 */

export const RadioGroup = RadioGroupPrimitive.Root;

export function RadioGroupItem({
  className,
  ...props
}: ComponentProps<typeof RadioGroupPrimitive.Item>) {
  return (
    <RadioGroupPrimitive.Item
      className={cn(
        'aspect-square size-4 shrink-0 rounded-full border border-input text-primary',
        'focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background focus-visible:outline-none',
        'disabled:cursor-not-allowed disabled:opacity-50',
        'data-[state=checked]:border-primary',
        className,
      )}
      {...props}
    >
      <RadioGroupPrimitive.Indicator className="flex items-center justify-center">
        <span className="size-2 rounded-full bg-primary" />
      </RadioGroupPrimitive.Indicator>
    </RadioGroupPrimitive.Item>
  );
}

export interface RadioCardProps extends ComponentProps<typeof RadioGroupPrimitive.Item> {
  label: string;
  description?: string | undefined;
  icon?: ReactNode;
}

/**
 * The choice as a card, for a decision that steers the whole screen.
 *
 * The entire card is the target — a 16px circle is not something anyone hits on
 * a phone on the first try, and docs/16 §5 asks for 44px.
 */
export function RadioCard({ label, description, icon, className, id, ...props }: RadioCardProps) {
  const itemId = id ?? `radio-${String(props.value)}`;

  return (
    <label
      htmlFor={itemId}
      className={cn(
        'group relative flex cursor-pointer items-start gap-3 rounded-xl border border-border bg-card p-4',
        'transition-colors duration-150 hover:border-primary/40 hover:bg-muted/40',
        'has-[button[data-state=checked]]:border-primary has-[button[data-state=checked]]:bg-primary/5',
        'has-[button:focus-visible]:ring-2 has-[button:focus-visible]:ring-ring',
        'has-[button:disabled]:cursor-not-allowed has-[button:disabled]:opacity-50',
        className,
      )}
    >
      <RadioGroupItem id={itemId} className="mt-0.5" {...props} />
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2 text-sm font-medium text-foreground">
          {icon}
          {label}
        </span>
        {description === undefined ? null : (
          <span className="mt-1 block text-xs leading-relaxed text-muted-foreground">
            {description}
          </span>
        )}
      </span>
    </label>
  );
}
