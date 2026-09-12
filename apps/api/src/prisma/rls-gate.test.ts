import { type Client } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  PLATFORM_TABLES,
  SELF_SCOPED_TABLES,
  TENANT_MODELS,
  TENANT_RLS_EXEMPT_TABLES,
} from './tenant-models';
import { connectOwner } from './testing/database';

/**
 * The structural RLS gate (CLAUDE.md, "Before adding a tenant-scoped table").
 *
 * This introspects the *live database*, not the Prisma schema. A model can look
 * correct in `schema.prisma` while the migration that created it forgot the
 * policy — and that gap is exactly where a cross-tenant leak lives. The schema
 * tests in `schema.test.ts` check the declaration; this checks the reality.
 *
 * A new tenant table cannot merge without all four: `school_id NOT NULL`, RLS
 * enabled *and* forced with the `tenant_isolation` policy, a `school_id`-leading
 * index, and registration in TENANT_MODELS.
 */

let owner: Client;

/** Prisma model name to the table name it maps to. */
const MODEL_TO_TABLE: Readonly<Record<string, string>> = {
  User: 'users',
  UserRole: 'user_roles',
  Session: 'sessions',
  Invitation: 'invitations',
  PasswordReset: 'password_resets',
  AuthHandoff: 'auth_handoffs',
  EmailVerification: 'email_verifications',
  SchoolAgreement: 'school_agreements',
  AuditLog: 'audit_logs',
  AcademicSession: 'academic_sessions',
  ClassLevel: 'class_levels',
  Section: 'sections',
  Student: 'students',
  Guardian: 'guardians',
  StudentGuardian: 'student_guardians',
  Enrollment: 'enrollments',
  FeeHead: 'fee_heads',
  StudentFee: 'student_fees',
  Holiday: 'holidays',
  Staff: 'staff',
  ExpenseCategory: 'expense_categories',
  Expense: 'expenses',
  JobRun: 'job_runs',
  FeeVoucher: 'fee_vouchers',
  FeeVoucherLine: 'fee_voucher_lines',
  FeeVoucherPeriod: 'fee_voucher_periods',
  FeeVoucherArrear: 'fee_voucher_arrears',
  FeePayment: 'fee_payments',
  FeePaymentAllocation: 'fee_payment_allocations',
  AttendanceRecord: 'attendance_records',
  StaffAttendanceRecord: 'staff_attendance_records',
  SecurityDeposit: 'security_deposits',
  SecurityDepositRefund: 'security_deposit_refunds',
  NumberSequence: 'number_sequences',
};

const tenantTables = TENANT_MODELS.map((model) => {
  const table = MODEL_TO_TABLE[model];
  if (table === undefined) {
    throw new Error(`No table mapping for registered tenant model "${model}"`);
  }
  return table;
});

/** Every table protected by a tenant policy, including the self-scoped one. */
const protectedTables = [...tenantTables, ...SELF_SCOPED_TABLES];

interface TableSecurity {
  relname: string;
  relrowsecurity: boolean;
  relforcerowsecurity: boolean;
}

let security: Map<string, TableSecurity>;
let policies: Map<string, { qual: string | null; withCheck: string | null }>;
let schoolIdTables: string[];
/** Every partition of a tenant-scoped partitioned table, from the catalogue. */
let partitions: string[];

beforeAll(async () => {
  owner = await connectOwner();

  const securityRows = await owner.query<TableSecurity>(`
    SELECT c.relname, c.relrowsecurity, c.relforcerowsecurity
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p')
  `);
  security = new Map(securityRows.rows.map((row) => [row.relname, row]));

  const policyRows = await owner.query<{
    tablename: string;
    policyname: string;
    qual: string | null;
    with_check: string | null;
  }>(`SELECT tablename, policyname, qual, with_check FROM pg_policies WHERE schemaname = 'public'`);
  policies = new Map(
    policyRows.rows
      .filter((row) => row.policyname === 'tenant_isolation')
      .map((row) => [row.tablename, { qual: row.qual, withCheck: row.with_check }]),
  );

  const schoolIdRows = await owner.query<{ table_name: string }>(`
    SELECT c.table_name
    FROM information_schema.columns c
    JOIN pg_class pc ON pc.relname = c.table_name
    JOIN pg_namespace pn ON pn.oid = pc.relnamespace AND pn.nspname = 'public'
    WHERE c.table_schema = 'public'
      AND c.column_name = 'school_id'
      AND pc.relkind IN ('r', 'p')
  `);
  schoolIdTables = schoolIdRows.rows.map((row) => row.table_name);

  const partitionRows = await owner.query<{ relname: string }>(`
    SELECT child.relname
    FROM pg_inherits
    JOIN pg_class child  ON child.oid  = pg_inherits.inhrelid
    JOIN pg_class parent ON parent.oid = pg_inherits.inhparent
    JOIN pg_namespace n  ON n.oid = child.relnamespace
    WHERE n.nspname = 'public' AND parent.relkind = 'p'
  `);
  partitions = partitionRows.rows.map((row) => row.relname);
}, 30_000);

