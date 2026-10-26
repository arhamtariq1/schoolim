import {
  accessUserListQuerySchema,
  customizableRoleSchema,
  idSchema,
  ROUTES,
  updatePermissionOverridesSchema,
  type AccessRole,
  type AccessRoleList,
  type AccessUser,
  type AccessUserDetail,
} from '@ilm/contracts';
import { Body, Controller, Get, Module, Param, Put, Query, Req } from '@nestjs/common';
import { type FastifyRequest } from 'fastify';

import { NotFoundError } from '../../shared/errors/domain-error';
import { RequireUnscopedPermission } from '../../shared/rbac/rbac.guard';
import { clockProvider } from '../../shared/time/clock.provider';

import { AccessService } from './access.service';

/**
 * Who can open what, beyond the role defaults (ADR-0025).
 *
 * `settings.user.manage`, unscoped: there is no row to narrow — the setting is
 * the school's. Which roles and people a holder may actually change is decided
 * in the service, by rank, because that depends on who is asking.
 */
@Controller()
export class AccessController {
  constructor(private readonly access: AccessService) {}

  @Get(ROUTES.access.roles)
  @RequireUnscopedPermission('settings.user.manage')
  async listRoles(): Promise<{ data: AccessRoleList }> {
    return { data: await this.access.listRoles() };
  }

  @Put('/api/v1/access/roles/:role')
  @RequireUnscopedPermission('settings.user.manage')
  async updateRole(
    @Param('role') rawRole: string,
    @Body() body: unknown,
  ): Promise<{ data: AccessRole }> {
    const role = customizableRoleSchema.safeParse(rawRole);
    if (!role.success) {
      throw new NotFoundError('role');
    }
    return {
      data: await this.access.updateRole(role.data, updatePermissionOverridesSchema.parse(body)),
    };
  }

  @Get(ROUTES.access.users)
  @RequireUnscopedPermission('settings.user.manage')
  async listUsers(
    @Query() rawQuery: unknown,
    @Req() request: FastifyRequest,
  ): Promise<{
    data: AccessUser[];
    meta: { requestId: string; page: { total: number; limit: number; offset: number } };
  }> {
    const query = accessUserListQuerySchema.parse(rawQuery);
    const { items, total } = await this.access.listUsers(query);
    return {
      data: items,
      meta: { requestId: request.id, page: { total, limit: query.limit, offset: query.offset } },
    };
  }

  @Get('/api/v1/access/users/:id')
  @RequireUnscopedPermission('settings.user.manage')
  async getUser(@Param('id') id: string): Promise<{ data: AccessUserDetail }> {
    return { data: await this.access.getUser(parseId(id)) };
  }

  @Put('/api/v1/access/users/:id')
  @RequireUnscopedPermission('settings.user.manage')
  async updateUser(
    @Param('id') id: string,
    @Body() body: unknown,
  ): Promise<{ data: AccessUserDetail }> {
    return {
      data: await this.access.updateUser(parseId(id), updatePermissionOverridesSchema.parse(body)),
    };
  }
}

/** A malformed id is a person who does not exist, not a database error. */
function parseId(id: string): string {
  const parsed = idSchema.safeParse(id);
  if (!parsed.success) {
    throw new NotFoundError('person');
  }
  return parsed.data;
}

@Module({
  controllers: [AccessController],
  providers: [clockProvider, AccessService],
})
export class AccessModule {}
