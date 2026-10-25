import {
  allowedNextStatuses,
  grantFor,
  hasPermission,
  REQUEST_ATTACHMENTS_PER_EVENT,
  REQUEST_CATEGORY_LABELS,
  REQUEST_PRIORITY_LABELS,
  REQUEST_STATUS_LABELS,
  SCHOOL_ROLE_LABELS,
  SCHOOL_ROLES,
  type AssignRequest,
  type ChangeRequestStatus,
  type CreateRequest,
  type RequestAssigneeOption,
  type RequestAttachment,
  type RequestDetail,
  type RequestEvent,
  type RequestListItem,
  type RequestListQuery,
  type RequestPerson,
  type RequestStatus,
  type RequestStudentOption,
  type RequestSummary,
  type SchoolRole,
  type UploadRequestAttachment,
} from '@ilm/contracts';
import { Inject, Injectable } from '@nestjs/common';

import { type Prisma, type TransactionClient } from '../../prisma';
import { PrismaService } from '../../prisma/prisma.service';
import { BusinessRuleError, NotFoundError } from '../../shared/errors/domain-error';
import { ClassScopeService } from '../../shared/rbac/class-scope.service';
import { verifyImage } from '../../shared/storage/image-bytes';
import {
  STORAGE,
  STORAGE_PROVIDERS,
  type AssetLocation,
  type StoragePort,
} from '../../shared/storage/storage.port';
import { TenantContextService } from '../../shared/tenancy/tenant-context.service';
import { CLOCK, type Clock } from '../../shared/time/clock.provider';
import { NotificationsService } from '../notifications/notifications.service';

/** Roles that hold `workflow.request.manage` — read off the permission table, never listed twice. */
const MANAGE_ROLES: readonly SchoolRole[] = SCHOOL_ROLES.filter((role) =>
  hasPermission([role], 'workflow.request.manage'),
);


/** How many children the form's picker offers at once. */
const STUDENT_OPTION_LIMIT = 25;

interface PersonRow {
  readonly id: string;
  readonly name: string;
}

/**
 * Requests and concerns — ADR-0016.
 *
 * ## Who sees what is a query clause, not a filter
 *
 * A holder of `workflow.request.manage` reads every request in the school;
 * everyone else reads the ones they raised, and nothing else. That is the
 * `visible()` clause, applied inside every query that touches a request — never
 * after the fetch, which would let a count or a page boundary leak the existence
 * of rows the caller may not see. A request that is not yours answers "not
 * found", exactly as one that does not exist.
 *
 * ## One transaction per act, notifications inside it
 *
 * Replying, changing a status and assigning each do their writes and their
 * notifications in one transaction, so nobody is told about a change that
 * rolled back and no change goes unannounced.
 *
 * ## The state machine is not here
 *
 * `REQUEST_TRANSITIONS` and `allowedNextStatuses` live in `@ilm/contracts`; this
 * service enforces them and the portal draws its buttons from them.
 */
