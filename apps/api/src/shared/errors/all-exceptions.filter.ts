import { errorTypeUri, type ErrorCode, type ProblemDetails } from '@ilm/contracts';
import {
  Catch,
  HttpException,
  Logger,
  type ArgumentsHost,
  type ExceptionFilter,
} from '@nestjs/common';
import { type FastifyReply, type FastifyRequest } from 'fastify';

import { DomainError } from './domain-error';

/**
 * Every error leaves the API as RFC 9457 `application/problem+json`
 * (docs/11 section 4).
 *
 * Two rules this enforces, both from docs/12 section 3:
 *
 * 1. **Nothing internal leaks.** A Prisma error, a stack trace or a SQL string
 *    reaching a client is both an information disclosure and a support burden.
 *    Anything that is not a DomainError becomes a bare 500 whose detail says
 *    nothing, while the real error goes to the log with the request id.
 * 2. **The request id is always present**, so a school can quote it and the
 *    log can be found in one search.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  constructor(private readonly baseUrl: string) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const reply = http.getResponse<FastifyReply>();
    const request = http.getRequest<FastifyRequest>();
    const requestId = request.id;

    const problem = this.toProblem(exception, request.url, requestId);

    if (problem.status >= 500) {
      // The full error is logged, never sent.
      this.logger.error({ err: exception, requestId, path: request.url }, 'Unhandled exception');
    } else {
      this.logger.warn({ code: problem.code, requestId, path: request.url }, problem.title);
    }

    void reply.status(problem.status).type('application/problem+json').send(problem);
  }

  private toProblem(exception: unknown, instance: string, requestId: string): ProblemDetails {
    if (exception instanceof DomainError) {
      return this.problem(
        exception.code,
        exception.status,
        exception.message,
        instance,
        requestId,
        {
          ...(exception.fieldErrors === undefined ? {} : { errors: [...exception.fieldErrors] }),
        },
      );
    }

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const code: ErrorCode =
        status === 404
          ? 'NOT_FOUND'
          : status === 401
            ? 'AUTH_TOKEN_INVALID'
            : status === 403
              ? 'AUTH_PERMISSION_DENIED'
              : status >= 500
                ? 'INTERNAL_ERROR'
                : 'VALIDATION_FAILED';
      return this.problem(code, status, exception.message, instance, requestId);
    }

    // Unknown. Say nothing useful to the caller; the log has everything.
    return this.problem(
      'INTERNAL_ERROR',
      500,
      'Something went wrong on our side. The team has been notified.',
      instance,
      requestId,
    );
  }

  private problem(
    code: ErrorCode,
    status: number,
    detail: string,
    instance: string,
    requestId: string,
    extra: Partial<ProblemDetails> = {},
  ): ProblemDetails {
    return {
      type: errorTypeUri(code, this.baseUrl),
      title: titleFor(code),
      status,
      code,
      detail,
      instance,
      requestId,
      ...extra,
    };
  }
}

/** A short human title per code. `detail` carries the specifics. */
function titleFor(code: ErrorCode): string {
  return code
    .toLowerCase()
    .split('_')
    .join(' ')
    .replace(/^./, (first) => first.toUpperCase());
}
