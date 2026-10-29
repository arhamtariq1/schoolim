import {
  assignRequestSchema,
  changeRequestStatusSchema,
  createRequestSchema,
  idSchema,
  requestListQuerySchema,
  requestStudentQuerySchema,
  requestSummaryQuerySchema,
  ROUTES,
  uploadRequestAttachmentSchema,
  type RequestAssigneeOption,
  type RequestAttachment,
  type RequestDetail,
  type RequestListItem,
  type RequestStudentOption,
  type RequestSummary,
} from '@ilm/contracts';
import { Body, Controller, Get, Module, Param, Post, Query, Req, Res } from '@nestjs/common';
import { type FastifyReply, type FastifyRequest } from 'fastify';

import { RequirePermission } from '../../shared/rbac/rbac.guard';
import { clockProvider } from '../../shared/time/clock.provider';
import { NotificationsModule } from '../notifications/notifications.module';

import { RequestsService } from './requests.service';

/**
 * Requests and concerns — ADR-0016.
 *
 * Two permissions split the module. `workflow.request.create` — held by every
 * role — raises a request and reads **your own**; `workflow.request.manage`
 * reads all of them and may assign and set status. Which rows a caller reaches
 * is decided in the service as a query clause, so nothing here narrows.
 *
 * The fixed paths (`summary`, `students`, `assignees`, `attachments/:id`) are
 * declared ahead of `:id`, so none of them can be read as an id.
 */
@Controller()
export class RequestsController {
  constructor(private readonly requests: RequestsService) {}

  @Get(ROUTES.requests.list)
  @RequirePermission('workflow.request.create')
  async list(
    @Query() rawQuery: unknown,
    @Req() request: FastifyRequest,
  ): Promise<{
    data: RequestListItem[];
    meta: { requestId: string; page: { total: number; limit: number; offset: number } };
  }> {
    const query = requestListQuerySchema.parse(rawQuery);
    const { items, total } = await this.requests.list(query);

    return {
      data: items,
      meta: {
        requestId: request.id,
        page: { total, limit: query.limit, offset: query.offset },
      },
    };
  }

  @Get(ROUTES.requests.summary)
  @RequirePermission('workflow.request.create')
  async summary(@Query() rawQuery: unknown): Promise<{ data: RequestSummary }> {
    return { data: await this.requests.summary(requestSummaryQuerySchema.parse(rawQuery)) };
  }

  @Get(ROUTES.requests.students)
  @RequirePermission('workflow.request.create')
  async students(@Query() rawQuery: unknown): Promise<{ data: RequestStudentOption[] }> {
    const { q } = requestStudentQuerySchema.parse(rawQuery);
    return { data: await this.requests.studentOptions(q) };
  }

  /** Who a request can be given to. Managers only: nobody else assigns. */
  @Get(ROUTES.requests.assignees)
  @RequirePermission('workflow.request.manage')
  async assignees(): Promise<{ data: RequestAssigneeOption[] }> {
    return { data: await this.requests.assigneeOptions() };
  }

  /**
   * A picture, served as the image it is so it can be an `<img src>`.
   *
   * Private to the browser that asked: it sits behind a session and belongs to
   * one school's request, so a shared proxy must never keep it. It is immutable
   * — pictures are never replaced — which is what lets it be cached for an hour.
   */
  @Get(`${ROUTES.requests.list}/attachments/:attachmentId`)
  @RequirePermission('workflow.request.create')
  async attachment(
    @Param('attachmentId') attachmentId: string,
    @Req() request: FastifyRequest,
    @Res({ passthrough: false }) reply: FastifyReply,
  ): Promise<void> {
    const asset = await this.requests.attachment(idSchema.parse(attachmentId));

    if (request.headers['if-none-match'] === `"${asset.etag}"`) {
      await reply.code(304).send();
      return;
    }
    if (asset.kind === 'redirect') {
      await reply
        .code(302)
        .header('location', asset.url)
        .header('cache-control', 'private, max-age=300, must-revalidate')
        .send();
      return;
    }

    await reply
      .header('content-type', asset.mimeType)
      .header('etag', `"${asset.etag}"`)
      .header('cache-control', 'private, max-age=3600')
      .header('content-length', String(asset.bytes.byteLength))
      // The bytes were uploaded by a parent. Refusing to let a browser sniff
      // them into anything but the image they were verified to be.
      .header('x-content-type-options', 'nosniff')
      .send(asset.bytes);
  }

  @Post(ROUTES.requests.list)
  @RequirePermission('workflow.request.create')
  async create(@Body() body: unknown): Promise<{ data: RequestDetail }> {
    return { data: await this.requests.create(createRequestSchema.parse(body)) };
  }

  @Get(`${ROUTES.requests.list}/:id`)
  @RequirePermission('workflow.request.create')
  async detail(@Param('id') id: string): Promise<{ data: RequestDetail }> {
    return { data: await this.requests.detail(idSchema.parse(id)) };
  }

  /**
   * Set the status. A manager follows the whole state machine; the person who
   * raised the request may only reopen it — the service decides which, from who
   * is asking, so the one route serves both.
   */
  @Post(`${ROUTES.requests.list}/:id/status`)
  @RequirePermission('workflow.request.create')
  async status(@Param('id') id: string, @Body() body: unknown): Promise<{ data: RequestDetail }> {
    return {
      data: await this.requests.changeStatus(idSchema.parse(id), changeRequestStatusSchema.parse(body)),
    };
  }

  @Post(`${ROUTES.requests.list}/:id/assign`)
  @RequirePermission('workflow.request.manage')
  async assign(@Param('id') id: string, @Body() body: unknown): Promise<{ data: RequestDetail }> {
    return {
      data: await this.requests.assign(idSchema.parse(id), assignRequestSchema.parse(body)),
    };
  }

  @Post(`${ROUTES.requests.list}/:id/events/:eventId/attachments`)
  @RequirePermission('workflow.request.create')
  async attach(
    @Param('id') id: string,
    @Param('eventId') eventId: string,
    @Body() body: unknown,
  ): Promise<{ data: RequestAttachment }> {
    return {
      data: await this.requests.attach(
        idSchema.parse(id),
        idSchema.parse(eventId),
        uploadRequestAttachmentSchema.parse(body),
      ),
    };
  }
}

@Module({
  imports: [NotificationsModule],
  controllers: [RequestsController],
  providers: [clockProvider, RequestsService],
})
export class RequestsModule {}
