import { z } from 'zod';

import { calendarDateSchema, idSchema, monthKeySchema } from './primitives';

/**
 * Attendance — docs/modules/attendance-and-exams.md Part A.
 *
 * ## The number everything else depends on
 *
 * `expectedDays`. A percentage is only honest if its denominator is the days a
 * child could actually have attended: weekdays the school runs, minus
 * holidays, minus days before they were admitted or after they left. Count
 * calendar days instead and every new admission starts the year at 40%.
 */

// --- Statuses ---------------------------------------------------------------

export const ATTENDANCE_STATUSES = [
  'PRESENT',
  'ABSENT',
  'LATE',
  'LEAVE',
  'HALF_DAY',
  'EXCUSED',
] as const;
export const attendanceStatusSchema = z.enum(ATTENDANCE_STATUSES);
export type AttendanceStatus = z.infer<typeof attendanceStatusSchema>;

export const ATTENDANCE_STATUS_LABELS: Readonly<Record<AttendanceStatus, string>> = {
  PRESENT: 'Present',
  ABSENT: 'Absent',
  LATE: 'Late',
  LEAVE: 'Leave',
  HALF_DAY: 'Half day',
  EXCUSED: 'Excused',
};

/** One character, for a month grid where 31 columns have to fit. */
export const ATTENDANCE_STATUS_SHORT: Readonly<Record<AttendanceStatus, string>> = {
  PRESENT: 'P',
  ABSENT: 'A',
  LATE: 'L',
  LEAVE: 'Lv',
  HALF_DAY: 'H',
  EXCUSED: 'E',
};

/** Counted as attended. Half a day still had the child in the building. */
export const PRESENT_STATUSES: readonly AttendanceStatus[] = [
  'PRESENT',
  'LATE',
  'HALF_DAY',
] as const;

export const STAFF_ATTENDANCE_STATUSES = [
  'PRESENT',
  'ABSENT',
  'LATE',
  'SICK_LEAVE',
  'CASUAL_LEAVE',
  'HALF_DAY',
] as const;
export const staffAttendanceStatusSchema = z.enum(STAFF_ATTENDANCE_STATUSES);
export type StaffAttendanceStatus = z.infer<typeof staffAttendanceStatusSchema>;

export const STAFF_ATTENDANCE_STATUS_LABELS: Readonly<Record<StaffAttendanceStatus, string>> = {
  PRESENT: 'Present',
  ABSENT: 'Absent',
  LATE: 'Late',
  SICK_LEAVE: 'Sick leave',
  CASUAL_LEAVE: 'Casual leave',
  HALF_DAY: 'Half day',
};

export const STAFF_ATTENDANCE_STATUS_SHORT: Readonly<Record<StaffAttendanceStatus, string>> = {
  PRESENT: 'P',
  ABSENT: 'A',
  LATE: 'L',
  SICK_LEAVE: 'S',
  CASUAL_LEAVE: 'C',
  HALF_DAY: 'H',
};

// --- Why a day is not markable ----------------------------------------------

/**
 * A day the school is not running.
 *
 * Returned rather than a bare refusal so the screen can say *which* holiday,
 * which is the difference between "you cannot do that" and an answer.
 */
export const NON_WORKING_REASONS = ['WEEKEND', 'HOLIDAY', 'FUTURE', 'BEFORE_SESSION'] as const;
export const nonWorkingReasonSchema = z.enum(NON_WORKING_REASONS);
export type NonWorkingReason = z.infer<typeof nonWorkingReasonSchema>;

export const dayStatusSchema = z.object({
  date: calendarDateSchema,
  isWorkingDay: z.boolean(),
  reason: nonWorkingReasonSchema.nullable(),
  /** The holiday's name, when that is why. */
  holidayName: z.string().nullable(),
});

export type DayStatus = z.infer<typeof dayStatusSchema>;

// --- The class overview -----------------------------------------------------

/** One card on the "pick a class" screen. */
export const classAttendanceCardSchema = z.object({
  classLevelId: idSchema,
  className: z.string(),
  sectionId: idSchema.nullable(),
  sectionName: z.string().nullable(),
  strength: z.int().min(0),
  /** Null when nobody has marked this class for the chosen date yet. */
  markedAt: z.string().nullable(),
  present: z.int().min(0),
  absent: z.int().min(0),
  leave: z.int().min(0),
});

export type ClassAttendanceCard = z.infer<typeof classAttendanceCardSchema>;

export const classOverviewQuerySchema = z
  .object({
    date: calendarDateSchema.optional(),
    sessionId: idSchema.optional(),
  })
  .strict();

export type ClassOverviewQuery = z.infer<typeof classOverviewQuerySchema>;

export const classOverviewSchema = z.object({
  date: calendarDateSchema,
  day: dayStatusSchema,
  classes: z.array(classAttendanceCardSchema),
});

export type ClassOverview = z.infer<typeof classOverviewSchema>;

// --- The marking roster -----------------------------------------------------

