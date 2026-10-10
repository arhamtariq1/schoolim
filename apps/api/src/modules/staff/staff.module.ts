import {
  createStaffSchema,
  deleteStaffSchema,
  ROUTES,
  staffListQuerySchema,
  updateStaffSchema,
  type StaffInviteResult,
  type StaffListItem,
  type StaffProfile,
} from '@ilm/contracts';
import {
  Body,
  Controller,
  Delete,
  Get,
  Inject,
  Module,
  Param,
  Patch,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import { type FastifyRequest } from 'fastify';

import { RequirePermission } from '../../shared/rbac/rbac.guard';
import { CLOCK, clockProvider, type Clock } from '../../shared/time/clock.provider';

import { StaffInviteService } from './staff-invite.service';
import { StaffService } from './staff.service';

/**
 * Staff endpoints.
 *
 * Reads are `staff.record.read`, writes `staff.record.update`. Salary travels
 * on the list row rather than behind `staff.salary.read`, which is a
 * simplification worth naming: the roles that can open this screen at all are
 * the roles that see payroll anyway (docs/08), and a second fetch for one
 * column would be a worse trade until there is a role that needs one without
 * the other.
 */
@Controller()
export class StaffController {
  constructor(
    private readonly staff: StaffService,
    private readonly invites: StaffInviteService,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  @Get(ROUTES.staff.list)
  @RequirePermission('staff.record.read')
  async list(
    @Query() rawQuery: unknown,
    @Req() request: FastifyRequest,
  ): Promise<{
    data: StaffListItem[];
    meta: { requestId: string; page: { total: number; limit: number; offset: number } };
  }> {
    const query = staffListQuerySchema.parse(rawQuery);
    const { items, total } = await this.staff.list(query);

    return {
      data: items,
      meta: {
        requestId: request.id,
        page: { total, limit: query.limit, offset: query.offset },
      },
    };
  }

  @Post(ROUTES.staff.create)
  @RequirePermission('staff.record.update')
  async create(@Body() body: unknown): Promise<{ data: StaffListItem }> {
    return { data: await this.staff.create(createStaffSchema.parse(body)) };
  }

  @Get('/api/v1/staff/:id')
  @RequirePermission('staff.record.read')
  async get(@Param('id') id: string): Promise<{ data: StaffProfile }> {
    return { data: await this.staff.getProfile(id) };
  }

  @Patch('/api/v1/staff/:id')
  @RequirePermission('staff.record.update')
  async update(@Param('id') id: string, @Body() body: unknown): Promise<{ data: StaffListItem }> {
    return { data: await this.staff.update(id, updateStaffSchema.parse(body)) };
  }

  /**
   * Send, or re-send, the invitation that lets somebody set their own password.
   *
   * `staff.record.update`, the same permission as editing the record: whoever
   * may put a teacher on the payroll may give that teacher a way in. It is a
   * POST with no body because there is nothing to choose — the address, the
   * role and the school are all on the record already, and offering any of them
   * as parameters would be offering a way to send an invitation somewhere the
   * staff list does not say.
   */
  @Post('/api/v1/staff/:id/invite')
  @RequirePermission('staff.record.update')
  async invite(@Param('id') id: string): Promise<{ data: StaffInviteResult }> {
    return { data: await this.invites.invite(id, this.clock.now()) };
  }

  @Delete('/api/v1/staff/:id')
  @RequirePermission('staff.record.update')
  async remove(@Param('id') id: string, @Body() body: unknown): Promise<{ data: { ok: true } }> {
    const input = deleteStaffSchema.parse(body);
    await this.staff.remove(id, input.reason);
    return { data: { ok: true } };
  }
}

@Module({
  controllers: [StaffController],
  providers: [clockProvider, StaffService, StaffInviteService],
  exports: [StaffInviteService],
})
export class StaffModule {}
