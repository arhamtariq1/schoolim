import { z } from 'zod';

import { listQuery } from './pagination';
import {
  calendarDateSchema,
  emailSchema,
  idSchema,
  phoneSchema,
  positiveMinorUnitsSchema,
  reasonSchema,
  textSchema,
} from './primitives';
import { formatCnic, nationalIdSchema } from './national-id';
import { genderSchema } from './students';

export { formatCnic };

/**
 * Staff — the people a school employs. docs/07 §4.
 *
 * ## Why a staff role is not a portal role
 *
 * `SCHOOL_ROLES` is about what the portal permits. `STAFF_ROLES` is about what
 * somebody does. A peon and a security guard are on the payroll with leave
 * and a salary and have no reason to sign in to anything; a principal and an admin
 * need both. One enum for both jobs would mean inventing logins for people who
 * will never use one, or leaving half the payroll unrecorded.
 *
 * The mapping below is what connects them, and only for the roles that get an
 * account at all.
 */

export const STAFF_ROLES = [
  'ADMIN',
  'PRINCIPAL',
  'OFFICE_STAFF',
  'TEACHER',
  'SECURITY_GUARD',
  'PEON',
  'OTHERS',
] as const;

export const staffRoleSchema = z.enum(STAFF_ROLES);
export type StaffRole = z.infer<typeof staffRoleSchema>;

export const STAFF_ROLE_LABELS: Readonly<Record<StaffRole, string>> = {
  ADMIN: 'Admin (School Owner)',
  PRINCIPAL: 'Principal',
  OFFICE_STAFF: 'Office Staff',
  TEACHER: 'Teacher',
  SECURITY_GUARD: 'Security Guard',
  PEON: 'Peon',
  OTHERS: 'Others',
};

/**
 * Which staff roles can hold a portal account, and what it grants.
 *
 * A role absent from this map gets no login — not a login with no permissions.
 * The distinction matters: an account that exists but can do nothing still has
 * a password to leak and a session to steal.
 */
export const STAFF_ROLE_TO_SCHOOL_ROLE = {
  ADMIN: 'ADMIN',
  PRINCIPAL: 'PRINCIPAL',
  OFFICE_STAFF: 'RECEPTION',
  TEACHER: 'TEACHER',
} as const satisfies Partial<Record<StaffRole, string>>;

export function staffRoleCanSignIn(role: StaffRole): boolean {
  return role in STAFF_ROLE_TO_SCHOOL_ROLE;
}

export const STAFF_STATUSES = ['ACTIVE', 'LEFT'] as const;
export const staffStatusSchema = z.enum(STAFF_STATUSES);
export type StaffStatus = z.infer<typeof staffStatusSchema>;

export const staffListItemSchema = z.object({
  id: idSchema,
  /** Gapless per-school counter. Printed on payroll. */
  employeeNo: z.string(),
  name: z.string(),
  email: z.string().nullable(),
  phone: z.string().nullable(),
  gender: genderSchema.nullable(),
  role: staffRoleSchema,
  status: staffStatusSchema,
  casualLeaves: z.int(),
  sickLeaves: z.int(),
  /** Integer paisa. */
  basicSalaryMinor: positiveMinorUnitsSchema,
  joinedOn: calendarDateSchema.nullable(),
  /** Whether they actually hold a portal account, not whether they could. */
  hasLogin: z.boolean(),
  /**
   * Invited, but they have not chosen a password yet.
   *
   * A separate flag rather than folding it into `hasLogin`, because the two
   * answer different questions and the screen needs both: "does this person
   * have an account" decides whether removing them revokes access, and "can
   * they get into it" decides whether the office should chase them.
   *
   * It became worth distinguishing the moment invitations started going out
   * automatically. Before that, an account existed only once somebody had set a
   * password on it, so the two states were the same state. Now every teacher
   * has an account from the moment they are added, and a "Login" badge beside
   * all of them would tell the office nothing at all.
   */
  invitePending: z.boolean(),
  createdAt: z.iso.datetime(),
});

export type StaffListItem = z.infer<typeof staffListItemSchema>;

/** Full employment record for the staff profile screen. */
export const staffProfileSchema = staffListItemSchema.extend({
  cnic: z.string().nullable(),
  designation: z.string().nullable(),
  address: z.string().nullable(),
  photoUrl: z.string().nullable(),
  cvUrl: z.string().nullable(),
  /** The classes a teacher takes. Always empty for any other role. */
  classLevelIds: z.array(idSchema),
});

export type StaffProfile = z.infer<typeof staffProfileSchema>;

