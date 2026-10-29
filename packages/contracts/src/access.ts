import { z } from 'zod';

import { isPermission, PERMISSIONS, type Permission } from './permissions';
import {
  PERMISSION_GRANT,
  ROLE_PERMISSIONS,
  SCHOOL_ROLES,
  type PermissionGrant,
  type SchoolRole,
} from './roles';

/**
 * Access customisation — a school changing what a role, or one person, can open
 * (ADR-0025).
 *
 * The defaults stay in `roles.ts` and stay the product's opinion. A school then
 * layers two kinds of change on top, both as plain lists of permissions:
 *
 * 1. **Per role** — "our teachers also take fee payments". Applies to everyone
 *    holding the role.
 * 2. **Per person** — "Mrs Khan does not need Marks". Applied last, so a person
 *    can be given more than their role, or less.
 *
 * A grant never *upgrades* a permission the person already holds as `scoped`:
 * granting "View students" to a teacher who sees their own classes leaves them
 * seeing their own classes. A grant only adds what was absent, and adds it for
 * the whole school, because there is no scope to narrow a permission the role
 * never had.
 */

/**
 * The roles a school may customise.
 *
 * Not `OWNER`: the owner is who does the customising, and a school that removed
 * its own owner's access to this screen would have nobody left to put it back.
 * Not `STUDENT` or `PARENT`: their screens start from their own account and
 * child (see the PARENT comment in `roles.ts`), and handing a parent a staff
 * permission would show them every child in the school, not theirs.
 */
export const CUSTOMIZABLE_ROLES = [
  'PRINCIPAL',
  'ADMIN',
  'ACCOUNTANT',
  'RECEPTION',
  'TEACHER',
  'COORDINATOR',
] as const satisfies readonly SchoolRole[];

export type CustomizableRole = (typeof CUSTOMIZABLE_ROLES)[number];

const CUSTOMIZABLE_ROLE_SET: ReadonlySet<string> = new Set<string>(CUSTOMIZABLE_ROLES);

export function isCustomizableRole(role: string): role is CustomizableRole {
  return CUSTOMIZABLE_ROLE_SET.has(role);
}

/**
 * How the access screen names each role. Not `SCHOOL_ROLE_LABELS`: there the
 * owner and the administrator both read "Admin", which is right in the header
 * and wrong on the one screen where only one of them can be changed.
 */
export const ACCESS_ROLE_DETAILS: Readonly<
  Record<CustomizableRole, { readonly label: string; readonly description: string }>
> = {
  PRINCIPAL: { label: 'Principal', description: 'Oversight, approvals and results' },
  ADMIN: { label: 'Administrator', description: 'Runs the system day to day' },
  ACCOUNTANT: { label: 'Accountant', description: 'Fees, collection and expenses' },
  RECEPTION: { label: 'Office Staff', description: 'Front desk and the fee counter' },
  TEACHER: { label: 'Teacher', description: 'Their own classes' },
  COORDINATOR: { label: 'Coordinator', description: 'A teacher who oversees classes' },
};

/**
 * Who may change whom. A person may only change roles **below** their highest
 * one, so nobody edits their own role and nobody edits a peer's.
 *
 * Lower number is more senior. Roles outside the staff hierarchy rank last.
 */
export const ROLE_RANK: Readonly<Record<SchoolRole, number>> = {
  OWNER: 0,
  PRINCIPAL: 1,
  ADMIN: 2,
  ACCOUNTANT: 3,
  COORDINATOR: 3,
  RECEPTION: 3,
  TEACHER: 3,
  STUDENT: 9,
  PARENT: 9,
};

/** The most senior rank among the held roles; `Infinity` for none. */
export function highestRank(roles: readonly SchoolRole[]): number {
  return roles.reduce((best, role) => Math.min(best, ROLE_RANK[role]), Number.POSITIVE_INFINITY);
}

/**
 * Permissions that are never customised.
 *
 * - Every signed-in person opens their own dashboard and may raise a request;
 *   taking either away leaves a shell with nothing in it.
 * - `parent.*` is served by endpoints that start at the guardian's own account
 *   and means nothing for staff.
 * - The school's plan and invoices stay with the owner.
 */
