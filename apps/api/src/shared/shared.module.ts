import { systemClock } from '@ilm/utils';
import { Global, Module } from '@nestjs/common';

import { ENV, loadEnv, type Env } from '../config/env';
import { PrismaService } from '../prisma/prisma.service';

import { PasswordService } from './auth/password.service';
import { TokenService } from './auth/token.service';
import { LogMailer } from './mail/log.mailer';
import { MAIL, type MailPort } from './mail/mail.port';
import { SmtpMailer } from './mail/smtp.mailer';
import { CloudinaryStore } from './storage/cloudinary.store';
import { DatabaseStore } from './storage/database.store';
import { STORAGE, type StoragePort } from './storage/storage.port';
import { StorageRouter } from './storage/storage.router';
import { SchoolDirectoryService } from './tenancy/school-directory.service';
import { TenantContextService } from './tenancy/tenant-context.service';

/**
 * The remote driver, when one is configured.
 *
 * Returns undefined rather than throwing on missing credentials: the env schema
 * has already refused to start a process that names `cloudinary` without them,
 * so reaching here with a gap would be a bug in that check. The narrowing is
 * what turns those three optional strings into the non-optional config the
 * driver wants, without a cast.
 */
function remoteStore(env: Env): StoragePort | undefined {
  if (
    env.STORAGE_DRIVER !== 'cloudinary' ||
    env.CLOUDINARY_CLOUD_NAME === undefined ||
    env.CLOUDINARY_API_KEY === undefined ||
    env.CLOUDINARY_API_SECRET === undefined
  ) {
    return undefined;
  }

  return new CloudinaryStore(
    {
      cloudName: env.CLOUDINARY_CLOUD_NAME,
      apiKey: env.CLOUDINARY_API_KEY,
      apiSecret: env.CLOUDINARY_API_SECRET,
      prefix: env.CLOUDINARY_FOLDER,
      timeoutMs: env.CLOUDINARY_TIMEOUT_MS,
    },
    systemClock,
  );
}

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
      provide: STORAGE,
      // Same shape as MAIL below, and for the same reason (ADR-0011, ADR-0013):
      // the driver is chosen once, at boot, from configuration — never per call
      // site. A service that stores a file does not learn where it went.
      //
      // The router is always present, even with no remote driver, because the
      // rule it enforces is not a deployment setting: private assets stay in
      // the database whatever is configured.
      useFactory: (env: Env): StoragePort =>
        new StorageRouter(new DatabaseStore(), remoteStore(env)),
      inject: [ENV],
    },
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
    STORAGE,
  ],
})
export class SharedModule {}
