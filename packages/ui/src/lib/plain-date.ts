/**
 * Converting between a `YYYY-MM-DD` string and a `Date`, without moving the day.
 *
 * ## Why this file exists at all
 *
 * `new Date('2026-09-07')` is parsed by the language as **UTC midnight**. In
 * Karachi that is 05:00 local, which is harmless — but the reverse trip is not:
 * `date.toISOString().slice(0, 10)` on a date picked in a timezone behind UTC
 * hands back *the previous day*. A school in a UTC-5 timezone marking
 * attendance for the 7th would silently file it against the 6th, and every
 * report built on that date would be wrong by one row.
 *
 * The whole product speaks `YYYY-MM-DD` on the wire — a calendar day, with no
 * instant and no zone attached. So both directions here work in **local
 * civil-time components** and never touch UTC:
 *
 * - parse builds `new Date(y, m - 1, d)`, which is local midnight of that day
 * - format reads `getFullYear` / `getMonth` / `getDate`, which are local
 *
 * That round-trips exactly, in every timezone, which `toISOString` does not.
 */

/** A calendar day with no time and no zone, as `YYYY-MM-DD`. */
export type PlainDate = string;

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

/**
 * `'2026-09-07'` to a `Date` at local midnight.
 *
 * Returns `undefined` for empty, malformed, or impossible input — `'2026-02-30'`
 * is rejected rather than rolled forward to March 2nd, because a picker
 * silently showing a different day than the one it was given is worse than
 * showing none.
 */
export function parsePlainDate(value: string | null | undefined): Date | undefined {
  if (value === null || value === undefined) return undefined;

  const match = ISO_DATE.exec(value.trim());
  if (match === null) return undefined;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);

  if (month < 1 || month > 12 || day < 1 || day > 31) return undefined;

  const date = new Date(year, month - 1, day);

  // Rejects the rollover: `new Date(2026, 1, 30)` is March 2nd, and its parts
  // no longer match what was asked for.
  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) {
    return undefined;
  }

  return date;
}

/** A `Date` to `'2026-09-07'`, reading local parts so the day never shifts. */
export function formatPlainDate(date: Date | null | undefined): PlainDate {
  if (date === null || date === undefined || Number.isNaN(date.getTime())) return '';

  const year = String(date.getFullYear()).padStart(4, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');

  return `${year}-${month}-${day}`;
}

/** `'2026-09'` to a `Date` at local midnight on the 1st. */
export function parsePlainMonth(value: string | null | undefined): Date | undefined {
  if (value === null || value === undefined) return undefined;
  return parsePlainDate(`${value.trim()}-01`);
}

/** A `Date` to `'2026-09'`. */
export function formatPlainMonth(date: Date | null | undefined): string {
  const full = formatPlainDate(date);
  return full === '' ? '' : full.slice(0, 7);
}

/**
 * Today, as a plain date.
 *
 * Takes the instant as an argument rather than calling `new Date()` internally,
 * so a test can pin it and so the lint rule that bans the zero-argument
 * constructor stays satisfied. See `packages/config/eslint/base.mjs`.
 */
export function todayPlainDate(now: number = Date.now()): PlainDate {
  return formatPlainDate(new Date(now));
}