export const LOCKED_PERMISSIONS = [
  'dashboard.workspace.read',
  'workflow.request.create',
  'parent.child.read',
  'parent.voucher.read',
  'settings.billing.manage',
] as const satisfies readonly Permission[];

const LOCKED_SET: ReadonlySet<string> = new Set<string>(LOCKED_PERMISSIONS);

export function isCustomizablePermission(permission: Permission): boolean {
  return !LOCKED_SET.has(permission);
}

/**
 * The permissions as the access screen shows them: grouped by the part of the
 * product they open, and named for what a school administrator would recognise.
 *
 * Every customisable permission appears exactly once — a test holds this list
 * to `PERMISSIONS`, so adding a permission without a label fails CI rather than
 * hiding it from the screen.
 */
export const ACCESS_MODULES: readonly {
  readonly key: string;
  readonly label: string;
  readonly permissions: readonly { readonly permission: Permission; readonly label: string }[];
}[] = [
  {
    key: 'students',
    label: 'Students & admissions',
    permissions: [
      { permission: 'students.student.read', label: 'View students' },
      { permission: 'students.student.create', label: 'Add students' },
      { permission: 'students.student.update', label: 'Edit students' },
      { permission: 'students.student.delete', label: 'Strike off students' },
      { permission: 'students.guardian.read', label: 'View guardians' },
      { permission: 'students.guardian.create', label: 'Add guardians' },
      { permission: 'students.guardian.update', label: 'Edit guardians' },
      { permission: 'admissions.application.read', label: 'View admissions' },
      { permission: 'admissions.application.create', label: 'Start admissions' },
      { permission: 'admissions.application.update', label: 'Process admissions' },
    ],
  },
  {
    key: 'academics',
    label: 'Academics & timetables',
    permissions: [
      { permission: 'academics.structure.read', label: 'View classes and sections' },
      { permission: 'academics.structure.configure', label: 'Set up classes and sections' },
      { permission: 'academics.timetable.read', label: 'View timetables' },
      { permission: 'academics.timetable.configure', label: 'Build timetables' },
      { permission: 'academics.session.configure', label: 'Sessions and promotion' },
    ],
  },
  {
    key: 'fees',
    label: 'Fees',
    permissions: [
      { permission: 'fees.plan.read', label: 'View fee settings' },
      { permission: 'fees.plan.configure', label: 'Change fee settings' },
      { permission: 'fees.increment.generate', label: 'Run fee increments' },
      { permission: 'fees.voucher.read', label: 'View vouchers' },
      { permission: 'fees.voucher.generate', label: 'Generate vouchers' },
      { permission: 'fees.voucher.cancel', label: 'Cancel vouchers' },
      { permission: 'fees.payment.create', label: 'Collect fee payments' },
      { permission: 'fees.payment.reverse', label: 'Reverse payments' },
      { permission: 'fees.discount.create', label: 'Request discounts' },
      { permission: 'fees.discount.approve', label: 'Approve discounts' },
      { permission: 'fees.waiver.create', label: 'Request waivers' },
      { permission: 'fees.waiver.approve', label: 'Approve waivers' },
      { permission: 'fees.deposit.read', label: 'View security deposits' },
      { permission: 'fees.deposit.update', label: 'Record and refund deposits' },
      { permission: 'fees.defaulter.read', label: 'View defaulters' },
    ],
  },
  {
    key: 'finance',
    label: 'Finance',
    permissions: [
      { permission: 'finance.expense.read', label: 'View expenses' },
      { permission: 'finance.expense.create', label: 'Record expenses' },
      { permission: 'finance.expense.approve', label: 'Approve expenses' },
      { permission: 'finance.report.read', label: 'Finance reports' },
      { permission: 'finance.revenue.read', label: 'Revenue' },
    ],
  },
  {
    key: 'attendance',
    label: 'Attendance',
    permissions: [
      { permission: 'attendance.record.read', label: 'View student attendance' },
      { permission: 'attendance.record.create', label: 'Mark student attendance' },
      { permission: 'attendance.record.unlock', label: 'Change past attendance' },
      { permission: 'attendance.report.read', label: 'Attendance reports' },
      { permission: 'attendance.staff.read', label: 'View staff attendance' },
      { permission: 'attendance.staff.create', label: 'Mark staff attendance' },
      { permission: 'attendance.own.read', label: 'Own attendance' },
    ],
  },
  {
    key: 'staff',
    label: 'Staff & salaries',
    permissions: [
      { permission: 'staff.record.read', label: 'View staff' },
      { permission: 'staff.record.update', label: 'Add and edit staff' },
      { permission: 'staff.salary.read', label: 'View salaries' },
      { permission: 'staff.salary.pay', label: 'Pay salaries' },
    ],
  },
  {
    key: 'exams',
    label: 'Marks & results',
    permissions: [
      { permission: 'exams.exam.configure', label: 'Set up exams' },
      { permission: 'exams.mark.create', label: 'Enter marks' },
      { permission: 'exams.result.read', label: 'View results' },
      { permission: 'exams.result.publish', label: 'Publish results' },
      { permission: 'exams.setup.manage', label: 'Subjects and assessment types' },
    ],
  },
  {
    key: 'workflow',
    label: 'Requests & messages',
    permissions: [
      { permission: 'workflow.request.manage', label: 'Manage all requests' },
      { permission: 'workflow.request.approve', label: 'Approve requests' },
      { permission: 'comms.message.create', label: 'Send messages' },
    ],
  },
  {
    key: 'settings',
    label: 'Settings & governance',
    permissions: [
      { permission: 'settings.school.configure', label: 'School settings' },
      { permission: 'settings.user.manage', label: 'Users and access' },
      { permission: 'settings.data.export', label: 'Export all data' },
      { permission: 'audit.log.read', label: 'Audit log' },
    ],
  },
];

