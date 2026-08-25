import { Client } from 'pg';

/**
 * Database connections for the gate and isolation suites.
 *
 * Two roles, because the whole point is to test the difference between them:
 * - **owner** (`DATABASE_ADMIN_URL`) runs migrations and seeds fixtures. It can
 *   see everything, which is why nothing under test may use it for reads.
 * - **app** (`DATABASE_URL`) is `NOBYPASSRLS`. Everything the product does at
 *   runtime goes through this role.
 *
 * There is deliberately **no skip-if-unavailable path**. A suite that silently
 * skips when the database is missing is a green build that proves nothing, and
 * the one thing these suites exist to prove is the thing that ends the company
 * if it breaks (docs/15 R1).
 */

function required(name: string): string {
  const value = process.env[name];
  if (value === undefined || value === '') {
    throw new Error(
      `${name} is not set. The isolation suites require a real PostgreSQL; they must never be skipped. ` +
        'Start one with `pnpm db` and re-run.',
    );
  }
  return value;
}

/** Prisma accepts `?schema=`, `pg` does not. */
function toPgUrl(url: string): string {
  const parsed = new URL(url);
  parsed.search = '';
  return parsed.toString();
}

export function ownerUrl(): string {
  return required('DATABASE_ADMIN_URL');
}

export function appUrl(): string {
  return required('DATABASE_URL');
}

export async function connectOwner(): Promise<Client> {
  const client = new Client({ connectionString: toPgUrl(ownerUrl()) });
  await client.connect();
  return client;
}

export async function connectApp(): Promise<Client> {
  const client = new Client({ connectionString: toPgUrl(appUrl()) });
  await client.connect();
  return client;
}

/**
 * Run a callback with the tenant context set, exactly as the request pipeline
 * does: inside a transaction, using `set_config(..., true)`.
 *
 * Transaction-local is not a style choice. The runtime connects through a
 * transaction-mode pooler, where a session-level setting would leak from one
 * tenant's request into the next request that reused the connection.
 */
export async function withTenant<T>(
  client: Client,
  schoolId: string,
  fn: () => Promise<T>,
): Promise<T> {
  await client.query('BEGIN');
  try {
    await client.query(`SELECT set_config('app.school_id', $1, true)`, [schoolId]);
    return await fn();
  } finally {
    await client.query('ROLLBACK');
  }
}
