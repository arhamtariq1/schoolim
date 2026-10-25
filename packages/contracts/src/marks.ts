import { z } from 'zod';

import { calendarDateSchema, idSchema, textSchema } from './primitives';

/**
 * Marks — tests and exams entered by teachers, read by parents and the office.
 *
 * ## Marks are not money
 *
 * They may be fractional (17.5 out of 20), so they are plain numbers limited to
 * two decimals, and stored as `numeric(6,2)`. The money rules (integer minor
 * units) are about currency and do not apply here.
 *
 * ## One assessment per class, subject, type and day
 *
 * That is the duplicate guard, enforced by a unique index and surfaced as a
 * 409: a second "Grade 5 / Maths / Monthly test / 12 Aug" is the same paper
 * entered twice, and two of them would give a child two results for one test.
 */

/**
 * ## Subjects and assessment types are the school's own
 *
 * Neither is an enum. A school names its tests ("Class test", "Midterm",
 * "Pre-board") and its subjects itself, and a fixed list would be
 * school-specific code. Both are rows, seeded with generic defaults on first
 * use and managed by `exams.setup.manage` holders.
 */

/**
 * The assessment types a school starts with. Generic starting points, not one
 * school's list (R1): renamed or deleted freely. Both the marks screens and the
 * timetable form read the same list, so a test is the same test in both.
 */
export const DEFAULT_ASSESSMENT_TYPE_NAMES = [
  'Class test',
  'Monthly test',
  'Surprise test',
  'Midterm exam',
  'Final exam',
] as const;

export const MAX_MARKS = 1000;
export const MAX_ASSESSMENT_ENTRIES = 500;

const twoDecimals = (value: number): boolean => Math.round(value * 100) / 100 === value;

/** A mark: zero or more, at most two decimals. */
const marksSchema = z
  .number()
  .min(0, 'Marks cannot be negative.')
  .max(MAX_MARKS, `Marks cannot exceed ${String(MAX_MARKS)}.`)
  .refine(twoDecimals, 'Use at most two decimal places.');

export const totalMarksSchema = marksSchema.refine((value) => value > 0, {
  message: 'Total marks must be more than zero.',
});

/** `null` means the child was absent: not zero, which is a result. */
export const markEntryInputSchema = z
  .object({ studentId: idSchema, obtained: marksSchema.nullable() })
  .strict();

export type MarkEntryInput = z.infer<typeof markEntryInputSchema>;

const entriesSchema = z.array(markEntryInputSchema).min(1, 'Enter marks for at least one student.').max(MAX_ASSESSMENT_ENTRIES);

function entriesAreSane(value: { totalMarks: number; entries: MarkEntryInput[] }): boolean {
  return value.entries.every((entry) => entry.obtained === null || entry.obtained <= value.totalMarks);
}

function studentsAreUnique(value: { entries: MarkEntryInput[] }): boolean {
  return new Set(value.entries.map((entry) => entry.studentId)).size === value.entries.length;
}

export const createAssessmentSchema = z
  .object({
    classLevelId: idSchema,
    subjectId: idSchema,
    assessmentTypeId: idSchema,
    heldOn: calendarDateSchema,
    totalMarks: totalMarksSchema,
    entries: entriesSchema,
  })
  .strict()
  .refine(entriesAreSane, {
    message: 'A student cannot score more than the total marks.',
    path: ['entries'],
  })
  .refine(studentsAreUnique, { message: 'A student appears twice.', path: ['entries'] });

export type CreateAssessment = z.infer<typeof createAssessmentSchema>;

/** Editing keeps the class, subject, type and day — those identify the test. */
export const updateAssessmentSchema = z
  .object({ totalMarks: totalMarksSchema, entries: entriesSchema })
  .strict()
  .refine(entriesAreSane, {
    message: 'A student cannot score more than the total marks.',
    path: ['entries'],
  })
  .refine(studentsAreUnique, { message: 'A student appears twice.', path: ['entries'] });

export type UpdateAssessment = z.infer<typeof updateAssessmentSchema>;

