import { DEFAULT_TIMEZONE, type CalendarDate } from '@ilm/utils';
import type { ComponentProps } from 'react';

import { cn } from '../lib/cn';

/**
 * The only sanctioned way to render a date (docs/16 section 10).
 *
 * Dates render in the **school's** timezone, not the reader's. A voucher due on
 * the 10th is due on the 10th whether the accountant is in Lahore or the parent
 * is in Dubai, and a browser-local render would show two different due dates
 * for the same voucher.
 *
 * Whenever a relative form is shown ("3 days overdue"), the absolute date is in
 * the `title`, because "3 days" is useless in a screenshot pasted into WhatsApp
 * and that is how school staff actually share things.
 */

export type DateInput = CalendarDate | string | Date;

export interface DateDisplayProps extends Omit<ComponentProps<'time'>, 'children' | 'dateTime'> {
  value: DateInput;
  /** The school's IANA timezone. Comes from the tenant, not the browser. */
  timeZone?: string;
  locale?: string;
  /** `date` for a calendar date, `datetime` when the time of day matters. */
  precision?: 'date' | 'datetime';
  /** Render "in 3 days" / "3 days ago", with the absolute date in the title. */
  relativeTo?: Date;
}

function toDate(value: DateInput): Date {
  if (value instanceof Date) {
    return value;
  }
  // A bare YYYY-MM-DD is anchored at UTC midnight so it cannot slip a day
  // backwards when the runtime's own offset is negative.
  return /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(`${value}T00:00:00Z`) : new Date(value);
}

export function DateDisplay({
  value,
  timeZone = DEFAULT_TIMEZONE,
  locale = 'en-PK',
  precision = 'date',
  relativeTo,
  className,
  ...props
}: DateDisplayProps) {
  const date = toDate(value);

  if (Number.isNaN(date.getTime())) {
    // Never render "Invalid Date" to a school. An em dash is honest and quiet.
    return (
      <span className={cn('text-muted-foreground', className)} aria-label="no date">
        —
      </span>
    );
  }

  const absolute = new Intl.DateTimeFormat(locale, {
    timeZone,
    dateStyle: 'medium',
    ...(precision === 'datetime' ? { timeStyle: 'short' as const } : {}),
  }).format(date);

  const label = relativeTo === undefined ? absolute : formatRelative(date, relativeTo, locale);

  return (
    <time
      dateTime={date.toISOString()}
      // The absolute date is always reachable, even when a relative one shows.
      title={absolute}
      className={cn('whitespace-nowrap', className)}
      {...props}
    >
      {label}
    </time>
  );
}

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

function formatRelative(date: Date, now: Date, locale: string): string {
  const formatter = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' });
  const difference = date.getTime() - now.getTime();
  const absolute = Math.abs(difference);

  if (absolute < HOUR) {
    return formatter.format(Math.trunc(difference / MINUTE), 'minute');
  }
  if (absolute < DAY) {
    return formatter.format(Math.trunc(difference / HOUR), 'hour');
  }
  if (absolute < 30 * DAY) {
    return formatter.format(Math.trunc(difference / DAY), 'day');
  }
  return formatter.format(Math.trunc(difference / (30 * DAY)), 'month');
}
