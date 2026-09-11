#!/usr/bin/env node
/**
 * Create (or update) the application role on whichever database
 * `DATABASE_ADMIN_URL` points at.
 *
 * The role is deliberately `NOBYPASSRLS` and holds no DDL grant: it is the role
 * every request runs as, and layer 3 of the isolation model is only real
 * because PostgreSQL will not let it see another tenant's rows whatever SQL it
 * sends (docs/04 §2).
 *
 * On a managed host the owner is usually not a superuser but does carry
 * `BYPASSRLS` — Supabase's `postgres` role does — which is what lets migrations
 * and seeds run against tables with `FORCE ROW LEVEL SECURITY`.
 *
 * The password comes from `DATABASE_URL`, so the two can never drift.
 *
 * Run: node tooling/scripts/provision-app-role.mjs
 */

import 'dotenv/config';

import { Client } from 'pg';

function required(name) {
  const value = process.env[name];
  if (value === undefined || value === '') {
    throw new Error(`${name} is not set.`);
  }
  return value;
}

/** `pg` rejects Prisma's `?schema=`; SSL is required by every managed host. */
function connection(url) {
  const parsed = new URL(url);
  parsed.search = '';
  const isLocal = parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1';
  return {
    connectionString: parsed.toString(),
    connectionTimeoutMillis: 30_000,
    ...(isLocal ? {} : { ssl: { rejectUnauthorized: false } }),
  };
}

const adminUrl = required('DATABASE_ADMIN_URL');
const appUrl = new URL(required('DATABASE_URL'));

/**
 * The role name, with a connection-pooler suffix stripped.
 *
 * Supabase's pooler addresses a project by putting it in the username —
 * `ilm_app.wfvrkgli…` — but the role in `pg_roles` is plain `ilm_app`. Taking
 * the username literally would have this script CREATE a second, bogus role
 * called `ilm_app.wfvrkgli…` and report success, while the role the
 * application actually connects as kept its old password. A rotation that
 * silently rotates nothing is worse than one that fails.
 *
 * Only stripped for a recognised pooler host, so a role name that genuinely
 * contains a dot survives everywhere else.
 */
function roleNameFrom(url) {
  const username = decodeURIComponent(url.username);
  const isPooler = /(^|.)pooler.supabase.com$/.test(url.hostname);
  if (!isPooler) return username;

  const cut = username.lastIndexOf('.');
  return cut === -1 ? username : username.slice(0, cut);
}

const appRole = roleNameFrom(appUrl);
const appPassword = decodeURIComponent(appUrl.password);

if (appPassword === '') {
  throw new Error('DATABASE_URL has no password; the application role needs one.');
}

const client = new Client(connection(adminUrl));
await client.connect();

try {
  const existing = await client.query('SELECT 1 FROM pg_roles WHERE rolname = $1', [appRole]);

  // Role names and passwords cannot be bound as parameters in CREATE/ALTER
  // ROLE, so they are quoted by the server rather than concatenated by hand.
  const quotedRole = (await client.query('SELECT quote_ident($1) AS q', [appRole])).rows[0].q;
  const quotedPassword = (await client.query('SELECT quote_literal($1) AS q', [appPassword]))
    .rows[0].q;

  const verb = existing.rowCount === 0 ? 'CREATE' : 'ALTER';
  await client.query(
    `${verb} ROLE ${quotedRole} WITH LOGIN NOBYPASSRLS NOSUPERUSER NOCREATEDB NOCREATEROLE PASSWORD ${quotedPassword}`,
  );

  await client.query(`GRANT USAGE ON SCHEMA public TO ${quotedRole}`);
  await client.query(
    `ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO ${quotedRole}`,
  );
  await client.query(
    `ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO ${quotedRole}`,
  );

  const check = await client.query(
    'SELECT rolname, rolbypassrls, rolsuper, rolcanlogin FROM pg_roles WHERE rolname = $1',
    [appRole],
  );
  const row = check.rows[0];

  if (row.rolbypassrls === true || row.rolsuper === true) {
    throw new Error(
      `${appRole} can bypass row-level security. Every isolation guarantee rests on it not being able to.`,
    );
  }

  console.error(
    `${verb === 'CREATE' ? 'Created' : 'Updated'} role ${appRole} ` +
      `(from username "${decodeURIComponent(appUrl.username)}"): ` +
      `login=${String(row.rolcanlogin)} bypassrls=${String(row.rolbypassrls)} superuser=${String(row.rolsuper)}`,
  );
} finally {
  await client.end();
}
