import { z } from 'zod';

import { MAX_PAGE_LIMIT, sortOrderSchema } from './pagination';
import { calendarDateSchema, idSchema, instantSchema } from './primitives';

/**
 * Timetables — ADR-0017.
 *
 * Two kinds of schedule: a **class** timetable (the weekly periods of a class
 * or section) and an **assessment** timetable (dated tests and exams, several
 * subjects on one sheet). Both are made by the office, are hidden from everyone
 * else until published, and appear on the Academic Calendar — which reads them
 * rather than keeping a copy.
 */

// --- Vocabulary --------------------------------------------------------------

export const TIMETABLE_KINDS = ['CLASS', 'ASSESSMENT'] as const;
export const timetableKindSchema = z.enum(TIMETABLE_KINDS);
export type TimetableKind = z.infer<typeof timetableKindSchema>;

export const TIMETABLE_KIND_LABELS: Readonly<Record<TimetableKind, string>> = {
  CLASS: 'Class timetable',
  ASSESSMENT: 'Assessment timetable',
};

export const TIMETABLE_STATUSES = ['DRAFT', 'PUBLISHED'] as const;
export const timetableStatusSchema = z.enum(TIMETABLE_STATUSES);
export type TimetableStatus = z.infer<typeof timetableStatusSchema>;

export const TIMETABLE_STATUS_LABELS: Readonly<Record<TimetableStatus, string>> = {
  DRAFT: 'Draft',
  PUBLISHED: 'Published',
};

/** ISO weekdays: 1 is Monday, 7 is Sunday. */
export const WEEKDAY_NUMBERS = [1, 2, 3, 4, 5, 6, 7] as const;
export const WEEKDAY_LABELS: Readonly<Record<number, string>> = {
  1: 'Monday',
  2: 'Tuesday',
  3: 'Wednesday',
  4: 'Thursday',
  5: 'Friday',
  6: 'Saturday',
  7: 'Sunday',
};

/** What an event on the calendar is, which decides its colour. */
export const TIMETABLE_EVENT_KINDS = ['CLASS', 'TEST', 'EXAM'] as const;
export const timetableEventKindSchema = z.enum(TIMETABLE_EVENT_KINDS);
export type TimetableEventKind = z.infer<typeof timetableEventKindSchema>;

export const TIMETABLE_EVENT_KIND_LABELS: Readonly<Record<TimetableEventKind, string>> = {
  CLASS: 'Class',
  TEST: 'Test',
  EXAM: 'Exam',
};

/**
 * Whether an assessment type is a test or an exam, for colouring.
 *
 * Types are the school's own words ("Midterm exam", "Surprise test"), so this
 * reads the word rather than a flag nobody would remember to set.
 */
export function eventKindForAssessmentType(name: string): TimetableEventKind {
  return /exam/i.test(name) ? 'EXAM' : 'TEST';
}

export const DEFAULT_TIMETABLE_PAGE_SIZE = 20;
export const MAX_TIMETABLE_ENTRIES = 300;
/** The widest span the calendar will expand in one request. */
export const MAX_CALENDAR_DAYS = 400;

// --- Times -------------------------------------------------------------------

/** `HH:MM`, 24-hour, zero-padded — which is also how it sorts. */
export const timeOfDaySchema = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use a time like 09:30.');

/** A time as people read it: `09:30` → `9:30 AM`. */
export function formatTimeOfDay(value: string): string {
  const [hours = '0', minutes = '00'] = value.split(':');
  const hour = Number(hours);
  const suffix = hour >= 12 ? 'PM' : 'AM';
  const twelve = hour % 12 === 0 ? 12 : hour % 12;
  return `${String(twelve)}:${minutes} ${suffix}`;
}

/** Whether two half-open time ranges share any time. */
export function timesOverlap(
  a: { readonly startTime: string; readonly endTime: string },
  b: { readonly startTime: string; readonly endTime: string },
): boolean {
  return a.startTime < b.endTime && b.startTime < a.endTime;
}

