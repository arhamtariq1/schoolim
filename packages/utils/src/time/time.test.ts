import { describe, expect, it } from 'vitest';

import {
  addDays,
  addMonths,
  calendarDate,
  compareCalendarDates,
  DEFAULT_TIMEZONE,
  daysBetween,
  endOfMonth,
  monthKey,
  startOfDayInstant,
  startOfMonth,
  toCalendarDate,
  today,
} from './calendar-date';
import { fixedClock, mutableClock, systemClock } from './clock';

describe('calendarDate', () => {
  it('accepts a valid date', () => {
    expect(calendarDate('2026-08-25')).toBe('2026-08-25');
    expect(calendarDate('2024-02-29')).toBe('2024-02-29'); // leap year
  });

  it('rejects a date that matches the shape but does not exist', () => {
    expect(() => calendarDate('2026-02-31')).toThrow(/not a valid calendar date/);
    expect(() => calendarDate('2026-13-01')).toThrow();
    expect(() => calendarDate('2025-02-29')).toThrow(); // not a leap year
  });

  it('rejects anything that is not YYYY-MM-DD', () => {
    for (const value of ['25-08-2026', '2026/08/25', '2026-8-25', '', '2026-08-25T00:00:00Z']) {
      expect(() => calendarDate(value)).toThrow();
    }
  });
});

describe('toCalendarDate', () => {
  it('resolves the local date, not the UTC date', () => {
    // 22:00 UTC on the 24th is 03:00 on the 25th in Karachi (UTC+5).
    const instant = new Date('2026-08-24T22:00:00Z');
    expect(toCalendarDate(instant, DEFAULT_TIMEZONE)).toBe('2026-08-25');
    expect(toCalendarDate(instant, 'UTC')).toBe('2026-08-24');
  });

  it('is the reason a due date is not stored as an instant', () => {
    const instant = new Date('2026-08-25T19:30:00Z');
    expect(toCalendarDate(instant, 'Asia/Karachi')).toBe('2026-08-26');
    expect(toCalendarDate(instant, 'America/New_York')).toBe('2026-08-25');
  });
});

describe('startOfDayInstant', () => {
  it('returns the instant the day begins in the given zone', () => {
    const start = startOfDayInstant(calendarDate('2026-08-25'), 'Asia/Karachi');
    expect(start.toISOString()).toBe('2026-08-24T19:00:00.000Z');
  });

  it('agrees with UTC when the zone is UTC', () => {
    const start = startOfDayInstant(calendarDate('2026-08-25'), 'UTC');
    expect(start.toISOString()).toBe('2026-08-25T00:00:00.000Z');
  });

  it('round-trips through toCalendarDate', () => {
    for (const zone of ['Asia/Karachi', 'UTC', 'America/New_York', 'Australia/Sydney']) {
      const date = calendarDate('2026-03-29');
      expect(toCalendarDate(startOfDayInstant(date, zone), zone)).toBe(date);
    }
  });

  it('stays correct across a DST transition', () => {
    // 29 March 2026 is the spring-forward date in most of Europe.
    const date = calendarDate('2026-03-29');
    const start = startOfDayInstant(date, 'Europe/London');
    expect(toCalendarDate(start, 'Europe/London')).toBe(date);
  });
});

describe('calendar arithmetic', () => {
  it('adds days across a month boundary', () => {
    expect(addDays(calendarDate('2026-08-30'), 3)).toBe('2026-09-02');
    expect(addDays(calendarDate('2026-01-01'), -1)).toBe('2025-12-31');
  });

  it('clamps when adding months, so a fee due on the 31st does not skip a month', () => {
    expect(addMonths(calendarDate('2026-01-31'), 1)).toBe('2026-02-28');
    expect(addMonths(calendarDate('2024-01-31'), 1)).toBe('2024-02-29'); // leap year
    expect(addMonths(calendarDate('2026-03-31'), -1)).toBe('2026-02-28');
    expect(addMonths(calendarDate('2026-01-15'), 1)).toBe('2026-02-15');
  });

  it('advances a full year', () => {
    expect(addMonths(calendarDate('2026-08-25'), 12)).toBe('2027-08-25');
  });

  it('finds month boundaries', () => {
    expect(startOfMonth(calendarDate('2026-08-25'))).toBe('2026-08-01');
    expect(endOfMonth(calendarDate('2026-08-25'))).toBe('2026-08-31');
    expect(endOfMonth(calendarDate('2026-02-10'))).toBe('2026-02-28');
    expect(endOfMonth(calendarDate('2024-02-10'))).toBe('2024-02-29');
  });

  it('counts whole days between dates', () => {
    expect(daysBetween(calendarDate('2026-08-01'), calendarDate('2026-08-31'))).toBe(30);
    expect(daysBetween(calendarDate('2026-08-31'), calendarDate('2026-08-01'))).toBe(-30);
    expect(daysBetween(calendarDate('2026-08-01'), calendarDate('2026-08-01'))).toBe(0);
  });

  it('orders chronologically', () => {
    const early = calendarDate('2026-08-01');
    const late = calendarDate('2026-09-01');
    expect(compareCalendarDates(early, late)).toBeLessThan(0);
    expect(compareCalendarDates(late, early)).toBeGreaterThan(0);
    expect(compareCalendarDates(early, early)).toBe(0);
    expect([late, early].sort(compareCalendarDates)).toEqual([early, late]);
  });

  it('derives the billing-period and partition key', () => {
    expect(monthKey(calendarDate('2026-08-25'))).toBe('2026-08');
  });
});

describe('clocks', () => {
  it('freezes time so a time-dependent test has a fixed target', () => {
    const clock = fixedClock(new Date('2026-08-25T06:00:00Z'));
    expect(clock.now().toISOString()).toBe('2026-08-25T06:00:00.000Z');
    expect(clock.now().toISOString()).toBe('2026-08-25T06:00:00.000Z');
  });

  it('does not leak a mutable Date to callers', () => {
    const clock = fixedClock(new Date('2026-08-25T06:00:00Z'));
    const first = clock.now();
    first.setUTCFullYear(1999);
    expect(clock.now().getUTCFullYear()).toBe(2026);
  });

  it('advances only when told to', () => {
    const clock = mutableClock(new Date('2026-08-25T06:00:00Z'));
    clock.advanceBy(90 * 60_000);
    expect(clock.now().toISOString()).toBe('2026-08-25T07:30:00.000Z');
  });

  it('resolves today in the school timezone', () => {
    const clock = fixedClock(new Date('2026-08-24T20:00:00Z'));
    expect(today(clock, 'Asia/Karachi')).toBe('2026-08-25');
    expect(today(clock, 'UTC')).toBe('2026-08-24');
  });

  it('exposes a real clock', () => {
    expect(systemClock.now().getTime()).toBeGreaterThan(0);
  });
});
