import { Module } from '@nestjs/common';

import { ENV, type Env } from '../../config/env';
import { PasswordService } from '../../shared/auth/password.service';
import { TokenService } from '../../shared/auth/token.service';
import { PrismaService } from '../../shared/prisma/prisma.service';
import { clockProvider } from '../../shared/time/clock.provider';

import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { SessionService } from './session.service';

@Module({
  controllers: [AuthController],
  providers: [
    clockProvider,
    SessionService,
    {
      provide: AuthService,
      // The apex domain is injected rather than read inside the service, so the
      // host-to-school derivation can be tested without an environment.
      useFactory: (
        prisma: PrismaService,
        passwords: PasswordService,
        tokens: TokenService,
        sessions: SessionService,
        env: Env,
      ) => new AuthService(prisma, passwords, tokens, sessions, env.APP_DOMAIN),
      inject: [PrismaService, PasswordService, TokenService, SessionService, ENV],
    },
  ],
  exports: [AuthService, SessionService],
})
export class AuthModule {}
