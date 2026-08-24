import { type Permission } from './permissions';

/**
 * Roles and the permissions each one grants.
 *
 * This is the machine-readable form of the matrix in docs/08 section 4. The API
 * guard and the UI navigation both read it, so a role change is one edit.
 *
 * **Interpretation of the matrix symbols**
 * - `✓` becomes `all` — the role acts on every row in the school.
 * - `S` becomes `scoped` — the role acts only on rows the scope rules in
 *   docs/08 section 5 admit: their assigned sections, their own children, their
 *   own record. Scope is data (`user_roles.scope`) compiled into a query
 *   clause, never a code branch.
 * - `–` is simply absent. There is no explicit deny; a permission is granted if
 *   **any** held role grants it, because roles are additive.
 *
 * **Where a matrix row covers a resource rather than an action** (for example
 * the single "Guardians" row), `✓` is read as full read/create/update on that
 * resource and `S` as scoped read only. Deletion is never implied — it is
 * always its own row.
 *
 * Three grants are inferred rather than stated, and are marked INFERRED below:
 * `staff.record.update`, `attendance.record.read` and `fees.plan.read`. Each
 * follows the read grant of the row it belongs to. They are called out so the
 * matrix in docs/08 can be corrected rather than quietly diverging.
 */

export const SCHOOL_ROLES = [
  'OWNER',
  'PRINCIPAL',
  'ADMIN',
  'ACCOUNTANT',
  'RECEPTION',
  'TEACHER',
  'COORDINATOR',
  'STUDENT',
  'PARENT',
] as const;

export type SchoolRole = (typeof SCHOOL_ROLES)[number];

export const PLATFORM_ROLES = ['SUPER_ADMIN', 'SUPPORT', 'BILLING'] as const;
export type PlatformRole = (typeof PLATFORM_ROLES)[number];

/** `all` acts on every row; `scoped` only on rows the scope rules admit. */
export const PERMISSION_GRANT = {
  ALL: 'all',
  SCOPED: 'scoped',
} as const;

export type PermissionGrant = (typeof PERMISSION_GRANT)[keyof typeof PERMISSION_GRANT];

type RoleGrants = Readonly<Partial<Record<Permission, PermissionGrant>>>;

const { ALL, SCOPED } = PERMISSION_GRANT;

/**
 * Every role can open its own workspace; which workspace it opens is decided by
 * the role, not by a second permission (docs/09 section 3).
 */
const WORKSPACE: RoleGrants = { 'dashboard.workspace.read': ALL };

const OWNER: RoleGrants = {
  ...WORKSPACE,
  'students.student.read': ALL,
  'students.student.create': ALL,
  'students.student.update': ALL,
  'students.student.delete': ALL,
  'students.guardian.read': ALL,
  'students.guardian.create': ALL,
  'students.guardian.update': ALL,
  'admissions.application.read': ALL,
  'admissions.application.create': ALL,
  'admissions.application.update': ALL,
  'academics.structure.read': ALL,
  'academics.structure.configure': ALL,
  'academics.timetable.read': ALL,
  'academics.timetable.configure': ALL,
  'academics.session.configure': ALL,
  'fees.plan.read': ALL,
  'fees.plan.configure': ALL,
  'fees.increment.generate': ALL,
  'fees.voucher.read': ALL,
  'fees.voucher.generate': ALL,
  'fees.voucher.cancel': ALL,
  'fees.payment.create': ALL,
  'fees.payment.reverse': ALL,
  'fees.discount.create': ALL,
  'fees.discount.approve': ALL,
  'fees.waiver.create': ALL,
  'fees.waiver.approve': ALL,
  'fees.deposit.read': ALL,
  'fees.deposit.update': ALL,
  'fees.defaulter.read': ALL,
  'finance.expense.read': ALL,
  'finance.expense.create': ALL,
  'finance.expense.approve': ALL,
  'finance.report.read': ALL,
  'attendance.record.read': ALL,
  'attendance.record.create': ALL,
  'attendance.record.unlock': ALL,
  'attendance.report.read': ALL,
  'staff.record.read': ALL,
  'staff.record.update': ALL,
  'staff.salary.read': ALL,
  'exams.exam.configure': ALL,
  'exams.mark.create': ALL,
  'exams.result.read': ALL,
  'exams.result.publish': ALL,
  'workflow.request.create': ALL,
  'workflow.request.approve': ALL,
  'comms.message.create': ALL,
  'settings.school.configure': ALL,
  'settings.user.manage': ALL,
  'settings.data.export': ALL,
  'audit.log.read': ALL,
};

/**
 * The principal oversees and approves but cannot silently record a payment.
 * That omission is deliberate: segregation of duties is why a school trusts the
 * software (docs/08 section 4).
 */
