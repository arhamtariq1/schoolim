import { type PrismaClient } from '../generated/client';

import { type TenantResolver } from './tenant-context';
import { tenantExtension } from './tenant-extension';

/**
 * Binds a unit of work to one tenant, on one connection, with both isolation
 * layers active.
 *
 * PostgreSQL RLS reads `app.school_id`; nothing sets it implicitly. So every
 * tenant-scoped unit of work runs inside a transaction that sets it first, and
 * the request pipeline wraps handlers in this.
 *
 * **`set_config(..., true)` — transaction-local — is required, not stylistic.**
 * The runtime connects through a transaction-mode connection pooler. A
 * session-level setting would outlive the request and leak into whichever
 * tenant's request next reused that pooled connection: a cross-tenant leak
 * caused by the isolation mechanism itself.
 *
 * **Order matters, and Prisma enforces it.** A transaction client has no
 * `$extends`, so layer 2 must be applied to the client *before* opening the
 * transaction; the resulting `tx` inherits it. Composing them the other way —
 * extending a sibling client — would put layer 2 on a different connection from
 * the one carrying the tenant setting: layer 2 would filter correctly while
 * layer 3 saw no tenant at all and rejected every write. They are composed here
 * once so that cannot be assembled wrongly at a call site.
 *
 * The tenant id is passed as a bound parameter, never interpolated.
 */

/** A Prisma transaction client. */
export type TransactionClient = Omit<
  PrismaClient,
  '$transaction' | '$connect' | '$disconnect' | '$on' | '$extends'
>;

/** Layer 2 applied to a client. The result is what opens transactions. */
export function tenantClient(prisma: PrismaClient, resolve: TenantResolver) {
  return prisma.$extends(tenantExtension(resolve));
}

/**
 * Layer 3 only: the transaction carries the tenant, but queries are not
 * rewritten. Used by raw-SQL paths, and by the isolation suite, which must be
 * able to prove the database holds on its own.
 */
export async function runInTenantUnscoped<T>(
  prisma: PrismaClient,
  schoolId: string,
  fn: (tx: TransactionClient) => Promise<T>,
): Promise<T> {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT set_config('app.school_id', ${schoolId}, true)`;
    return fn(tx);
  });
}

/**
 * Both layers. This is what the request pipeline uses.
 *
 * The callback receives a client that already scopes every query to the tenant,
 * so no service method ever names a `schoolId` (docs/12 R2).
 *
 * `scopeTenant` exists only so the isolation suite can prove the layers are
 * independent by deliberately telling layer 2 the wrong tenant. Production
 * callers never pass it, and the two then agree by construction.
 */
export async function runInTenant<T>(
  prisma: PrismaClient,
  schoolId: string,
  fn: (tx: TransactionClient) => Promise<T>,
  scopeTenant: string = schoolId,
  options?: TenantTransactionOptions,
): Promise<T> {
  const scoped = tenantClient(prisma, () => scopeTenant);
  return scoped.$transaction(
    async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.school_id', ${schoolId}, true)`;
      return fn(tx as unknown as TransactionClient);
    },
    { maxWait: DEFAULT_MAX_WAIT_MS, timeout: DEFAULT_TIMEOUT_MS, ...options },
  );
}

/**
 * How long to wait for a free connection before giving up.
 *
 * Prisma's default is **two seconds**, and that default is wrong for this
 * application in a way that only shows up under load. Every tenant-scoped read
 * needs an interactive transaction — that is not optional, it is how
 * `app.school_id` reaches PostgreSQL — so the pool is contended by *reads*, not
 * just writes. Against a hosted database a request's own work is already a
 * large fraction of two seconds, so a queue two deep exceeded the budget and
 * Prisma raised `P2028: Unable to start a transaction in the given time`.
 *
 * That surfaced as an intermittent **500** on a perfectly ordinary list
 * endpoint whenever enough requests arrived together — which is precisely the
 * morning every teacher in a school opens the register at once.
 *
 * Five seconds makes a burst *queue* instead of failing. It is deliberately not
 * larger: past this the honest answer is that the pool is too small, and a
 * request that waits thirty seconds for a connection has failed anyway, just
 * more expensively. Size the pool with `connection_limit` in DATABASE_URL —
 * Prisma otherwise derives it from the container's CPU count, which on a
 * 2-vCPU instance is five connections for the whole API.
 */
const DEFAULT_MAX_WAIT_MS = 5_000;

/**
 * How long one transaction may run once it has started.
 *
 * Left at Prisma's five seconds on purpose. This is the number that catches a
 * slow query, and raising it globally to paper over one endpoint would hide
 * every other. The batch paths that genuinely need longer pass their own — see
 * `voucher-generation.service.ts`.
 */
const DEFAULT_TIMEOUT_MS = 5_000;

/**
 * How long one tenant transaction may take.
 *
 * Prisma's default is five seconds, which is right for a request that touches a
 * handful of rows and wrong for a batch that writes a whole school's vouchers.
 * Raising it globally would hide slow queries everywhere, so it is passed in by
 * the one caller that needs it, with a comment saying why.
 */
export interface TenantTransactionOptions {
  /** Milliseconds the transaction may run before Postgres is told to give up. */
  readonly timeout?: number;
  /** Milliseconds to wait for a connection before failing fast. */
  readonly maxWait?: number;
}

/**
 * Read the tenant PostgreSQL currently considers active.
 *
 * Returns `null` outside a tenant transaction. Used by the isolation suite to
 * assert that context does not survive a transaction boundary.
 */
export async function currentTenant(
  prisma: Pick<PrismaClient, '$queryRaw'>,
): Promise<string | null> {
  const rows = await prisma.$queryRaw<{ school: string | null }[]>`
    SELECT current_school_id()::text AS school
  `;
  return rows[0]?.school ?? null;
}
