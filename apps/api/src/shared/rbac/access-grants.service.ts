import {
  isCustomizableRole,
  isPermission,
  resolveGrants,
  type EffectiveGrants,
  type Permission,
  type PermissionOverrides,
  type SchoolRole,
} from '@ilm/contracts';
import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../prisma/prisma.service';
import { TenantContextService } from '../tenancy/tenant-context.service';

/** A stored override row, as both tables return it. */
export interface OverrideRow {
  readonly permission: string;
  readonly effect: 'GRANT' | 'REVOKE';
}

/**
 * Rows to the shape `resolveGrants` takes.
 *
 * A permission name the code no longer declares is dropped here, not failed on:
 * removing a permission from `PERMISSIONS` must not lock every school that ever
 * customised it out of their own portal.
 */
export function overridesFromRows(rows: readonly OverrideRow[]): PermissionOverrides {
  const grant: Permission[] = [];
  const revoke: Permission[] = [];
  for (const row of rows) {
    if (isPermission(row.permission)) {
      (row.effect === 'GRANT' ? grant : revoke).push(row.permission);
    }
  }
  return { grant, revoke };
}

/** Role rows grouped by role, ready for `resolveGrants`. */
export function roleOverridesFromRows(
  rows: readonly (OverrideRow & { readonly role: SchoolRole })[],
): Partial<Record<SchoolRole, PermissionOverrides>> {
  const byRole = new Map<SchoolRole, OverrideRow[]>();
  for (const row of rows) {
    byRole.set(row.role, [...(byRole.get(row.role) ?? []), row]);
  }
  return Object.fromEntries(
    [...byRole].map(([role, roleRows]) => [role, overridesFromRows(roleRows)]),
  );
}

/**
 * The selects that fetch a person's overrides alongside them, for paths with no
 * tenant in context yet — sign-in, refresh and the session read go through the
 * admin connection, so they join from the user row instead of querying by school.
 */
export const ACCESS_OVERRIDE_SELECT = {
  user: { select: { permission: true, effect: true } },
  role: { select: { role: true, permission: true, effect: true } },
} as const;

/** The permission list a session carries, for the shell's navigation. */
export function sessionPermissions(
  roles: readonly SchoolRole[],
  roleRows: readonly (OverrideRow & { readonly role: SchoolRole })[],
  userRows: readonly OverrideRow[],
): Permission[] {
  return [
    ...resolveGrants(roles, roleOverridesFromRows(roleRows), overridesFromRows(userRows)).keys(),
  ];
}

/**
 * What the person in request context can do at this school, customisations
 * included (ADR-0025).
 *
 * Called once per request, by `TenantGuard`, and kept in CLS — so the guard,
 * every service that narrows by grant, and the shell's navigation read the
 * same answer. Re-read every request rather than cached: taking a permission
 * away has to stop working on the next click, not in fifteen minutes.
 */
@Injectable()
export class AccessGrantsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly context: TenantContextService,
  ) {}

  async resolveForContext(): Promise<EffectiveGrants> {
    const roles = this.context.roles as readonly SchoolRole[];
    const userId = this.context.userId;
    const customizable = roles.filter(isCustomizableRole);

    // Nothing stored can apply: the owner's own access is never customised, and
    // a parent or a student holds no customisable role.
    if (userId === undefined || customizable.length === 0) {
      return resolveGrants(roles, {});
    }

    const [roleRows, userRows] = await this.prisma.tenant((tx) =>
      Promise.all([
        tx.rolePermissionOverride.findMany({
          where: { role: { in: customizable } },
          select: { role: true, permission: true, effect: true },
        }),
        tx.userPermissionOverride.findMany({
          where: { userId },
          select: { permission: true, effect: true },
        }),
      ]),
    );

    return resolveGrants(
      roles,
      roleOverridesFromRows(roleRows),
      overridesFromRows(userRows),
    );
  }
}