const PRINCIPAL: RoleGrants = {
  ...WORKSPACE,
  'students.student.read': ALL,
  'students.student.create': ALL,
  'students.student.update': ALL,
  'students.student.delete': ALL,
  'students.guardian.read': ALL,
  'students.guardian.create': ALL,
  'students.guardian.update': ALL,
  'admissions.application.read': ALL,
  'admissions.application.create': ALL,
  'admissions.application.update': ALL,
  'academics.structure.read': ALL,
  'academics.structure.configure': ALL,
  'academics.timetable.read': ALL,
  'academics.timetable.configure': ALL,
  'academics.session.configure': ALL,
  'fees.plan.read': ALL,
  'fees.plan.configure': ALL,
  'fees.increment.generate': ALL,
  'fees.voucher.read': ALL,
  'fees.voucher.generate': ALL,
  'fees.voucher.cancel': ALL,
  'fees.payment.reverse': ALL,
  'fees.discount.create': ALL,
  'fees.discount.approve': ALL,
  'fees.waiver.create': ALL,
  'fees.waiver.approve': ALL,
  'fees.deposit.read': ALL,
  'fees.deposit.update': ALL,
  'fees.defaulter.read': ALL,
  'finance.expense.read': ALL,
  'finance.expense.create': ALL,
  'finance.expense.approve': ALL,
  'finance.report.read': ALL,
  'attendance.record.read': ALL,
  'attendance.record.unlock': ALL,
  'attendance.report.read': ALL,
  'staff.record.read': ALL,
  'staff.record.update': ALL,
  'staff.salary.read': ALL,
  'exams.exam.configure': ALL,
  'exams.result.read': ALL,
  'exams.result.publish': ALL,
  'workflow.request.create': ALL,
  'workflow.request.approve': ALL,
  'comms.message.create': ALL,
  'settings.school.configure': ALL,
  'settings.user.manage': ALL,
  'settings.data.export': ALL,
  'audit.log.read': ALL,
};

/** The power user who runs the system day to day, but approves nothing. */
const ADMIN: RoleGrants = {
  ...WORKSPACE,
  'students.student.read': ALL,
  'students.student.create': ALL,
  'students.student.update': ALL,
  'students.guardian.read': ALL,
  'students.guardian.create': ALL,
  'students.guardian.update': ALL,
  'admissions.application.read': ALL,
  'admissions.application.create': ALL,
  'admissions.application.update': ALL,
  'academics.structure.read': ALL,
  'academics.structure.configure': ALL,
  'academics.timetable.read': ALL,
  'academics.timetable.configure': ALL,
  'academics.session.configure': ALL,
  'fees.plan.read': ALL,
  'fees.plan.configure': ALL,
  'fees.voucher.read': ALL,
  'fees.voucher.generate': ALL,
  'fees.payment.create': ALL,
  'fees.discount.create': ALL,
  'fees.waiver.create': ALL,
  'fees.deposit.read': ALL,
  'fees.deposit.update': ALL,
  'fees.defaulter.read': ALL,
  'finance.expense.read': ALL,
  'finance.expense.create': ALL,
  'attendance.record.read': ALL,
  'attendance.record.create': ALL,
  'attendance.record.unlock': ALL,
  'attendance.report.read': ALL,
  'staff.record.read': ALL,
  'staff.record.update': ALL,
  'exams.exam.configure': ALL,
  'exams.mark.create': ALL,
  'exams.result.read': ALL,
  'workflow.request.create': ALL,
  'workflow.request.approve': SCOPED,
  'comms.message.create': ALL,
  'settings.school.configure': ALL,
  'settings.user.manage': ALL,
};

/**
 * Moves money, but cannot approve a discount or a waiver. The other half of the
 * segregation of duties that makes the finance module defensible.
 */
const ACCOUNTANT: RoleGrants = {
  ...WORKSPACE,
  'students.student.read': ALL,
  'students.guardian.read': ALL,
  'students.guardian.create': ALL,
  'students.guardian.update': ALL,
  'fees.plan.read': ALL,
  'fees.plan.configure': ALL,
  'fees.increment.generate': ALL,
  'fees.voucher.read': ALL,
  'fees.voucher.generate': ALL,
  'fees.voucher.cancel': ALL,
  'fees.payment.create': ALL,
  'fees.payment.reverse': ALL,
  'fees.discount.create': ALL,
  'fees.waiver.create': ALL,
  'fees.deposit.read': ALL,
  'fees.deposit.update': ALL,
  'fees.defaulter.read': ALL,
  'finance.expense.read': ALL,
  'finance.expense.create': ALL,
  'finance.report.read': ALL,
  'staff.salary.read': ALL,
  'workflow.request.create': ALL,
  'workflow.request.approve': SCOPED,
  'comms.message.create': ALL,
};