@Injectable()
export class RequestsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly context: TenantContextService,
    private readonly classScope: ClassScopeService,
    private readonly notifications: NotificationsService,
    @Inject(STORAGE) private readonly storage: StoragePort,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  // --- Reading ---------------------------------------------------------------

  async list(query: RequestListQuery): Promise<{ items: RequestListItem[]; total: number }> {
    return this.prisma.tenant(async (tx) => {
      const where = this.listWhere(query);
      const [rows, total] = await Promise.all([
        tx.request.findMany({
          where,
          orderBy: this.orderFor(query),
          skip: query.offset,
          take: query.limit,
          select: LIST_SELECT,
        }),
        tx.request.count({ where }),
      ]);

      return { items: await this.toListItems(tx, rows), total };
    });
  }

  async summary(): Promise<RequestSummary> {
    return this.prisma.tenant(async (tx) => {
      const groups = await tx.request.groupBy({
        by: ['status'],
        where: this.visible(),
        _count: { _all: true },
      });
      const count = (status: RequestStatus): number =>
        groups.find((group) => group.status === status)?._count._all ?? 0;

      return {
        total: groups.reduce((sum, group) => sum + group._count._all, 0),
        pending: count('PENDING'),
        inProgress: count('IN_PROGRESS'),
        resolved: count('RESOLVED'),
        rejected: count('REJECTED'),
        reopened: count('REOPENED'),
      };
    });
  }

  async detail(id: string): Promise<RequestDetail> {
    return this.prisma.tenant(async (tx) => this.loadDetail(tx, id));
  }

  /** Children the caller may raise a request about, for the form's picker. */
  async studentOptions(q: string | undefined): Promise<RequestStudentOption[]> {
    return this.prisma.tenant(async (tx) => {
      const rows = await tx.student.findMany({
        where: {
          AND: [
            { deletedAt: null },
            await this.studentScope(tx),
            q === undefined
              ? {}
              : {
                  OR: [
                    { firstName: { contains: q, mode: 'insensitive' } },
                    { lastName: { contains: q, mode: 'insensitive' } },
                    { grNo: { contains: q, mode: 'insensitive' } },
                  ],
                },
          ],
        },
        orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }],
        take: STUDENT_OPTION_LIMIT,
        select: { id: true, firstName: true, lastName: true, grNo: true },
      });
      const classes = await classNames(
        tx,
        rows.map((row) => row.id),
      );

      return rows.map((row) => ({
        id: row.id,
        name: `${row.firstName} ${row.lastName}`,
        grNo: row.grNo,
        className: classes.get(row.id) ?? null,
      }));
    });
  }

  /** Staff a request can be assigned to: anyone who can then open and answer it. */
  async assigneeOptions(): Promise<RequestAssigneeOption[]> {
    return this.prisma.tenant(async (tx) => {
      const users = await tx.user.findMany({
        where: {
          status: 'ACTIVE',
          deletedAt: null,
          roles: { some: { role: { in: [...MANAGE_ROLES] } } },
        },
        orderBy: { name: 'asc' },
        select: { id: true, name: true },
      });
      const labels = await roleLabels(
        tx,
        users.map((user) => user.id),
      );

      return users.map((user) => ({
        id: user.id,
        name: user.name,
        roleLabel: labels.get(user.id) ?? 'Staff',
      }));
    });
  }

  // --- Writing ---------------------------------------------------------------

  async create(input: CreateRequest): Promise<RequestDetail> {
    const userId = this.requireUser();

    try {
      return await this.prisma.tenant(async (tx) => {
        const replay = await tx.request.findFirst({
          where: { createdBy: userId, idempotencyKey: input.idempotencyKey },
          select: { id: true },
        });
        if (replay !== null) {
          // A double-submitted form is one request.
          return this.loadDetail(tx, replay.id);
        }

        if (input.studentId !== undefined) {
          await this.assertMayRaiseAbout(tx, input.studentId);
        }

        const now = this.clock.now();
        const requesterRole = primaryRole(this.context.roles);
        const request = await tx.request.create({
          data: {
            schoolId: this.context.schoolId,
            requestNo: await nextRequestNo(tx),
            createdBy: userId,
            requesterRole,
            category: input.category,
            priority: input.priority,
            subject: input.subject,
            description: input.description,
            studentId: input.studentId ?? null,
            idempotencyKey: input.idempotencyKey,
            lastActivityAt: now,
          },
          select: { id: true, requestNo: true },
        });
        await this.recordEvent(tx, request.id, { kind: 'CREATED', actorId: userId });

        const requester = await tx.user.findFirst({ where: { id: userId }, select: { name: true } });
        await this.notifications.notify(tx, {
          recipientIds: await this.managerIds(tx),
          exceptUserId: userId,
          kind: 'request.submitted',
          title: `New request: ${input.subject}`,
          body: `${requester?.name ?? 'Someone'} (${SCHOOL_ROLE_LABELS[requesterRole]}) · ${REQUEST_CATEGORY_LABELS[input.category]} · ${REQUEST_PRIORITY_LABELS[input.priority]} priority`,
          entityType: 'request',
          entityId: request.id,
        });
        await this.audit(tx, 'requests.create', request.id, null, {
          requestNo: request.requestNo,
          category: input.category,
          priority: input.priority,
        });

        return this.loadDetail(tx, request.id);
      });
    } catch (error) {
      if (!isUniqueViolation(error)) {
        throw error;
      }
      // Two submissions of one form raced and the other won. Return what it made.
      return this.prisma.tenant(async (tx) => {
        const existing = await tx.request.findFirst({
          where: { createdBy: userId, idempotencyKey: input.idempotencyKey },
          select: { id: true },
        });
        if (existing === null) {
          throw error;
        }
        return this.loadDetail(tx, existing.id);
      });
    }
  }

  async changeStatus(id: string, input: ChangeRequestStatus): Promise<RequestDetail> {
    const userId = this.requireUser();

    return this.prisma.tenant(async (tx) => {
      const request = await this.findVisible(tx, id);
      const allowed = allowedNextStatuses(request.status, this.isManager() ? 'manager' : 'requester');

      if (!allowed.includes(input.status)) {
        throw new BusinessRuleError(
          'REQUESTS_INVALID_TRANSITION',
          `A ${REQUEST_STATUS_LABELS[request.status].toLowerCase()} request cannot be moved to ${REQUEST_STATUS_LABELS[input.status].toLowerCase()}.`,
        );
      }

      // Guarded on the status it was read at, so two people acting on the same
      // request at once cannot both succeed: the second finds it already moved.
      const now = this.clock.now();
      const moved = await tx.request.updateMany({
        where: { id, status: request.status },
        data: {
          status: input.status,
          resolvedAt: input.status === 'RESOLVED' ? now : null,
          lastActivityAt: now,
        },
      });
      if (moved.count === 0) {
        throw new BusinessRuleError(
          'REQUESTS_CHANGED',
          'Someone else just changed this request. Reload it to see where it stands.',
        );
      }

      await this.recordEvent(tx, id, {
        kind: 'STATUS_CHANGED',
        actorId: userId,
        body: input.note === undefined || input.note === '' ? null : input.note,
        fromStatus: request.status,
        toStatus: input.status,
      });

      await this.notifications.notify(tx, {
        recipientIds: [request.createdBy, ...(request.assignedTo === null ? [] : [request.assignedTo])],
        exceptUserId: userId,
        kind: 'request.status_changed',
        title: `${request.requestNo}: ${REQUEST_STATUS_LABELS[input.status].toLowerCase()}`,
        body: `${request.subject}${input.note === undefined || input.note === '' ? '' : ` — ${input.note}`}`,
        entityType: 'request',
        entityId: id,
      });
      await this.audit(
        tx,
        'requests.status.change',
        id,
        { status: request.status },
        { status: input.status },
      );

      return this.loadDetail(tx, id);
    });
  }

  async assign(id: string, input: AssignRequest): Promise<RequestDetail> {
    const userId = this.requireUser();

    return this.prisma.tenant(async (tx) => {
      const request = await this.findVisible(tx, id);
      if (request.assignedTo === input.assigneeId) {
        // Already where it was asked to be. Not an error, and not an event.
        return this.loadDetail(tx, id);
      }

      if (input.assigneeId !== null) {
        const assignee = await tx.user.findFirst({
          where: {
            id: input.assigneeId,
            status: 'ACTIVE',
            deletedAt: null,
            roles: { some: { role: { in: [...MANAGE_ROLES] } } },
          },
          select: { id: true },
        });
        if (assignee === null) {
          // Somebody who could not open it is not somebody it can be given to.
          throw new BusinessRuleError(
            'VALIDATION_FAILED',
            'That person cannot be given requests. Choose someone from the office.',
          );
        }
      }

      await tx.request.update({
        where: { id },
        data: { assignedTo: input.assigneeId, lastActivityAt: this.clock.now() },
      });
      await this.recordEvent(tx, id, {
        kind: 'ASSIGNED',
        actorId: userId,
        assigneeId: input.assigneeId,
      });

      if (input.assigneeId !== null) {
        const assignee = await tx.user.findFirst({
          where: { id: input.assigneeId },
          select: { name: true },
        });
        await this.notifications.notify(tx, {
          recipientIds: [input.assigneeId],
          exceptUserId: userId,
          kind: 'request.assigned',
          title: `${request.requestNo} was assigned to you`,
          body: request.subject,
          entityType: 'request',
          entityId: id,
        });
        await this.notifications.notify(tx, {
          recipientIds: [request.createdBy],
          exceptUserId: userId,
          kind: 'request.assigned',
          title: `${request.requestNo}: ${assignee?.name ?? 'Someone'} is handling your request`,
          body: request.subject,
          entityType: 'request',
          entityId: id,
        });
      }
      await this.audit(
        tx,
        'requests.assign',
        id,
        { assignedTo: request.assignedTo },
        { assignedTo: input.assigneeId },
      );

      return this.loadDetail(tx, id);
    });
  }

  // --- Pictures --------------------------------------------------------------

  /** Attach one picture to a request or reply the caller has just written. */
  async attach(
    id: string,
    eventId: string,
    input: UploadRequestAttachment,
  ): Promise<RequestAttachment> {
    const userId = this.requireUser();
    // Checked before anything is opened: what the bytes are does not depend on
    // who is sending them, and a bad file should not cost a transaction.
    const image = verifyImage('REQUEST_ATTACHMENT', input);

    return this.prisma.tenant(async (tx) => {
      await this.findVisible(tx, id);

      const event = await tx.requestEvent.findFirst({
        where: { id: eventId, requestId: id },
        select: { id: true, kind: true, actorId: true },
      });
      // Not yours, or not there: the same answer, so one person cannot probe for
      // another's events.
      if (event === null || event.actorId !== userId) {
        throw new NotFoundError('message');
      }
      if (event.kind !== 'CREATED') {
        throw new BusinessRuleError(
          'REQUESTS_ATTACHMENT_REFUSED',
          'Pictures can only go on the request itself.',
        );
      }
      // Judged by order, not by the clock: a later event on the same request,
      // compared against this one inside the database.
      const [later] = await tx.$queryRawUnsafe<{ newer: boolean }[]>(
        `SELECT EXISTS (
                  SELECT 1 FROM request_events later
                   WHERE later.request_id = e.request_id
                     AND (later.created_at, later.id) > (e.created_at, e.id)
                ) AS newer
           FROM request_events e WHERE e.id = $1::uuid`,
        eventId,
      );
      const tooOld = later?.newer === true;
      if (tooOld) {
        throw new BusinessRuleError(
          'REQUESTS_ATTACHMENT_REFUSED',
          'Something has happened on this request since. Add the picture in a new reply instead.',
        );
      }

      const existing = await tx.requestAttachment.count({ where: { eventId } });
      if (existing >= REQUEST_ATTACHMENTS_PER_EVENT) {
        throw new BusinessRuleError(
          'REQUESTS_ATTACHMENT_REFUSED',
          `You can attach up to ${String(REQUEST_ATTACHMENTS_PER_EVENT)} pictures to one message.`,
        );
      }

      const stored = await this.storage.put({
        kind: 'REQUEST_ATTACHMENT',
        schoolId: this.context.schoolId,
        bytes: image.bytes,
        mimeType: image.mimeType,
        etag: image.etag,
      });
      const local = stored.provider === STORAGE_PROVIDERS.database;

      const row = await tx.requestAttachment.create({
        data: {
          schoolId: this.context.schoolId,
          requestId: id,
          eventId,
          uploadedBy: userId,
          fileName: input.fileName,
          mimeType: image.mimeType,
          byteSize: stored.byteSize,
          etag: image.etag,
          // Prisma's `Bytes` is a Uint8Array over a plain ArrayBuffer; a Node
          // Buffer may sit on a shared one. A copy of at most half a megabyte.
          bytes: local ? new Uint8Array(image.bytes) : null,
          storageProvider: stored.provider,
          storageKey: stored.key,
          storageUrl: stored.url ?? null,
        },
        select: { id: true, fileName: true, mimeType: true, byteSize: true },
      });

      return {
        id: row.id,
        fileName: row.fileName,
        mimeType: row.mimeType as RequestAttachment['mimeType'],
        byteSize: row.byteSize,
      };
    });
  }

  /** The picture itself, for whoever may open the request it belongs to. */
  async attachment(attachmentId: string): Promise<AssetLocation & { mimeType: string; etag: string }> {
    const row = await this.prisma.tenant(async (tx) =>
      tx.requestAttachment.findFirst({
        // Through the request, so the visibility rule is the request's own.
        where: { id: attachmentId, request: this.visible() },
        select: {
          bytes: true,
          mimeType: true,
          etag: true,
          storageProvider: true,
          storageKey: true,
          storageUrl: true,
        },
      }),
    );
    if (row === null) {
      throw new NotFoundError('attachment');
    }

    if (row.storageProvider === STORAGE_PROVIDERS.database) {
      if (row.bytes === null) {
        // The check constraint forbids this; reaching it means a row written
        // around the application. A loud failure beats a blank picture.
        throw new NotFoundError('attachment');
      }
      return { kind: 'bytes', bytes: Buffer.from(row.bytes), mimeType: row.mimeType, etag: row.etag };
    }

    const located = await this.storage.locate({
      key: row.storageKey,
      url: row.storageUrl,
      provider: row.storageProvider,
    });
    return { ...located, mimeType: row.mimeType, etag: row.etag };
  }

  // --- Who may see what ------------------------------------------------------

  private requireUser(): string {
    const userId = this.context.userId;
    if (userId === undefined) {
      throw new NotFoundError('request');
    }
    return userId;
  }

  private isManager(): boolean {
    return hasPermission(this.context.roles as readonly SchoolRole[], 'workflow.request.manage');
  }

  /**
   * The rows of `requests` the caller may see.
   *
   * A manager sees the school's; everyone else sees what they raised. Used in
   * the WHERE of every query — never applied after the fetch.
   */
  private visible(): Prisma.RequestWhereInput {
    if (this.isManager()) {
      return {};
    }
    // `requireUser` would throw; here an absent user must match nothing.
    return { createdBy: this.context.userId ?? '00000000-0000-0000-0000-000000000000' };
  }

  private async findVisible(tx: TransactionClient, id: string) {
    const request = await tx.request.findFirst({
      where: { id, ...this.visible() },
      select: {
        id: true,
        requestNo: true,
        subject: true,
        status: true,
        createdBy: true,
        assignedTo: true,
      },
    });
    if (request === null) {
      throw new NotFoundError('request');
    }
    return request;
  }

  /**
   * The children this caller may raise a request about, as a student `where`.
   *
   * The same reach as reading that child: everyone with the unscoped student
   * grant, a parent's own children, a student themselves, a teacher's classes.
   * Anything unclear is nobody — never everybody.
   */
  private async studentScope(tx: TransactionClient): Promise<Prisma.StudentWhereInput> {
    const roles = this.context.roles as readonly SchoolRole[];
    const userId = this.context.userId;
    const none: Prisma.StudentWhereInput = { id: { in: [] } };

    if (grantFor(roles, 'students.student.read') === 'all') {
      return {};
    }
    if (userId === undefined) {
      return none;
    }
    if (roles.includes('PARENT')) {
      const links = await tx.studentGuardian.findMany({
        where: { guardian: { userId, deletedAt: null } },
        select: { studentId: true },
      });
      return { id: { in: [...new Set(links.map((link) => link.studentId))] } };
    }
    if (roles.includes('STUDENT')) {
      return { userId };
    }

    const classIds = await this.classScope.classLevelIds(tx, 'students.student.read');
    if (classIds === undefined || classIds.length === 0) {
      return classIds === undefined ? {} : none;
    }
    return { enrollments: { some: { classLevelId: { in: [...classIds] }, status: 'ENROLLED' } } };
  }

  private async assertMayRaiseAbout(tx: TransactionClient, studentId: string): Promise<void> {
    // `AND`, not a spread: the scope for a parent is itself an `id` filter, and
    // spreading it after `id: studentId` replaces the id being asked about with
    // the list of their own children — which then matches, for any id at all.
    const found = await tx.student.findFirst({
      where: { AND: [{ id: studentId, deletedAt: null }, await this.studentScope(tx)] },
      select: { id: true },
    });
    if (found === null) {
      // The same answer for a child that is not theirs and one that does not exist.
      throw new BusinessRuleError(
        'VALIDATION_FAILED',
        'Choose one of your own children, or leave the student out.',
      );
    }
  }

  private async managerIds(tx: TransactionClient): Promise<string[]> {
    const rows = await tx.userRole.findMany({
      where: {
        role: { in: [...MANAGE_ROLES] },
        user: { status: 'ACTIVE', deletedAt: null },
      },
      select: { userId: true },
    });
    return [...new Set(rows.map((row) => row.userId))];
  }

  // --- Building answers ------------------------------------------------------

  private listWhere(query: RequestListQuery): Prisma.RequestWhereInput {
    const userId = this.context.userId;
    const filters: Prisma.RequestWhereInput[] = [this.visible()];

    if (query.status !== undefined) {
      filters.push({ status: query.status });
    }
    if (query.category !== undefined) {
      filters.push({ category: query.category });
    }
    if (query.priority !== undefined) {
      filters.push({ priority: query.priority });
    }
    if (query.assignee === 'unassigned') {
      filters.push({ assignedTo: null });
    } else if (query.assignee === 'me') {
      filters.push({ assignedTo: userId ?? null });
    } else if (query.assignee !== undefined) {
      filters.push({ assignedTo: query.assignee });
    }
    if (query.q !== undefined) {
      const contains = { contains: query.q, mode: 'insensitive' } as const;
      filters.push({
        OR: [
          { subject: contains },
          { requestNo: contains },
          { creator: { name: contains } },
          { student: { OR: [{ firstName: contains }, { lastName: contains }, { grNo: contains }] } },
        ],
      });
    }

    return { AND: filters };
  }

  private orderFor(query: RequestListQuery): Prisma.RequestOrderByWithRelationInput[] {
    // Priority and status sort by their declaration order in the database enum
    // (Low → Urgent, Pending → Reopened), which is the order a person means.
    // The request number sorts by when it was made: the same order, and it
    // stays right past REQ-9999 where text would not.
    const field = query.sort === 'requestNo' ? 'createdAt' : query.sort;
    return [{ [field]: query.order }, { id: query.order }];
  }

  private async toListItems(
    tx: TransactionClient,
    rows: readonly ListRow[],
  ): Promise<RequestListItem[]> {
    const labels = await roleLabels(
      tx,
      rows.flatMap((row) => (row.assignee === null ? [] : [row.assignee.id])),
    );
    const classes = await classNames(
      tx,
      rows.flatMap((row) => (row.student === null ? [] : [row.student.id])),
    );

    return rows.map((row) => ({
      id: row.id,
      requestNo: row.requestNo,
      subject: row.subject,
      category: row.category,
      priority: row.priority,
      status: row.status,
      requester: person(row.creator, SCHOOL_ROLE_LABELS[asRole(row.requesterRole)]),
      student:
        row.student === null
          ? null
          : {
              id: row.student.id,
              name: `${row.student.firstName} ${row.student.lastName}`,
              grNo: row.student.grNo,
              className: classes.get(row.student.id) ?? null,
            },
      assignee:
        row.assignee === null
          ? null
          : person(row.assignee, labels.get(row.assignee.id) ?? 'Staff'),
      createdAt: row.createdAt.toISOString(),
      lastActivityAt: row.lastActivityAt.toISOString(),
    }));
  }

  private async loadDetail(tx: TransactionClient, id: string): Promise<RequestDetail> {
    const row = await tx.request.findFirst({
      where: { id, ...this.visible() },
      select: { ...LIST_SELECT, description: true, resolvedAt: true },
    });
    if (row === null) {
      throw new NotFoundError('request');
    }

    const [item] = await this.toListItems(tx, [row]);
    if (item === undefined) {
      throw new NotFoundError('request');
    }

    const events = await tx.requestEvent.findMany({
      where: { requestId: id, kind: { not: 'MESSAGE' } },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      select: {
        id: true,
        kind: true,
        body: true,
        fromStatus: true,
        toStatus: true,
        createdAt: true,
        actor: { select: { id: true, name: true } },
        assignee: { select: { id: true, name: true } },
        attachments: {
          orderBy: { createdAt: 'asc' },
          select: { id: true, fileName: true, mimeType: true, byteSize: true },
        },
      },
    });

    const labels = await roleLabels(
      tx,
      events.flatMap((event) => [event.actor.id, ...(event.assignee === null ? [] : [event.assignee.id])]),
    );
    const labelFor = (user: PersonRow): string =>
      // Whoever raised it keeps the role they raised it as.
      user.id === row.creator.id
        ? SCHOOL_ROLE_LABELS[asRole(row.requesterRole)]
        : (labels.get(user.id) ?? 'Staff');

    const manager = this.isManager();
    const isRequester = row.createdBy === this.context.userId;
    // Contact details go to the office only: the requester knows their own, and
    // nobody else has a reason to read them.
    const contact = manager
      ? await tx.user.findFirst({ where: { id: row.createdBy }, select: { phone: true, email: true } })
      : null;
    const timeline: RequestEvent[] = events.map((event) => ({
      id: event.id,
      kind: event.kind,
      actor: person(event.actor, labelFor(event.actor)),
      body: event.body,
      fromStatus: event.fromStatus,
      toStatus: event.toStatus,
      assignee: event.assignee === null ? null : person(event.assignee, labelFor(event.assignee)),
      attachments: event.attachments.map((attachment) => ({
        id: attachment.id,
        fileName: attachment.fileName,
        mimeType: attachment.mimeType as RequestAttachment['mimeType'],
        byteSize: attachment.byteSize,
      })),
      createdAt: event.createdAt.toISOString(),
    }));

    return {
      ...item,
      description: row.description,
      resolvedAt: row.resolvedAt === null ? null : row.resolvedAt.toISOString(),
      events: timeline,
      allowedStatuses: [...allowedNextStatuses(row.status, manager ? 'manager' : 'requester')],
      canAssign: manager,
      isRequester,
      requesterContact: contact === null ? null : { phone: contact.phone, email: contact.email },
    };
  }

  // --- Writing the timeline --------------------------------------------------

  private async recordEvent(
    tx: TransactionClient,
    requestId: string,
    event: {
      kind: 'CREATED' | 'STATUS_CHANGED' | 'ASSIGNED';
      actorId: string;
      body?: string | null;
      fromStatus?: RequestStatus;
      toStatus?: RequestStatus;
      assigneeId?: string | null;
    },
  ): Promise<{ id: string }> {
    const created = await tx.requestEvent.create({
      data: {
        schoolId: this.context.schoolId,
        requestId,
        kind: event.kind,
        actorId: event.actorId,
        body: event.body ?? null,
        fromStatus: event.fromStatus ?? null,
        toStatus: event.toStatus ?? null,
        assigneeId: event.assigneeId ?? null,
      },
      select: { id: true },
    });

    return created;
  }

  private async audit(
    tx: TransactionClient,
    action: string,
    requestId: string,
    before: Prisma.InputJsonValue | null,
    after: Prisma.InputJsonValue,
  ): Promise<void> {
    await tx.auditLog.create({
      data: {
        schoolId: this.context.schoolId,
        action,
        entityType: 'Request',
        entityId: requestId,
        actorType: 'USER',
        actorUserId: this.context.userId ?? null,
        ...(before === null ? {} : { before }),
        after,
        at: this.clock.now(),
      },
    });
  }
}

