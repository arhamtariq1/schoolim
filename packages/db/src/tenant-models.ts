/**
 * The registry the tenant extension and the RLS CI gate both read.
 *
 * CLAUDE.md: a tenant-scoped table ships with `school_id NOT NULL`, RLS enabled
 * *and* forced with the `tenant_isolation` policy, a `school_id`-leading index,
 * and registration here. Missing any of the four fails CI.
 */

/**
 * Models the Prisma extension scopes automatically. Every read gets
 * `where: { schoolId }` injected and every write is stamped, so a developer
 * cannot forget tenant scoping — they never write it (docs/04 section 2, L2).
 */
export const TENANT_MODELS = [
  'User',
  'UserRole',
  'Session',
  'Invitation',
  'PasswordReset',
  'AuditLog',
  // Phase 1
  'AcademicSession',
  'ClassLevel',
  'Section',
  'Student',
  'Guardian',
  'StudentGuardian',
  'Enrollment',
  'NumberSequence',
] as const;

export type TenantModel = (typeof TENANT_MODELS)[number];

const TENANT_MODEL_SET: ReadonlySet<string> = new Set<string>(TENANT_MODELS);

export function isTenantModel(model: string): model is TenantModel {
  return TENANT_MODEL_SET.has(model);
}

/**
 * Tables that live outside tenancy. The application role holds no grant on
 * these at all; they are reachable only through the owner connection used by
 * migrations and the platform console.
 */
export const PLATFORM_TABLES = ['platform_users', 'school_groups', 'school_domains'] as const;

/**
 * `schools` is neither, and is the one genuine exception.
 *
 * A tenant must read its own row — for branding, timezone and status — but must
 * never see another school's. So RLS applies to it with the policy written
 * against `id` rather than `school_id`. The CI gate knows about this case by
 * name rather than inferring it, because a silent exception in an isolation
 * gate is worse than no gate.
 */
export const SELF_SCOPED_TABLES = ['schools'] as const;

/**
 * `school_domains` carries a `school_id` but is deliberately NOT tenant-scoped.
 *
 * It is read during tenant *resolution* — host header to school — which happens
 * before any tenant context exists. A tenant-scoped policy would make the
 * lookup return nothing and every request would fail closed at the guard. It is
 * therefore a platform table, read through the owner connection, and the
 * application role is granted nothing on it.
 *
 * This list exists so the RLS gate can distinguish "deliberately exempt" from
 * "someone forgot", and every entry needs the reasoning written above it.
 */
export const TENANT_RLS_EXEMPT_TABLES = ['school_domains'] as const;
