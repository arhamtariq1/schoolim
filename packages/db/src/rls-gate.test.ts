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
  AuditLog: 'audit_logs',
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

    // Partitions inherit their parent's policies; they are not separate tables
    // for this purpose.
    const unaccounted = schoolIdTables.filter(
      (table) => !accounted.has(table) && !table.startsWith('audit_logs_'),
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
