import { schoolSlugFromHost } from '@ilm/utils';
import { CanActivate, Inject, Injectable, type ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { type FastifyRequest } from 'fastify';

import { ENV, type Env } from '../../config/env';
import { IS_PUBLIC } from '../auth/auth.guard';
import { TenantMismatchError } from '../errors/domain-error';
import { PrismaService } from '../prisma/prisma.service';

import { TenantContextService } from './tenant-context.service';

/**
 * Second guard in the chain, and the whole of layer 1 (docs/04 section 2).
 *
 * It checks the JWT tenant claim **and** the request host, and a mismatch is a
 * 401. Checking only the claim would mean a token stolen from one school works
 * against any school's hostname; checking only the host would mean anyone can
 * pick a tenant by editing a header. Both, or neither is worth anything.
 *
 * The host-to-school lookup runs on the **admin** connection, necessarily: it
 * happens before any tenant context exists, so a tenant-scoped query would
 * return nothing and every request would fail closed. That is why
 * `school_domains` is deliberately exempt from RLS — see TENANT_RLS_EXEMPT_TABLES.
 */
@Injectable()
export class TenantGuard implements CanActivate {
  constructor(
    @Inject(ENV) private readonly env: Env,
    private readonly prisma: PrismaService,
    private readonly context: TenantContextService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(execution: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, [
      execution.getHandler(),
      execution.getClass(),
    ]);
    if (isPublic === true) {
      return true;
    }

    const request = execution.switchToHttp().getRequest<FastifyRequest>();
    const claims = request.claims;

    if (claims === undefined) {
      // AuthGuard runs first and would have rejected. Defence in depth: this
      // guard must be safe even if the chain is reordered by mistake.
      throw new TenantMismatchError();
    }

    // A platform token must never satisfy a tenant route.
    if (claims.typ !== 'tenant') {
      throw new TenantMismatchError();
    }

    const slug = schoolSlugFromHost(request.headers.host, this.env.APP_DOMAIN);
    if (slug === undefined) {
      throw new TenantMismatchError();
    }

    const school = await this.prisma.admin.school.findUnique({
      where: { slug },
      select: { id: true, status: true },
    });

    if (school === null || school.id !== claims.sid) {
      // Same error whether the school does not exist or the token belongs to a
      // different one. Distinguishing them would confirm which slugs are real.
      throw new TenantMismatchError();
    }

    this.context.set({
      schoolId: school.id,
      userId: claims.sub,
      roles: claims.rol,
      ...(claims.act === undefined ? {} : { actingPlatformUserId: claims.act }),
    });

    return true;
  }
}
