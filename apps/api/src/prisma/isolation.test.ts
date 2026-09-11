import { PrismaPg } from '@prisma/adapter-pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { PrismaClient } from './generated/client';
import { currentTenant, runInTenant, runInTenantUnscoped } from './tenancy/run-in-tenant';
import { MissingTenantContextError } from './tenancy/tenant-context';
import { tenantExtension } from './tenancy/tenant-extension';

/**
 * The Phase 0 exit criterion (docs/14, docs/20 gate 1).
 *
 * School A must not be able to list, read, update or delete a single row
 * belonging to School B — **and every assertion is repeated with layer 2
 * disabled**, so that PostgreSQL RLS is proven to hold on its own.
 *
 * That second half is the entire point. If these tests only ran with the Prisma
 * extension active, they would pass on a database with no policies at all, and
 * the suite would be certifying the wrong thing. Layer 3 exists because layer 2
 * cannot see `$queryRaw`, and because one day someone will write raw SQL.
 *
 * There is no skip-if-no-database path here, deliberately. See testing/database.
 */

const SCHOOL_A = '11111111-1111-4111-8111-111111111111';
const SCHOOL_B = '22222222-2222-4222-8222-222222222222';

function requireEnv(name: string): string {
  const value = process.env[name];
  if (value === undefined || value === '') {
    throw new Error(`${name} is required; the isolation suite must never be skipped.`);
  }
  return value;
}

function stripSchemaParam(url: string): string {
  const parsed = new URL(url);
  parsed.search = '';
  return parsed.toString();
}

/** Owner connection. Superuser, so it can seed across tenants. */
const owner = new PrismaClient({
  adapter: new PrismaPg({ connectionString: stripSchemaParam(requireEnv('DATABASE_ADMIN_URL')) }),
});

/** Application connection: NOBYPASSRLS. Everything under test uses this. */
const rawApp = new PrismaClient({
  adapter: new PrismaPg({ connectionString: stripSchemaParam(requireEnv('DATABASE_URL')) }),
});

const userA = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1';
const userB = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1';

beforeAll(async () => {
  // Seeded as the owner, which is a superuser and therefore bypasses RLS.
  // Note for deployment: on a managed Postgres where the migration role is not
  // a superuser, FORCE RLS applies to it too and seeding needs explicit context.
  await owner.$executeRaw`DELETE FROM audit_logs WHERE school_id IN (${SCHOOL_A}::uuid, ${SCHOOL_B}::uuid)`;
  await owner.$executeRaw`DELETE FROM users WHERE school_id IN (${SCHOOL_A}::uuid, ${SCHOOL_B}::uuid)`;
  await owner.$executeRaw`DELETE FROM schools WHERE id IN (${SCHOOL_A}::uuid, ${SCHOOL_B}::uuid)`;

  await owner.$executeRaw`
    INSERT INTO schools (id, name, slug, created_at, updated_at)
    VALUES (${SCHOOL_A}::uuid, 'School A', 'school-a', now(), now()),
           (${SCHOOL_B}::uuid, 'School B', 'school-b', now(), now())
  `;

  await owner.$executeRaw`
    INSERT INTO users (id, school_id, email, name, status, created_at, updated_at)
    VALUES (${userA}::uuid, ${SCHOOL_A}::uuid, 'head@school-a.test', 'Head A', 'ACTIVE', now(), now()),
           (${userB}::uuid, ${SCHOOL_B}::uuid, 'head@school-b.test', 'Head B', 'ACTIVE', now(), now())
  `;

  await owner.$executeRaw`
    INSERT INTO audit_logs (id, school_id, action, entity_type, at)
    VALUES (gen_random_uuid(), ${SCHOOL_A}::uuid, 'seed', 'User', now()),
           (gen_random_uuid(), ${SCHOOL_B}::uuid, 'seed', 'User', now())
  `;
}, 30_000);

afterAll(async () => {
  await owner.$executeRaw`DELETE FROM audit_logs WHERE school_id IN (${SCHOOL_A}::uuid, ${SCHOOL_B}::uuid)`;
  await owner.$executeRaw`DELETE FROM users WHERE school_id IN (${SCHOOL_A}::uuid, ${SCHOOL_B}::uuid)`;
  await owner.$executeRaw`DELETE FROM schools WHERE id IN (${SCHOOL_A}::uuid, ${SCHOOL_B}::uuid)`;
  await owner.$disconnect();
  await rawApp.$disconnect();
});

