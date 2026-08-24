import { COOKIES } from '@ilm/contracts';
import {
  CanActivate,
  Injectable,
  SetMetadata,
  UnauthorizedException,
  type ExecutionContext,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { type FastifyRequest } from 'fastify';

import { TokenService, type AccessTokenClaims } from './token.service';

export const IS_PUBLIC = 'auth:public';

/** Opt a route out of authentication. Used by login, health and webhooks. */
export const Public = (): MethodDecorator & ClassDecorator => SetMetadata(IS_PUBLIC, true);

declare module 'fastify' {
  interface FastifyRequest {
    claims?: AccessTokenClaims;
  }
}

/**
 * First guard in the chain: is this request authenticated at all?
 *
 * The token comes from an **httpOnly cookie**, never `localStorage`
 * (docs/11 section 8) — a token readable by script is a token any XSS can
 * exfiltrate. A `Bearer` header is accepted only for machine clients.
 *
 * This guard deliberately does *not* look at the tenant. That is the next
 * guard's job, and keeping them separate is what makes "a valid token for the
 * wrong school" a distinct, testable failure.
 */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly tokens: TokenService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic === true) {
      return true;
    }

    const request = context.switchToHttp().getRequest<FastifyRequest>();
    const token = extractToken(request);

    if (token === undefined) {
      throw new UnauthorizedException('Sign in to continue.');
    }

    try {
      request.claims = await this.tokens.verifyAccessToken(token);
    } catch {
      // Never echo why. "Expired" versus "malformed" is free information.
      throw new UnauthorizedException('Your session has expired. Sign in again.');
    }

    return true;
  }
}

function extractToken(request: FastifyRequest): string | undefined {
  const cookies = request.cookies as Record<string, string | undefined> | undefined;
  const fromCookie = cookies?.[COOKIES.accessToken];
  if (fromCookie !== undefined && fromCookie !== '') {
    return fromCookie;
  }

  const header = request.headers.authorization;
  if (header !== undefined && header.startsWith('Bearer ')) {
    return header.slice('Bearer '.length);
  }

  return undefined;
}
