import { describe, expect, it } from 'vitest';

import {
  eventKindForAssessmentType,
  formatTimeOfDay,
  timetableCalendarQuerySchema,
  timetableInputSchema,
  timesOverlap,
} from './timetables';

const ID = '11111111-1111-4111-8111-111111111111';

const weekly = {
  sessionId: ID,
  classLevelId: ID,
  sectionId: null,
  kind: 'CLASS',
  assessmentTypeId: null,
  title: 'Class 5 weekly',
  description: '',
  startsOn: null,
  endsOn: null,
  entries: [
    {
      subjectId: null,
      teacherId: null,
      room: '',
      dayOfWeek: 1,
      onDate: null,
      startTime: '09:00',
      endTime: '09:40',
      notes: '',
    },
  ],
};

describe('a timetable', () => {
  it('accepts a weekly timetable, turning blanks into nothing', () => {
    const parsed = timetableInputSchema.parse(weekly);
    expect(parsed.description).toBeNull();
    expect(parsed.entries[0]?.room).toBeNull();
    expect(parsed.publish).toBe(false);
  });

  it('wants entries, a sensible title and times in order', () => {
    expect(timetableInputSchema.safeParse({ ...weekly, entries: [] }).success).toBe(false);
    expect(timetableInputSchema.safeParse({ ...weekly, title: 'ab' }).success).toBe(false);
    const backwards = { ...weekly.entries[0], startTime: '10:00', endTime: '09:00' };
    expect(timetableInputSchema.safeParse({ ...weekly, entries: [backwards] }).success).toBe(false);
    const badTime = { ...weekly.entries[0], startTime: '9am' };
    expect(timetableInputSchema.safeParse({ ...weekly, entries: [badTime] }).success).toBe(false);
  });

  it('uses weekdays for a class and dates for an assessment, never both on one row', () => {
    const both = { ...weekly.entries[0], onDate: '2026-11-10' };
    expect(timetableInputSchema.safeParse({ ...weekly, entries: [both] }).success).toBe(false);

    const dated = { ...weekly.entries[0], dayOfWeek: null, onDate: '2026-11-10' };
    expect(timetableInputSchema.safeParse({ ...weekly, entries: [dated] }).success).toBe(false);
    expect(
      timetableInputSchema.safeParse({
        ...weekly,
        kind: 'ASSESSMENT',
        assessmentTypeId: ID,
        entries: [dated],
      }).success,
    ).toBe(true);
  });

  it('names the assessment type for an assessment, and only then', () => {
    const dated = { ...weekly.entries[0], dayOfWeek: null, onDate: '2026-11-10' };
    expect(
      timetableInputSchema.safeParse({ ...weekly, kind: 'ASSESSMENT', entries: [dated] }).success,
    ).toBe(false);
    expect(timetableInputSchema.safeParse({ ...weekly, assessmentTypeId: ID }).success).toBe(false);
  });

  it('refuses an end date before the start', () => {
    expect(
      timetableInputSchema.safeParse({ ...weekly, startsOn: '2026-11-10', endsOn: '2026-11-01' })
        .success,
    ).toBe(false);
  });
});

describe('times', () => {
  it('reads as people read it', () => {
    expect(formatTimeOfDay('09:05')).toBe('9:05 AM');
    expect(formatTimeOfDay('00:30')).toBe('12:30 AM');
    expect(formatTimeOfDay('12:00')).toBe('12:00 PM');
    expect(formatTimeOfDay('15:45')).toBe('3:45 PM');
  });

  it('overlaps only when the ranges share time; touching is not sharing', () => {
    expect(
      timesOverlap({ startTime: '09:00', endTime: '09:40' }, { startTime: '09:20', endTime: '10:00' }),
    ).toBe(true);
    expect(
      timesOverlap({ startTime: '09:00', endTime: '09:40' }, { startTime: '09:40', endTime: '10:20' }),
    ).toBe(false);
  });

  it('tells a test from an exam by the name', () => {
    expect(eventKindForAssessmentType('Midterm Exam')).toBe('EXAM');
    expect(eventKindForAssessmentType('Surprise Test')).toBe('TEST');
  });
});

describe('the calendar query', () => {
  it('wants a span that runs forwards', () => {
    expect(timetableCalendarQuerySchema.safeParse({ from: '2026-11-01', to: '2026-11-30' }).success).toBe(true);
    expect(timetableCalendarQuerySchema.safeParse({ from: '2026-11-30', to: '2026-11-01' }).success).toBe(false);
  });
});
