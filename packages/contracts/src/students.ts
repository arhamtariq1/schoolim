import { z } from 'zod';

import { feeTotalsSchema, studentFeeLineSchema, studentFeeSchema } from './fees';
import { listQuery } from './pagination';
import {
  calendarDateSchema,
  idSchema,
  nonEmptyString,
  phoneSchema,
  positiveMinorUnitsSchema,
  reasonSchema,
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
  /**
   * The General Register number — the school's permanent entry for this child.
   * Issued once, never reused, never edited, and it outlives them leaving.
   */
  grNo: z.string(),
  /**
   * The school's **Student ID**, as printed on the card and the fee voucher.
   *
   * Named `studentCode` rather than `studentId` because that name already means
   * the internal UUID on every table that points at a student. One identifier
   * with two meanings is a join written against the wrong one, and it reads as
   * correct. The label a person sees is "Student ID".
   */
  studentCode: z.string(),
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
  /**
   * The father's name where one is recorded, otherwise the primary guardian's.
   *
   * A register that has always printed "Father Name" cannot show a blank column
   * for a child raised by an aunt, so this falls back rather than being null
   * whenever no `FATHER` relation exists. `guardianName` stays available for
   * callers that need the literal primary contact.
   */
  fatherName: z.string().nullable(),
  admittedOn: calendarDateSchema.nullable(),
  /**
   * Integer paisa payable for the `TUITION` head, after any discount.
   *
   * On the list because it is the one figure reception is asked for by phone,
   * and because a column that requires opening each row is a column nobody
   * uses. Null when the school has no tuition head, or this child has no line
   * against it.
   */
  tuitionFeeMinor: positiveMinorUnitsSchema.nullable(),
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
  ['name', 'grNo', 'studentCode', 'className', 'createdAt'] as const,
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
 * `grNo` and `studentCode` are absent on purpose: both come from gapless
 * per-school sequences allocated on the server, inside the same transaction as
 * the insert. A client-supplied number is how two children end up sharing one,
 * and how a school stops trusting its own register.
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

    /**
     * The fee structure agreed at admission.
     *
     * Part of this request rather than a second call, for the same reason
     * `enrollment` and `guardian` are: a child admitted with no fees, because
     * the second request failed or the tab was closed, is a child who is
     * invisible to billing and looks perfectly fine on every screen. One
     * transaction or none of it.
     *
     * Omitted entirely means "use the school's active catalogue at its default
     * amounts", which is what the form sends when nobody touched anything.
     */
    fees: z.array(studentFeeLineSchema).max(50).optional(),

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
  .omit({ enrollment: true, guardian: true, fees: true })
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

/**
 * Removing a student.
 *
 * A reason is **required**, and this is a soft delete. A school's register is a
 * legal record: a row that vanishes takes with it the answer to "was this child
 * ever enrolled here", which is the one question a register exists to answer.
 * The row is hidden everywhere and erased later by the retention job in
 * docs/17 §4 — not by a button someone clicked in a hurry.
 *
 * For a student who has simply left, use `changeStatus` with `LEFT`. Delete is
 * for a record created in error.
 */
export const deleteStudentSchema = z
  .object({
    reason: reasonSchema,
  })
  .strict();

export type DeleteStudent = z.infer<typeof deleteStudentSchema>;

/**
 * A class level with the sections that exist in the current session.
 *
 * Nested rather than two endpoints: a form that fetches classes, then sections
 * for the chosen class, renders two loading states and briefly shows sections
 * belonging to the previously selected class.
 */
export const sectionOptionSchema = z.object({
  id: idSchema,
  name: z.string(),
  capacity: z.int().nullable(),
});

export const classLevelWithSectionsSchema = z.object({
  id: idSchema,
  name: z.string(),
  /** Sort key. Alphabetical puts "Grade 10" before "Grade 2". */
  numericOrder: z.int(),
  sections: z.array(sectionOptionSchema),
});

export type ClassLevelWithSections = z.infer<typeof classLevelWithSectionsSchema>;

export const currentSessionSchema = z.object({
  id: idSchema,
  name: z.string(),
  startDate: calendarDateSchema,
  endDate: calendarDateSchema,
});

export type CurrentSession = z.infer<typeof currentSessionSchema>;

/** A guardian attached to a student, as the 360 page shows them. */
export const studentGuardianSchema = z.object({
  id: idSchema,
  name: z.string(),
  relation: guardianRelationSchema,
  phone: z.string().nullable(),
  email: z.string().nullable(),
  cnic: z.string().nullable(),
  occupation: z.string().nullable(),
  isPrimary: z.boolean(),
  /** Whose name the fee voucher goes to. Exactly one per student. */
  isFeePayer: z.boolean(),
  /**
   * Other children of this guardian, in this school.
   *
   * Siblings fall out of the guardian link rather than being guessed from a
   * surname — Pakistani families share a surname across households far too
   * often for that to be safe. A real sibling link is what lets fees be billed
   * to one family and a sibling discount mean anything.
   */
  siblings: z.array(
    z.object({
      id: idSchema,
      name: z.string(),
      grNo: z.string(),
      className: z.string().nullable(),
    }),
  ),
});

export type StudentGuardian = z.infer<typeof studentGuardianSchema>;

/** One row of a student's enrolment history — which class, which year. */
export const enrollmentHistoryItemSchema = z.object({
  id: idSchema,
  sessionName: z.string(),
  className: z.string(),
  sectionName: z.string().nullable(),
  rollNo: z.int().nullable(),
  status: z.enum(['ENROLLED', 'PROMOTED', 'REPEATED', 'TRANSFERRED', 'LEFT']),
  enrolledOn: calendarDateSchema.nullable(),
  endedOn: calendarDateSchema.nullable(),
});

export type EnrollmentHistoryItem = z.infer<typeof enrollmentHistoryItemSchema>;

/**
 * Everything the student's own page shows, in one response.
 *
 * One request, not four. A 360 page that fires separate calls for details,
 * guardians and history renders three spinners that finish out of order, and
 * the first thing a person sees is a page assembling itself.
 */
export const studentProfileSchema = studentDetailSchema.extend({
  guardians: z.array(studentGuardianSchema),
  enrollments: z.array(enrollmentHistoryItemSchema),
  /** The agreed fee structure, with the totals already summed server-side. */
  fees: z.array(studentFeeSchema),
  feeTotals: feeTotalsSchema,
});

export type StudentProfile = z.infer<typeof studentProfileSchema>;

/** Adding a guardian to a student, or editing one already attached. */
export const upsertGuardianSchema = z
  .object({
    name: textSchema(120),
    relation: guardianRelationSchema,
    phone: phoneSchema.optional(),
    email: z.email().optional(),
    cnic: z.string().trim().max(20).optional(),
    occupation: z.string().trim().max(80).optional(),
    /** Promotes this guardian and demotes whoever held the flag. */
    isPrimary: z.boolean().optional(),
    isFeePayer: z.boolean().optional(),
  })
  .strict();

export type UpsertGuardian = z.infer<typeof upsertGuardianSchema>;

/**
 * Attaching an existing guardian, by id.
 *
 * The path that makes siblings work: the second child is linked to the guardian
 * the first child already has, rather than a second copy of the same person
 * being typed in. Two copies means two fee vouchers, two phone numbers to keep
 * in step, and no sibling discount that can ever be calculated.
 */
export const linkGuardianSchema = z
  .object({
    guardianId: idSchema,
    isPrimary: z.boolean().optional(),
    isFeePayer: z.boolean().optional(),
  })
  .strict();

export type LinkGuardian = z.infer<typeof linkGuardianSchema>;