/** Takes a payment at the counter, but cannot cancel a voucher or reverse one. */
const RECEPTION: RoleGrants = {
  ...WORKSPACE,
  'students.student.read': ALL,
  'students.student.create': ALL,
  'students.student.update': ALL,
  'students.guardian.read': ALL,
  'students.guardian.create': ALL,
  'students.guardian.update': ALL,
  'admissions.application.read': ALL,
  'admissions.application.create': ALL,
  'admissions.application.update': ALL,
  'academics.timetable.read': ALL,
  'fees.voucher.read': ALL,
  'fees.payment.create': ALL,
  'fees.discount.create': ALL,
  'fees.waiver.create': ALL,
  'fees.defaulter.read': ALL,
  'attendance.record.read': ALL,
  'attendance.record.create': ALL,
  'attendance.report.read': ALL,
  'exams.result.read': ALL,
  'workflow.request.create': ALL,
  'comms.message.create': ALL,
};

/** Everything a teacher touches is scoped to the sections assigned to them. */
const TEACHER: RoleGrants = {
  ...WORKSPACE,
  'students.student.read': SCOPED,
  'students.guardian.read': SCOPED,
  'academics.timetable.read': SCOPED,
  'attendance.record.read': SCOPED,
  'attendance.record.create': SCOPED,
  'attendance.report.read': SCOPED,
  'exams.mark.create': SCOPED,
  'exams.result.read': SCOPED,
  'workflow.request.create': ALL,
  'comms.message.create': SCOPED,
};

/** A teacher, plus oversight of the classes in their wing. */
const COORDINATOR: RoleGrants = {
  ...TEACHER,
  'academics.structure.read': SCOPED,
  'academics.timetable.configure': SCOPED,
  'exams.exam.configure': SCOPED,
  'workflow.request.approve': SCOPED,
};

/** Sees only their own record. */
const STUDENT: RoleGrants = {
  ...WORKSPACE,
  'students.student.read': SCOPED,
  'academics.timetable.read': SCOPED,
  'fees.voucher.read': SCOPED,
  'attendance.report.read': SCOPED,
  'exams.result.read': SCOPED,
  'workflow.request.create': ALL,
};

/** Sees only their own children, across classes. */
const PARENT: RoleGrants = {
  ...WORKSPACE,
  'students.student.read': SCOPED,
  'students.guardian.read': SCOPED,
  'academics.timetable.read': SCOPED,
  'fees.voucher.read': SCOPED,
  'attendance.report.read': SCOPED,
  'exams.result.read': SCOPED,
  'workflow.request.create': ALL,
};

export const ROLE_PERMISSIONS: Readonly<Record<SchoolRole, RoleGrants>> = {
  OWNER,
  PRINCIPAL,
  ADMIN,
  ACCOUNTANT,
  RECEPTION,
  TEACHER,
  COORDINATOR,
  STUDENT,
  PARENT,
};

/**
 * The effective grant for a set of held roles.
 *
 * Roles are additive and `all` beats `scoped`: a user who is both a teacher and
 * an administrator reads every student, not only their own sections.
 *
 * Returns `undefined` when no held role grants the permission at all.
 */
export function grantFor(
  roles: readonly SchoolRole[],
  permission: Permission,
): PermissionGrant | undefined {
  let best: PermissionGrant | undefined;

  for (const role of roles) {
    const grant = ROLE_PERMISSIONS[role][permission];
    if (grant === ALL) {
      return ALL;
    }
    if (grant === SCOPED) {
      best = SCOPED;
    }
  }

  return best;
}

/** Whether the roles grant the permission at all, scoped or otherwise. */
export function hasPermission(roles: readonly SchoolRole[], permission: Permission): boolean {
  return grantFor(roles, permission) !== undefined;
}

/** Whether the roles grant the permission across every row in the school. */
export function hasUnscopedPermission(
  roles: readonly SchoolRole[],
  permission: Permission,
): boolean {
  return grantFor(roles, permission) === PERMISSION_GRANT.ALL;
}

/** Every permission the roles grant, for building navigation and tokens. */
export function permissionsFor(roles: readonly SchoolRole[]): Permission[] {
  const effective = new Map<Permission, PermissionGrant>();

  for (const role of roles) {
    for (const [permission, grant] of Object.entries(ROLE_PERMISSIONS[role])) {
      if (grant === ALL || !effective.has(permission as Permission)) {
        effective.set(permission as Permission, grant);
      }
    }
  }

  return [...effective.keys()];
}