// ---------------------------------------------------------------------------
// Layer 3 alone. The Prisma extension is NOT applied in this block.
// If these fail, the database is not protecting anything by itself.
// ---------------------------------------------------------------------------
describe('PostgreSQL RLS holds with layer 2 disabled', () => {
  it('lists only its own users', async () => {
    const rows = await runInTenantUnscoped(rawApp, SCHOOL_A, (tx) => tx.user.findMany());
    expect(rows).toHaveLength(1);
    expect(rows[0]?.email).toBe('head@school-a.test');
  });

  it('cannot read another school by id, even asking for it directly', async () => {
    const found = await runInTenantUnscoped(rawApp, SCHOOL_A, (tx) =>
      tx.user.findUnique({ where: { id: userB } }),
    );
    expect(found).toBeNull();
  });

  it('cannot reach another school through raw SQL', async () => {
    // The case layer 2 could never catch: hand-written SQL, or an injection,
    // naming the other tenant explicitly.
    const rows = await runInTenantUnscoped(
      rawApp,
      SCHOOL_A,
      (tx) =>
        tx.$queryRaw<
          { count: bigint }[]
        >`SELECT count(*) AS count FROM users WHERE school_id = ${SCHOOL_B}::uuid`,
    );
    expect(Number(rows[0]?.count ?? -1)).toBe(0);
  });

  it('cannot update another school’s row', async () => {
    const result = await runInTenantUnscoped(rawApp, SCHOOL_A, (tx) =>
      tx.user.updateMany({ where: { id: userB }, data: { name: 'hijacked' } }),
    );
    expect(result.count).toBe(0);

    const untouched = await owner.$queryRaw<{ name: string }[]>`
      SELECT name FROM users WHERE id = ${userB}::uuid
    `;
    expect(untouched[0]?.name).toBe('Head B');
  });

  it('cannot delete another school’s row', async () => {
    const result = await runInTenantUnscoped(rawApp, SCHOOL_A, (tx) =>
      tx.user.deleteMany({ where: { id: userB } }),
    );
    expect(result.count).toBe(0);
  });

  it('cannot plant a row into another school', async () => {
    await expect(
      runInTenantUnscoped(
        rawApp,
        SCHOOL_A,
        (tx) =>
          tx.$executeRaw`
          INSERT INTO users (id, school_id, email, name, status, created_at, updated_at)
          VALUES (gen_random_uuid(), ${SCHOOL_B}::uuid, 'forged@school-b.test', 'Forged', 'ACTIVE', now(), now())
        `,
      ),
    ).rejects.toThrow();
  });

  it('sees nothing at all with no tenant context', async () => {
    // Failing closed: no context must mean no rows, never all rows.
    const rows = await rawApp.user.findMany();
    expect(rows).toHaveLength(0);
  });

  it('scopes the schools table to the tenant’s own row', async () => {
    const rows = await runInTenantUnscoped(rawApp, SCHOOL_A, (tx) => tx.school.findMany());
    expect(rows).toHaveLength(1);
    expect(rows[0]?.id).toBe(SCHOOL_A);
  });

  it('isolates audit rows, which are partitioned', async () => {
    // Partitions inherit the parent policy; this proves it in practice.
    const rows = await runInTenantUnscoped(rawApp, SCHOOL_A, (tx) => tx.auditLog.findMany());
    expect(rows).toHaveLength(1);
    expect(rows[0]?.schoolId).toBe(SCHOOL_A);
  });

  it('does not let tenant context survive the transaction', async () => {
    await runInTenantUnscoped(rawApp, SCHOOL_A, async (tx) => {
      expect(await currentTenant(tx)).toBe(SCHOOL_A);
    });
    // Transaction-local: the pooled connection must carry nothing forward.
    expect(await currentTenant(rawApp)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Layers 2 and 3 together — the normal runtime configuration.
// ---------------------------------------------------------------------------
describe('the Prisma extension scopes queries', () => {
  it('injects the tenant filter on reads', async () => {
    const rows = await runInTenant(rawApp, SCHOOL_A, (tx) => tx.user.findMany());
    expect(rows).toHaveLength(1);
    expect(rows[0]?.schoolId).toBe(SCHOOL_A);
  });

  it('narrows findUnique, so a guessed id from another school does not resolve', async () => {
    const found = await runInTenant(rawApp, SCHOOL_A, (tx) =>
      tx.user.findUnique({ where: { id: userB } }),
    );
    expect(found).toBeNull();
  });

  it('stamps the tenant onto a create, so it cannot be forgotten', async () => {
    const created = await runInTenant(rawApp, SCHOOL_A, (tx) =>
      // No schoolId supplied: the extension supplies it. This is what makes
      // docs/12 R2 enforceable rather than aspirational.
      tx.user.create({
        data: { email: 'new@school-a.test', name: 'New', status: 'ACTIVE' } as never,
      }),
    );
    expect(created.schoolId).toBe(SCHOOL_A);

    await owner.$executeRaw`DELETE FROM users WHERE id = ${created.id}::uuid`;
  });

  it('throws rather than querying unscoped when there is no tenant', async () => {
    // Fails closed. Defaulting to "no filter" would return every school's rows.
    const unresolved = rawApp.$extends(tenantExtension(() => undefined));
    await expect(unresolved.user.findMany()).rejects.toThrow(MissingTenantContextError);
  });

  it('leaves platform models unscoped, since they are outside tenancy', async () => {
    // SchoolGroup is not a tenant model, so the extension must not demand a
    // tenant for it. The owner client is what actually reads these.
    const platform = owner.$extends(tenantExtension(() => undefined));
    await expect(platform.schoolGroup.findMany()).resolves.toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// The layers do not depend on each other.
// ---------------------------------------------------------------------------
describe('the two layers are independent', () => {
  it('blocks a cross-tenant read even when layer 2 is told the wrong tenant', async () => {
    // Layer 2 is deliberately lied to: it will happily filter on School B.
    // Layer 3 is bound to School A. The database must win.
    const rows = await runInTenant(rawApp, SCHOOL_A, (tx) => tx.user.findMany(), SCHOOL_B);
    expect(rows).toHaveLength(0);
  });

  it('blocks a cross-tenant write even when layer 2 is told the wrong tenant', async () => {
    await expect(
      runInTenant(
        rawApp,
        SCHOOL_A,
        (tx) =>
          tx.user.create({
            data: { email: 'forged@school-b.test', name: 'Forged', status: 'ACTIVE' } as never,
          }),
        SCHOOL_B,
      ),
    ).rejects.toThrow();
  });
});