/** A Pakistani mobile: +92 then 10 digits starting with 3, i.e. 03XXXXXXXXX written locally. */
const staffPhoneSchema = phoneSchema.regex(
  /^\+923\d{9}$/,
  'Enter an 11-digit mobile number, like 03001234567.',
);

const staffCnicSchema = nationalIdSchema('CNIC');

/**
 * Roles a school can add through the staff form.
 *
 * Admin is the school owner, and there is exactly one: the person who
 * registered it. A second Admin account would be a second owner.
 */
export const ASSIGNABLE_STAFF_ROLES = STAFF_ROLES.filter(
  (role): role is Exclude<StaffRole, 'ADMIN'> => role !== 'ADMIN',
);

/** Photo data URLs from the portal file picker stay under ~512 KB raw. */
const optionalStaffPhotoSchema = z.string().trim().max(800_000).optional().nullable();

/** CV PDFs as data URLs from the portal stay under ~2 MB raw. */
const optionalStaffCvSchema = z.string().trim().max(3_000_000).optional().nullable();

const optionalAddressSchema = z.string().trim().max(500).optional().nullable();

/**
 * The classes a teacher takes — what scopes their student list and registers.
 *
 * Optional, and empty is valid: a teacher can be hired before the timetable is
 * settled. The safe reading of empty is "sees no class", never "sees all".
 * The cap is generous (a school has a dozen classes) and exists so one request
 * cannot carry an unbounded list.
 */
export const MAX_TEACHER_CLASSES = 60;
const classLevelIdsSchema = z.array(idSchema).max(MAX_TEACHER_CLASSES);

export const staffListQuerySchema = listQuery(
  ['name', 'employeeNo', 'role', 'createdAt'] as const,
  {
    role: staffRoleSchema.optional(),
    gender: genderSchema.optional(),
    status: staffStatusSchema.optional(),
  },
  'name',
);

export type StaffListQuery = z.infer<typeof staffListQuerySchema>;

/**
 * Adding a member of staff.
 *
 * `employeeNo` is absent on purpose — it comes from a gapless per-school
 * sequence allocated on the server, in the same transaction as the insert. A
 * client-supplied number is how two people end up sharing one.
 *
 * ## No password
 *
 * There was one, and an administrator typed it in. That is the pattern where a
 * school ends up with a shared password on a sticky note, because somebody has
 * to say it out loud to hand it over — and where the product knows a person's
 * password, which it should never be in a position to do. A member of staff who
 * uses the portal is **invited** instead: they get a link, they choose a
 * password nobody else has seen, and until they do there is no password to
 * leak.
 *
 * ## Which fields are required, and why they differ by role
 *
 * **Phone, always.** This is a payroll record before it is a login. A school
 * calls a janitor who has not arrived exactly as it calls a teacher, and a
 * staff list with no number on half its rows is a staff list nobody uses.
 *
 * **Email, only for the roles that sign in.** It is the address the invitation
 * goes to, so for a principal, an admin, office staff or a teacher it is not
 * optional in any meaningful sense — without it the account cannot be created
 * at all. A security guard, peon or other staff member is on the payroll and off the portal,
 * and most of them genuinely do not have one; demanding it would mean inventing
 * addresses to satisfy a form.
 */
export const createStaffSchema = z
  .object({
    name: textSchema(120),
    email: emailSchema.optional(),
    phone: staffPhoneSchema,
    gender: genderSchema.optional(),
    role: staffRoleSchema.refine((role) => role !== 'ADMIN', {
      message: 'Admin is the school owner and is set when the school is registered.',
    }),
    casualLeaves: z.int().min(0).max(365).default(0),
    sickLeaves: z.int().min(0).max(365).default(0),
    basicSalaryMinor: positiveMinorUnitsSchema.default(0),
    joinedOn: calendarDateSchema.optional(),
    cnic: staffCnicSchema,
    designation: z.string().trim().max(80).optional(),
    address: optionalAddressSchema,
    photoUrl: optionalStaffPhotoSchema,
    cvUrl: optionalStaffCvSchema,
    classLevelIds: classLevelIdsSchema.default([]),
  })
  .strict()
  .refine((value) => !staffRoleCanSignIn(value.role) || value.email !== undefined, {
    message: 'This role uses the portal, so an email address is needed to invite them.',
    path: ['email'],
  })
  .refine((value) => value.role === 'TEACHER' || value.classLevelIds.length === 0, {
    message: 'Only teachers are assigned classes.',
    path: ['classLevelIds'],
  });

export type CreateStaff = z.infer<typeof createStaffSchema>;

