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
import { genderSchema } from './students';

/**
 * Staff — the people a school employs. docs/07 §4.
 *
 * ## Why a staff role is not a portal role
 *
 * `SCHOOL_ROLES` is about what the portal permits. `STAFF_ROLES` is about what
 * somebody does. A janitor and a security guard are on the payroll with leave
 * and a salary and have no reason to sign in to anything; a head and an admin
 * need both. One enum for both jobs would mean inventing logins for people who
 * will never use one, or leaving half the payroll unrecorded.
 *
 * The mapping below is what connects them, and only for the roles that get an
 * account at all.
 */

export const STAFF_ROLES = [
  'HEAD',
  'ADMIN',
  'OFFICE_STAFF',
  'TEACHER',
  'SECURITY_GUARD',
  'JANITOR',
] as const;

export const staffRoleSchema = z.enum(STAFF_ROLES);
export type StaffRole = z.infer<typeof staffRoleSchema>;

export const STAFF_ROLE_LABELS: Readonly<Record<StaffRole, string>> = {
  HEAD: 'Head',
  ADMIN: 'Admin',
  OFFICE_STAFF: 'Office staff',
  TEACHER: 'Teacher',
  SECURITY_GUARD: 'Security guard',
  JANITOR: 'Janitor',
};

/**
 * Which staff roles can hold a portal account, and what it grants.
 *
 * A role absent from this map gets no login — not a login with no permissions.
 * The distinction matters: an account that exists but can do nothing still has
 * a password to leak and a session to steal.
 */
export const STAFF_ROLE_TO_SCHOOL_ROLE = {
  HEAD: 'PRINCIPAL',
  ADMIN: 'ADMIN',
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
});

export type StaffListItem = z.infer<typeof staffListItemSchema>;

export const staffListQuerySchema = listQuery(
  ['name', 'employeeNo', 'role', 'createdAt'] as const,
  {
    role: staffRoleSchema.optional(),
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
 * goes to, so for a head, an admin, office staff or a teacher it is not
 * optional in any meaningful sense — without it the account cannot be created
 * at all. A security guard or a janitor is on the payroll and off the portal,
 * and most of them genuinely do not have one; demanding it would mean inventing
 * addresses to satisfy a form.
 */
export const createStaffSchema = z
  .object({
    name: textSchema(120),
    email: emailSchema.optional(),
    phone: phoneSchema,
    gender: genderSchema.optional(),
    role: staffRoleSchema,
    casualLeaves: z.int().min(0).max(365).default(0),
    sickLeaves: z.int().min(0).max(365).default(0),
    basicSalaryMinor: positiveMinorUnitsSchema.default(0),
    joinedOn: calendarDateSchema.optional(),
    cnic: z.string().trim().max(20).optional(),
    designation: z.string().trim().max(80).optional(),
  })
  .strict()
  .refine((value) => !staffRoleCanSignIn(value.role) || value.email !== undefined, {
    message: 'This role uses the portal, so an email address is needed to invite them.',
    path: ['email'],
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
    phone: phoneSchema.optional(),
    gender: genderSchema.optional(),
    role: staffRoleSchema.optional(),
    casualLeaves: z.int().min(0).max(365).optional(),
    sickLeaves: z.int().min(0).max(365).optional(),
    basicSalaryMinor: positiveMinorUnitsSchema.optional(),
    joinedOn: calendarDateSchema.optional(),
    cnic: z.string().trim().max(20).optional(),
    designation: z.string().trim().max(80).optional(),
  })
  .strict();

export type UpdateStaff = z.infer<typeof updateStaffSchema>;

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