export const rosterEntrySchema = z.object({
  studentId: idSchema,
  name: z.string(),
  grNo: z.string(),
  fatherName: z.string().nullable(),
  rollNo: z.int().nullable(),
  sectionId: idSchema.nullable(),
  sectionName: z.string().nullable(),
  /** What is already recorded for this date, if anything. */
  status: attendanceStatusSchema.nullable(),
  note: z.string().nullable(),
});

export type RosterEntry = z.infer<typeof rosterEntrySchema>;

export const rosterQuerySchema = z
  .object({
    date: calendarDateSchema,
    sectionId: idSchema.optional(),
    sessionId: idSchema.optional(),
  })
  .strict();

export type RosterQuery = z.infer<typeof rosterQuerySchema>;

export const rosterSchema = z.object({
  classLevelId: idSchema,
  className: z.string(),
  date: calendarDateSchema,
  day: dayStatusSchema,
  /** False once the date is older than the school allows without an unlock. */
  isEditable: z.boolean(),
  lockedReason: z.string().nullable(),
  markedAt: z.string().nullable(),
  markedByName: z.string().nullable(),
  students: z.array(rosterEntrySchema),
});

export type Roster = z.infer<typeof rosterSchema>;

/**
 * Submitting a register.
 *
 * One request for the whole class — docs §3, "one submit, no per-student save".
 * Re-submitting the same class and date updates rather than duplicating.
 */
export const markAttendanceSchema = z
  .object({
    classLevelId: idSchema,
    date: calendarDateSchema,
    entries: z
      .array(
        z
          .object({
            studentId: idSchema,
            status: attendanceStatusSchema,
            note: z.string().trim().max(200).optional(),
          })
          .strict(),
      )
      .min(1)
      .max(500),
  })
  .strict();

export type MarkAttendance = z.infer<typeof markAttendanceSchema>;

export const markResultSchema = z.object({
  saved: z.int().min(0),
  /** Students in the request who are not enrolled on that date. */
  skipped: z.int().min(0),
});

export type MarkResult = z.infer<typeof markResultSchema>;

// --- Staff marking ----------------------------------------------------------

export const staffRosterEntrySchema = z.object({
  staffId: idSchema,
  employeeNo: z.string(),
  name: z.string(),
  email: z.string().nullable(),
  role: z.string(),
  status: staffAttendanceStatusSchema.nullable(),
  note: z.string().nullable(),
});

export type StaffRosterEntry = z.infer<typeof staffRosterEntrySchema>;

export const staffRosterSchema = z.object({
  date: calendarDateSchema,
  day: dayStatusSchema,
  isEditable: z.boolean(),
  lockedReason: z.string().nullable(),
  markedAt: z.string().nullable(),
  staff: z.array(staffRosterEntrySchema),
});

export type StaffRoster = z.infer<typeof staffRosterSchema>;

export const markStaffAttendanceSchema = z
  .object({
    date: calendarDateSchema,
    entries: z
      .array(
        z
          .object({
            staffId: idSchema,
            status: staffAttendanceStatusSchema,
            note: z.string().trim().max(200).optional(),
          })
          .strict(),
      )
      .min(1)
      .max(500),
  })
  .strict();

export type MarkStaffAttendance = z.infer<typeof markStaffAttendanceSchema>;

// --- Monthly reports --------------------------------------------------------

export const monthlyReportQuerySchema = z
  .object({
    /** `YYYY-MM`. */
    month: monthKeySchema,
    sectionId: idSchema.optional(),
    sessionId: idSchema.optional(),
    q: z.string().trim().max(80).optional(),
  })
  .strict();

export type MonthlyReportQuery = z.infer<typeof monthlyReportQuerySchema>;

/**
 * One student's month.
 *
 * `days` is keyed by day-of-month so the grid can render 1–31 without the
 * client doing date arithmetic, and a day with no mark is simply absent from
 * the map — distinct from a day marked absent, which is the distinction the
 * reference screen loses when it prints "A" for days that had not happened yet.
 */
export const monthlyRowSchema = z.object({
  subjectId: idSchema,
  name: z.string(),
  /** GR number for a student, employee number for staff. */
  code: z.string(),
  days: z.record(z.string(), z.string()),
  present: z.int().min(0),
  absent: z.int().min(0),
  leave: z.int().min(0),
  /** Days this person could have attended. The percentage denominator. */
  expectedDays: z.int().min(0),
  /** Basis points, so no float reaches the wire. 9250 is 92.50%. */
  percentBasisPoints: z.int().min(0).max(10_000),
});

export type MonthlyRow = z.infer<typeof monthlyRowSchema>;

export const monthlyReportSchema = z.object({
  month: monthKeySchema,
  title: z.string(),
  /** Every day of the month, so the grid can grey out the closed ones. */
  days: z.array(dayStatusSchema),
  workingDays: z.int().min(0),
  rows: z.array(monthlyRowSchema),
});

export type MonthlyReport = z.infer<typeof monthlyReportSchema>;
