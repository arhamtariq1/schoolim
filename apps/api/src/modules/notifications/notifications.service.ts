import {
  NOTIFICATION_PAGE_SIZE,
  type MarkNotificationsRead,
  type NotificationEntityType,
  type NotificationItem,
  type NotificationKind,
  type NotificationList,
} from '@ilm/contracts';
import { Inject, Injectable } from '@nestjs/common';

import { type TransactionClient } from '../../prisma';
import { PrismaService } from '../../prisma/prisma.service';
import { TenantContextService } from '../../shared/tenancy/tenant-context.service';
import { CLOCK, type Clock } from '../../shared/time/clock.provider';

/** What a module hands over to tell people something happened. */
export interface NotifyInput {
  /** Everyone who should hear. Duplicates, and `exceptUserId`, are dropped. */
  readonly recipientIds: readonly string[];
  /** The person who did the thing. They never hear about their own action. */
  readonly exceptUserId?: string | undefined;
  readonly kind: NotificationKind;
  readonly title: string;
  readonly body?: string | undefined;
  readonly entityType: NotificationEntityType;
  readonly entityId: string;
}

const TITLE_MAX = 200;
const BODY_MAX = 400;

/**
 * The header bell.
 *
 * ## Reading is always your own
 *
 * Every query here is constrained to the signed-in user. There is no
 * "notifications for user X" and no id in the URL to swap, so there is nothing
 * for one person to reach into another's with — which is the whole of the
 * access control. Row-level security still fences off other schools.
 *
 * ## Writing happens inside the caller's transaction
 *
 * `notify` takes the transaction of the service that is making the change. A
 * notification then exists if and only if the change it describes does: no
 * "your request was resolved" for a resolution that rolled back, and no
 * resolution that silently told nobody.
 */
@Injectable()
export class NotificationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly context: TenantContextService,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async list(): Promise<NotificationList> {
    const userId = this.context.userId;
    if (userId === undefined) {
      return { items: [], unreadCount: 0 };
    }

    return this.prisma.tenant(async (tx) => {
      const [rows, unreadCount] = await Promise.all([
        tx.notification.findMany({
          where: { userId },
          orderBy: { createdAt: 'desc' },
          take: NOTIFICATION_PAGE_SIZE,
        }),
        tx.notification.count({ where: { userId, readAt: null } }),
      ]);

      return {
        items: rows.map(
          (row): NotificationItem => ({
            id: row.id,
            kind: row.kind as NotificationKind,
            title: row.title,
            body: row.body,
            entityType: row.entityType as NotificationEntityType | null,
            entityId: row.entityId,
            readAt: row.readAt === null ? null : row.readAt.toISOString(),
            createdAt: row.createdAt.toISOString(),
          }),
        ),
        unreadCount,
      };
    });
  }

  /** Mark some, or all, of the caller's own as read. Idempotent. */
  async markRead(input: MarkNotificationsRead): Promise<{ unreadCount: number }> {
    const userId = this.context.userId;
    if (userId === undefined) {
      return { unreadCount: 0 };
    }

    return this.prisma.tenant(async (tx) => {
      await tx.notification.updateMany({
        where: {
          userId,
          readAt: null,
          ...(input.ids === undefined ? {} : { id: { in: [...input.ids] } }),
        },
        data: { readAt: this.clock.now() },
      });

      return { unreadCount: await tx.notification.count({ where: { userId, readAt: null } }) };
    });
  }

  /**
   * Many different notifications in one insert, in the caller's transaction.
   *
   * For a batch that tells each person something of their own — a voucher run
   * telling each family about their own child's voucher — where calling `notify`
   * per item would be a round trip each.
   */
  async notifyMany(tx: TransactionClient, inputs: readonly NotifyInput[]): Promise<void> {
    const data = inputs.flatMap((input) =>
      [...new Set(input.recipientIds)]
        .filter((id) => id !== input.exceptUserId)
        .map((userId) => ({
          schoolId: this.context.schoolId,
          userId,
          kind: input.kind,
          title: clip(input.title, TITLE_MAX),
          body: input.body === undefined ? null : clip(input.body, BODY_MAX),
          entityType: input.entityType,
          entityId: input.entityId,
        })),
    );
    if (data.length > 0) {
      await tx.notification.createMany({ data });
    }
  }

  /**
   * Tell people something happened, in the caller's transaction.
   *
   * Titles and bodies are plain text, trimmed to what the bell can show. They
   * are rendered as text by the portal, never as markup.
   */
  async notify(tx: TransactionClient, input: NotifyInput): Promise<void> {
    const recipients = [...new Set(input.recipientIds)].filter(
      (id) => id !== input.exceptUserId,
    );
    if (recipients.length === 0) {
      return;
    }

    await tx.notification.createMany({
      data: recipients.map((userId) => ({
        schoolId: this.context.schoolId,
        userId,
        kind: input.kind,
        title: clip(input.title, TITLE_MAX),
        body: input.body === undefined ? null : clip(input.body, BODY_MAX),
        entityType: input.entityType,
        entityId: input.entityId,
      })),
    });
  }
}

function clip(text: string, max: number): string {
  const trimmed = text.trim();
  return trimmed.length <= max ? trimmed : `${trimmed.slice(0, max - 1).trimEnd()}…`;
}