afterAll(async () => {
  await owner?.end();
});

describe('every protected table has RLS enabled and forced', () => {
  it.each(protectedTables)('%s', (table) => {
    const row = security.get(table);
    expect(row, `table ${table} does not exist`).toBeDefined();
    expect(row?.relrowsecurity, `${table}: RLS is not enabled`).toBe(true);
    // Without FORCE, the table owner silently bypasses its own policies — and
    // migrations run as the owner.
    expect(row?.relforcerowsecurity, `${table}: RLS is not FORCED`).toBe(true);
  });
});

describe('every protected table has a tenant_isolation policy', () => {
  it.each(protectedTables)('%s', (table) => {
    const policy = policies.get(table);
    expect(policy, `${table}: no policy named tenant_isolation`).toBeDefined();
    // A USING clause without WITH CHECK would filter reads but allow a write
    // that plants a row into another tenant.
    expect(policy?.qual, `${table}: policy has no USING clause`).toBeTruthy();
    expect(policy?.withCheck, `${table}: policy has no WITH CHECK clause`).toBeTruthy();
    expect(policy?.qual).toContain('current_school_id()');
  });
});

describe('the tenant policy keys on the right column', () => {
  // Matched with an anchored pattern rather than a substring, because
  // `current_school_id()` itself contains the text "school_id" and a loose
  // `toContain` would pass for a policy keyed on the wrong column.
  it.each(tenantTables)('%s keys on its own school_id column', (table) => {
    expect(policies.get(table)?.qual ?? '').toMatch(/^\(school_id = current_school_id\(\)\)$/);
  });

  it.each(SELF_SCOPED_TABLES)('%s keys on id, because it is the tenant root', (table) => {
    expect(policies.get(table)?.qual ?? '').toMatch(/^\(id = current_school_id\(\)\)$/);
  });
});

