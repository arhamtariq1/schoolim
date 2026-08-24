import { invariant } from '../assert';
import { type Brand } from '../types/brand';

import { type Clock } from './clock';

/**
 * A calendar date with no time and no timezone, as `YYYY-MM-DD`.
 *
 * docs/03 section 8: instants are `timestamptz` in UTC, but academic dates are
 * `date`. A due date of the 10th is the 10th regardless of where the reader
 * is standing — storing it as an instant is how a voucher becomes due on the
 * 9th for one user and the 10th for another.
 *
 * The brand stops a `Date` or a loose string reaching a date-only field.
 */
export type CalendarDate = Brand<string, 'CalendarDate'>;

/** IANA zone. Schools operate in one local timezone; this is the default. */
export const DEFAULT_TIMEZONE = 'Asia/Karachi';

const CALENDAR_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/** Parse and validate a `YYYY-MM-DD` string, rejecting impossible dates. */
export function calendarDate(value: string): CalendarDate {
  invariant(CALENDAR_DATE_PATTERN.test(value), `not a YYYY-MM-DD date: "${value}"`);

  // `2026-02-31` matches the pattern but is not a date. Round-tripping through
  // UTC catches it: an overflowing day rolls into the next month.
  const parsed = new Date(`${value}T00:00:00Z`);
  invariant(!Number.isNaN(parsed.getTime()), `not a valid date: "${value}"`);
  invariant(parsed.toISOString().slice(0, 10) === value, `not a valid calendar date: "${value}"`);

  return value as CalendarDate;
}

/**
 * The calendar date an instant falls on, **in a given timezone**.
 *
 * `en-CA` is used because it formats as `YYYY-MM-DD`; the locale is an
 * implementation detail of the format, not a user-facing choice.
 */
export function toCalendarDate(instant: Date, timeZone: string = DEFAULT_TIMEZONE): CalendarDate {
  const formatted = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(instant);

  return calendarDate(formatted);
}

/** Today, in the school's timezone. Requires a Clock — there is no ambient now. */
export function today(clock: Clock, timeZone: string = DEFAULT_TIMEZONE): CalendarDate {
  return toCalendarDate(clock.now(), timeZone);
}

/**
 * The instant a calendar date begins in a given timezone.
 *
 * Needed when a date-only value must be compared against `timestamptz` columns,
 * for example "payments received on the 5th" in a day-book query.
 *
 * Resolved by probing UTC midnight and correcting by the zone's offset, so it
 * stays correct across DST transitions in zones that observe them. Pakistan
 * does not currently, but the helper must not silently assume that.
 */
export function startOfDayInstant(date: CalendarDate, timeZone: string = DEFAULT_TIMEZONE): Date {
  const utcMidnight = new Date(`${date}T00:00:00Z`);
  const offsetMinutes = timeZoneOffsetMinutes(utcMidnight, timeZone);
  const candidate = new Date(utcMidnight.getTime() - offsetMinutes * 60_000);

  // Re-resolve once: near a DST boundary the offset at UTC midnight may differ
  // from the offset at the local instant we just computed.
  const correctedOffset = timeZoneOffsetMinutes(candidate, timeZone);
  return correctedOffset === offsetMinutes
    ? candidate
    : new Date(utcMidnight.getTime() - correctedOffset * 60_000);
}

/** Minutes a timezone is ahead of UTC at a given instant. */
function timeZoneOffsetMinutes(instant: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(instant);

  const lookup = (type: Intl.DateTimeFormatPartTypes): number => {
    const part = parts.find((candidate) => candidate.type === type);
    invariant(part !== undefined, `timezone ${timeZone} produced no ${type}`);
    return Number(part.value);
  };

  // `hour` renders as 24 at midnight under hour12:false in some ICU versions.
  const hour = lookup('hour') % 24;
  const asUtc = Date.UTC(
    lookup('year'),
    lookup('month') - 1,
    lookup('day'),
    hour,
    lookup('minute'),
    lookup('second'),
  );

  return (asUtc - instant.getTime()) / 60_000;
}

// --- Calendar arithmetic ----------------------------------------------------
// Performed in UTC on the date-only value, which is safe precisely because a
// CalendarDate carries no timezone.

export function addDays(date: CalendarDate, days: number): CalendarDate {
  invariant(Number.isInteger(days), 'days must be a whole number');
  const shifted = new Date(`${date}T00:00:00Z`);
  shifted.setUTCDate(shifted.getUTCDate() + days);
  return calendarDate(shifted.toISOString().slice(0, 10));
}

export function addMonths(date: CalendarDate, months: number): CalendarDate {
  invariant(Number.isInteger(months), 'months must be a whole number');
  const source = new Date(`${date}T00:00:00Z`);
  const targetDay = source.getUTCDate();

  const shifted = new Date(source);
  shifted.setUTCDate(1);
  shifted.setUTCMonth(shifted.getUTCMonth() + months);

  // Clamp: 31 January plus one month is 28 or 29 February, not 2 or 3 March.
  // A fee due on the 31st must not silently jump into the following month.
  const lastDay = daysInMonth(shifted.getUTCFullYear(), shifted.getUTCMonth());
  shifted.setUTCDate(targetDay < lastDay ? targetDay : lastDay);

  return calendarDate(shifted.toISOString().slice(0, 10));
}

export function startOfMonth(date: CalendarDate): CalendarDate {
  return calendarDate(`${date.slice(0, 7)}-01`);
}

export function endOfMonth(date: CalendarDate): CalendarDate {
  const source = new Date(`${date}T00:00:00Z`);
  const lastDay = daysInMonth(source.getUTCFullYear(), source.getUTCMonth());
  return calendarDate(`${date.slice(0, 7)}-${String(lastDay).padStart(2, '0')}`);
}

/** Whole days from `from` to `to`; negative when `to` is earlier. */
export function daysBetween(from: CalendarDate, to: CalendarDate): number {
  const start = new Date(`${from}T00:00:00Z`).getTime();
  const end = new Date(`${to}T00:00:00Z`).getTime();
  return (end - start) / 86_400_000;
}

/** Lexicographic comparison is chronological for `YYYY-MM-DD`. */
export function compareCalendarDates(a: CalendarDate, b: CalendarDate): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

export function isBefore(a: CalendarDate, b: CalendarDate): boolean {
  return a < b;
}

export function isAfter(a: CalendarDate, b: CalendarDate): boolean {
  return a > b;
}

/** `YYYY-MM`, the key a billing period and a monthly partition are named by. */
export function monthKey(date: CalendarDate): string {
  return date.slice(0, 7);
}

function daysInMonth(year: number, monthIndex: number): number {
  return new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
}
