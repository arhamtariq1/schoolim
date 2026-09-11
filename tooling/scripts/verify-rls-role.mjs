#!/usr/bin/env node
/**
 * WP1 gate: prove the application role cannot bypass row-level security.
 *
 * Every isolation guarantee in this product rests on one assumption — that the
 * role in `DATABASE_URL` is `NOBYPASSRLS` and that PostgreSQL therefore filters
 * its reads no matter what SQL reaches it. If the role bootstrap is subtly
 * wrong, every later isolation test passes for the wrong reason: the Prisma
 * extension (layer 2) would be doing all the work while layer 3 quietly does
 * nothing, and the suite would still be green.
 *
 * So this is checked directly, against a throwaway table, before any product
 * schema exists. It is deliberately independent of the Prisma schema.
 *
 * Run: node tooling/scripts/verify-rls-role.mjs
 */

import './lib/load-env.mjs';

import { Client } from 'pg';

/**
 * No fallback URLs, deliberately.
 *
 * A default connection string means this gate can quietly run against a
 * different database than the application uses and still report eleven passes —
 * which is the one outcome worse than it failing.
 */
function required(name) {
  const value = process.env[name];
  if (value === undefined || value === '') {
    throw new Error(`${name} is not set. Copy .env.example to .env, then start a database.`);
  }
  return value;
}

const OWNER_URL = required('DATABASE_ADMIN_URL');
const APP_URL = required('DATABASE_URL');

const TABLE = 'rls_probe';

/** Strip Prisma-style query params that `pg` does not understand. */
function toPgUrl(url) {
  const parsed = new URL(url);
  parsed.search = '';
  return parsed.toString();
}

const checks = [];
function check(name, passed, detail) {
  checks.push({ name, passed, detail });
  console.error(
    `${passed ? 'PASS' : 'FAIL'}  ${name}${detail === undefined ? '' : ` — ${detail}`}`,
  );
}

const owner = new Client({ connectionString: toPgUrl(OWNER_URL) });
const app = new Client({ connectionString: toPgUrl(APP_URL) });

await owner.connect();
await app.connect();

