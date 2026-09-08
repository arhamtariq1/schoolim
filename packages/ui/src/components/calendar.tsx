'use client';

import { DayPicker, type DayPickerProps } from 'react-day-picker';

import { ChevronLeftIcon, ChevronRightIcon } from '../icons';
import { cn } from '../lib/cn';

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
 * Every class below is a semantic token. Nothing here is a hex or an arbitrary
 * value, so a school's `primary_color` swap recolours the calendar too.
 */

export type CalendarProps = DayPickerProps & {
  /** Extra classes on the root. */
  className?: string;
};

export function Calendar({ className, classNames, showOutsideDays = true, ...props }: CalendarProps) {
  return (
    <DayPicker
      showOutsideDays={showOutsideDays}
      className={cn('p-1', className)}
      classNames={{
        months: 'flex flex-col sm:flex-row gap-4',
        month: 'space-y-3',
        month_caption: 'flex h-9 items-center justify-center px-9',
        caption_label: 'text-sm font-semibold text-foreground',

        nav: 'flex items-center justify-between absolute inset-x-1 top-1 h-9 pointer-events-none',
        button_previous: cn(
          'pointer-events-auto inline-flex size-8 items-center justify-center rounded-md',
          'text-muted-foreground transition-colors hover:bg-muted hover:text-foreground',
          'focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
          'disabled:pointer-events-none disabled:opacity-30',
        ),
        button_next: cn(
          'pointer-events-auto inline-flex size-8 items-center justify-center rounded-md',
          'text-muted-foreground transition-colors hover:bg-muted hover:text-foreground',
          'focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
          'disabled:pointer-events-none disabled:opacity-30',
        ),

        month_grid: 'w-full border-collapse',
        weekdays: 'flex',
        weekday: 'w-9 text-xs font-medium text-muted-foreground uppercase tracking-wide',
        weeks: '',
        week: 'flex w-full mt-1',

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

        dropdowns: 'flex items-center gap-1.5',
        dropdown_root: 'relative',
        dropdown: cn(
          'h-8 rounded-md border border-border bg-background px-2 text-sm',
          'focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
        ),

        ...classNames,
      }}
      components={{
        Chevron: ({ orientation }) =>
          orientation === 'left' ? (
            <ChevronLeftIcon className="size-4" aria-hidden="true" />
          ) : (
            <ChevronRightIcon className="size-4" aria-hidden="true" />
          ),
      }}
      {...props}
    />
  );
}
