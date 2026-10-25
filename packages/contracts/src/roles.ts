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

/**
 * What a role is called on screen. The owner is the school's Admin, so OWNER
 * reads "Admin"; RECEPTION is the front-office role the staff form calls
 * "Office Staff".
 */
export const SCHOOL_ROLE_LABELS: Readonly<Record<SchoolRole, string>> = {
  OWNER: 'Admin',
  PRINCIPAL: 'Principal',
  ADMIN: 'Admin',
  ACCOUNTANT: 'Accountant',
  RECEPTION: 'Office Staff',
  TEACHER: 'Teacher',
  COORDINATOR: 'Coordinator',
  STUDENT: 'Student',
  PARENT: 'Parent',
};

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
  'exams.setup.manage': ALL,
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
  'finance.revenue.read': ALL,
  'attendance.record.read': ALL,
  'attendance.record.create': ALL,
  'attendance.record.unlock': ALL,
  'attendance.report.read': ALL,
  'attendance.staff.read': ALL,
  'attendance.staff.create': ALL,
  'staff.record.read': ALL,
  'staff.record.update': ALL,
  'staff.salary.read': ALL,
  'staff.salary.pay': ALL,
  'exams.exam.configure': ALL,
  'exams.mark.create': ALL,
  'exams.result.read': ALL,
  'exams.result.publish': ALL,
  'workflow.request.create': ALL,
  'workflow.request.approve': ALL,
  'workflow.request.manage': ALL,
  'comms.message.create': ALL,
  'settings.school.configure': ALL,
  'settings.billing.manage': ALL,
  'settings.user.manage': ALL,
  'settings.data.export': ALL,
  'audit.log.read': ALL,
};

/**
 * Everything the Admin (owner) can do, except revenue.
 *
 * Revenue — the figures, charts and trends on the dashboard — is the one thing
 * kept for the Admin alone. The Principal and Office Staff otherwise work with
 * the same modules, pages and settings, so both are derived from the Admin's
 * grants rather than listed again: a permission added for the Admin reaches
 * them without a second edit, and `finance.revenue.read` can never leak by
 * being copied across.
 */
/** Kept for the Admin alone: the figures, and the school's dealings with the platform. */
const ADMIN_ONLY: ReadonlySet<string> = new Set(['finance.revenue.read', 'settings.billing.manage']);

const WITHOUT_REVENUE: RoleGrants = Object.fromEntries(
  Object.entries(OWNER).filter(([permission]) => !ADMIN_ONLY.has(permission)),
) as RoleGrants;

/** The principal: the Admin's access without revenue, plus their own attendance record. */
const PRINCIPAL: RoleGrants = {
  ...WITHOUT_REVENUE,
  'attendance.own.read': ALL,
};

/** The power user who runs the system day to day, but approves nothing. */
const ADMIN: RoleGrants = {
  ...WORKSPACE,
  'exams.setup.manage': ALL,
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
  'attendance.staff.read': ALL,
  'attendance.staff.create': ALL,
  'staff.record.read': ALL,
  'staff.record.update': ALL,
  'exams.exam.configure': ALL,
  'exams.mark.create': ALL,
  'exams.result.read': ALL,
  'workflow.request.create': ALL,
  'workflow.request.approve': SCOPED,
  'workflow.request.manage': ALL,
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
  'staff.salary.pay': ALL,
  'workflow.request.create': ALL,
  'workflow.request.approve': SCOPED,
  'comms.message.create': ALL,
};

/** Office Staff: the Admin's access without revenue, plus their own attendance record. */
const RECEPTION: RoleGrants = {
  ...WITHOUT_REVENUE,
  'attendance.own.read': ALL,
};

/**
 * Everything a teacher touches is scoped to the classes assigned to them
 * (`staff_class_assignments`, ADR-0014) — and a teacher with none assigned
 * reaches nothing. They hold no `attendance.staff.*`: the staff register is
 * not any class's.
 */
const TEACHER: RoleGrants = {
  ...WORKSPACE,
  'attendance.own.read': ALL,
  'students.student.read': SCOPED,
  // Read-only, and only the classes assigned to them (ADR-0014): the Classes
  // page lists their own and nobody else's. Configuring stays with the office.
  'academics.structure.read': SCOPED,
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

/**
 * Sees only their own children, through the parent portal.
 *
 * Deliberately **not** the staff permissions with a `SCOPED` grant. A scoped
 * grant protects only the services that narrow their queries, and most do not:
 * a student detail or an attendance report would have shown a parent any
 * child's record. `parent.child.read` is served by endpoints that begin at the
 * guardian's own account, so there is nothing broader for a parent to reach.
 * It also keeps staff-facing screens (and their navigation) closed to parents.
 */
const PARENT: RoleGrants = {
  'parent.child.read': ALL,
  // Their children's fee vouchers, through endpoints that start at the guardian's own account.
  'parent.voucher.read': ALL,
  // The timetable of the class their child is in — narrowed by the service to
  // exactly that, and only once it is published (ADR-0017).
  'academics.timetable.read': SCOPED,
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
