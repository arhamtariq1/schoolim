import { PrismaPg } from '@prisma/adapter-pg';

import { PrismaClient } from './generated/client';

/**
 * The two database clients, and why there are exactly two.
 *
 * - **The application client** connects as the `NOBYPASSRLS` role. Every
 *   request goes through it, and PostgreSQL filters its reads whatever SQL
 *   reaches it — including `$queryRaw`, which layer 2 cannot touch.
 * - **The admin client** connects as the owner. It runs migrations and the
 *   platform console, and it is deliberately awkward to reach so that nobody
 *   uses it to "just fix" a tenant query.
 *
 * Never export a single default client. The distinction between these two is
 * the whole security model, and a single ambient `prisma` import is how it
 * would quietly erode.
 */

export interface DatabaseOptions {
  readonly url: string;
  /** Log every query. Development only — queries carry PII. */
  readonly logQueries?: boolean;
}

function createClient({ url, logQueries = false }: DatabaseOptions): PrismaClient {
  return new PrismaClient({
    adapter: new PrismaPg({ connectionString: url }),
    log: logQueries ? ['query', 'warn', 'error'] : ['warn', 'error'],
  });
}

/** The RLS-enforcing client every request uses. */
export function createApplicationClient(options: DatabaseOptions): PrismaClient {
  return createClient(options);
}

/**
 * The owner client. Migrations, the platform console, and tenant *resolution*
 * — the host-to-school lookup that necessarily happens before any tenant
 * context exists (see TENANT_RLS_EXEMPT_TABLES).
 */
export function createAdminClient(options: DatabaseOptions): PrismaClient {
  return createClient(options);
}

export { PrismaClient };
