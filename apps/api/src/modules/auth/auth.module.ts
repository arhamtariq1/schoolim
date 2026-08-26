import { Module } from '@nestjs/common';

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
      // Tenant resolution moved out to `resolveTenantSlug`, called by the
      // controller, so the service no longer needs the apex domain at all.
      useFactory: (
        prisma: PrismaService,
        passwords: PasswordService,
        tokens: TokenService,
        sessions: SessionService,
      ) => new AuthService(prisma, passwords, tokens, sessions),
      inject: [PrismaService, PasswordService, TokenService, SessionService],
    },
  ],
  exports: [AuthService, SessionService],
})
export class AuthModule {}
