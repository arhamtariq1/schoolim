import { describe, expect, it } from 'vitest';

import {
  attendanceBasisPoints,
  daysInMonth,
  describeDay,
  describeMonth,
  expectedDaysFor,
  isoWeekday,
  lockReason,
  todayIn,
  type CalendarConfig,
} from './school-calendar';

/**
 * The calendar is where attendance goes quietly wrong, so it is tested on its
 * own rather than only through an endpoint.
 */

const MON_TO_SAT = [1, 2, 3, 4, 5, 6];

function config(over: Partial<CalendarConfig> = {}): CalendarConfig {
  return {
    workingDays: MON_TO_SAT,
    holidays: [],
    today: '2026-09-30',
    audience: 'STUDENTS',
    ...over,
  };
}

describe('which days a school runs', () => {
  it('counts a normal weekday', () => {
    // Tuesday.
    expect(describeDay('2026-09-01', config()).isWorkingDay).toBe(true);
  });

  it('closes on a day the school does not run', () => {
    // 2026-09-06 is a Sunday, and Sunday is not in Monday–Saturday.
    const day = describeDay('2026-09-06', config());
    expect(day.isWorkingDay).toBe(false);
    expect(day.reason).toBe('WEEKEND');
  });

  it('follows the school’s own week rather than a hard-coded one', () => {
    // A school running Monday–Friday is closed on Saturday; one running
    // Monday–Saturday is not. Same date, different answer, no code branch.
    const saturday = '2026-09-05';
    expect(describeDay(saturday, config({ workingDays: [1, 2, 3, 4, 5] })).isWorkingDay).toBe(
      false,
    );
    expect(describeDay(saturday, config()).isWorkingDay).toBe(true);
  });

  it('names the holiday rather than only refusing', () => {
    const day = describeDay(
      '2026-09-10',
      config({
        holidays: [
          {
            name: 'Eid Milad-un-Nabi',
            startDate: '2026-09-09',
            endDate: '2026-09-11',
            appliesTo: 'ALL',
          },
        ],
      }),
    );

    expect(day.isWorkingDay).toBe(false);
    expect(day.reason).toBe('HOLIDAY');
    // "You cannot mark this day" is a refusal; naming it is an answer.
    expect(day.holidayName).toBe('Eid Milad-un-Nabi');
  });

  it('treats a holiday range as inclusive at both ends', () => {
    const holidays = [
      {
        name: 'Mid-term break',
        startDate: '2026-09-14',
        endDate: '2026-09-16',
        appliesTo: 'ALL' as const,
      },
    ];
    const withBreak = config({ holidays });

    expect(describeDay('2026-09-14', withBreak).isWorkingDay).toBe(false);
    expect(describeDay('2026-09-16', withBreak).isWorkingDay).toBe(false);
    expect(describeDay('2026-09-17', withBreak).isWorkingDay).toBe(true);
  });

  it('applies a staff-only closure to staff and not to students', () => {
    const holidays = [
      {
        name: 'Staff training',
        startDate: '2026-09-15',
        endDate: '2026-09-15',
        appliesTo: 'STAFF' as const,
      },
    ];

    expect(describeDay('2026-09-15', config({ holidays, audience: 'STAFF' })).isWorkingDay).toBe(
      false,
    );
    expect(describeDay('2026-09-15', config({ holidays, audience: 'STUDENTS' })).isWorkingDay).toBe(
      true,
    );
  });

  it('refuses a day that has not happened yet', () => {
    const day = describeDay('2026-10-01', config({ today: '2026-09-30' }));
    expect(day.isWorkingDay).toBe(false);
    expect(day.reason).toBe('FUTURE');
  });

  it('allows today itself', () => {
    expect(describeDay('2026-09-30', config({ today: '2026-09-30' })).isWorkingDay).toBe(true);
  });
});

