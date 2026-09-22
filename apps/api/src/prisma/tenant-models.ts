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
  /** ADR-0009: the apex-to-school bridge. Minted after a verified password. */
  'AuthHandoff',
  /** ADR-0012: proof that a person can read mail at the address they typed. */
  'EmailVerification',
  /** ADR-0010 / docs/17 §3: who accepted which terms version, and when. */
  'SchoolAgreement',
  'AuditLog',
  // Phase 1
  'AcademicSession',
  'ClassLevel',
  'Section',
  'Student',
  'Guardian',
  'StudentGuardian',
  'Enrollment',
  // Phase 2 — fees
  'FeeHead',
  'StudentFee',
  'Holiday',
  'Staff',
  'ExpenseCategory',
  'Expense',
  // Vouchers, payments, and the batch engine behind them.
  'JobRun',
  'FeeVoucher',
  'FeeVoucherLine',
  'FeeVoucherPeriod',
  'FeeVoucherArrear',
  'FeePayment',
  'FeePaymentAllocation',
  // Attendance. `AttendanceRecord` is partitioned by month; every partition
  // carries its own RLS, checked by the gate suite.
  'AttendanceRecord',
  'StaffAttendanceRecord',
  // Money the school holds rather than earns, and the repayments out of it.
  'SecurityDeposit',
  'SecurityDepositRefund',
  'SchoolLogo',
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
export const PLATFORM_TABLES = [
  'platform_users',
  /** Refresh tokens for platform staff. Belongs to no school, by definition. */
  'platform_sessions',
  /**
   * In-progress self-serve signup. Exists before a school does, so it cannot
   * carry `school_id` or tenant RLS. Admin connection only.
   */
  'signup_intents',
  'school_groups',
  'school_domains',
] as const;

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

/**
 * Indexes on a tenant table that deliberately do **not** lead with `school_id`.
 *
 * Every tenant-scoped query carries a school, so every index leads with one,
 * and `schema.test.ts` enforces that. This is the named exception list, because
 * a gate with a silent exception is worse than no gate — the same reasoning
 * that put `TENANT_RLS_EXEMPT_TABLES` above.
 *
 * An entry here is a claim that a query genuinely crosses tenants on purpose.
 * There is exactly one such query in the product, and it needs a written reason
 * to be added to.
 */
export const UNSCOPED_INDEXES: ReadonlyArray<{
  readonly model: string;
  readonly fields: string;
  readonly why: string;
}> = [
  {
    model: 'User',
    fields: 'email',
    why:
      'Global sign-in (ADR-0009) resolves the school from the credentials, so it looks an ' +
      'identifier up across every school before a tenant exists. It runs on the admin ' +
      'connection from AuthService and nowhere else. Unindexed it would be a sequential scan ' +
      'over every user on the platform, on an endpoint anyone can call.',
  },
  {
    model: 'User',
    fields: 'phone',
    why: 'Same query, same reasoning: sign-in accepts an email or a phone number.',
  },
];

const UNSCOPED_INDEX_SET: ReadonlySet<string> = new Set(
  UNSCOPED_INDEXES.map((entry) => `${entry.model}.${entry.fields}`),
);

export function isDeliberatelyUnscopedIndex(model: string, fields: string): boolean {
  return UNSCOPED_INDEX_SET.has(`${model}.${fields}`);
}
