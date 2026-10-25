import {
  idSchema,
  ROUTES,
  timetableCalendarQuerySchema,
  timetableInputSchema,
  timetableListQuerySchema,
  type TimetableCalendarEvent,
  type TimetableDetail,
  type TimetableListItem,
  type TimetableOptions,
} from '@ilm/contracts';
import { Body, Controller, Delete, Get, Module, Param, Post, Put, Query, Req } from '@nestjs/common';
import { type FastifyRequest } from 'fastify';

import { RequirePermission, RequireUnscopedPermission } from '../../shared/rbac/rbac.guard';
import { clockProvider } from '../../shared/time/clock.provider';
import { NotificationsModule } from '../notifications/notifications.module';

import { TimetablesService } from './timetables.service';

/**
 * Timetables — ADR-0017.
 *
 * Reading is `academics.timetable.read`, which a teacher, a parent and a student
 * hold **scoped**: the service narrows every query to what concerns them and to
 * what is published. Writing is `academics.timetable.configure` required
 * **unscoped**, so a coordinator's scoped grant never reaches it — the office
 * makes timetables.
 *
 * The fixed paths (`options`, `calendar`) are declared ahead of `:id`, so
 * neither can be read as an id.
 */
@Controller()
export class TimetablesController {
  constructor(private readonly timetables: TimetablesService) {}

  @Get(ROUTES.timetables.list)
  @RequirePermission('academics.timetable.read')
  async list(
    @Query() rawQuery: unknown,
    @Req() request: FastifyRequest,
  ): Promise<{
    data: TimetableListItem[];
    meta: { requestId: string; page: { total: number; limit: number; offset: number } };
  }> {
    const query = timetableListQuerySchema.parse(rawQuery);
    const { items, total } = await this.timetables.list(query);
    return {
      data: items,
      meta: { requestId: request.id, page: { total, limit: query.limit, offset: query.offset } },
    };
  }

  @Get(ROUTES.timetables.options)
  @RequireUnscopedPermission('academics.timetable.configure')
  async options(): Promise<{ data: TimetableOptions }> {
    return { data: await this.timetables.options() };
  }

  @Get(ROUTES.timetables.calendar)
  @RequirePermission('academics.timetable.read')
  async calendar(@Query() rawQuery: unknown): Promise<{ data: TimetableCalendarEvent[] }> {
    return { data: await this.timetables.calendar(timetableCalendarQuerySchema.parse(rawQuery)) };
  }

  @Get(`${ROUTES.timetables.list}/:id`)
  @RequirePermission('academics.timetable.read')
  async detail(@Param('id') id: string): Promise<{ data: TimetableDetail }> {
    return { data: await this.timetables.detail(idSchema.parse(id)) };
  }

  @Post(ROUTES.timetables.list)
  @RequireUnscopedPermission('academics.timetable.configure')
  async create(@Body() body: unknown): Promise<{ data: TimetableDetail }> {
    return { data: await this.timetables.create(timetableInputSchema.parse(body)) };
  }

  @Put(`${ROUTES.timetables.list}/:id`)
  @RequireUnscopedPermission('academics.timetable.configure')
  async update(@Param('id') id: string, @Body() body: unknown): Promise<{ data: TimetableDetail }> {
    return { data: await this.timetables.update(idSchema.parse(id), timetableInputSchema.parse(body)) };
  }

  @Post(`${ROUTES.timetables.list}/:id/publish`)
  @RequireUnscopedPermission('academics.timetable.configure')
  async publish(@Param('id') id: string): Promise<{ data: TimetableDetail }> {
    return { data: await this.timetables.publish(idSchema.parse(id)) };
  }

  @Post(`${ROUTES.timetables.list}/:id/unpublish`)
  @RequireUnscopedPermission('academics.timetable.configure')
  async unpublish(@Param('id') id: string): Promise<{ data: TimetableDetail }> {
    return { data: await this.timetables.unpublish(idSchema.parse(id)) };
  }

  @Delete(`${ROUTES.timetables.list}/:id`)
  @RequireUnscopedPermission('academics.timetable.configure')
  async remove(@Param('id') id: string): Promise<{ data: { deleted: true } }> {
    await this.timetables.remove(idSchema.parse(id));
    return { data: { deleted: true } };
  }
}

@Module({
  imports: [NotificationsModule],
  controllers: [TimetablesController],
  providers: [clockProvider, TimetablesService],
})
export class TimetablesModule {}
