import { z } from 'zod';

import { listQuery } from './pagination';
import {
  calendarDateSchema,
  idSchema,
  nonEmptyString,
  phoneSchema,
  textSchema,
} from './primitives';

/**
 * Student contracts.
 *
 * One schema serves the API, the forms and the OpenAPI spec (docs/12 R7), so a
 * rule such as "a name is at most 80 characters" is written once here rather
 * than drifting between a controller and a form.
 */

export const STUDENT_STATUSES = ['ACTIVE', 'INACTIVE', 'GRADUATED', 'LEFT', 'STRUCK_OFF'] as const;

export const studentStatusSchema = z.enum(STUDENT_STATUSES);
export type StudentStatus = z.infer<typeof studentStatusSchema>;

export const GENDERS = ['MALE', 'FEMALE', 'OTHER'] as const;
export const genderSchema = z.enum(GENDERS);

export const GUARDIAN_RELATIONS = ['FATHER', 'MOTHER', 'GUARDIAN'] as const;
export const guardianRelationSchema = z.enum(GUARDIAN_RELATIONS);

/**
 * A student as a list row.
 *
 * Deliberately flat and small: this is what a 500-row grid fetches, so every
 * field here is paid for 500 times. The full record is `studentDetailSchema`.
 */
export const studentListItemSchema = z.object({
  id: idSchema,
  admissionNo: z.string(),
  firstName: z.string(),
  lastName: z.string(),
  status: studentStatusSchema,
  gender: genderSchema.nullable(),
  /** Current enrolment, flattened for display. Null before first enrolment. */
  className: z.string().nullable(),
  sectionName: z.string().nullable(),
  rollNo: z.int().nullable(),
  /** The primary guardian's phone — what reception actually needs on a list. */
  guardianName: z.string().nullable(),
  guardianPhone: z.string().nullable(),
});

export type StudentListItem = z.infer<typeof studentListItemSchema>;

export const studentDetailSchema = studentListItemSchema.extend({
  dateOfBirth: calendarDateSchema.nullable(),
  photoUrl: z.string().nullable(),
  religion: z.string().nullable(),
  bloodGroup: z.string().nullable(),
  nationality: z.string().nullable(),
  address: z.string().nullable(),
  city: z.string().nullable(),
  emergencyContact: z.string().nullable(),
  admittedOn: calendarDateSchema.nullable(),
  leftOn: calendarDateSchema.nullable(),
  leavingReason: z.string().nullable(),
  custom: z.record(z.string(), z.unknown()),
});

export type StudentDetail = z.infer<typeof studentDetailSchema>;

/**
 * The student list query.
 *
 * Sortable fields are an allow-list, never interpolated into SQL. Unknown
 * parameters are rejected by `.strict()` inside `listQuery`, so a typo in a
 * filter name fails loudly rather than silently returning an unfiltered list —
 * the bug that leaks a whole table into a report (docs/11 §6).
 */
export const studentListQuerySchema = listQuery(
  ['name', 'admissionNo', 'className', 'createdAt'] as const,
  {
    status: studentStatusSchema.optional(),
    sessionId: idSchema.optional(),
    sectionId: idSchema.optional(),
    classLevelId: idSchema.optional(),
    gender: genderSchema.optional(),
  },
  'name',
);

export type StudentListQuery = z.infer<typeof studentListQuerySchema>;

/**
 * Creating a student.
 *
 * `admissionNo` is absent on purpose: it comes from a gapless per-school
 * sequence on the server. A client-supplied admission number is how two
 * students end up sharing one, and how a school loses trust in the register.
 *
 * `schoolId` is absent for the same class of reason — tenant scope comes from
 * request context, never from the body (docs/12 R2). A caller must not be able
 * to smuggle a tenant in.
 */
export const createStudentSchema = z
  .object({
    firstName: textSchema(80),
    lastName: textSchema(80),
    gender: genderSchema.optional(),
    dateOfBirth: calendarDateSchema.optional(),
    bFormNo: z.string().trim().max(20).optional(),
    religion: z.string().trim().max(40).optional(),
    bloodGroup: z.string().trim().max(8).optional(),
    nationality: z.string().trim().max(40).optional(),
    address: z.string().trim().max(300).optional(),
    city: z.string().trim().max(80).optional(),
    emergencyContact: z.string().trim().max(40).optional(),
    admittedOn: calendarDateSchema.optional(),

    /** Optional first enrolment, so admission is one request rather than two. */
    enrollment: z
      .object({
        sessionId: idSchema,
        classLevelId: idSchema,
        sectionId: idSchema.optional(),
        rollNo: z.int().min(1).optional(),
      })
      .optional(),

    /** Optional first guardian, created and linked as primary. */
    guardian: z
      .object({
        name: textSchema(120),
        relation: guardianRelationSchema,
        phone: phoneSchema.optional(),
        email: z.email().optional(),
        cnic: z.string().trim().max(20).optional(),
        occupation: z.string().trim().max(80).optional(),
      })
      .optional(),

    custom: z.record(z.string(), z.unknown()).optional(),
  })
  .strict();

export type CreateStudent = z.infer<typeof createStudentSchema>;

/**
 * Updating a student. Every field optional; status is NOT here.
 *
 * Changing status is a state transition with consequences — striking a student
 * off ends their enrolment and stops their billing — so it is its own endpoint
 * that can require a reason and write a meaningful audit entry. A generic
 * `PATCH { status }` can do none of that (docs/11 §7).
 */
export const updateStudentSchema = createStudentSchema
  .omit({ enrollment: true, guardian: true })
  .partial()
  .strict();

export type UpdateStudent = z.infer<typeof updateStudentSchema>;

/** Aggregates travelling with the filtered list, so the screen needs no second call. */
export const studentListAggregatesSchema = {
  totalActive: z.int().min(0),
  totalInactive: z.int().min(0),
};

export const changeStudentStatusSchema = z
  .object({
    status: studentStatusSchema,
    /** Required when leaving or striking off; the register must say why. */
    reason: nonEmptyString.max(300).optional(),
    effectiveOn: calendarDateSchema.optional(),
  })
  .strict();

export type ChangeStudentStatus = z.infer<typeof changeStudentStatusSchema>;
