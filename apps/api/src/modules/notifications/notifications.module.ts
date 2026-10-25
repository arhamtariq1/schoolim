import {
  markNotificationsReadSchema,
  notificationListQuerySchema,
  registerDeviceSchema,
  ROUTES,
  unregisterDeviceSchema,
  type NotificationList,
} from '@ilm/contracts';
import { Body, Controller, Delete, Get, Headers, HttpCode, Module, Post, Query } from '@nestjs/common';

import { clockProvider } from '../../shared/time/clock.provider';

import { NotificationsService } from './notifications.service';
import { PushDeliveryService } from './push-delivery.service';

/**
 * The signed-in person's own notifications.
 *
 * No `@RequirePermission`: everyone who is a member of the school has a bell,
 * and every query is already limited to the caller's own rows. A permission
 * here would have nothing to protect.
 */
@Controller()
export class NotificationsController {
  constructor(
    private readonly notifications: NotificationsService,
    private readonly push: PushDeliveryService,
  ) {}

  @Get(ROUTES.notifications.list)
  async list(@Query() query: unknown): Promise<{ data: NotificationList }> {
    return { data: await this.notifications.list(notificationListQuerySchema.parse(query ?? {})) };
  }

  @Post(ROUTES.notifications.read)
  async read(@Body() body: unknown): Promise<{ data: { unreadCount: number } }> {
    return { data: await this.notifications.markRead(markNotificationsReadSchema.parse(body ?? {})) };
  }

  /**
   * Register this browser for push. Like the bell, it is always the caller's
   * own: the device is attached to whoever is signed in, never to an id in the
   * request.
   */
  @Post(ROUTES.notifications.devices)
  @HttpCode(204)
  async registerDevice(
    @Body() body: unknown,
    @Headers('user-agent') userAgent: string | undefined,
  ): Promise<void> {
    const input = registerDeviceSchema.parse(body);
    await this.push.register(input.token, input.platform, userAgent);
  }

  @Delete(ROUTES.notifications.devices)
  @HttpCode(204)
  async unregisterDevice(@Body() body: unknown): Promise<void> {
    await this.push.unregister(unregisterDeviceSchema.parse(body).token);
  }
}

@Module({
  controllers: [NotificationsController],
  providers: [clockProvider, NotificationsService, PushDeliveryService],
  // Other modules write notifications through the service, inside their own
  // transaction; none of them reaches the table (docs/12 R9).
  exports: [NotificationsService],
})
export class NotificationsModule {}
