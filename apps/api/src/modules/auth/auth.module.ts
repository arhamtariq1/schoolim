import { Module } from '@nestjs/common';

import { ENV, type Env } from '../../config/env';
import { PasswordService } from '../../shared/auth/password.service';
import { TokenService } from '../../shared/auth/token.service';
import { PrismaService } from '../../shared/prisma/prisma.service';
import { clockProvider } from '../../shared/time/clock.provider';

import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { EmailVerificationService } from './email-verification.service';
import { HandoffService } from './handoff.service';
import { SessionService } from './session.service';

@Module({
  controllers: [AuthController],
  providers: [
    clockProvider,
    SessionService,
    HandoffService,
    EmailVerificationService,
    {
      provide: AuthService,
      // The apex domain is back, and for one reason: sign-in at the apex has to
      // hand the browser an absolute URL on the school's own hostname, and only
      // the environment knows what that hostname looks like (ADR-0009). Tenant
      // *resolution* still happens in the controller via `resolveTenantSlug`.
      useFactory: (
        prisma: PrismaService,
        passwords: PasswordService,
        tokens: TokenService,
        sessions: SessionService,
        handoffs: HandoffService,
        env: Env,
      ) => new AuthService(prisma, passwords, tokens, sessions, handoffs, env),
      inject: [PrismaService, PasswordService, TokenService, SessionService, HandoffService, ENV],
    },
  ],
  exports: [AuthService, SessionService, HandoffService, EmailVerificationService],
})
export class AuthModule {}
