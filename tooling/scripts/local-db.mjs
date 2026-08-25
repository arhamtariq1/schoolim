#!/usr/bin/env node
/**
 * Project-owned local PostgreSQL.
 *
 * Runs a real PostgreSQL server from a binary in `node_modules`. No Docker, no
 * system install, no admin rights — `pnpm db` and it is up.
 *
 * This is for local development and tests only. Deployed environments point
 * DATABASE_URL at Supabase today and Railway later (docs/13 §3).
 *
 * Usage:
 *   node tooling/scripts/local-db.mjs start
 *   node tooling/scripts/local-db.mjs stop
 *   node tooling/scripts/local-db.mjs status
 *   node tooling/scripts/local-db.mjs reset    (destroys the data directory)
 */

import { existsSync } from 'node:fs';
import { mkdir, rm, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import EmbeddedPostgres from 'embedded-postgres';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const dataDir = join(repoRoot, '.local', 'pgdata');
const pidFile = join(repoRoot, '.local', 'pg.json');

/**
 * Must match .env exactly.
 *
 * The port is overridable because Windows can leave a stale LISTEN socket
 * behind after a hard kill, and hard-coding one port makes that unrecoverable
 * without a reboot.
 */
const PORT = Number(process.env.LOCAL_DB_PORT ?? 5433);

const CONFIG = {
  databaseDir: dataDir,
  user: 'ilm',
  password: 'ilm_local_dev',
  port: PORT,
  persistent: true,
};

const DATABASE_NAME = 'ilm';

/**
 * The application role. Deliberately NOBYPASSRLS and holding no DDL grant, so
 * it could not create a table or a policy even if a bug tried (docs/04 s2).
 * Kept in step with tooling/sql/01-app-role.sql.
 */
const APP_ROLE_SQL = `
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'ilm_app') THEN
    CREATE ROLE ilm_app WITH LOGIN PASSWORD 'ilm_local_dev' NOBYPASSRLS;
  END IF;
END
$$;
GRANT CONNECT ON DATABASE ilm TO ilm_app;
GRANT USAGE ON SCHEMA public TO ilm_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO ilm_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO ilm_app;
`;

async function start() {
  await mkdir(dirname(pidFile), { recursive: true });

  const initialise = !existsSync(join(dataDir, 'PG_VERSION'));
  const pg = new EmbeddedPostgres(CONFIG);

  if (initialise) {
    console.error('initialising a fresh data directory…');
    await pg.initialise();
  }

  await pg.start();

  const client = pg.getPgClient();
  await client.connect();

  const { rows } = await client.query('SELECT 1 FROM pg_database WHERE datname = $1', [
    DATABASE_NAME,
  ]);
  if (rows.length === 0) {
    await client.query(`CREATE DATABASE ${DATABASE_NAME}`);
  }
  await client.end();

  // The app role and its grants live in the target database, not in `postgres`.
  const { Client } = await import('pg');
  const appDb = new Client({
    host: 'localhost',
    port: CONFIG.port,
    user: CONFIG.user,
    password: CONFIG.password,
    database: DATABASE_NAME,
  });
  await appDb.connect();
  await appDb.query(APP_ROLE_SQL);
  await appDb.end();

  await writeFile(pidFile, JSON.stringify({ port: CONFIG.port, startedAt: Date.now() }, null, 2));

  console.error(
    `postgres listening on localhost:${String(CONFIG.port)}, database "${DATABASE_NAME}"`,
  );
  console.error('roles: ilm (owner, migrations) · ilm_app (application, NOBYPASSRLS)');
  console.error('ready — leave this process running; Ctrl-C or `local-db.mjs stop` to shut down');

  // The server runs as a child of this process, so this process must stay
  // alive. Run it in its own terminal and leave it there.
  const shutdown = () => {
    void pg
      .stop()
      .catch(() => undefined)
      .finally(() => process.exit(0));
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  // Keep the event loop occupied without busy-waiting.
  await new Promise(() => {
    /* runs until a signal arrives */
  });
}

async function stop() {
  const pg = new EmbeddedPostgres(CONFIG);
  try {
    await pg.stop();
    console.error('postgres stopped');
  } catch (error) {
    console.error(`could not stop cleanly: ${String(error)}`);
  }
  if (existsSync(pidFile)) {
    await rm(pidFile);
  }
}

async function status() {
  const { Client } = await import('pg');
  const client = new Client({
    host: 'localhost',
    port: CONFIG.port,
    user: CONFIG.user,
    password: CONFIG.password,
    database: DATABASE_NAME,
    connectionTimeoutMillis: 2000,
  });
  try {
    await client.connect();
    const { rows } = await client.query('SELECT version()');
    console.error(rows[0]?.version ?? 'connected');
    await client.end();
  } catch (error) {
    console.error(`not reachable on port ${String(CONFIG.port)}: ${String(error)}`);
    process.exit(1);
  }
}

async function reset() {
  await stop();
  if (existsSync(dataDir)) {
    await rm(dataDir, { recursive: true, force: true });
    console.error('data directory destroyed');
  }
  await start();
}

const command = process.argv[2] ?? 'start';
const commands = { start, stop, status, reset };
const handler = commands[command];

if (handler === undefined) {
  console.error(`unknown command "${command}". Use start | stop | status | reset.`);
  process.exit(1);
}

await handler();