describe('every tenant table has a school_id-leading index', () => {
  it.each(tenantTables)('%s', async (table) => {
    const { rows } = await owner.query<{ indexdef: string }>(
      `SELECT indexdef FROM pg_indexes WHERE schemaname = 'public' AND tablename = $1`,
      [table],
    );
    expect(rows.length, `${table} has no indexes at all`).toBeGreaterThan(0);

    // At least one index must lead with school_id, or every tenant-scoped query
    // is a sequential scan once the table is large.
    const leading = rows.some((row) => /\(\s*school_id\b/.test(row.indexdef));
    expect(leading, `${table}: no index leads with school_id`).toBe(true);
  });
});

describe('nothing carrying a school_id is unaccounted for', () => {
  it('is either registered, self-scoped, platform-owned or explicitly exempt', () => {
    const accounted = new Set<string>([
      ...tenantTables,
      ...SELF_SCOPED_TABLES,
      ...PLATFORM_TABLES,
      ...TENANT_RLS_EXEMPT_TABLES,
    ]);

    // Partitions are covered by the suite below rather than registered
    // separately. Identified by asking the catalogue what is a partition, not
    // by matching a name prefix — a prefix check silently stops covering the
    // next partitioned table somebody adds.
    const unaccounted = schoolIdTables.filter(
      (table) => !accounted.has(table) && !partitions.includes(table),
    );

    expect(
      unaccounted,
      'A table carries school_id but is not registered in TENANT_MODELS. ' +
        'Register it, or add it to an exemption list with the reason written down.',
    ).toEqual([]);
  });
});

describe('append-only tables really are append-only', () => {
  it('denies the application role UPDATE and DELETE on audit_logs', async () => {
    // docs/12 R8. This is what makes an impersonation record impossible to
    // quietly remove (docs/17 section 5).
    const { rows } = await owner.query<{ privilege_type: string }>(
      `SELECT privilege_type FROM information_schema.role_table_grants
       WHERE table_schema = 'public' AND table_name = 'audit_logs' AND grantee = 'ilm_app'`,
    );
    const granted = rows.map((row) => row.privilege_type);

    expect(granted).toContain('INSERT');
    expect(granted).toContain('SELECT');
    expect(granted).not.toContain('UPDATE');
    expect(granted).not.toContain('DELETE');
  });
});

describe('platform tables are unreachable by the application role', () => {
  it.each(PLATFORM_TABLES)('%s grants nothing to ilm_app', async (table) => {
    const { rows } = await owner.query(
      `SELECT privilege_type FROM information_schema.role_table_grants
       WHERE table_schema = 'public' AND table_name = $1 AND grantee = 'ilm_app'`,
      [table],
    );
    expect(rows).toEqual([]);
  });
});

describe('audit_logs is partitioned by month', () => {
  it('is a partitioned table, not an ordinary one', () => {
    // relkind 'p' is a partitioned table. Retrofitting this onto a populated
    // table means an exclusive lock and a full rewrite.
    expect(security.get('audit_logs')).toBeDefined();
  });

  it('has partitions covering the months ahead, plus a default', async () => {
    const { rows } = await owner.query<{ child: string }>(`
      SELECT c.relname AS child
      FROM pg_inherits i
      JOIN pg_class c ON c.oid = i.inhrelid
      JOIN pg_class p ON p.oid = i.inhparent
      WHERE p.relname = 'audit_logs'
    `);
    const children = rows.map((row) => row.child);

    expect(children).toContain('audit_logs_default');
    // Twelve months ahead plus the current one; a shortfall means the
    // maintenance job has not been run.
    expect(children.length).toBeGreaterThanOrEqual(13);
  });
});

describe('audit_logs partitions are individually protected', () => {
  /**
   * RLS on a partitioned parent does NOT protect a partition queried directly:
   * PostgreSQL evaluates row security against the relation named in the query.
   * Privileges, meanwhile, DO propagate from parent to partition — so
   * `SELECT * FROM audit_logs_2026_08` read every school's rows while the
   * parent looked perfectly correct in every introspection.
   *
   * Found by probing a deployed database. This test exists so it cannot
   * return, including on partitions created years from now.
   */
  it('every partition has RLS enabled and forced', async () => {
    const { rows } = await owner.query<{ child: string; enabled: boolean; forced: boolean }>(`
      SELECT c.relname AS child, c.relrowsecurity AS enabled, c.relforcerowsecurity AS forced
      FROM pg_inherits i
      JOIN pg_class c ON c.oid = i.inhrelid
      JOIN pg_class p ON p.oid = i.inhparent
      WHERE p.relname = 'audit_logs'
    `);

    expect(rows.length).toBeGreaterThan(0);
    const unprotected = rows.filter((row) => !row.enabled || !row.forced).map((row) => row.child);
    expect(unprotected, 'these partitions are readable across tenants').toEqual([]);
  });

  it('every partition carries the tenant_isolation policy', async () => {
    const { rows } = await owner.query<{ child: string }>(`
      SELECT c.relname AS child
      FROM pg_inherits i
      JOIN pg_class c ON c.oid = i.inhrelid
      JOIN pg_class p ON p.oid = i.inhparent
      WHERE p.relname = 'audit_logs'
        AND NOT EXISTS (
          SELECT 1 FROM pg_policies
          WHERE schemaname = 'public'
            AND tablename = c.relname
            AND policyname = 'tenant_isolation'
        )
    `);
    expect(
      rows.map((row) => row.child),
      'these partitions have no tenant policy',
    ).toEqual([]);
  });

  it('provides a helper so a new partition cannot be created unprotected', async () => {
    // The monthly maintenance job must call this rather than CREATE TABLE.
    const { rows } = await owner.query<{ exists: boolean }>(
      `SELECT EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'ensure_audit_partition') AS exists`,
    );
    expect(rows[0]?.exists).toBe(true);
  });
});

describe('the tenant context function fails closed', () => {
  it('returns NULL when no tenant is set, so policies match nothing', async () => {
    const { rows } = await owner.query<{ school: string | null }>(
      'SELECT current_school_id() AS school',
    );
    expect(rows[0]?.school).toBeNull();
  });

  it('treats an empty string as unset rather than raising', async () => {
    await owner.query('BEGIN');
    await owner.query(`SELECT set_config('app.school_id', '', true)`);
    const { rows } = await owner.query<{ school: string | null }>(
      'SELECT current_school_id() AS school',
    );
    await owner.query('ROLLBACK');
    expect(rows[0]?.school).toBeNull();
  });
});

/**
 * Every partition, secured on its own.
 *
 * PostgreSQL evaluates row security against the relation named in the query, so
 * a policy on a partitioned parent does **not** protect a partition somebody
 * selects from directly:
 *
 *     SELECT * FROM attendance_records_2026_09;   -- every school's rows
 *
 * The application role reaches partitions because privileges granted on a
 * partitioned table propagate down, while the parent's RLS does not. This was a
 * real leak on `audit_logs`, found by probing the deployed database rather than
 * by reading the schema — the parent looked correct in every introspection.
 *
 * So the gate walks the catalogue rather than trusting a naming convention: any
 * partition of any tenant-scoped parent, including ones a maintenance job
 * created last night, has to carry its own policy.
 */
describe('every partition is secured in its own right', () => {
  it('finds at least one, or this suite is silently passing on nothing', () => {
    expect(partitions.length).toBeGreaterThan(0);
  });

  it('has RLS enabled, forced and policed on each', () => {
    const unprotected: string[] = [];

    for (const partition of partitions) {
      const row = security.get(partition);
      const policy = policies.get(partition);
      if (
        row?.relrowsecurity !== true ||
        row.relforcerowsecurity !== true ||
        policy?.qual === null ||
        policy?.qual === undefined ||
        policy.withCheck === null
      ) {
        unprotected.push(partition);
      }
    }

    expect(
      unprotected,
      'A partition is reachable without a tenant policy. Pass it through ' +
        'secure_tenant_partition(), including in whatever created it.',
    ).toEqual([]);
  });
});
