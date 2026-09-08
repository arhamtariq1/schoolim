import { z } from 'zod';

import { calendarDateSchema, idSchema, textSchema } from './primitives';

/**
 * Academic structure — sessions, classes, sections and the calendar.
 *
 * docs/07 §3: **sessions are the axis of everything.** A section belongs to a
 * session, an enrolment belongs to a session, and so does a holiday. That is
 * what makes year rollover a supported operation — clone the sections, promote
 * the students — rather than a data migration written under pressure each July.
 */

export const SESSION_STATUSES = ['PLANNED', 'ACTIVE', 'CLOSED'] as const;
export const sessionStatusSchema = z.enum(SESSION_STATUSES);
export type SessionStatus = z.infer<typeof sessionStatusSchema>;

export const academicSessionSchema = z.object({
  id: idSchema,
  name: z.string(),
  startDate: calendarDateSchema,
  endDate: calendarDateSchema,
  status: sessionStatusSchema,
  /** Exactly one per school, enforced by a partial unique index. */
  isCurrent: z.boolean(),
  /** Enrolments attached to it — what makes deleting one dangerous. */
  enrollmentCount: z.int().min(0),
  sectionCount: z.int().min(0),
});

export type AcademicSession = z.infer<typeof academicSessionSchema>;

const sessionDates = {
  startDate: calendarDateSchema,
  endDate: calendarDateSchema,
};

/**
 * A session must end after it starts.
 *
 * Checked in the schema rather than the service so the form catches it before a
 * round trip, and the API cannot be talked past it by a caller that is not our
 * form.
 */
export const createSessionSchema = z
  .object({
    name: textSchema(60),
    ...sessionDates,
    status: sessionStatusSchema.default('PLANNED'),
  })
  .strict()
  .refine((value) => value.endDate > value.startDate, {
    message: 'The session must end after it starts.',
    path: ['endDate'],
  });

export type CreateSession = z.infer<typeof createSessionSchema>;

export const updateSessionSchema = z
  .object({
    name: textSchema(60).optional(),
    startDate: calendarDateSchema.optional(),
    endDate: calendarDateSchema.optional(),
    status: sessionStatusSchema.optional(),
  })
  .strict()
  .refine(
    (value) =>
      value.startDate === undefined ||
      value.endDate === undefined ||
      value.endDate > value.startDate,
    { message: 'The session must end after it starts.', path: ['endDate'] },
  );

export type UpdateSession = z.infer<typeof updateSessionSchema>;

// ---------------------------------------------------------------------------
// Classes and sections
// ---------------------------------------------------------------------------

export const sectionSchema = z.object({
  id: idSchema,
  name: z.string(),
  capacity: z.int().nullable(),
  /** Which session this section belongs to — sections are per year. */
  sessionId: idSchema,
  sessionName: z.string(),
  /** Students currently enrolled in it. Blocks deletion when non-zero. */
  studentCount: z.int().min(0),
});

export type Section = z.infer<typeof sectionSchema>;

export const classLevelSchema = z.object({
  id: idSchema,
  name: z.string(),
  /**
   * Sort key, and what promotion increments. Nursery may be 0, Grade 1 is 1.
   * Alphabetical ordering puts "Grade 10" before "Grade 2", which is why this
   * is a number and not a label.
   */
  numericOrder: z.int(),
  isActive: z.boolean(),
  /** Sections in the current session. A class with none is not yet usable. */
  sections: z.array(sectionSchema),
  /** Across every session — the number that makes deletion unsafe. */
  studentCount: z.int().min(0),
});

export type ClassLevel = z.infer<typeof classLevelSchema>;

export const createClassLevelSchema = z
  .object({
    name: textSchema(60),
    numericOrder: z.int().min(0).max(100),
    isActive: z.boolean().default(true),
  })
  .strict();

export type CreateClassLevel = z.infer<typeof createClassLevelSchema>;

