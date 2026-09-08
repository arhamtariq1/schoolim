import { describe, expect, it } from 'vitest';

import {
  formatPlainDate,
  formatPlainMonth,
  parsePlainDate,
  parsePlainMonth,
  todayPlainDate,
} from './plain-date';

/**
 * These exist because of one specific bug class.
 *
 * `new Date('2026-09-07').toISOString().slice(0, 10)` returns `'2026-09-06'`
 * anywhere west of Greenwich — the string parses as UTC midnight and formats
 * back in local time, losing a day. A date picker with that bug files
 * attendance against the wrong day and nobody notices until a report is wrong.
 *
 * The round-trip test below is the one that catches it.
 */
describe('parsePlainDate', () => {
  it('reads a date as local midnight, not UTC', () => {
    const parsed = parsePlainDate('2026-09-07');

    expect(parsed).toBeDefined();
    expect(parsed?.getFullYear()).toBe(2026);
    expect(parsed?.getMonth()).toBe(8);
    expect(parsed?.getDate()).toBe(7);
    expect(parsed?.getHours()).toBe(0);
  });

  it('rejects rather than rolls over an impossible day', () => {
    // `new Date(2026, 1, 30)` is silently March 2nd. A picker that accepted
    // that would display a different day than the one it was handed.
    expect(parsePlainDate('2026-02-30')).toBeUndefined();
    expect(parsePlainDate('2026-13-01')).toBeUndefined();
    expect(parsePlainDate('2026-00-10')).toBeUndefined();
  });

  it('accepts a real leap day and rejects a fake one', () => {
    expect(parsePlainDate('2024-02-29')).toBeDefined();
    expect(parsePlainDate('2026-02-29')).toBeUndefined();
  });

  it('treats empty, null and malformed input as no date', () => {
    expect(parsePlainDate('')).toBeUndefined();
    expect(parsePlainDate(null)).toBeUndefined();
    expect(parsePlainDate(undefined)).toBeUndefined();
    expect(parsePlainDate('07/09/2026')).toBeUndefined();
    expect(parsePlainDate('2026-9-7')).toBeUndefined();
  });
});

describe('formatPlainDate', () => {
  it('reads local parts, so the day never shifts', () => {
    expect(formatPlainDate(new Date(2026, 8, 7))).toBe('2026-09-07');
  });

  it('pads single-digit months and days', () => {
    expect(formatPlainDate(new Date(2026, 0, 1))).toBe('2026-01-01');
  });

  it('is empty for nothing and for an invalid date', () => {
    expect(formatPlainDate(null)).toBe('');
    expect(formatPlainDate(undefined)).toBe('');
    expect(formatPlainDate(new Date('nonsense'))).toBe('');
  });

  it('survives a late-evening instant, which toISOString would not', () => {
    // 23:30 local on the 7th. `toISOString()` in any timezone ahead of UTC
    // reports the 7th; in one behind, the 8th. Local parts always say the 7th.
    expect(formatPlainDate(new Date(2026, 8, 7, 23, 30))).toBe('2026-09-07');
    expect(formatPlainDate(new Date(2026, 8, 7, 0, 30))).toBe('2026-09-07');
  });
});

describe('round trip', () => {
  it('returns the same string for every day across a leap year', () => {
    // The whole point of the module: parse then format is the identity, on
    // every day, whatever timezone the test runner happens to be in.
    for (let month = 0; month < 12; month += 1) {
      const daysInMonth = new Date(2024, month + 1, 0).getDate();
      for (let day = 1; day <= daysInMonth; day += 1) {
        const iso = `2024-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        expect(formatPlainDate(parsePlainDate(iso))).toBe(iso);
      }
    }
  });

  it('survives a spring-forward day, where local midnight may not exist', () => {
    // Some zones skip 00:00 on a DST boundary; the constructor then lands on
    // 01:00 the same day, which still formats correctly.
    for (const iso of ['2026-03-08', '2026-03-29', '2026-10-25', '2026-11-01']) {
      expect(formatPlainDate(parsePlainDate(iso))).toBe(iso);
    }
  });
});

describe('months', () => {
  it('parses a month to the first of it', () => {
    const parsed = parsePlainMonth('2026-09');

    expect(parsed?.getDate()).toBe(1);
    expect(parsed?.getMonth()).toBe(8);
  });

  it('formats back to YYYY-MM', () => {
    expect(formatPlainMonth(new Date(2026, 8, 30))).toBe('2026-09');
    expect(formatPlainMonth(null)).toBe('');
  });

  it('round-trips every month of a year', () => {
    for (let month = 1; month <= 12; month += 1) {
      const iso = `2026-${String(month).padStart(2, '0')}`;
      expect(formatPlainMonth(parsePlainMonth(iso))).toBe(iso);
    }
  });
});

describe('todayPlainDate', () => {
  it('takes the instant as an argument so it can be pinned', () => {
    const noon = new Date(2026, 8, 7, 12, 0, 0).getTime();

    expect(todayPlainDate(noon)).toBe('2026-09-07');
  });
});
