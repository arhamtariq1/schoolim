'use client';

import * as SelectPrimitive from '@radix-ui/react-select';
import { type ComponentProps, type ReactNode } from 'react';

import { ApproveIcon, ChevronDownIcon, ChevronLeftIcon, ChevronRightIcon } from '../icons';
import { cn } from '../lib/cn';

/**
 * The select.
 *
 * A native `<select>` was here first and it was wrong: the browser paints its
 * own list from the OS, so it ignores every token in the theme, cannot be
 * styled to match anything around it, and looks like a different product on
 * Windows, macOS and Android. CLAUDE.md says Radix, and this is exactly the
 * component that rule exists for.
 *
 * What the primitive buys beyond appearance, none of which is free to rebuild:
 * type-ahead, arrow-key and Home/End navigation, focus return to the trigger on
 * close, `aria-activedescendant`, correct behaviour inside a dialog, and
 * collision-aware positioning so the list never opens off-screen.
 *
 * A native select still wins on a small phone, where the OS wheel picker is
 * genuinely better than any web list. That is a future `useMediaQuery` branch
 * inside this file — the call sites do not change.
 */

export const Select = SelectPrimitive.Root;
export const SelectGroup = SelectPrimitive.Group;
export const SelectValue = SelectPrimitive.Value;

export function SelectTrigger({
  className,
  children,
  ...props
}: ComponentProps<typeof SelectPrimitive.Trigger>) {
  return (
    <SelectPrimitive.Trigger
      className={cn(
        'flex h-10 w-full items-center justify-between gap-2 rounded-md border border-border',
        'bg-background px-3 text-sm',
        'placeholder:text-muted-foreground',
        'focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
        'disabled:cursor-not-allowed disabled:opacity-50',
        // Set by Field when the value fails validation.
        'aria-[invalid=true]:border-danger',
        '[&>span]:truncate',
        className,
      )}
      {...props}
    >
      {children}
      <SelectPrimitive.Icon asChild>
        <ChevronDownIcon className="size-4 shrink-0 opacity-60" aria-hidden="true" />
      </SelectPrimitive.Icon>
    </SelectPrimitive.Trigger>
  );
}

export function SelectContent({
  className,
  children,
  position = 'popper',
  ...props
}: ComponentProps<typeof SelectPrimitive.Content>) {
  return (
    <SelectPrimitive.Portal>
      <SelectPrimitive.Content
        position={position}
        className={cn(
          'relative z-50 max-h-96 min-w-32 overflow-hidden rounded-md border border-border',
          'bg-popover text-popover-foreground shadow-md',
          'data-[state=open]:animate-in data-[state=closed]:animate-out',
          'data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0',
          position === 'popper' &&
            'data-[side=bottom]:translate-y-1 data-[side=top]:-translate-y-1',
          className,
        )}
        {...props}
      >
        <SelectPrimitive.ScrollUpButton className="flex h-6 items-center justify-center">
          <ChevronLeftIcon className="size-4 rotate-90" aria-hidden="true" />
        </SelectPrimitive.ScrollUpButton>

        <SelectPrimitive.Viewport
          className={cn(
            'p-1',
            // Matches the trigger's width so the list never jumps narrower.
            position === 'popper' && 'w-full min-w-[var(--radix-select-trigger-width)]',
          )}
        >
          {children}
        </SelectPrimitive.Viewport>

        <SelectPrimitive.ScrollDownButton className="flex h-6 items-center justify-center">
          <ChevronRightIcon className="size-4 rotate-90" aria-hidden="true" />
        </SelectPrimitive.ScrollDownButton>
      </SelectPrimitive.Content>
    </SelectPrimitive.Portal>
  );
}

export function SelectItem({
  className,
  children,
  ...props
}: ComponentProps<typeof SelectPrimitive.Item>) {
  return (
    <SelectPrimitive.Item
      className={cn(
        'relative flex w-full cursor-default items-center rounded-sm py-2 ps-2 pe-8 text-sm',
        'outline-none select-none',
        'focus:bg-muted data-[highlighted]:bg-muted',
        'data-[disabled]:pointer-events-none data-[disabled]:opacity-50',
        className,
      )}
      {...props}
    >
      <SelectPrimitive.ItemText>{children}</SelectPrimitive.ItemText>
      <span className="absolute end-2 flex size-4 items-center justify-center">
        <SelectPrimitive.ItemIndicator>
          <ApproveIcon className="size-4" aria-hidden="true" />
        </SelectPrimitive.ItemIndicator>
      </span>
    </SelectPrimitive.Item>
  );
}

export function SelectLabel({ className, ...props }: ComponentProps<typeof SelectPrimitive.Label>) {
  return (
    <SelectPrimitive.Label
      className={cn('px-2 py-1.5 text-xs font-medium text-muted-foreground', className)}
      {...props}
    />
  );
}

export function SelectSeparator({
  className,
  ...props
}: ComponentProps<typeof SelectPrimitive.Separator>) {
  return (
    <SelectPrimitive.Separator className={cn('-mx-1 my-1 h-px bg-border', className)} {...props} />
  );
}

export interface SelectOption {
  readonly value: string;
  readonly label: string;
  readonly disabled?: boolean;
}

export interface SimpleSelectProps {
  readonly value: string;
  readonly onValueChange: (value: string) => void;
  readonly options: readonly SelectOption[];
  readonly placeholder?: string;
  readonly ariaLabel?: string;
  readonly id?: string;
  readonly name?: string;
  readonly disabled?: boolean;
  readonly className?: string;
  readonly 'aria-describedby'?: string;
  readonly 'aria-invalid'?: boolean;
  readonly required?: boolean;
  /** Rendered as the first option; picking it clears the filter. */
  readonly emptyOption?: { value: string; label: string } | undefined;
}

/**
 * The 90% case: a list of options and a value.
 *
 * Most call sites want exactly this and should not have to assemble five
 * primitives to get it — that is how one screen ends up with a select that
 * behaves differently from the rest. The compound parts stay exported for
 * grouped or decorated lists.
 *
 * `''` cannot be a Radix item value (it is how the primitive represents "no
 * selection"), so an "any" option is mapped through a sentinel here rather than
 * every call site discovering that separately.
 */
const ANY = '__any__';

export function SimpleSelect({
  value,
  onValueChange,
  options,
  placeholder,
  ariaLabel,
  emptyOption,
  className,
  disabled,
  ...props
}: SimpleSelectProps): ReactNode {
  return (
    <Select
      value={value === '' && emptyOption !== undefined ? ANY : value}
      onValueChange={(next) => {
        onValueChange(next === ANY ? (emptyOption?.value ?? '') : next);
      }}
      disabled={disabled}
    >
      <SelectTrigger className={className} aria-label={ariaLabel} {...props}>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {emptyOption === undefined ? null : (
          <SelectItem value={ANY}>{emptyOption.label}</SelectItem>
        )}
        {options.map((option) => (
          <SelectItem key={option.value} value={option.value} disabled={option.disabled}>
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
