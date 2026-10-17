import { markNotificationsReadSchema, ROUTES, type NotificationList } from '@ilm/contracts';
import { Body, Controller, Get, Module, Post } from '@nestjs/common';

import { clockProvider } from '../../shared/time/clock.provider';

import { NotificationsService } from './notifications.service';

/**
 * The signed-in person's own notifications.
 *
 * No `@RequirePermission`: everyone who is a member of the school has a bell,
 * and every query is already limited to the caller's own rows. A permission
 * here would have nothing to protect.
 */
@Controller()
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @Get(ROUTES.notifications.list)
  async list(): Promise<{ data: NotificationList }> {
    return { data: await this.notifications.list() };
  }

  @Post(ROUTES.notifications.read)
  async read(@Body() body: unknown): Promise<{ data: { unreadCount: number } }> {
    return { data: await this.notifications.markRead(markNotificationsReadSchema.parse(body ?? {})) };
  }
}

@Module({
  controllers: [NotificationsController],
  providers: [clockProvider, NotificationsService],
  // Other modules write notifications through the service, inside their own
  // transaction; none of them reaches the table (docs/12 R9).
  exports: [NotificationsService],
})
export class NotificationsModule {}