describe('the month grid', () => {
  it('has the right number of days, February included', () => {
    expect(daysInMonth('2026-09')).toHaveLength(30);
    expect(daysInMonth('2026-01')).toHaveLength(31);
    expect(daysInMonth('2026-02')).toHaveLength(28);
    // 2028 is a leap year; a hard-coded 28 would be wrong once every four.
    expect(daysInMonth('2028-02')).toHaveLength(29);
  });

  it('starts on the 1st and ends on the last', () => {
    const days = daysInMonth('2026-09');
    expect(days[0]).toBe('2026-09-01');
    expect(days.at(-1)).toBe('2026-09-30');
  });

  it('reads weekdays without drifting a day in a positive-offset zone', () => {
    // The reason dates are strings here: `new Date('2026-09-01')` in
    // Asia/Karachi is the 1st at 05:00, and naive local-date maths lands on
    // the 31st of August often enough to shift a whole register.
    expect(isoWeekday('2026-09-01')).toBe(2); // Tuesday
    expect(isoWeekday('2026-09-06')).toBe(7); // Sunday
  });
});

describe('the percentage denominator', () => {
  const september = describeMonth('2026-09', config());

  it('counts only the days the school ran', () => {
    // September 2026 has 30 days and four Sundays.
    expect(september.filter((day) => day.isWorkingDay)).toHaveLength(26);
  });

  it('excludes the days before a child was admitted', () => {
    // Admitted on the 20th: the month is not 26 days of opportunity for them.
    const expected = expectedDaysFor(september, '2026-09-20', null);
    expect(expected).toBe(9);
    // The bug this guards: counting the whole month would put a child who
    // never missed a day on 35%.
    expect(attendanceBasisPoints(9, expected)).toBe(10_000);
  });

  it('excludes the days after a child left', () => {
    expect(expectedDaysFor(september, null, '2026-09-10')).toBe(9);
  });

  it('is zero for a month somebody was not there at all', () => {
    expect(expectedDaysFor(september, '2026-10-01', null)).toBe(0);
  });

  it('reports no percentage rather than NaN when nothing was expected', () => {
    // A dash on a report is honest. `NaN%` is a bug on a page a principal reads.
    expect(attendanceBasisPoints(0, 0)).toBe(0);
  });

  it('never exceeds 100%', () => {
    // Defensive: a stray extra mark must not produce 110% on a report.
    expect(attendanceBasisPoints(30, 26)).toBe(10_000);
  });

  it('rounds to two decimal places, as basis points', () => {
    // 24 of 26 is 92.3076…%, which is 9231 basis points.
    expect(attendanceBasisPoints(24, 26)).toBe(9231);
  });
});

describe('how far back a register may be edited', () => {
  it('leaves today open', () => {
    expect(lockReason('2026-09-30', '2026-09-30', 7, false)).toBeNull();
  });

  it('leaves yesterday open', () => {
    expect(lockReason('2026-09-29', '2026-09-30', 7, false)).toBeNull();
  });

  it('leaves the last day of the window open', () => {
    expect(lockReason('2026-09-23', '2026-09-30', 7, false)).toBeNull();
  });

  it('locks the day after the window, and says how old it is', () => {
    const reason = lockReason('2026-09-22', '2026-09-30', 7, false);
    expect(reason).toContain('8 days old');
  });

  it('opens anything for somebody holding the unlock permission', () => {
    expect(lockReason('2025-01-01', '2026-09-30', 7, true)).toBeNull();
  });
});

describe('today, in the school’s zone', () => {
  it('is the local date, not the UTC one', () => {
    // 19:30 UTC on the 30th is already 00:30 on the 1st in Karachi. A register
    // opened at half past midnight must be the new day's.
    const instant = new Date('2026-09-30T19:30:00Z');
    expect(todayIn('Asia/Karachi', instant)).toBe('2026-10-01');
    expect(todayIn('UTC', instant)).toBe('2026-09-30');
  });
});