// --- Pure helpers --------------------------------------------------------------

const LIST_SELECT = {
  id: true,
  requestNo: true,
  subject: true,
  category: true,
  priority: true,
  status: true,
  requesterRole: true,
  createdBy: true,
  createdAt: true,
  lastActivityAt: true,
  creator: { select: { id: true, name: true } },
  assignee: { select: { id: true, name: true } },
  student: { select: { id: true, firstName: true, lastName: true, grNo: true } },
} as const;

type ListRow = Prisma.RequestGetPayload<{ select: typeof LIST_SELECT }>;

function person(user: PersonRow, roleLabel: string): RequestPerson {
  return { id: user.id, name: user.name, roleLabel };
}

/** A stored role string as a role, falling back to the humblest rather than throwing. */
function asRole(value: string): SchoolRole {
  return (SCHOOL_ROLES as readonly string[]).includes(value) ? (value as SchoolRole) : 'PARENT';
}

/**
 * What to call someone who writes in, when they hold several roles: the first
 * of the school's own role order, so an owner who is also a teacher reads as
 * the owner.
 */
function primaryRole(held: readonly string[]): SchoolRole {
  return SCHOOL_ROLES.find((role) => held.includes(role)) ?? 'PARENT';
}

/** Each person's best role, as the label shown beside their name. */
async function roleLabels(
  tx: TransactionClient,
  userIds: readonly string[],
): Promise<Map<string, string>> {
  const ids = [...new Set(userIds)];
  const labels = new Map<string, string>();
  if (ids.length === 0) {
    return labels;
  }

  const rows = await tx.userRole.findMany({
    where: { userId: { in: ids } },
    select: { userId: true, role: true },
  });
  const best = new Map<string, SchoolRole>();
  for (const row of rows) {
    const current = best.get(row.userId);
    if (current === undefined || SCHOOL_ROLES.indexOf(row.role) < SCHOOL_ROLES.indexOf(current)) {
      best.set(row.userId, row.role);
    }
  }
  for (const [userId, role] of best) {
    labels.set(userId, SCHOOL_ROLE_LABELS[role]);
  }
  return labels;
}

