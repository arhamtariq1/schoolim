import { Module } from '@nestjs/common';

import { ENV, type Env } from '../../config/env';
import { PrismaService } from '../../prisma/prisma.service';
import { PasswordService } from '../../shared/auth/password.service';
import { MAIL, type MailPort } from '../../shared/mail/mail.port';
import { clockProvider } from '../../shared/time/clock.provider';
import { PublicController } from './public.controller';
import { SignupService } from './signup.service';

/** Apex-only public surface (signup, slug checks, legacy complete). */
@Module({
  controllers: [PublicController],
  providers: [
    clockProvider,
    {
      provide: SignupService,
      useFactory: (prisma: PrismaService, passwords: PasswordService, mail: MailPort, env: Env) =>
        new SignupService(prisma, passwords, mail, env),
      inject: [PrismaService, PasswordService, MAIL, ENV],
    },
  ],
})
export class PublicModule {}