// --- Writing -----------------------------------------------------------------

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullable()
    .transform((value) => (value === null || value === '' ? null : value));

export const timetableEntryInputSchema = z
  .object({
    subjectId: idSchema.nullable(),
    teacherId: idSchema.nullable(),
    room: optionalText(60),
    /** For a class timetable: the weekday it repeats on. */
    dayOfWeek: z.int().min(1).max(7).nullable(),
    /** For an assessment timetable: the date it is held. */
    onDate: calendarDateSchema.nullable(),
    startTime: timeOfDaySchema,
    endTime: timeOfDaySchema,
    notes: optionalText(500),
    /** A break between periods: no subject, teacher or room; `notes` can name it. */
    isBreak: z.boolean().default(false),
  })
  .strict()
  .refine((entry) => !entry.isBreak || (entry.subjectId === null && entry.teacherId === null && entry.room === null), {
    message: 'A break has no subject, teacher or room.',
    path: ['isBreak'],
  })
  .refine((entry) => (entry.dayOfWeek === null) !== (entry.onDate === null), {
    message: 'Choose a weekday or a date, not both.',
    path: ['dayOfWeek'],
  })
  .refine((entry) => entry.endTime > entry.startTime, {
    message: 'The end must be after the start.',
    path: ['endTime'],
  });
export type TimetableEntryInput = z.infer<typeof timetableEntryInputSchema>;

/**
 * Making or replacing a timetable.
 *
 * Editing sends the whole thing: the entries are the timetable, and a timetable
 * half-saved is one a parent could see half of. `publish` saves it and makes it
 * visible in one step; without it a new timetable is a draft.
 */
export const timetableInputSchema = z
  .object({
    sessionId: idSchema,
    classLevelId: idSchema,
    /** Null means the whole class. */
    sectionId: idSchema.nullable(),
    kind: timetableKindSchema,
    /** Required for an assessment timetable, and only for one. */
    assessmentTypeId: idSchema.nullable(),
    title: z.string().trim().min(3, 'Give it a short title.').max(120),
    description: optionalText(1000),
    /** A class timetable's effective dates. Optional; an assessment's are worked out. */
    startsOn: calendarDateSchema.nullable(),
    endsOn: calendarDateSchema.nullable(),
    entries: z
      .array(timetableEntryInputSchema)
      .min(1, 'Add at least one period.')
      .max(MAX_TIMETABLE_ENTRIES),
    publish: z.boolean().default(false),
  })
  .strict()
  .refine((value) => (value.kind === 'ASSESSMENT') === (value.assessmentTypeId !== null), {
    message: 'Choose the type of assessment — and only for an assessment timetable.',
    path: ['assessmentTypeId'],
  })
  .refine(
    (value) =>
      value.entries.every((entry) => (value.kind === 'CLASS' ? entry.dayOfWeek !== null : entry.onDate !== null)),
    {
      message: 'A class timetable repeats on weekdays; an assessment timetable uses dates.',
      path: ['entries'],
    },
  )
  .refine((value) => value.startsOn === null || value.endsOn === null || value.endsOn >= value.startsOn, {
    message: 'The end date cannot be before the start.',
    path: ['endsOn'],
  });
export type TimetableInput = z.infer<typeof timetableInputSchema>;

// --- Reading -----------------------------------------------------------------

export const timetableRefSchema = z.object({ id: idSchema, name: z.string() });
export type TimetableRef = z.infer<typeof timetableRefSchema>;

export const timetableListItemSchema = z.object({
  id: idSchema,
  title: z.string(),
  kind: timetableKindSchema,
  status: timetableStatusSchema,
  session: timetableRefSchema,
  classLevel: timetableRefSchema,
  section: timetableRefSchema.nullable(),
  assessmentType: timetableRefSchema.nullable(),
  startsOn: calendarDateSchema.nullable(),
  endsOn: calendarDateSchema.nullable(),
  entryCount: z.int().min(0),
  publishedAt: instantSchema.nullable(),
  updatedAt: instantSchema,
});
export type TimetableListItem = z.infer<typeof timetableListItemSchema>;

