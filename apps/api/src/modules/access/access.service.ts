import {
  CUSTOMIZABLE_ROLES,
  highestRank,
  isCustomizableRole,
  PERMISSION_GRANT,
  resolveGrants,
  ROLE_RANK,
  roleGrants,
  type AccessRole,
  type AccessRoleList,
  type AccessUser,
  type AccessUserDetail,
  type AccessUserListQuery,
  type CustomizableRole,
  type EffectiveGrants,
  type Permission,
  type PermissionOverrides,
  type SchoolRole,
  type UpdatePermissionOverrides,
} from '@ilm/contracts';
import { Inject, Injectable } from '@nestjs/common';

import { type Prisma, type TransactionClient } from '../../prisma';
import { PrismaService } from '../../prisma/prisma.service';
import { BusinessRuleError, NotFoundError } from '../../shared/errors/domain-error';
import {
  overridesFromRows,
  roleOverridesFromRows,
} from '../../shared/rbac/access-grants.service';
import { TenantContextService } from '../../shared/tenancy/tenant-context.service';
import { CLOCK, type Clock } from '../../shared/time/clock.provider';

/** A user is on the access screen when they hold at least one role a school can customise. */
const ON_ACCESS_SCREEN: Prisma.UserWhereInput = {
  deletedAt: null,
  roles: { some: { role: { in: [...CUSTOMIZABLE_ROLES] } } },
};

/**
 * Customising who can open what (ADR-0025).
 *
 * The rules that keep this from becoming a way to promote yourself:
 *
 * 1. **Downward only.** A person changes only roles ranked below their own
 *    highest role, and only people whose every role is below it. Nobody edits
 *    their own role, their own account, or a peer's.
 * 2. **Nothing you do not hold.** A permission newly given must be one the
 *    person giving it holds for the whole school. Taking away is always allowed
 *    within rule 1.
 * 3. **Never the owner.** The owner's access is not customisable, so the school
 *    always has somebody who can undo any change.
 *
 * Each save replaces the whole set for that role or person, inside one
 * transaction with its audit row, so the log always holds a complete before and
 * after rather than a trail of single toggles to replay.
 */