export const updateClassLevelSchema = createClassLevelSchema.partial().strict();
export type UpdateClassLevel = z.infer<typeof updateClassLevelSchema>;

/**
 * A section, created against a class **and** a session.
 *
 * Both are required rather than the session being inferred from "current",
 * because a school sets up next year's sections while this year is still
 * running, and an inferred session would silently put them in the wrong year.
 */
export const createSectionSchema = z
  .object({
    classLevelId: idSchema,
    sessionId: idSchema,
    name: textSchema(20),
    capacity: z.int().min(1).max(500).optional(),
  })
  .strict();

export type CreateSection = z.infer<typeof createSectionSchema>;

export const updateSectionSchema = z
  .object({
    name: textSchema(20).optional(),
    capacity: z.int().min(1).max(500).nullable().optional(),
    /** Moving a section to another class. Rare, and occasionally necessary. */
    classLevelId: idSchema.optional(),
  })
  .strict();

export type UpdateSection = z.infer<typeof updateSectionSchema>;

// ---------------------------------------------------------------------------
// Holidays
// ---------------------------------------------------------------------------

export const HOLIDAY_TYPES = ['HOLIDAY', 'VACATION', 'EVENT'] as const;
export const holidayTypeSchema = z.enum(HOLIDAY_TYPES);
export type HolidayType = z.infer<typeof holidayTypeSchema>;

export const HOLIDAY_AUDIENCES = ['ALL', 'STUDENTS', 'STAFF'] as const;
export const holidayAudienceSchema = z.enum(HOLIDAY_AUDIENCES);
export type HolidayAudience = z.infer<typeof holidayAudienceSchema>;

export const HOLIDAY_TYPE_LABELS: Readonly<Record<HolidayType, string>> = {
  HOLIDAY: 'Holiday',
  VACATION: 'Vacation',
  EVENT: 'Event',
};

export const HOLIDAY_AUDIENCE_LABELS: Readonly<Record<HolidayAudience, string>> = {
  ALL: 'Everyone',
  STUDENTS: 'Students only',
  STAFF: 'Staff only',
};

export const holidaySchema = z.object({
  id: idSchema,
  sessionId: idSchema,
  name: z.string(),
  type: holidayTypeSchema,
  appliesTo: holidayAudienceSchema,
  startDate: calendarDateSchema,
  /** Inclusive. Equal to `startDate` for a single day. */
  endDate: calendarDateSchema,
  notes: z.string().nullable(),
  /** Inclusive day count, computed server-side so no caller re-derives it. */
  days: z.int().min(1),
});

export type Holiday = z.infer<typeof holidaySchema>;

export const createHolidaySchema = z
  .object({
    sessionId: idSchema,
    name: textSchema(80),
    type: holidayTypeSchema.default('HOLIDAY'),
    appliesTo: holidayAudienceSchema.default('ALL'),
    startDate: calendarDateSchema,
    /** Omit for a single day; the server sets it equal to `startDate`. */
    endDate: calendarDateSchema.optional(),
    notes: z.string().trim().max(300).optional(),
  })
  .strict()
  .refine((value) => value.endDate === undefined || value.endDate >= value.startDate, {
    message: 'The last day cannot be before the first.',
    path: ['endDate'],
  });

export type CreateHoliday = z.infer<typeof createHolidaySchema>;

export const updateHolidaySchema = z
  .object({
    name: textSchema(80).optional(),
    type: holidayTypeSchema.optional(),
    appliesTo: holidayAudienceSchema.optional(),
    startDate: calendarDateSchema.optional(),
    endDate: calendarDateSchema.optional(),
    notes: z.string().trim().max(300).nullable().optional(),
  })
  .strict()
  .refine(
    (value) =>
      value.startDate === undefined ||
      value.endDate === undefined ||
      value.endDate >= value.startDate,
    { message: 'The last day cannot be before the first.', path: ['endDate'] },
  );

export type UpdateHoliday = z.infer<typeof updateHolidaySchema>;