/**
 * Editing.
 *
 * Every field is optional, so the "phone is required" and "a portal role needs
 * an email" rules cannot be checked here: a PATCH carrying only a salary says
 * nothing about either. The service applies them to the row **after** the merge,
 * which is the only place that knows what the record will actually end up as.
 *
 * No `password`, and no `status`. A password is set by the person it belongs
 * to, through an invitation; ending someone's employment also ends their
 * access, so that is its own endpoint that can do both and say why.
 */
export const updateStaffSchema = z
  .object({
    name: textSchema(120).optional(),
    email: emailSchema.optional(),
    phone: staffPhoneSchema.optional(),
    gender: genderSchema.optional(),
    role: staffRoleSchema.optional(),
    casualLeaves: z.int().min(0).max(365).optional(),
    sickLeaves: z.int().min(0).max(365).optional(),
    basicSalaryMinor: positiveMinorUnitsSchema.optional(),
    joinedOn: calendarDateSchema.optional(),
    cnic: staffCnicSchema.optional(),
    designation: z.string().trim().max(80).optional(),
    address: optionalAddressSchema,
    photoUrl: optionalStaffPhotoSchema,
    cvUrl: optionalStaffCvSchema,
    /**
     * Replaces the whole set when present, and is left alone when absent — so a
     * PATCH carrying only a salary cannot strip a teacher of their classes. The
     * service checks the role it will end up with, for the same reason the
     * email rule is checked there.
     */
    classLevelIds: classLevelIdsSchema.optional(),
  })
  .strict();

export type UpdateStaff = z.infer<typeof updateStaffSchema>;

/**
 * Salary history — what a member of staff was paid, month by month.
 *
 * ## Append-only
 *
 * A payment is recorded once per person per month and never edited or deleted;
 * the database allows INSERT and nothing else on the table (docs/12 R4). A
 * month with no payment is shown as `DUE` at the basic salary, which is what is
 * owed, not what was paid.
 */
const salaryMonthSchema = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'Choose a month.');

export const recordSalaryPaymentSchema = z
  .object({
    month: salaryMonthSchema,
    paidOn: calendarDateSchema,
    /** Defaults to the basic salary. Integer paisa. */
    amountMinor: positiveMinorUnitsSchema
      .refine((value) => value > 0, 'Enter an amount above zero.')
      .optional(),
  })
  .strict();

export type RecordSalaryPayment = z.infer<typeof recordSalaryPaymentSchema>;

export interface StaffSalaryRow {
  /** `YYYY-MM`. */
  month: string;
  /** Paid amount, or the basic salary still owed for a `DUE` month. Integer paisa. */
  amountMinor: number;
  status: 'PAID' | 'DUE';
  paidOn: string | null;
}

export interface StaffSalaryHistory {
  basicSalaryMinor: number;
  /** Newest month first. */
  rows: StaffSalaryRow[];
}

/**
 * Removing somebody.
 *
 * A reason is required and this is a soft delete, for the same reason a student
 * is soft-deleted: "who worked here in 2026" is a question payroll and any
 * inspection will ask, and a row that vanished cannot answer it. Their portal
 * access is revoked at the same time — a deleted employee who can still sign in
 * is the worst of both outcomes.
 */
export const deleteStaffSchema = z.object({ reason: reasonSchema }).strict();
export type DeleteStaff = z.infer<typeof deleteStaffSchema>;

/**
 * Removing a selection from the staff list.
 *
 * Same rules as removing one — soft delete, access revoked, a reason on record
 * — applied to every id in one transaction. Capped, because one request that
 * disables a thousand accounts is a request somebody should be asked to split.
 */
export const MAX_BULK_STAFF = 200;

export const bulkDeleteStaffSchema = z
  .object({
    ids: z.array(idSchema).min(1, 'Choose at least one staff member.').max(MAX_BULK_STAFF),
    reason: reasonSchema,
  })
  .strict();

export type BulkDeleteStaff = z.infer<typeof bulkDeleteStaffSchema>;

/** `skipped` holds ids that were already gone — repeating a request removes nobody twice. */
export const bulkDeleteStaffResultSchema = z.object({
  deleted: z.int().min(0),
  skipped: z.array(idSchema),
});

export type BulkDeleteStaffResult = z.infer<typeof bulkDeleteStaffResultSchema>;

/**
 * What the staff screen learns after asking for an invitation to be sent.
 *
 * `sent: false` is not an error and must not be shown as one. The mail port
 * never throws (see `MailPort`), a school must not fail to record an employee
 * because a mail server was slow, and the invitation itself has been created
 * either way — so the honest message is "invited, but the email did not go;
 * try resending", not "something went wrong".
 */
export const staffInviteResultSchema = z.object({
  sent: z.boolean(),
  email: emailSchema,
  expiresAt: z.iso.datetime(),
});

export type StaffInviteResult = z.infer<typeof staffInviteResultSchema>;