/** Creating and renaming a subject or an assessment type take the same body. */
export const namedItemSchema = z.object({ name: textSchema(60) }).strict();
export type NamedItem = z.infer<typeof namedItemSchema>;
export const createSubjectSchema = namedItemSchema;
export type CreateSubject = NamedItem;

export const assessmentListQuerySchema = z
  .object({
    classLevelId: idSchema.optional(),
    subjectId: idSchema.optional(),
    assessmentTypeId: idSchema.optional(),
    from: calendarDateSchema.optional(),
    to: calendarDateSchema.optional(),
  })
  .strict();

export type AssessmentListQuery = z.infer<typeof assessmentListQuerySchema>;

export interface SubjectItem {
  id: string;
  name: string;
  /** Assessments using it. A subject in use cannot be deleted. */
  usageCount: number;
}

export interface AssessmentTypeItem {
  id: string;
  name: string;
  /** Assessments using it. A type in use cannot be deleted. */
  usageCount: number;
}

export interface AssessmentListItem {
  id: string;
  classLevelId: string;
  className: string;
  subjectId: string;
  subjectName: string;
  typeId: string;
  typeName: string;
  heldOn: string;
  totalMarks: number;
  /** Students with a result entered, absent ones included. */
  entryCount: number;
  /** Mean of the students who sat it, as a percentage; null when nobody did. */
  averagePercent: number | null;
}

export interface AssessmentStudentEntry {
  studentId: string;
  name: string;
  grNo: string;
  rollNo: number | null;
  /** Null: absent, or not entered yet. */
  obtained: number | null;
}

export interface AssessmentDetail extends AssessmentListItem {
  entries: AssessmentStudentEntry[];
}

/** The class list a new assessment's entry grid starts from. */
export interface MarksRoster {
  classLevelId: string;
  className: string;
  students: Omit<AssessmentStudentEntry, 'obtained'>[];
}

/** One result, as a student's or a parent's page shows it. */
export interface StudentMarkResult {
  assessmentId: string;
  subjectName: string;
  typeName: string;
  heldOn: string;
  totalMarks: number;
  /** Null: absent. */
  obtained: number | null;
  percent: number | null;
}

/**
 * One subject, or one assessment type, as it has been used in a class.
 *
 * Subjects and assessment types are the school's lists — there is no per-class
 * configuration — so a class's page shows each of them with **what has actually
 * happened in that class**: how many tests, the latest, and the class average.
 * A subject with no tests there says so rather than disappearing.
 */
export interface ClassUsageItem {
  id: string;
  name: string;
  testCount: number;
  /** The most recent test day, or null when there has been none. */
  lastHeldOn: string | null;
  /** Mean of the tests' own averages, as a percentage; null when nobody has sat one. */
  averagePercent: number | null;
  /** Who teaches it in this class. Subjects only; always null for an assessment type. */
  teacher: { id: string; name: string } | null;
}

/**
 * Add a subject or an assessment type to a class: pick one the school already
 * has (`itemId`) or name a new one (`name`) — exactly one of the two. A new
 * name joins the school's list *and* the class in one step.
 */
export const assignToClassSchema = z
  .object({ itemId: idSchema.optional(), name: textSchema(60).optional() })
  .strict()
  .refine((value) => (value.itemId === undefined) !== (value.name === undefined), {
    message: 'Choose an existing one, or type a new name — not both.',
  });

export type AssignToClass = z.infer<typeof assignToClassSchema>;

/** Who teaches a subject in a class; null takes the teacher off it. */
export const setSubjectTeacherSchema = z.object({ teacherId: idSchema.nullable() }).strict();

export type SetSubjectTeacher = z.infer<typeof setSubjectTeacherSchema>;

export interface ClassMarksSummary {
  /** The subjects **this class** has, with how each has gone. */
  subjects: ClassUsageItem[];
  /** The assessment types this class has. */
  assessmentTypes: ClassUsageItem[];
  /** School subjects this class does not have yet — what "add existing" offers. */
  availableSubjects: { id: string; name: string }[];
  availableAssessmentTypes: { id: string; name: string }[];
  /** Active teachers the office can choose from for a subject. */
  teachers: { id: string; name: string }[];
  testCount: number;
  averagePercent: number | null;
}
