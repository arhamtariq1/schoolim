import { Module } from '@nestjs/common';

import { ENV, type Env } from '../../config/env';
import { PrismaService } from '../../prisma/prisma.service';
import { PasswordService } from '../../shared/auth/password.service';
import { MAIL, type MailPort } from '../../shared/mail/mail.port';
import { clockProvider } from '../../shared/time/clock.provider';
import { AuthModule } from '../auth/auth.module';
import { HandoffService } from '../auth/handoff.service';

import { PublicController } from './public.controller';
import { SignupService } from './signup.service';

/**
 * Apex-only public surface. Imports AuthModule for HandoffService: after OTP
 * the new owner is handed onto the school host the same way apex sign-in is.
 */
@Module({
  imports: [AuthModule],
  controllers: [PublicController],
  providers: [
    clockProvider,
    {
      provide: SignupService,
      useFactory: (
        prisma: PrismaService,
        passwords: PasswordService,
        handoffs: HandoffService,
        mail: MailPort,
        env: Env,
      ) => new SignupService(prisma, passwords, handoffs, mail, env),
      inject: [PrismaService, PasswordService, HandoffService, MAIL, ENV],
    },
  ],
})
export class PublicModule {}
