import {
  grantFor,
  PERMISSION_GRANT,
  type Permission,
  type PermissionGrant,
  type SchoolRole,
} from '@ilm/contracts';
import {
  applyDecorators,
  CanActivate,
  Injectable,
  SetMetadata,
  type ExecutionContext,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';

import { PermissionDeniedError } from '../errors/domain-error';
import { TenantContextService } from '../tenancy/tenant-context.service';

export const REQUIRED_PERMISSION = 'rbac:permission';
export const REQUIRES_UNSCOPED_GRANT = 'rbac:unscoped';

/**
 * Declare the permission a route requires.
 *
 * docs/08: **a permission check that happens only in the UI does not exist.**
 * The UI hides; the API decides.
 */
export const RequirePermission = (permission: Permission): MethodDecorator =>
  SetMetadata(REQUIRED_PERMISSION, permission);

/**
 * Declare a permission a route needs **across the whole school**.
 *
 * For a route that has no per-row clause to narrow: a scoped grant would pass
 * `RequirePermission` and then hand back everything, because nothing in the
 * handler knows what "scoped" means. Where there is no scope to apply, the
 * honest answer for a scoped holder is no.
 */
export const RequireUnscopedPermission = (permission: Permission): MethodDecorator =>
  applyDecorators(
    SetMetadata(REQUIRED_PERMISSION, permission),
    SetMetadata(REQUIRES_UNSCOPED_GRANT, true),
  );

/**
 * Third guard in the chain: coarse capability.
 *
 * This answers "may this role do this kind of thing at all". It does **not**
 * answer "may they do it to *this row*" — that is row-level scope, which lives
 * in the service as a query clause, never as a post-fetch filter
 * (docs/04 section 5). A guard cannot do it because the guard has not fetched
 * anything yet.
 *
 * When a role holds the permission only as `scoped`, this guard admits the
 * request and records the grant, so the service knows it must narrow.
 */
@Injectable()
export class RbacGuard implements CanActivate {
  constructor(
    private readonly context: TenantContextService,
    private readonly reflector: Reflector,
  ) {}

  canActivate(execution: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<Permission | undefined>(REQUIRED_PERMISSION, [
      execution.getHandler(),
      execution.getClass(),
    ]);

    // A route with no declared permission is not implicitly public — AuthGuard
    // and TenantGuard have already run. It simply requires no capability beyond
    // being a signed-in member of the school.
    if (required === undefined) {
      return true;
    }

    const roles = this.context.roles as readonly SchoolRole[];
    const grant: PermissionGrant | undefined = grantFor(roles, required);

    if (grant === undefined) {
      throw new PermissionDeniedError(required);
    }

    const needsUnscoped = this.reflector.getAllAndOverride<boolean | undefined>(
      REQUIRES_UNSCOPED_GRANT,
      [execution.getHandler(), execution.getClass()],
    );
    if (needsUnscoped === true && grant !== PERMISSION_GRANT.ALL) {
      throw new PermissionDeniedError(required);
    }

    return true;
  }
}
