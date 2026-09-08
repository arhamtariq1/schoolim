import { z } from 'zod';

import { passwordSchema } from './auth';
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
 * `password` is optional even for roles that *can* sign in: a school often
 * records the person first and sorts out their login later, and forcing a
 * password at creation means inventing one and writing it on paper.
 */
export const createStaffSchema = z
  .object({
    name: textSchema(120),
    email: emailSchema.optional(),
    phone: phoneSchema.optional(),
    gender: genderSchema.optional(),
    role: staffRoleSchema,
    password: passwordSchema.optional(),
    casualLeaves: z.int().min(0).max(365).default(0),
    sickLeaves: z.int().min(0).max(365).default(0),
    basicSalaryMinor: positiveMinorUnitsSchema.default(0),
    joinedOn: calendarDateSchema.optional(),
    cnic: z.string().trim().max(20).optional(),
    designation: z.string().trim().max(80).optional(),
  })
  .strict()
  .refine((value) => value.password === undefined || value.email !== undefined, {
    message: 'An email address is needed to create a login.',
    path: ['email'],
  })
  .refine((value) => value.password === undefined || staffRoleCanSignIn(value.role), {
    message: 'This role does not use the portal, so it cannot have a password.',
    path: ['password'],
  });

export type CreateStaff = z.infer<typeof createStaffSchema>;

/**
 * Editing. `password` is here so it can be *set* later or changed, and status
 * is not — ending someone's employment also ends their access, so it is its own
 * endpoint that can do both and say why.
 */
export const updateStaffSchema = z
  .object({
    name: textSchema(120).optional(),
    email: emailSchema.optional(),
    phone: phoneSchema.optional(),
    gender: genderSchema.optional(),
    role: staffRoleSchema.optional(),
    password: passwordSchema.optional(),
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
