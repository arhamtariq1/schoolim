import { type DayStatus, type NonWorkingReason } from '@ilm/contracts';
import { divideRoundHalfToEven } from '@ilm/utils';

/**
 * Which days a school actually runs — the denominator of every percentage.
 *
 * Pure and free of Prisma on purpose: this is the part of attendance that is
 * easy to get quietly wrong, and it should be testable without a database.
 *
 * ## The bug this file exists to prevent
 *
 * "Attendance 0.00%" next to four absences, on a screen showing 31 columns for
 * a month that has barely started. That happens when the denominator is
 * calendar days, or when a child admitted in September is counted absent for
 * April through August. A percentage is only honest if its denominator is the
 * days that child could have attended: a weekday the school runs, not a
 * holiday, on or after they were admitted, and on or before they left.
 *
 * ## Dates are strings, deliberately
 *
 * `YYYY-MM-DD` throughout, compared lexicographically. A `Date` carries a time
 * and a zone, and in Asia/Karachi `new Date('2026-09-01')` is the 1st at
 * 05:00 local — which rounds to the wrong day often enough to matter on a
 * register. Nothing here constructs a local Date.
 */

/** A holiday, as the calendar needs it: an inclusive span and a name. */
export interface HolidaySpan {
  readonly name: string;
  readonly startDate: string;
  readonly endDate: string;
  readonly appliesTo: 'ALL' | 'STUDENTS' | 'STAFF';
}

export interface CalendarConfig {
  /** ISO day numbers the school runs. 1 is Monday, 7 is Sunday. */
  readonly workingDays: readonly number[];
  readonly holidays: readonly HolidaySpan[];
  /** Today, in the school's own reckoning. Nothing after this is markable. */
  readonly today: string;
  /** `STUDENTS` ignores staff-only holidays, and the other way round. */
  readonly audience: 'STUDENTS' | 'STAFF';
}

export function describeDay(date: string, config: CalendarConfig): DayStatus {
  if (date > config.today) {
    // Marking tomorrow's register is not a permission question, it is a
    // statement about a day that has not happened.
    return { date, isWorkingDay: false, reason: 'FUTURE', holidayName: null };
  }

  const holiday = holidayOn(date, config);
  if (holiday !== undefined) {
    return { date, isWorkingDay: false, reason: 'HOLIDAY', holidayName: holiday.name };
  }

  if (!config.workingDays.includes(isoWeekday(date))) {
    return { date, isWorkingDay: false, reason: 'WEEKEND', holidayName: null };
  }

  return { date, isWorkingDay: true, reason: null, holidayName: null };
}

function holidayOn(date: string, config: CalendarConfig): HolidaySpan | undefined {
  return config.holidays.find(
    (holiday) =>
      (holiday.appliesTo === 'ALL' || holiday.appliesTo === config.audience) &&
      // Inclusive at both ends: "closed 1st to 3rd" includes the 3rd.
      holiday.startDate <= date &&
      date <= holiday.endDate,
  );
}

/** Every day of a `YYYY-MM` month, described. */
export function describeMonth(monthKey: string, config: CalendarConfig): DayStatus[] {
  return daysInMonth(monthKey).map((date) => describeDay(date, config));
}

/**
 * How many of those days one person could have attended.
 *
 * `from` is when they joined and `to` when they left; either may be absent,
 * and both are inclusive. This is what stops a child admitted on the 20th from
 * starting their first month on 25% attendance.
 */
export function expectedDaysFor(
  days: readonly DayStatus[],
  from: string | null,
  to: string | null,
): number {
  return days.filter(
    (day) =>
      day.isWorkingDay && (from === null || day.date >= from) && (to === null || day.date <= to),
  ).length;
}

/** `2026-09` → every date in it, as `YYYY-MM-DD`. */
export function daysInMonth(monthKey: string): string[] {
  const [yearPart, monthPart] = monthKey.split('-');
  const year = Number(yearPart);
  const month = Number(monthPart);

  // Day 0 of the next month is the last day of this one — the standard way to
  // get 28, 29, 30 or 31 without a leap-year table.
  const count = new Date(Date.UTC(year, month, 0)).getUTCDate();

  return Array.from({ length: count }, (_, index) => {
    const day = String(index + 1).padStart(2, '0');
    return `${monthKey}-${day}`;
  });
}

/** ISO weekday for a `YYYY-MM-DD` string. 1 is Monday, 7 is Sunday. */
export function isoWeekday(date: string): number {
  const day = new Date(`${date}T00:00:00Z`).getUTCDay();
  // `getUTCDay` puts Sunday at 0; ISO puts it at 7.
  return day === 0 ? 7 : day;
}

/**
 * Attendance as basis points, so no float crosses the wire.
 *
 * Zero expected days returns zero rather than dividing — a month a child was
 * not enrolled for has no percentage, and `NaN%` on a report is worse than a
 * dash.
 */
export function attendanceBasisPoints(attended: number, expected: number): number {
  if (expected <= 0) {
    return 0;
  }
  // Half-to-even through the shared helper rather than Math.round: the same
  // rounding rule the money code uses, and no float in the division.
  const points = divideRoundHalfToEven(BigInt(attended) * 10_000n, BigInt(expected));
  return Math.min(10_000, Number(points));
}

/** Why a past date may no longer be edited, or null when it still may be. */
export function lockReason(
  date: string,
  today: string,
  backdateDays: number,
  canUnlock: boolean,
): string | null {
  if (canUnlock || date >= today) {
    return null;
  }

  const age = daysBetween(date, today);
  if (age <= backdateDays) {
    return null;
  }

  return `This register is ${String(age)} days old. Editing it needs the attendance unlock permission.`;
}

/** Whole days from `from` to `to`, both `YYYY-MM-DD`. */
export function daysBetween(from: string, to: string): number {
  const start = Date.parse(`${from}T00:00:00Z`);
  const end = Date.parse(`${to}T00:00:00Z`);
  // Both ends are UTC midnight, so this divides exactly; truncating is the
  // honest operation rather than rounding something that has no remainder.
  return Math.trunc((end - start) / 86_400_000);
}

/** Today in a named zone, as `YYYY-MM-DD`. */
export function todayIn(timezone: string, now: Date): string {
  // `en-CA` formats as YYYY-MM-DD, which is the shape used everywhere here.
  // Going through the formatter rather than an offset calculation is what
  // makes this right on the days a zone changes.
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}

export type { NonWorkingReason };