export const timetableEntrySchema = z.object({
  id: idSchema,
  subject: timetableRefSchema.nullable(),
  teacher: timetableRefSchema.nullable(),
  room: z.string().nullable(),
  dayOfWeek: z.int().min(1).max(7).nullable(),
  onDate: calendarDateSchema.nullable(),
  startTime: timeOfDaySchema,
  endTime: timeOfDaySchema,
  notes: z.string().nullable(),
  isBreak: z.boolean(),
});
export type TimetableEntry = z.infer<typeof timetableEntrySchema>;

export const timetableDetailSchema = timetableListItemSchema.extend({
  description: z.string().nullable(),
  entries: z.array(timetableEntrySchema),
});
export type TimetableDetail = z.infer<typeof timetableDetailSchema>;

export const TIMETABLE_SORT_FIELDS = ['updatedAt', 'createdAt', 'title', 'status'] as const;

/** Strict, so a misspelt filter is a 400 and not an unfiltered list. */
export const timetableListQuerySchema = z
  .object({
    limit: z.coerce.number().int().min(1).max(MAX_PAGE_LIMIT).default(DEFAULT_TIMETABLE_PAGE_SIZE),
    offset: z.coerce.number().int().min(0).default(0),
    sort: z.enum(TIMETABLE_SORT_FIELDS).default('updatedAt'),
    order: sortOrderSchema.default('desc'),
    q: z.string().trim().min(1).max(120).optional(),
    sessionId: idSchema.optional(),
    classLevelId: idSchema.optional(),
    sectionId: idSchema.optional(),
    kind: timetableKindSchema.optional(),
    assessmentTypeId: idSchema.optional(),
    status: timetableStatusSchema.optional(),
  })
  .strict();
export type TimetableListQuery = z.infer<typeof timetableListQuerySchema>;

/** What the form offers, in one read: only ever things this school already has. */
export const timetableOptionsSchema = z.object({
  sessions: z.array(
    z.object({
      id: idSchema,
      name: z.string(),
      isCurrent: z.boolean(),
      startDate: calendarDateSchema,
      endDate: calendarDateSchema,
    }),
  ),
  classes: z.array(
    z.object({
      id: idSchema,
      name: z.string(),
      sections: z.array(z.object({ id: idSchema, name: z.string(), sessionId: idSchema })),
      /** Subjects configured for the class. Empty means none are, and any subject is allowed. */
      subjectIds: z.array(idSchema),
      /** Who the office has said teaches each of those subjects in this class. */
      subjectTeachers: z.array(z.object({ subjectId: idSchema, teacherId: idSchema })),
    }),
  ),
  subjects: z.array(timetableRefSchema),
  assessmentTypes: z.array(timetableRefSchema),
  teachers: z.array(timetableRefSchema),
});
export type TimetableOptions = z.infer<typeof timetableOptionsSchema>;

// --- The calendar ------------------------------------------------------------

export const timetableCalendarQuerySchema = z
  .object({
    from: calendarDateSchema,
    to: calendarDateSchema,
    classLevelId: idSchema.optional(),
    sectionId: idSchema.optional(),
  })
  .strict()
  .refine((value) => value.to >= value.from, { message: 'The end cannot be before the start.', path: ['to'] });
export type TimetableCalendarQuery = z.infer<typeof timetableCalendarQuerySchema>;

export const timetableCalendarEventSchema = z.object({
  /** Stable per entry and date, so the calendar never shows one twice. */
  key: z.string(),
  timetableId: idSchema,
  kind: timetableEventKindSchema,
  title: z.string(),
  subject: z.string().nullable(),
  classLevel: z.string(),
  section: z.string().nullable(),
  date: calendarDateSchema,
  startTime: timeOfDaySchema,
  endTime: timeOfDaySchema,
  room: z.string().nullable(),
  teacher: z.string().nullable(),
  status: timetableStatusSchema,
});
export type TimetableCalendarEvent = z.infer<typeof timetableCalendarEventSchema>;
