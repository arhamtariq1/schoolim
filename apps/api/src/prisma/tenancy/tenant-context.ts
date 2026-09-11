/**
 * How the database layer learns which tenant a query belongs to.
 *
 * The context itself lives in the API, in `nestjs-cls` AsyncLocalStorage. This
 * package deliberately does not depend on NestJS: it asks for a resolver
 * function and the request pipeline supplies one that reads CLS. That keeps
 * this layer
 * testable without a framework and keeps the dependency arrow pointing the way
 * docs/06 section 2 requires.
 *
 * docs/12 R2: **tenant scope is never a parameter.** No service method accepts
 * `schoolId` from a caller — it is resolved here, from ambient request context,
 * every time.
 */

/** Returns the current tenant, or `undefined` outside a tenant request. */
export type TenantResolver = () => string | undefined;

/**
 * Thrown when a tenant-scoped query is attempted with no tenant in context.
 *
 * This is a programming error, never a user error: it means a code path reached
 * the database outside a tenant request without deliberately opting out. It
 * fails **closed** — the alternative, defaulting to "no filter", would return
 * every school's rows.
 */
export class MissingTenantContextError extends Error {
  readonly code = 'MISSING_TENANT_CONTEXT';

  constructor(model: string, operation: string) {
    super(
      `${model}.${operation} was called with no tenant in context. ` +
        'Tenant scope comes from request context, never from a parameter (docs/12 R2). ' +
        'If this is genuinely a platform-level operation, use the admin client explicitly.',
    );
    this.name = 'MissingTenantContextError';
  }
}

/**
 * A resolver backed by a plain variable, for tests and for scripts that
 * legitimately operate as one tenant from start to finish.
 */
export function staticTenantResolver(schoolId: string | undefined): TenantResolver {
  return () => schoolId;
}