try {
  // --- Arrange: a table whose policy admits only one tenant -----------------
  await owner.query(`DROP TABLE IF EXISTS ${TABLE}`);
  await owner.query(`
    CREATE TABLE ${TABLE} (
      id        serial PRIMARY KEY,
      school_id uuid NOT NULL,
      note      text NOT NULL
    )
  `);
  await owner.query(`ALTER TABLE ${TABLE} ENABLE ROW LEVEL SECURITY`);
  await owner.query(`ALTER TABLE ${TABLE} FORCE ROW LEVEL SECURITY`);
  await owner.query(`
    CREATE POLICY tenant_isolation ON ${TABLE}
      USING (school_id = current_setting('app.school_id', true)::uuid)
      WITH CHECK (school_id = current_setting('app.school_id', true)::uuid)
  `);
  await owner.query(`GRANT SELECT, INSERT, UPDATE, DELETE ON ${TABLE} TO ilm_app`);
  await owner.query(`GRANT USAGE, SELECT ON SEQUENCE ${TABLE}_id_seq TO ilm_app`);

  const schoolA = '11111111-1111-4111-8111-111111111111';
  const schoolB = '22222222-2222-4222-8222-222222222222';

  await owner.query(`INSERT INTO ${TABLE} (school_id, note) VALUES ($1,$2),($1,$3),($4,$5)`, [
    schoolA,
    'a-one',
    'a-two',
    schoolB,
    'b-one',
  ]);

  // --- 1. The role itself ---------------------------------------------------
  const role = await app.query(
    'SELECT rolbypassrls, rolsuper FROM pg_roles WHERE rolname = current_user',
  );
  check(
    'application role is NOBYPASSRLS',
    role.rows[0]?.rolbypassrls === false,
    `rolbypassrls=${String(role.rows[0]?.rolbypassrls)}`,
  );
  check(
    'application role is not a superuser',
    role.rows[0]?.rolsuper === false,
    `rolsuper=${String(role.rows[0]?.rolsuper)}`,
  );

  // --- 2. No context means no rows, not all rows ----------------------------
  const noContext = await app.query(`SELECT count(*)::int AS n FROM ${TABLE}`);
  check(
    'with no tenant context the app role sees nothing',
    noContext.rows[0]?.n === 0,
    `saw ${String(noContext.rows[0]?.n)} rows`,
  );

  // --- 3. With context, only that tenant ------------------------------------
  await app.query('BEGIN');
  await app.query(`SELECT set_config('app.school_id', $1, true)`, [schoolA]);
  const scoped = await app.query(`SELECT note FROM ${TABLE} ORDER BY note`);
  check(
    'with tenant context the app role sees only that tenant',
    scoped.rowCount === 2 && scoped.rows.every((r) => r.note.startsWith('a-')),
    `saw ${String(scoped.rowCount)} rows: ${scoped.rows.map((r) => r.note).join(', ')}`,
  );

  // --- 4. Raw SQL cannot reach across ---------------------------------------
  // This is the case the Prisma extension could never catch: a hand-written
  // query, or a SQL injection, explicitly asking for another tenant.
  const crossTenant = await app.query(
    `SELECT count(*)::int AS n FROM ${TABLE} WHERE school_id = $1`,
    [schoolB],
  );
  check(
    'raw SQL naming another tenant returns nothing',
    crossTenant.rows[0]?.n === 0,
    `saw ${String(crossTenant.rows[0]?.n)} rows`,
  );

  // --- 5. Writes are constrained too ----------------------------------------
  // A rejected statement aborts the surrounding transaction, so each expected
  // failure runs inside its own savepoint and the probe continues afterwards.
  let insertBlocked = false;
  await app.query('SAVEPOINT probe_insert');
  try {
    await app.query(`INSERT INTO ${TABLE} (school_id, note) VALUES ($1,$2)`, [schoolB, 'forged']);
    await app.query('RELEASE SAVEPOINT probe_insert');
  } catch {
    insertBlocked = true;
    await app.query('ROLLBACK TO SAVEPOINT probe_insert');
  }
  check('WITH CHECK blocks writing a row into another tenant', insertBlocked);

  const updated = await app.query(`UPDATE ${TABLE} SET note = 'hijacked' WHERE school_id = $1`, [
    schoolB,
  ]);
  check(
    'UPDATE cannot touch another tenant',
    updated.rowCount === 0,
    `updated ${String(updated.rowCount)} rows`,
  );

  const deleted = await app.query(`DELETE FROM ${TABLE} WHERE school_id = $1`, [schoolB]);
  check(
    'DELETE cannot touch another tenant',
    deleted.rowCount === 0,
    `deleted ${String(deleted.rowCount)} rows`,
  );

  await app.query('ROLLBACK');

  // --- 6. FORCE matters: the owner is subject to its own policies -----------
  // Without FORCE, a table owner silently bypasses RLS. Migrations run as the
  // owner, so this must be explicit.
  const forced = await owner.query(`SELECT relforcerowsecurity FROM pg_class WHERE relname = $1`, [
    TABLE,
  ]);
  check('FORCE ROW LEVEL SECURITY is set', forced.rows[0]?.relforcerowsecurity === true);

  // --- 7. The app role holds no DDL grant -----------------------------------
  let ddlBlocked = false;
  await app.query('BEGIN');
  try {
    await app.query(`CREATE TABLE should_not_exist (id int)`);
    await app.query(`DROP TABLE should_not_exist`);
    await app.query('ROLLBACK');
  } catch {
    ddlBlocked = true;
    await app.query('ROLLBACK');
  }
  check('application role cannot create tables', ddlBlocked);

  // --- 8. The app role cannot disable the policy protecting it --------------
  let alterBlocked = false;
  await app.query('BEGIN');
  try {
    await app.query(`ALTER TABLE ${TABLE} DISABLE ROW LEVEL SECURITY`);
    await app.query('ROLLBACK');
  } catch {
    alterBlocked = true;
    await app.query('ROLLBACK');
  }
  check('application role cannot disable row-level security', alterBlocked);
} finally {
  await owner.query(`DROP TABLE IF EXISTS ${TABLE}`).catch(() => undefined);
  await app.end().catch(() => undefined);
  await owner.end().catch(() => undefined);
}

const failed = checks.filter((c) => !c.passed);
console.error(`\n${String(checks.length - failed.length)}/${String(checks.length)} checks passed`);

if (failed.length > 0) {
  console.error('\nThe application role is not safe to build on. Fix the role bootstrap first.');
  process.exit(1);
}
