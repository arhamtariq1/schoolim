/**
 * Turn a `DATABASE_*_URL` into something `pg` will accept, wherever it points.
 *
 * Two things have to be handled, and both of them produced confusing failures
 * before this existed:
 *
 * 1. **SSL is not a constant.** Every managed host requires it; a PostgreSQL
 *    installed on the developer's own machine does not offer it at all, and
 *    asking produces "The server does not support SSL connections" — which
 *    reads like a misconfigured server rather than an over-eager client.
 *
 * 2. **`pg` is not Prisma.** Prisma's `?schema=public` is meaningless to `pg`,
 *    so the query string is dropped rather than passed through.
 *
 * The scripts that check the database directly each carried their own copy of
 * this, three of them with SSL hard-coded on, so every one of those checks
 * silently skipped itself the moment the database moved to localhost.
 */
export function pgConfig(url) {
  const parsed = new URL(url);
  parsed.search = '';

  const isLocal = parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1';

  return {
    connectionString: parsed.toString(),
    connectionTimeoutMillis: 30_000,
    ...(isLocal ? {} : { ssl: { rejectUnauthorized: false } }),
  };
}

/**
 * Run one query against the admin connection, for a check that has to look at
 * the row rather than the response.
 *
 * Returns a **string** when the check could not be made, and whatever the
 * callback returned when it could. That distinction matters: reporting a
 * connection failure as "not configured" sends whoever is reading the output to
 * look at their environment file, which is the one place the problem is not.
 */
export async function withAdminClient(run) {
  const url = process.env.DATABASE_ADMIN_URL;
  if (url === undefined || url === '') {
    return 'skipped — DATABASE_ADMIN_URL is not set';
  }

  const { Client } = await import('pg');
  const client = new Client(pgConfig(url));

  try {
    await client.connect();
    return await run(client);
  } catch (error) {
    return `could not check — ${error instanceof Error ? error.message : String(error)}`;
  } finally {
    await client.end().catch(() => undefined);
  }
}
