import { Global, Module } from '@nestjs/common';

import { ENV, loadEnv } from '../config/env';

import { PasswordService } from './auth/password.service';
import { TokenService } from './auth/token.service';
import { PrismaService } from './prisma/prisma.service';
import { TenantContextService } from './tenancy/tenant-context.service';

/**
 * Cross-cutting infrastructure, available to every feature module.
 *
 * Marked `@Global` deliberately. NestJS modules do not inherit providers, so
 * without this every feature module would have to import a database module, an
 * auth module and a tenancy module — and the one that forgets is the one where
 * a developer reaches for a second Prisma client instead. There is exactly one
 * database connection pair in this process (see PrismaService), and making it
 * globally available is what keeps that true.
 *
 * Feature modules must still declare their own domain providers. `@Global` is
 * for infrastructure only, never for business services.
 */
@Global()
@Module({
  providers: [
    { provide: ENV, useFactory: () => loadEnv() },
    TenantContextService,
    PrismaService,
    TokenService,
    PasswordService,
  ],
  exports: [ENV, TenantContextService, PrismaService, TokenService, PasswordService],
})
export class SharedModule {}
