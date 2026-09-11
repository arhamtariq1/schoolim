import { Module } from '@nestjs/common';

import { ENV, type Env } from '../../config/env';
import { PrismaService } from '../../prisma/prisma.service';
import { PasswordService } from '../../shared/auth/password.service';
import { clockProvider } from '../../shared/time/clock.provider';
import { AuthModule } from '../auth/auth.module';
import { EmailVerificationService } from '../auth/email-verification.service';
import { HandoffService } from '../auth/handoff.service';

import { PublicController } from './public.controller';
import { SignupService } from './signup.service';

/**
 * `AuthModule` is imported for `HandoffService` rather than re-providing it:
 * signup finishes by signing the new owner in, and it must mint the same kind
 * of handoff that sign-in does. Two mints with two TTLs would be two things to
 * keep in step.
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
        verification: EmailVerificationService,
        env: Env,
      ) => new SignupService(prisma, passwords, handoffs, verification, env),
      inject: [PrismaService, PasswordService, HandoffService, EmailVerificationService, ENV],
    },
  ],
})
export class PublicModule {}
