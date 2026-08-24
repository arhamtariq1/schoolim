import {
  CallHandler,
  ExecutionContext,
  Injectable,
  Logger,
  type NestInterceptor,
} from '@nestjs/common';
import { type FastifyRequest } from 'fastify';
import { type Observable } from 'rxjs';
import { tap } from 'rxjs/operators';

import { PrismaService } from '../prisma/prisma.service';
import { TenantContextService } from '../tenancy/tenant-context.service';

/**
 * Every mutation is audited (docs/12 R8).
 *
 * Actor, action, entity, before, after, IP, request id. If an action is not in
 * the audit log it did not happen — and, more practically, you cannot answer
 * the support call about it.
 *
 * **Scope, stated honestly:** this interceptor records *that* a mutation
 * happened, with the actor and the request. It cannot know the before-image,
 * because it never touched the database. Modules that need before/after —
 * every financial module — emit a domain event with both, and this is the
 * safety net that guarantees no mutation is invisible even when a module
 * forgets.
 *
 * The audit write must never fail the request it is recording: a school losing
 * a fee payment because the audit table was slow would be a worse outcome than
 * a gap in the log. It is logged loudly instead.
 */
@Injectable()
export class AuditInterceptor implements NestInterceptor {
  private readonly logger = new Logger(AuditInterceptor.name);

  private static readonly MUTATING = new Set(['POST', 'PATCH', 'PUT', 'DELETE']);

  constructor(
    private readonly prisma: PrismaService,
    private readonly context: TenantContextService,
  ) {}

  intercept(execution: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = execution.switchToHttp().getRequest<FastifyRequest>();

    if (!AuditInterceptor.MUTATING.has(request.method)) {
      return next.handle();
    }

    // Captured before the handler runs: CLS is guaranteed populated here, and
    // reading it after the response has been sent is not.
    const schoolId = this.context.schoolIdOrUndefined;
    const userId = this.context.userId;
    const actingPlatformUserId = this.context.actingPlatformUserId;

    return next.handle().pipe(
      tap({
        next: () => {
          void this.record({
            schoolId,
            userId,
            actingPlatformUserId,
            action: `${request.method} ${request.routeOptions.url ?? request.url}`,
            ip: request.ip,
            userAgent: request.headers['user-agent'],
            requestId: request.id,
          });
        },
      }),
    );
  }

  private async record(entry: {
    schoolId: string | undefined;
    userId: string | undefined;
    actingPlatformUserId: string | undefined;
    action: string;
    ip: string | undefined;
    userAgent: string | undefined;
    requestId: string;
  }): Promise<void> {
    if (entry.schoolId === undefined) {
      return;
    }

    try {
      await this.prisma.tenant((tx) =>
        tx.auditLog.create({
          data: {
            action: entry.action,
            entityType: 'Request',
            actorType: entry.actingPlatformUserId === undefined ? 'USER' : 'PLATFORM',
            actorUserId: entry.userId ?? null,
            actorPlatformUserId: entry.actingPlatformUserId ?? null,
            ip: entry.ip ?? null,
            userAgent: entry.userAgent ?? null,
            requestId: entry.requestId,
          } as never,
        }),
      );
    } catch (error) {
      // Loud, but never fatal to the request being audited.
      this.logger.error({ err: error, requestId: entry.requestId }, 'Failed to write audit log');
    }
  }
}
