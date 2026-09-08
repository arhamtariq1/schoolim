import { errorTypeUri, type ErrorCode, type ProblemDetails } from '@ilm/contracts';
import {
  Catch,
  HttpException,
  Logger,
  type ArgumentsHost,
  type ExceptionFilter,
} from '@nestjs/common';
import { type FastifyReply, type FastifyRequest } from 'fastify';
import { ZodError } from 'zod';

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
    // A schema rejection is the caller's problem, not ours: 400 with the
    // offending fields named, so the form can map each message back to its
    // input rather than showing one generic toast (docs/16 §8). Without this
    // branch a mistyped filter surfaced as a 500 — which reads as "the server
    // is broken" when the server is in fact working exactly as designed.
    if (exception instanceof ZodError) {
      return this.problem(
        'VALIDATION_FAILED',
        400,
        'Some of the information provided is not valid.',
        instance,
        requestId,
        {
          errors: exception.issues.map((issue) => ({
            field: issue.path.map(String).join('.'),
            code: issue.code.toUpperCase(),
            message: issue.message,
          })),
        },
      );
    }

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

    // A malformed id in the path — `/students/not-a-uuid` — is bad input, not a
    // server fault. Prisma raises P2023 ("inconsistent column data") when a
    // string that is not a UUID reaches a uuid column, and without this branch
    // every endpoint taking an `:id` answers 500: it tells the caller the
    // mistake was ours, and it fires the error alarm for somebody mistyping a
    // URL. Mapped centrally rather than validated in forty controllers.
    if (isInvalidIdError(exception)) {
      return this.problem(
        'VALIDATION_FAILED',
        400,
        'That identifier is not valid.',
        instance,
        requestId,
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

/**
 * Prisma's "you passed something that is not a UUID to a uuid column".
 *
 * Matched on the error code rather than the message, which is reworded between
 * releases. Both codes mean the same thing to a caller: the identifier they
 * sent is not one. `P2007` is what Prisma 7 raises for a malformed uuid;
 * `P2023` is the older inconsistent-column-data code, kept because it costs
 * nothing and an upgrade should not silently reintroduce 500s.
 *
 * The code was verified against the running client rather than assumed — the
 * first guess here was P2023 alone, and it matched nothing.
 */
function isInvalidIdError(exception: unknown): boolean {
  if (typeof exception !== 'object' || exception === null || !('code' in exception)) {
    return false;
  }
  const code = (exception as { code?: unknown }).code;
  return code === 'P2007' || code === 'P2023';
}
