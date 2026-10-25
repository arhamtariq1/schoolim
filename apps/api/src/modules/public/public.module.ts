import { Module } from '@nestjs/common';

import { ENV, type Env } from '../../config/env';
import { AuthModule } from '../auth/auth.module';
import { HandoffService } from '../auth/handoff.service';
import { PrismaService } from '../../prisma/prisma.service';
import { PasswordService } from '../../shared/auth/password.service';
import { MAIL, type MailPort } from '../../shared/mail/mail.port';
import { clockProvider } from '../../shared/time/clock.provider';

import { PublicPlansService } from './public-plans.service';
import { PublicController } from './public.controller';
import { SignupService } from './signup.service';

/** Apex-only public surface (signup, slug checks, legacy complete). */
@Module({
  imports: [AuthModule],
  controllers: [PublicController],
  providers: [
    clockProvider,
    PublicPlansService,
    {
      provide: SignupService,
      useFactory: (
        prisma: PrismaService,
        passwords: PasswordService,
        mail: MailPort,
        handoffs: HandoffService,
        env: Env,
      ) => new SignupService(prisma, passwords, mail, handoffs, env),
      inject: [PrismaService, PasswordService, MAIL, HandoffService, ENV],
    },
  ],
})
export class PublicModule {}
