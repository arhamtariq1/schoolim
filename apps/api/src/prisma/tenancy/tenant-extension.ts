import { Prisma } from '../generated/client';
import { isTenantModel } from '../tenant-models';

import { MissingTenantContextError, type TenantResolver } from './tenant-context';

/**
 * Layer 2 of the three isolation layers (docs/04 section 2).
 *
 * A Prisma client extension that injects `where: { schoolId }` into every read
 * and stamps `schoolId` onto every write, for every model in TENANT_MODELS.
 *
 * The reason this is an extension rather than a convention: **developers cannot
 * forget it, because they never write it.** A code review that has to spot a
 * missing `where` clause will eventually miss one, and once is enough.
 *
 * It is written assuming layers 1 and 3 are broken, and it fails closed — no
 * tenant in context throws rather than querying unfiltered.
 *
 * Note what this layer cannot do: it has no effect on `$queryRaw`. That is
 * precisely why layer 3 (PostgreSQL RLS) exists and why the isolation suite
 * re-runs every assertion with this extension disabled.
 */

/** Operations that read and must be narrowed to the tenant. */
const READ_OPERATIONS = new Set([
  'findUnique',
  'findUniqueOrThrow',
  'findFirst',
  'findFirstOrThrow',
  'findMany',
  'count',
  'aggregate',
  'groupBy',
]);

/** Operations that write and must be narrowed *and* stamped. */
const WRITE_OPERATIONS = new Set([
  'create',
  'createMany',
  'createManyAndReturn',
  'update',
  'updateMany',
  'upsert',
  'delete',
  'deleteMany',
]);

/** Operations whose `where` must be narrowed even though they also write. */
const NARROWED_WRITE_OPERATIONS = new Set([
  'update',
  'updateMany',
  'upsert',
  'delete',
  'deleteMany',
]);

type UnknownRecord = Record<string, unknown>;

/** The shape Prisma passes to a $allOperations callback. */
interface QueryParams {
  readonly model: string;
  readonly operation: string;
  readonly args: UnknownRecord;
  readonly query: (args: UnknownRecord) => Promise<unknown>;
}

function stampData(data: unknown, schoolId: string): unknown {
  if (Array.isArray(data)) {
    return data.map((row) => ({ ...(row as UnknownRecord), schoolId }));
  }
  if (data !== null && typeof data === 'object') {
    return { ...(data as UnknownRecord), schoolId };
  }
  return data;
}

/**
 * Build the tenant-scoping extension.
 *
 * @param resolve returns the tenant for the current request, or `undefined`
 */
export function tenantExtension(resolve: TenantResolver) {
  return Prisma.defineExtension({
    name: 'tenant-scoping',
    query: {
      $allModels: {
        $allOperations(params): Promise<unknown> {
          // Prisma types this callback per-model, so the generic form arrives
          // loosely typed. It is narrowed once, here, rather than at each use.
          const { model, operation, args, query } = params as unknown as QueryParams;

          if (!isTenantModel(model)) {
            return query(args);
          }

          const isRead = READ_OPERATIONS.has(operation);
          const isWrite = WRITE_OPERATIONS.has(operation);
          if (!isRead && !isWrite) {
            return query(args);
          }

          const schoolId = resolve();
          if (schoolId === undefined || schoolId.length === 0) {
            throw new MissingTenantContextError(model, operation);
          }

          const scoped: UnknownRecord = { ...args };

          if (isRead || NARROWED_WRITE_OPERATIONS.has(operation)) {
            // Verified against Prisma 7: findUnique accepts an additional
            // non-unique field in `where`, so the merge below is enough and no
            // rewrite to findFirst is needed. This matters because a guessed id
            // from another school must not resolve.
            scoped['where'] = { ...(scoped['where'] ?? {}), schoolId };
          }

          if (
            operation === 'create' ||
            operation === 'createMany' ||
            operation === 'createManyAndReturn'
          ) {
            scoped['data'] = stampData(scoped['data'], schoolId);
          }

          if (operation === 'upsert') {
            scoped['create'] = stampData(scoped['create'], schoolId);
          }

          return query(scoped);
        },
      },
    },
  });
}
