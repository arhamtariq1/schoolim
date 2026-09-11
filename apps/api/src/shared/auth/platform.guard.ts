import { platformCan, type PlatformRole } from '@ilm/contracts';
import {
  CanActivate,
  Injectable,
  SetMetadata,
  UnauthorizedException,
  type ExecutionContext,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { type FastifyRequest } from 'fastify';

import { PrismaService } from '../../prisma/prisma.service';
import { PermissionDeniedError } from '../errors/domain-error';

export const IS_PLATFORM = 'auth:platform';
export const PLATFORM_CAPABILITY = 'auth:platform-capability';

/**
 * Mark a controller or handler as belonging to the **platform console**.
 *
 * This changes the whole guard chain for the route: the access token is read
 * from a different cookie, the tenant guard steps aside, and school RBAC is
 * replaced by the platform capability check below.
 */
export const PlatformRoute = (): MethodDecorator & ClassDecorator => SetMetadata(IS_PLATFORM, true);

/** Require a platform capability, e.g. `schools.create`. */
export const RequiresPlatform = (capability: string): MethodDecorator =>
  SetMetadata(PLATFORM_CAPABILITY, capability);

declare module 'fastify' {
  interface FastifyRequest {
    platformUser?: {
      id: string;
      name: string;
      email: string;
      role: PlatformRole;
    };
  }
}

/**
 * The platform half of the guard chain.
 *
 * Three things have to be true, and each one is a separate failure someone
 * could otherwise reason their way past:
 *
 * 1. **The token says `platform`.** A tenant token — even a school owner's —
 *    must never reach a route that can see every school. The token type is
 *    signed, so it cannot be edited into one.
 * 2. **The account still exists and is active, right now.** Read from the
 *    database on every request rather than trusted from the token: revoking a
 *    departing colleague's access has to take effect immediately, not in
 *    fifteen minutes when their access token happens to expire. This is the one
 *    console that can reach every tenant, so that window is not acceptable.
 * 3. **`tokenVersion` matches.** Bumping it invalidates every token that
 *    account holds, everywhere, at once.
 *
 * Only then is the capability checked. Reading the user costs a query per
 * request; the platform console serves a handful of staff, so it is free in
 * practice and worth far more than it costs.
 */
@Injectable()
export class PlatformGuard implements CanActivate {
  constructor(
    private readonly prisma: PrismaService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPlatform = this.reflector.getAllAndOverride<boolean>(IS_PLATFORM, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPlatform !== true) {
      return true;
    }

    const request = context.switchToHttp().getRequest<FastifyRequest>();
    const claims = request.claims;

    // No claims means the route was public (login). Nothing to authorise.
    if (claims === undefined) {
      return true;
    }

    if (claims.typ !== 'platform') {
      throw new UnauthorizedException('Sign in to continue.');
    }

    const user = await this.prisma.admin.platformUser.findUnique({
      where: { id: claims.sub },
      select: { id: true, name: true, email: true, role: true, isActive: true, tokenVersion: true },
    });

    if (user === null || !user.isActive || user.tokenVersion !== claims.ver) {
      throw new UnauthorizedException('Your session has ended. Sign in again.');
    }

    request.platformUser = {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
    };

    const capability = this.reflector.getAllAndOverride<string>(PLATFORM_CAPABILITY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (capability !== undefined && !platformCan(user.role, capability)) {
      throw new PermissionDeniedError(capability);
    }

    return true;
  }
}
