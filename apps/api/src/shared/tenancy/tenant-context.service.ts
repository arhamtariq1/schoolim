import {
  grantFor,
  type EffectiveGrants,
  type Permission,
  type PermissionGrant,
  type SchoolRole,
} from '@ilm/contracts';
import { Injectable } from '@nestjs/common';
import { ClsService } from 'nestjs-cls';

/** Keys held in AsyncLocalStorage for the lifetime of one request. */
export interface RequestContext {
  readonly schoolId: string;
  readonly userId: string;
  readonly roles: readonly string[];
  /** Set only during an impersonated support session (docs/17 section 5). */
  readonly actingPlatformUserId?: string;
}

const SCHOOL_ID = 'schoolId';
const USER_ID = 'userId';
const ROLES = 'roles';
const ACTING_PLATFORM_USER_ID = 'actingPlatformUserId';
const GRANTS = 'grants';

/**
 * Layer 1 of the three isolation layers (docs/04 section 2).
 *
 * The tenant for the current request lives in AsyncLocalStorage and is read
 * from here. **It is never passed as a parameter** (docs/12 R2) — a service
 * method whose signature contains `schoolId: string` is a review rejection,
 * precisely because a parameter can be passed the wrong value and ambient
 * context cannot.
 */
@Injectable()
export class TenantContextService {
  constructor(private readonly cls: ClsService) {}

  /** The tenant, or `undefined` outside a tenant request. */
  get schoolIdOrUndefined(): string | undefined {
    return this.cls.get<string | undefined>(SCHOOL_ID);
  }

  /**
   * The tenant. Throws outside a tenant request rather than returning a
   * fallback, because every fallback here is a cross-tenant leak.
   */
  get schoolId(): string {
    const schoolId = this.schoolIdOrUndefined;
    if (schoolId === undefined) {
      throw new Error(
        'No tenant in context. Tenant scope comes from the request, never from a parameter.',
      );
    }
    return schoolId;
  }

  get userId(): string | undefined {
    return this.cls.get<string | undefined>(USER_ID);
  }

  get roles(): readonly string[] {
    return this.cls.get<readonly string[] | undefined>(ROLES) ?? [];
  }

  /**
   * What the person in context can do, the school's customisations included
   * (ADR-0025). `TenantGuard` resolves it once per request.
   *
   * Outside an HTTP request nothing has resolved it, and the role defaults
   * answer instead — which is what every check returned before customisation
   * existed.
   */
  grantFor(permission: Permission): PermissionGrant | undefined {
    const grants = this.cls.get<EffectiveGrants | undefined>(GRANTS);
    return grants === undefined
      ? grantFor(this.roles as readonly SchoolRole[], permission)
      : grants.get(permission);
  }

  /** Whether the person in context holds the permission at all, scoped or not. */
  can(permission: Permission): boolean {
    return this.grantFor(permission) !== undefined;
  }

  setGrants(grants: EffectiveGrants): void {
    this.cls.set(GRANTS, grants);
  }

  get actingPlatformUserId(): string | undefined {
    return this.cls.get<string | undefined>(ACTING_PLATFORM_USER_ID);
  }

  set(context: RequestContext): void {
    this.cls.set(SCHOOL_ID, context.schoolId);
    this.cls.set(USER_ID, context.userId);
    this.cls.set(ROLES, context.roles);
    if (context.actingPlatformUserId !== undefined) {
      this.cls.set(ACTING_PLATFORM_USER_ID, context.actingPlatformUserId);
    }
  }
}
