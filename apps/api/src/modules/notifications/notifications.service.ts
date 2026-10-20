import {
  hasPermission,
  idSchema,
  NOTIFICATION_PAGE_SIZE,
  SCHOOL_ROLES,
  type MarkNotificationsRead,
  type NotificationEntityType,
  type NotificationItem,
  type NotificationKind,
  type NotificationList,
  type NotificationListQuery,
  type Permission,
  type SchoolRole,
} from '@ilm/contracts';
import { Inject, Injectable } from '@nestjs/common';

import { type TransactionClient } from '../../prisma';
import { PrismaService } from '../../prisma/prisma.service';
import { TenantContextService } from '../../shared/tenancy/tenant-context.service';
import { CLOCK, type Clock } from '../../shared/time/clock.provider';

import { PushDeliveryService, type PushItem } from './push-delivery.service';

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
    private readonly push: PushDeliveryService,
  ) {}

  async list(query: NotificationListQuery = {}): Promise<NotificationList> {
    const userId = this.context.userId;
    if (userId === undefined) {
      return { items: [], unreadCount: 0, nextCursor: null };
    }
    const after = parseCursor(query.cursor);

    return this.prisma.tenant(async (tx) => {
      const [fetched, unreadCount] = await Promise.all([
        tx.notification.findMany({
          where: {
            userId,
            ...(after === undefined ? {} : { id: { lt: after } }),
          },
          // Ordered and paged by id alone. Ids are UUIDv7, so they sort by
          // creation time — and unlike `createdAt` they are exact: Postgres keeps
          // microseconds and a JavaScript Date only milliseconds, so a time
          // cursor skips the rest of a voucher run written in one transaction.
          orderBy: { id: 'desc' },
          take: NOTIFICATION_PAGE_SIZE + 1,
        }),
        tx.notification.count({ where: { userId, readAt: null } }),
      ]);
      const hasMore = fetched.length > NOTIFICATION_PAGE_SIZE;
      const rows = fetched.slice(0, NOTIFICATION_PAGE_SIZE);
      const last = rows[rows.length - 1];

      return {
        nextCursor: hasMore && last !== undefined ? last.id : null,
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
      this.push.queue(tx, data.map(toPushItem));
    }
  }

  /**
   * Everyone active in this school whose role carries `permission`.
   *
   * Read off the permission table rather than a list of role names, so a role
   * that is later granted the permission starts hearing about it with no change
   * here — the same rule the requests module follows for its managers.
   */
  async userIdsWithPermission(tx: TransactionClient, permission: Permission): Promise<string[]> {
    const roles: SchoolRole[] = SCHOOL_ROLES.filter((role) => hasPermission([role], permission));
    if (roles.length === 0) {
      return [];
    }
    const rows = await tx.userRole.findMany({
      where: { role: { in: roles }, user: { status: 'ACTIVE', deletedAt: null } },
      select: { userId: true },
    });
    return [...new Set(rows.map((row) => row.userId))];
  }

  /**
   * The portal logins of the teachers who take a class: those assigned to it and
   * those named as teaching one of its subjects. Teachers hear about their own
   * classes and no others.
   */
  async teacherUserIdsOfClass(tx: TransactionClient, classLevelId: string): Promise<string[]> {
    const rows = await tx.staff.findMany({
      where: {
        deletedAt: null,
        userId: { not: null },
        user: { status: 'ACTIVE', deletedAt: null },
        OR: [
          { classAssignments: { some: { classLevelId } } },
          { taughtSubjects: { some: { classLevelId } } },
        ],
      },
      select: { userId: true },
    });
    return rows.flatMap((row) => (row.userId === null ? [] : [row.userId]));
  }

  /** The class a student is currently enrolled in, if any. */
  async currentClassOf(tx: TransactionClient, studentId: string): Promise<string | null> {
    const row = await tx.enrollment.findFirst({
      where: { studentId, status: 'ENROLLED' },
      orderBy: { createdAt: 'desc' },
      select: { classLevelId: true },
    });
    return row?.classLevelId ?? null;
  }

  /** Everyone active in this school who holds any of these roles. */
  async userIdsWithRoles(tx: TransactionClient, roles: readonly SchoolRole[]): Promise<string[]> {
    if (roles.length === 0) {
      return [];
    }
    const rows = await tx.userRole.findMany({
      where: { role: { in: [...roles] }, user: { status: 'ACTIVE', deletedAt: null } },
      select: { userId: true },
    });
    return [...new Set(rows.map((row) => row.userId))];
  }

  /** Portal logins of the guardians linked to each of these students. */
  async guardianUserIdsByStudent(
    tx: TransactionClient,
    studentIds: readonly string[],
  ): Promise<Map<string, string[]>> {
    const byStudent = new Map<string, string[]>();
    if (studentIds.length === 0) {
      return byStudent;
    }
    const links = await tx.studentGuardian.findMany({
      where: { studentId: { in: [...new Set(studentIds)] }, guardian: { userId: { not: null }, deletedAt: null } },
      select: { studentId: true, guardian: { select: { userId: true } } },
    });
    for (const link of links) {
      if (link.guardian.userId === null) continue;
      byStudent.set(link.studentId, [...(byStudent.get(link.studentId) ?? []), link.guardian.userId]);
    }
    return byStudent;
  }

  /** Every active login in the school — for announcements that are for all. */
  async allActiveUserIds(tx: TransactionClient): Promise<string[]> {
    const rows = await tx.user.findMany({
      where: { status: 'ACTIVE', deletedAt: null },
      select: { id: true },
    });
    return rows.map((row) => row.id);
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

    const data = recipients.map((userId) => ({
      schoolId: this.context.schoolId,
      userId,
      kind: input.kind,
      title: clip(input.title, TITLE_MAX),
      body: input.body === undefined ? null : clip(input.body, BODY_MAX),
      entityType: input.entityType,
      entityId: input.entityId,
    }));
    await tx.notification.createMany({ data });
    this.push.queue(tx, data.map(toPushItem));
  }
}

function toPushItem(row: {
  userId: string;
  kind: NotificationKind;
  title: string;
  body: string | null;
  entityType: NotificationEntityType;
  entityId: string;
}): PushItem {
  return {
    userId: row.userId,
    kind: row.kind,
    title: row.title,
    body: row.body,
    entityType: row.entityType,
    entityId: row.entityId,
  };
}

function parseCursor(cursor: string | undefined): string | undefined {
  // A mangled cursor is the caller's bug, but the bell should still open.
  return cursor !== undefined && idSchema.safeParse(cursor).success ? cursor : undefined;
}

function clip(text: string, max: number): string {
  const trimmed = text.trim();
  return trimmed.length <= max ? trimmed : `${trimmed.slice(0, max - 1).trimEnd()}…`;
}
