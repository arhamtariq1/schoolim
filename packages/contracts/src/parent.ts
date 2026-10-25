import { z } from 'zod';

import { calendarDateSchema, idSchema } from './primitives';
import { genderSchema } from './students';

/**
 * The parent portal — a read-only window onto the children a guardian is linked
 * to, and nothing else.
 *
 * ## Why it has its own endpoints
 *
 * The staff screens could have been reused with a "scoped" grant, and for the
 * student list they nearly were. But a scoped grant only protects the services
 * that remember to narrow, and every endpoint that forgets — a student detail,
 * a fee voucher, an attendance report — hands one family another family's
 * children. These endpoints start from the **guardian's own account** and can
 * only ever reach a child through it, so there is no unscoped query for a
 * parent to find.
 */

export const parentChildSummarySchema = z.object({
  id: idSchema,
  name: z.string(),
  grNo: z.string(),
  photoUrl: z.string().nullable(),
  className: z.string().nullable(),
  sectionName: z.string().nullable(),
  /** For asking the timetable about this child's own class and section. */
  classLevelId: idSchema.nullable(),
  sectionId: idSchema.nullable(),
  status: z.string(),
});

export type ParentChildSummary = z.infer<typeof parentChildSummarySchema>;

export const parentChildProfileSchema = parentChildSummarySchema.extend({
  studentCode: z.string(),
  gender: genderSchema.nullable(),
  dateOfBirth: calendarDateSchema.nullable(),
  sessionName: z.string().nullable(),
  rollNo: z.int().nullable(),
  admittedOn: calendarDateSchema.nullable(),
  religion: z.string().nullable(),
  nationality: z.string().nullable(),
  address: z.string().nullable(),
  status: z.string(),
});

export type ParentChildProfile = z.infer<typeof parentChildProfileSchema>;

export const PARENT_ATTENDANCE_STATUSES = [
  'PRESENT',
  'ABSENT',
  'LATE',
  'LEAVE',
  'HALF_DAY',
  'EXCUSED',
] as const;

export const parentAttendanceSchema = z.object({
  /** First day of the month the figures cover, `YYYY-MM-01`. */
  month: calendarDateSchema,
  /** Days marked in the month. */
  markedDays: z.int().min(0),
  counts: z.record(z.enum(PARENT_ATTENDANCE_STATUSES), z.int().min(0)),
  /** Present, late and half-day count as attending. Null when nothing is marked. */
  attendancePercent: z.number().min(0).max(100).nullable(),
  recent: z.array(
    z.object({
      date: calendarDateSchema,
      status: z.enum(PARENT_ATTENDANCE_STATUSES),
      note: z.string().nullable(),
    }),
  ),
});

export type ParentAttendance = z.infer<typeof parentAttendanceSchema>;

export const parentAttendanceQuerySchema = z
  .object({ month: z.string().regex(/^\d{4}-\d{2}$/, 'Use YYYY-MM.').optional() })
  .strict();