@Injectable()
export class AccessService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly context: TenantContextService,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  // --- Roles -----------------------------------------------------------------

  async listRoles(): Promise<AccessRoleList> {
    const rows = await this.prisma.tenant((tx) =>
      tx.rolePermissionOverride.findMany({ select: { role: true, permission: true, effect: true } }),
    );
    const byRole = roleOverridesFromRows(rows);

    return {
      roles: CUSTOMIZABLE_ROLES.map((role) => this.toAccessRole(role, byRole[role])),
    };
  }

  async updateRole(role: CustomizableRole, input: UpdatePermissionOverrides): Promise<AccessRole> {
    if (!this.outranks([role])) {
      throw refused('You can only change roles below your own.');
    }

    return this.prisma.tenant(async (tx) => {
      const current = overridesFromRows(
        await tx.rolePermissionOverride.findMany({
          where: { role },
          select: { permission: true, effect: true },
        }),
      );
      const next = normalise(input, roleGrants(role));
      this.assertGrantable(next, current);

      await tx.rolePermissionOverride.deleteMany({ where: { role } });
      await tx.rolePermissionOverride.createMany({
        data: toRows(next).map((row) => ({ ...row, schoolId: this.context.schoolId, role })),
      });
      await this.audit(tx, 'access.role.update', 'RolePermissionOverride', role, current, next);

      return this.toAccessRole(role, next);
    });
  }

  // --- People ----------------------------------------------------------------

  async listUsers(query: AccessUserListQuery): Promise<{ items: AccessUser[]; total: number }> {
    const where: Prisma.UserWhereInput =
      query.search === undefined || query.search === ''
        ? ON_ACCESS_SCREEN
        : {
            ...ON_ACCESS_SCREEN,
            OR: [
              { name: { contains: query.search, mode: 'insensitive' } },
              { email: { contains: query.search, mode: 'insensitive' } },
            ],
          };

    return this.prisma.tenant(async (tx) => {
      const [rows, total] = await Promise.all([
        tx.user.findMany({
          where,
          orderBy: [{ name: 'asc' }, { id: 'asc' }],
          skip: query.offset,
          take: query.limit,
          select: {
            id: true,
            name: true,
            email: true,
            roles: { select: { role: true } },
            _count: { select: { permissionOverrides: true } },
          },
        }),
        tx.user.count({ where }),
      ]);

      return {
        items: rows.map((row) => {
          const roles = row.roles.map((held) => held.role) as SchoolRole[];
          return {
            id: row.id,
            name: row.name,
            email: row.email,
            roles,
            editable: this.canEditUser(row.id, roles),
            changedCount: row._count.permissionOverrides,
          };
        }),
        total,
      };
    });
  }

  async getUser(id: string): Promise<AccessUserDetail> {
    return this.prisma.tenant((tx) => this.readUser(tx, id));
  }

  async updateUser(id: string, input: UpdatePermissionOverrides): Promise<AccessUserDetail> {
    return this.prisma.tenant(async (tx) => {
      const target = await this.findUser(tx, id);
      if (!this.canEditUser(target.id, target.roles)) {
        throw refused(
          target.id === this.context.userId
            ? 'You cannot change your own access. Ask someone senior to you.'
            : 'You can only change the access of people whose roles are below your own.',
        );
      }

      const current = overridesFromRows(
        await tx.userPermissionOverride.findMany({
          where: { userId: target.id },
          select: { permission: true, effect: true },
        }),
      );
      const next = normalise(input, await this.roleGrantsFor(tx, target.roles));
      this.assertGrantable(next, current);

      await tx.userPermissionOverride.deleteMany({ where: { userId: target.id } });
      await tx.userPermissionOverride.createMany({
        data: toRows(next).map((row) => ({
          ...row,
          schoolId: this.context.schoolId,
          userId: target.id,
        })),
      });
      await this.audit(tx, 'access.user.update', 'User', target.id, current, next);

      return this.readUser(tx, target.id);
    });
  }

  // --- Helpers ---------------------------------------------------------------

  private async readUser(tx: TransactionClient, id: string): Promise<AccessUserDetail> {
    const target = await this.findUser(tx, id);
    const overrides = overridesFromRows(
      await tx.userPermissionOverride.findMany({
        where: { userId: target.id },
        select: { permission: true, effect: true },
      }),
    );
    const fromRoles = await this.roleGrantsFor(tx, target.roles);

    return {
      id: target.id,
      name: target.name,
      email: target.email,
      roles: target.roles,
      editable: this.canEditUser(target.id, target.roles),
      changedCount: overrides.grant.length + overrides.revoke.length,
      roleGrants: [...fromRoles].map(([permission, grant]) => ({ permission, grant })),
      overrides: { grant: [...overrides.grant], revoke: [...overrides.revoke] },
    };
  }

  /** Someone on the access screen, or not found — the owner and parents are not on it. */
  private async findUser(
    tx: TransactionClient,
    id: string,
  ): Promise<{ id: string; name: string; email: string; roles: SchoolRole[] }> {
    const row = await tx.user.findFirst({
      where: { ...ON_ACCESS_SCREEN, id },
      select: { id: true, name: true, email: true, roles: { select: { role: true } } },
    });
    if (row === null) {
      throw new NotFoundError('person');
    }
    return { ...row, roles: row.roles.map((held) => held.role) };
  }

  /** What a person's roles grant at this school, before their own change. */
  private async roleGrantsFor(
    tx: TransactionClient,
    roles: readonly SchoolRole[],
  ): Promise<EffectiveGrants> {
    const rows = await tx.rolePermissionOverride.findMany({
      where: { role: { in: roles.filter(isCustomizableRole) } },
      select: { role: true, permission: true, effect: true },
    });
    return resolveGrants(roles, roleOverridesFromRows(rows));
  }

  private toAccessRole(role: CustomizableRole, overrides: PermissionOverrides | undefined): AccessRole {
    return {
      role,
      editable: this.outranks([role]),
      overrides: {
        grant: [...(overrides?.grant ?? [])],
        revoke: [...(overrides?.revoke ?? [])],
      },
    };
  }

  /** Whether the person in context ranks above every one of these roles. */
  private outranks(roles: readonly SchoolRole[]): boolean {
    const mine = highestRank(this.context.roles as readonly SchoolRole[]);
    return roles.length > 0 && roles.every((role) => mine < ROLE_RANK[role]);
  }

  private canEditUser(id: string, roles: readonly SchoolRole[]): boolean {
    return id !== this.context.userId && this.outranks(roles);
  }

  /** Rule 2: a permission newly given must be one the giver holds school-wide. */
  private assertGrantable(next: PermissionOverrides, current: PermissionOverrides): void {
    const missing = next.grant.filter(
      (permission) =>
        !current.grant.includes(permission) &&
        this.context.grantFor(permission) !== PERMISSION_GRANT.ALL,
    );
    if (missing.length > 0) {
      throw refused(
        `You can only give access you have yourself. Not held: ${missing.join(', ')}.`,
      );
    }
  }

  private async audit(
    tx: TransactionClient,
    action: string,
    entityType: string,
    entityId: string,
    before: PermissionOverrides,
    after: PermissionOverrides,
  ): Promise<void> {
    await tx.auditLog.create({
      data: {
        schoolId: this.context.schoolId,
        action,
        entityType,
        entityId,
        actorType: this.context.actingPlatformUserId === undefined ? 'USER' : 'PLATFORM',
        actorUserId: this.context.userId ?? null,
        actorPlatformUserId: this.context.actingPlatformUserId ?? null,
        before: { grant: [...before.grant], revoke: [...before.revoke] },
        after: { grant: [...after.grant], revoke: [...after.revoke] },
        at: this.clock.now(),
      },
    });
  }
}

/**
 * Keep only the changes that change something: a grant of what the base already
 * gives, or a revoke of what it never gave, is dropped rather than stored, so a
 * stored row always means a real difference from the default.
 */
function normalise(input: UpdatePermissionOverrides, base: EffectiveGrants): PermissionOverrides {
  return {
    grant: unique(input.grant.filter((permission) => !base.has(permission))),
    revoke: unique(input.revoke.filter((permission) => base.has(permission))),
  };
}

function unique(permissions: readonly Permission[]): Permission[] {
  return [...new Set(permissions)];
}

function toRows(
  overrides: PermissionOverrides,
): { permission: Permission; effect: 'GRANT' | 'REVOKE' }[] {
  return [
    ...overrides.grant.map((permission) => ({ permission, effect: 'GRANT' as const })),
    ...overrides.revoke.map((permission) => ({ permission, effect: 'REVOKE' as const })),
  ];
}

function refused(message: string): BusinessRuleError {
  return new BusinessRuleError('ACCESS_CHANGE_REFUSED', message);
}
