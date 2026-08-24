/**
 * Every permission in the product, declared once.
 *
 * docs/08 section 3: the shape is `{module}.{resource}.{action}`, lower-case
 * and dot-separated. Both the API guard and the UI navigation import this same
 * literal union, so granting a permission reveals its menu item automatically
 * and the two can never drift.
 *
 * Actions: read · create · update · delete · approve · export · generate ·
 * configure · and a small number of domain-specific verbs where none of those
 * describes what actually happens (`unlock`, `publish`, `reverse`, `cancel`).
 */
export const PERMISSIONS = [
  // --- Workspace ------------------------------------------------------------
  'dashboard.workspace.read',

  // --- Students and people --------------------------------------------------
  'students.student.read',
  'students.student.create',
  'students.student.update',
  'students.student.delete',
  'students.guardian.read',
  'students.guardian.create',
  'students.guardian.update',
  'admissions.application.read',
  'admissions.application.create',
  'admissions.application.update',

  // --- Academic structure ---------------------------------------------------
  'academics.structure.read',
  'academics.structure.configure',
  'academics.timetable.read',
  'academics.timetable.configure',
  'academics.session.configure',

  // --- Fees -----------------------------------------------------------------
  'fees.plan.read',
  'fees.plan.configure',
  'fees.increment.generate',
  'fees.voucher.read',
  'fees.voucher.generate',
  'fees.voucher.cancel',
  'fees.payment.create',
  'fees.payment.reverse',
  'fees.discount.create',
  'fees.discount.approve',
  'fees.waiver.create',
  'fees.waiver.approve',
  'fees.deposit.read',
  'fees.deposit.update',
  'fees.defaulter.read',

  // --- Finance --------------------------------------------------------------
  'finance.expense.read',
  'finance.expense.create',
  'finance.expense.approve',
  'finance.report.read',

  // --- Attendance -----------------------------------------------------------
  'attendance.record.read',
  'attendance.record.create',
  'attendance.record.unlock',
  'attendance.report.read',

  // --- Staff ----------------------------------------------------------------
  'staff.record.read',
  'staff.record.update',
  'staff.salary.read',

  // --- Exams ----------------------------------------------------------------
  'exams.exam.configure',
  'exams.mark.create',
  'exams.result.read',
  'exams.result.publish',

  // --- Workflow and communication -------------------------------------------
  'workflow.request.create',
  'workflow.request.approve',
  'comms.message.create',

  // --- Settings and governance ----------------------------------------------
  'settings.school.configure',
  'settings.user.manage',
  'settings.data.export',
  'audit.log.read',
] as const;

export type Permission = (typeof PERMISSIONS)[number];

const PERMISSION_SET: ReadonlySet<string> = new Set<string>(PERMISSIONS);

export function isPermission(value: string): value is Permission {
  return PERMISSION_SET.has(value);
}

/**
 * Platform permissions live in a separate union.
 *
 * docs/04 section 6: a tenant token can never satisfy a platform guard. Keeping
 * the unions disjoint means a school permission cannot be typed into a platform
 * check by accident.
 */
export const PLATFORM_PERMISSIONS = [
  'platform.school.read',
  'platform.school.create',
  'platform.school.update',
  'platform.school.suspend',
  'platform.school.delete',
  'platform.subscription.manage',
  'platform.invoice.manage',
  'platform.impersonation.start',
  'platform.impersonation.write',
  /** Exporting a whole tenant is the action that turns support into exfiltration (docs/17 section 5). */
  'platform.export.create',
  'platform.audit.read',
  'platform.health.read',
  'platform.feature.configure',
] as const;

export type PlatformPermission = (typeof PLATFORM_PERMISSIONS)[number];

const PLATFORM_PERMISSION_SET: ReadonlySet<string> = new Set<string>(PLATFORM_PERMISSIONS);

export function isPlatformPermission(value: string): value is PlatformPermission {
  return PLATFORM_PERMISSION_SET.has(value);
}
