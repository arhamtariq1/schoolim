'use client';

import { type ChangeEvent } from 'react';
import {
  DayPicker,
  type DayPickerProps,
  type DropdownProps,
} from 'react-day-picker';

import { ChevronDownIcon, ChevronLeftIcon, ChevronRightIcon } from '../icons';
import { cn } from '../lib/cn';

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './select';

/**
 * The calendar.
 *
 * This replaces `<input type="date">`, which was never really ours: the browser
 * paints that popup from the operating system, so it ignores every token in the
 * theme, is a different shape on Windows, macOS, Chrome and Safari, and on some
 * of them cannot be opened from the keyboard at all. It also cannot show the
 * one thing this product needs a calendar to show — which days are holidays,
 * which are outside the session, which already have attendance marked.
 *
 * `react-day-picker` is what shadcn/ui's Calendar is built on, so this is the
 * locked library set (docs/16 §2), not a new dependency of our own choosing.
 *
 * Month/year captions use our Radix `Select`, not a native `<select>`. The OS
 * list cannot be height-capped or themed — a hundred birth years becomes a
 * full-screen sheet. The custom list is capped and matches every other select.
 *
 * Every class below is a semantic token. Nothing here is a hex or an arbitrary
 * value, so a school's `primary_color` swap recolours the calendar too.
 */

export type CalendarProps = DayPickerProps & {
  /** Extra classes on the root. */
  className?: string;
};

/**
 * Month/year navigator for `captionLayout="dropdown"`.
 *
 * DayPicker still speaks native-select `onChange` events, so we synthesise one
 * when Radix reports a value. The list is portalled and height-capped — without
 * that a century of birth years paints the whole viewport.
 */
function CalendarCaptionDropdown({
  options,
  value,
  onChange,
  disabled,
  'aria-label': ariaLabel,
}: DropdownProps) {
  function handleValueChange(next: string) {
    if (onChange === undefined) return;
    onChange({
      target: { value: next },
    } as ChangeEvent<HTMLSelectElement>);
  }

  return (
    <Select
      value={value === undefined ? undefined : String(value)}
      onValueChange={handleValueChange}
      disabled={disabled}
    >
      <SelectTrigger
        aria-label={ariaLabel}
        className={cn(
          'h-8 w-auto min-w-0 gap-1 border-input px-2 text-sm font-medium shadow-none',
          'focus:ring-2 focus:ring-ring focus:ring-offset-0',
        )}
      >
        <SelectValue />
      </SelectTrigger>
      <SelectContent
        // ~8 rows. Tall enough to scan, short enough not to cover the form.
        className="max-h-60 min-w-[var(--radix-select-trigger-width)]"
        position="popper"
      >
        {(options ?? []).map((option) => (
          <SelectItem
            key={option.value}
            value={String(option.value)}
            disabled={option.disabled}
          >
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export function Calendar({
  className,
  classNames,
  showOutsideDays = true,
  captionLayout = 'label',
  formatters,
  components,
  ...props
}: CalendarProps) {
  const isDropdown = captionLayout.startsWith('dropdown');

  return (
    <DayPicker
      showOutsideDays={showOutsideDays}
      captionLayout={captionLayout}
      className={cn('w-fit p-3', className)}
      formatters={{
        formatMonthDropdown: (date) => date.toLocaleString('default', { month: 'short' }),
        ...formatters,
      }}
      classNames={{
        months: 'relative flex flex-col gap-4 sm:flex-row',
        month: 'flex w-full flex-col gap-4',
        month_caption: cn(
          'relative flex h-8 w-full items-center justify-center',
          // Room for the absolute prev/next buttons on either side.
          isDropdown ? 'px-8' : 'px-9',
        ),
        caption_label: 'select-none text-sm font-semibold text-foreground',

        nav: 'absolute inset-x-0 top-0 flex h-8 w-full items-center justify-between',
        button_previous: cn(
          'inline-flex size-8 items-center justify-center rounded-md',
          'text-muted-foreground transition-colors hover:bg-muted hover:text-foreground',
          'focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
          'disabled:pointer-events-none disabled:opacity-30',
        ),
        button_next: cn(
          'inline-flex size-8 items-center justify-center rounded-md',
          'text-muted-foreground transition-colors hover:bg-muted hover:text-foreground',
          'focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
          'disabled:pointer-events-none disabled:opacity-30',
        ),

        month_grid: 'w-full border-collapse',
        weekdays: 'flex',
        weekday: 'w-9 text-xs font-medium text-muted-foreground uppercase tracking-wide',
        weeks: '',
        week: 'mt-1 flex w-full',

        day: cn(
          'relative size-9 p-0 text-center text-sm',
          // The range styling. Kept on the cell rather than the button so the
          // highlight is continuous across the week instead of a row of pills.
          '[&:has([data-range-middle])]:bg-primary/10',
          '[&:has([data-range-start])]:rounded-s-md [&:has([data-range-start])]:bg-primary/10',
          '[&:has([data-range-end])]:rounded-e-md [&:has([data-range-end])]:bg-primary/10',
        ),
        day_button: cn(
          'inline-flex size-9 items-center justify-center rounded-md font-normal tabular-nums',
          'transition-colors duration-150',
          'hover:bg-muted hover:text-foreground',
          'focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
          'disabled:pointer-events-none disabled:opacity-30',
          'aria-selected:bg-primary aria-selected:font-semibold aria-selected:text-primary-foreground',
          'aria-selected:hover:bg-primary aria-selected:hover:text-primary-foreground',
          'data-[range-middle]:bg-transparent data-[range-middle]:text-foreground',
        ),

        // A ring rather than a fill, so "today" stays legible when it is also
        // the selected day — a filled-on-filled today is invisible.
        today: '[&>button]:ring-1 [&>button]:ring-primary/50 [&>button]:font-semibold',
        outside: 'text-muted-foreground/40',
        disabled: 'text-muted-foreground/30',
        hidden: 'invisible',

        dropdowns: 'flex h-8 w-full items-center justify-center gap-1.5',
        dropdown_root: 'relative',
        dropdown: '',

        ...classNames,
      }}
      components={{
        Chevron: ({ orientation, className: chevronClassName, ...chevronProps }) => {
          const iconClass = cn('size-4', chevronClassName);
          if (orientation === 'left') {
            return <ChevronLeftIcon className={iconClass} aria-hidden="true" {...chevronProps} />;
          }
          if (orientation === 'right') {
            return <ChevronRightIcon className={iconClass} aria-hidden="true" {...chevronProps} />;
          }
          return <ChevronDownIcon className={iconClass} aria-hidden="true" {...chevronProps} />;
        },
        Dropdown: CalendarCaptionDropdown,
        ...components,
      }}
      {...props}
    />
  );
}