/** Every permission a school can toggle, in screen order. */
export const CUSTOMIZABLE_PERMISSIONS: readonly Permission[] = ACCESS_MODULES.flatMap((module) =>
  module.permissions.map((entry) => entry.permission),
);

// --- Resolution -------------------------------------------------------------

/** A change on top of whatever came before it: what to add, what to take away. */
export interface PermissionOverrides {
  readonly grant: readonly Permission[];
  readonly revoke: readonly Permission[];
}

export const NO_OVERRIDES: PermissionOverrides = { grant: [], revoke: [] };

export type EffectiveGrants = ReadonlyMap<Permission, PermissionGrant>;

function applyOverrides(
  base: Map<Permission, PermissionGrant>,
  overrides: PermissionOverrides,
): Map<Permission, PermissionGrant> {
  for (const permission of overrides.revoke) {
    if (isCustomizablePermission(permission)) {
      base.delete(permission);
    }
  }
  for (const permission of overrides.grant) {
    // Never an upgrade: a scoped grant stays scoped (see the file comment).
    if (isCustomizablePermission(permission) && !base.has(permission)) {
      base.set(permission, PERMISSION_GRANT.ALL);
    }
  }
  return base;
}

/** What one role grants at this school: the default, then the school's change to it. */
export function roleGrants(role: SchoolRole, overrides?: PermissionOverrides): EffectiveGrants {
  const base = new Map(Object.entries(ROLE_PERMISSIONS[role]) as [Permission, PermissionGrant][]);
  // OWNER, STUDENT and PARENT are never customised; anything stored for them is ignored.
  return isCustomizableRole(role) && overrides !== undefined ? applyOverrides(base, overrides) : base;
}

/**
 * Everything a person can do: each role as the school has customised it,
 * combined (`all` beats `scoped`), then the person's own change applied last.
 */
export function resolveGrants(
  roles: readonly SchoolRole[],
  roleOverrides: Readonly<Partial<Record<SchoolRole, PermissionOverrides>>>,
  userOverrides: PermissionOverrides = NO_OVERRIDES,
): EffectiveGrants {
  const effective = new Map<Permission, PermissionGrant>();

  for (const role of roles) {
    for (const [permission, grant] of roleGrants(role, roleOverrides[role])) {
      if (grant === PERMISSION_GRANT.ALL || !effective.has(permission)) {
        effective.set(permission, grant);
      }
    }
  }

  // The owner's own access is not editable, so a person who holds OWNER keeps it whole.
  return roles.includes('OWNER') ? effective : applyOverrides(effective, userOverrides);
}