/** The class each child is in now — their newest enrolment. */
async function classNames(
  tx: TransactionClient,
  studentIds: readonly string[],
): Promise<Map<string, string>> {
  const classes = new Map<string, string>();
  const ids = [...new Set(studentIds)];
  if (ids.length === 0) {
    return classes;
  }

  const rows = await tx.enrollment.findMany({
    where: { studentId: { in: ids } },
    orderBy: { createdAt: 'desc' },
    select: { studentId: true, classLevel: { select: { name: true } } },
  });
  for (const row of rows) {
    if (!classes.has(row.studentId)) {
      classes.set(row.studentId, row.classLevel.name);
    }
  }
  return classes;
}

/**
 * `REQ-0001`, per school.
 *
 * One row per (school, kind) in `number_sequences`, advanced atomically: the
 * upsert takes the row lock, so two requests raised at the same moment cannot
 * be given the same number.
 */
async function nextRequestNo(tx: TransactionClient): Promise<string> {
  const rows = await tx.$queryRawUnsafe<{ next: number }[]>(
    `INSERT INTO number_sequences (id, school_id, kind, next_value, updated_at)
     VALUES (gen_random_uuid(), current_school_id(), 'request', 2, now())
     ON CONFLICT (school_id, kind)
     DO UPDATE SET next_value = number_sequences.next_value + 1, updated_at = now()
     RETURNING next_value - 1 AS next`,
  );

  const value = rows[0]?.next;
  if (value === undefined) {
    throw new BusinessRuleError(
      'INTERNAL_ERROR',
      'Could not allocate a request number. Nothing was saved.',
    );
  }
  return `REQ-${String(value).padStart(4, '0')}`;
}

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: string }).code === 'P2002'
  );
}

