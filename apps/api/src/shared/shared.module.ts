import { Global, Module } from '@nestjs/common';

import { ENV, loadEnv, type Env } from '../config/env';
import { PrismaService } from '../prisma/prisma.service';

import { PasswordService } from './auth/password.service';
import { TokenService } from './auth/token.service';
import { LogMailer } from './mail/log.mailer';
import { MAIL, type MailPort } from './mail/mail.port';
import { SmtpMailer } from './mail/smtp.mailer';
import { SchoolDirectoryService } from './tenancy/school-directory.service';
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
    SchoolDirectoryService,
    PrismaService,
    TokenService,
    PasswordService,
    {
      provide: MAIL,
      // The driver is chosen once, at boot, from configuration — not per call
      // site. That is the whole point of the port (ADR-0011): a service that
      // sends mail never learns which transport carried it.
      useFactory: (env: Env): MailPort =>
        env.MAIL_DRIVER === 'smtp' ? new SmtpMailer(env) : new LogMailer(),
      inject: [ENV],
    },
  ],
  exports: [
    ENV,
    TenantContextService,
    SchoolDirectoryService,
    PrismaService,
    TokenService,
    PasswordService,
    MAIL,
  ],
})
export class SharedModule {}