// --- Editing ----------------------------------------------------------------

/** Whether a permission is on, given what it starts from and the change on top. */
export function isGrantedWith(
  base: EffectiveGrants,
  overrides: PermissionOverrides,
  permission: Permission,
): boolean {
  if (overrides.revoke.includes(permission)) {
    return false;
  }
  return base.has(permission) || overrides.grant.includes(permission);
}

/**
 * The change after one permission is switched on or off. Switching it back to
 * what the base gives removes the change rather than recording a no-op.
 */
export function withPermission(
  base: EffectiveGrants,
  overrides: PermissionOverrides,
  permission: Permission,
  on: boolean,
): PermissionOverrides {
  const grant = overrides.grant.filter((entry) => entry !== permission);
  const revoke = overrides.revoke.filter((entry) => entry !== permission);
  const inBase = base.has(permission);
  if (on && !inBase) {
    grant.push(permission);
  }
  if (!on && inBase) {
    revoke.push(permission);
  }
  return { grant, revoke };
}

/** Whether two changes say the same thing, regardless of order. */
export function sameOverrides(a: PermissionOverrides, b: PermissionOverrides): boolean {
  const key = (value: PermissionOverrides): string =>
    JSON.stringify([[...value.grant].sort(), [...value.revoke].sort()]);
  return key(a) === key(b);
}

// --- Wire schemas -----------------------------------------------------------

export const permissionSchema = z
  .string()
  .refine((value): value is Permission => isPermission(value), { message: 'Unknown permission.' })
  .transform((value) => value as Permission);

export const customizableRoleSchema = z.enum(CUSTOMIZABLE_ROLES);

export const permissionOverridesSchema = z.object({
  grant: z.array(permissionSchema).max(PERMISSIONS.length),
  revoke: z.array(permissionSchema).max(PERMISSIONS.length),
});

/** Replaces the whole change for one role or one person. Empty lists reset it to the default. */
export const updatePermissionOverridesSchema = permissionOverridesSchema
  .strict()
  .refine((value) => !value.grant.some((permission) => value.revoke.includes(permission)), {
    message: 'A permission cannot be both given and taken away.',
    path: ['grant'],
  })
  .refine(
    (value) => [...value.grant, ...value.revoke].every((permission) => isCustomizablePermission(permission)),
    { message: 'That permission cannot be changed.', path: ['grant'] },
  );

export type UpdatePermissionOverrides = z.infer<typeof updatePermissionOverridesSchema>;

export const accessRoleSchema = z.object({
  role: customizableRoleSchema,
  /** False when the signed-in person may look but not change it (it is their own rank or above). */
  editable: z.boolean(),
  overrides: permissionOverridesSchema,
});

export type AccessRole = z.infer<typeof accessRoleSchema>;

export const accessRoleListSchema = z.object({ roles: z.array(accessRoleSchema) });

export type AccessRoleList = z.infer<typeof accessRoleListSchema>;

export const accessUserListQuerySchema = z.object({
  search: z.string().trim().max(100).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(25),
  offset: z.coerce.number().int().min(0).default(0),
});

export type AccessUserListQuery = z.infer<typeof accessUserListQuerySchema>;

const schoolRoleSchema = z.enum(SCHOOL_ROLES);

export const accessUserSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  email: z.string(),
  roles: z.array(schoolRoleSchema),
  editable: z.boolean(),
  /** How many permissions this one person has been given or had taken away. */
  changedCount: z.int(),
});

export type AccessUser = z.infer<typeof accessUserSchema>;

export const accessUserDetailSchema = accessUserSchema.extend({
  /** What this person's roles grant at this school, before their own change. */
  roleGrants: z.array(z.object({ permission: permissionSchema, grant: z.enum(['all', 'scoped']) })),
  overrides: permissionOverridesSchema,
});

export type AccessUserDetail = z.infer<typeof accessUserDetailSchema>;
