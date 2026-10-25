import { type NotificationEntityType, type NotificationKind } from '@ilm/contracts';
import { Inject, Injectable, Logger } from '@nestjs/common';

import { afterCommit, type TransactionClient } from '../../prisma';
import { PrismaService } from '../../prisma/prisma.service';
import { PUSH, type PushPort } from '../../shared/push/push.port';
import { TenantContextService } from '../../shared/tenancy/tenant-context.service';
import { CLOCK, type Clock } from '../../shared/time/clock.provider';

/** One notification, as far as the push needs to know about it. */
export interface PushItem {
  readonly userId: string;
  readonly kind: NotificationKind;
  readonly title: string;
  readonly body: string | null;
  readonly entityType: NotificationEntityType;
  readonly entityId: string;
}

/** A device not seen for this long is forgotten (docs/17 §4). */
const STALE_DEVICE_DAYS = 60;

/**
 * Pushes to people's phones and browsers, and remembers which ones they are.
 *
 * ## A push is a nudge, never the record
 *
 * The notification row is the record and is written in the caller's
 * transaction. The push is queued to run **after that transaction commits**, so
 * a rollback pushes nothing, and it never throws into the caller: a payment
 * must not fail because Firebase was slow.
 *
 * ## Tokens are credentials
 *
 * A device token lets whoever holds it push to that device. They are stored
 * under row-level security, never returned by any endpoint, and never logged.
 */
@Injectable()
export class PushDeliveryService {
  private readonly logger = new Logger(PushDeliveryService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly context: TenantContextService,
    @Inject(PUSH) private readonly push: PushPort,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  /** Queue pushes for `items`, to go out once `tx` has committed. */
  queue(tx: TransactionClient, items: readonly PushItem[]): void {
    if (items.length === 0 || this.push.driver === 'log') {
      return;
    }
    afterCommit(tx, () => {
      void this.deliver(items).catch((error: unknown) => {
        this.logger.warn({ err: error instanceof Error ? error.message : 'unknown' }, 'Push delivery failed');
      });
    });
  }

  /** Remember this browser as one of the caller's devices. Idempotent. */
  async register(token: string, platform: string, userAgent: string | undefined): Promise<void> {
    const userId = this.context.userId;
    if (userId === undefined) {
      return;
    }
    const now = this.clock.now();
    await this.prisma.tenant(async (tx) => {
      const known = await tx.deviceToken.findFirst({ where: { token }, select: { id: true } });
      if (known === null) {
        await tx.deviceToken.create({
          data: {
            schoolId: this.context.schoolId,
            userId,
            token,
            platform,
            userAgent: userAgent?.slice(0, 300) ?? null,
            lastSeenAt: now,
          },
        });
        return;
      }
      // The same browser, a different person signed in: the device now belongs
      // to whoever is using it, so the previous person stops being pushed to it.
      await tx.deviceToken.update({
        where: { id: known.id },
        data: { userId, platform, lastSeenAt: now },
      });
    });
  }

  /** Forget one of the caller's own devices — on sign-out or when push is turned off. */
  async unregister(token: string): Promise<void> {
    const userId = this.context.userId;
    if (userId === undefined) {
      return;
    }
    await this.prisma.tenant(async (tx) => {
      await tx.deviceToken.deleteMany({ where: { userId, token } });
    });
  }

  private async deliver(items: readonly PushItem[]): Promise<void> {
    const userIds = [...new Set(items.map((item) => item.userId))];
    const cutoff = new Date(this.clock.now().getTime() - STALE_DEVICE_DAYS * 86_400_000);

    const devices = await this.prisma.tenant(async (tx) => {
      // Piggy-backs on the read: forgetting devices that have not been seen
      // in two months costs one indexed delete per push, not a scheduled job.
      await tx.deviceToken.deleteMany({ where: { lastSeenAt: { lt: cutoff } } });
      return tx.deviceToken.findMany({
        where: { userId: { in: userIds } },
        select: { userId: true, token: true },
      });
    });
    if (devices.length === 0) {
      return;
    }

    const tokensOf = new Map<string, string[]>();
    for (const device of devices) {
      tokensOf.set(device.userId, [...(tokensOf.get(device.userId) ?? []), device.token]);
    }

    const dead: string[] = [];
    for (const item of items) {
      const tokens = tokensOf.get(item.userId);
      if (tokens === undefined) {
        continue;
      }
      const result = await this.push.send({
        tokens,
        title: item.title,
        body: item.body ?? undefined,
        data: { kind: item.kind, entityType: item.entityType, entityId: item.entityId },
      });
      dead.push(...result.invalidTokens);
    }

    if (dead.length > 0) {
      await this.prisma.tenant(async (tx) => {
        await tx.deviceToken.deleteMany({ where: { token: { in: dead } } });
      });
    }
  }
}
