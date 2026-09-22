import { createHash, randomBytes, randomInt } from 'node:crypto';

import {
  type ForgotPasswordResendOtpResult,
  type ForgotPasswordResult,
  type ForgotPasswordVerifyOtpResult,
} from '@ilm/contracts';
import { Inject, Injectable, Logger } from '@nestjs/common';

import { PrismaService } from '../../prisma/prisma.service';
import { PasswordService } from '../../shared/auth/password.service';
import { BusinessRuleError } from '../../shared/errors/domain-error';
import { MAIL, type MailPort } from '../../shared/mail/mail.port';
import { passwordResetOtpTemplate } from '../../shared/mail/templates/password-reset-otp.template';

import { SessionService } from './session.service';

/**
 * Forgot-password: email → OTP → new password.
 *
 * Runs on the **admin** connection (no session yet). OTP and the later reset
 * token both live in `password_resets.token_hash` — OTP first, then replaced by
 * a long opaque token once the code checks out.
 */

const OTP_TTL_MINUTES = 10;
const RESET_TOKEN_TTL_MINUTES = 30;
const RESEND_COOLDOWN_SECONDS = 60;
/** Distinguishes an OTP hash from a post-verify reset-token hash. */
const OTP_PREFIX = 'otp:';

@Injectable()
export class PasswordResetService {
  private readonly logger = new Logger(PasswordResetService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly passwords: PasswordService,
    private readonly sessions: SessionService,
    @Inject(MAIL) private readonly mail: MailPort,
  ) {}

  /**
   * @param schoolSlug When set (school host), only that school's account counts.
   *   On the apex, any active account with the email is enough.
   */
  async request(
    email: string,
    now: Date,
    schoolSlug: string | undefined,
  ): Promise<ForgotPasswordResult> {
    const user = await this.findActiveUser(email, schoolSlug);
    if (user === undefined) {
      throw new BusinessRuleError(
        'AUTH_EMAIL_NOT_FOUND',
        'No account uses that email. Check the address and try again.',
      );
    }

    const code = formatOtp(randomInt(0, 1_000_000));
    const otpExpiresAt = addMinutes(now, OTP_TTL_MINUTES);

    await this.prisma.admin.passwordReset.updateMany({
      where: { userId: user.id, usedAt: null },
      data: { usedAt: now },
    });

    await this.prisma.admin.passwordReset.create({
      data: {
        schoolId: user.schoolId,
        userId: user.id,
        tokenHash: hashToken(`${OTP_PREFIX}${code}`),
        expiresAt: otpExpiresAt,
      },
    });

    const sent = await this.mail.send(
      passwordResetOtpTemplate({
        to: user.email,
        recipientName: user.name,
        code,
        expiresInMinutes: OTP_TTL_MINUTES,
      }),
    );

    if (!sent.sent) {
      this.logger.warn(
        { email: user.email, error: sent.error },
        'Password-reset OTP email did not go out',
      );
      throw new BusinessRuleError(
        'AUTH_OTP_INVALID',
        'Could not send the code. Try again in a moment.',
      );
    }

    return { email: user.email, otpExpiresAt: otpExpiresAt.toISOString() };
  }

  async resend(
    email: string,
    now: Date,
    schoolSlug: string | undefined,
  ): Promise<ForgotPasswordResendOtpResult> {
    const user = await this.findActiveUser(email, schoolSlug);
    if (user === undefined) {
      throw new BusinessRuleError(
        'AUTH_EMAIL_NOT_FOUND',
        'No account uses that email. Check the address and try again.',
      );
    }

    const latest = await this.prisma.admin.passwordReset.findFirst({
      where: { userId: user.id, usedAt: null, expiresAt: { gt: now } },
      orderBy: { createdAt: 'desc' },
    });

    if (latest !== null) {
      const elapsed = (now.getTime() - latest.createdAt.getTime()) / 1000;
      if (elapsed < RESEND_COOLDOWN_SECONDS) {
        return {
          sent: false,
          retryAfterSeconds: Math.ceil(RESEND_COOLDOWN_SECONDS - elapsed),
        };
      }
    }

    const result = await this.request(email, now, schoolSlug);
    return { sent: true, otpExpiresAt: result.otpExpiresAt };
  }

  async verifyOtp(
    email: string,
    code: string,
    now: Date,
    schoolSlug: string | undefined,
  ): Promise<ForgotPasswordVerifyOtpResult> {
    const user = await this.findActiveUser(email, schoolSlug);
    if (user === undefined) {
      throw new BusinessRuleError(
        'AUTH_EMAIL_NOT_FOUND',
        'No account uses that email. Check the address and try again.',
      );
    }

    const row = await this.prisma.admin.passwordReset.findFirst({
      where: { userId: user.id, usedAt: null, expiresAt: { gt: now } },
      orderBy: { createdAt: 'desc' },
    });

    if (row === null) {
      throw new BusinessRuleError(
        'AUTH_OTP_EXPIRED',
        'That code has expired. Ask for a new one.',
      );
    }

    if (hashToken(`${OTP_PREFIX}${code}`) !== row.tokenHash) {
      throw new BusinessRuleError(
        'AUTH_OTP_INVALID',
        'That code is not correct. Check the email and try again.',
      );
    }

    const resetToken = randomBytes(32).toString('base64url');
    const resetExpiresAt = addMinutes(now, RESET_TOKEN_TTL_MINUTES);

    await this.prisma.admin.passwordReset.update({
      where: { id: row.id },
      data: {
        tokenHash: hashToken(resetToken),
        expiresAt: resetExpiresAt,
      },
    });

    return { email: user.email, resetToken };
  }

  async reset(token: string, password: string, now: Date): Promise<{ email: string }> {
    const row = await this.prisma.admin.passwordReset.findUnique({
      where: { tokenHash: hashToken(token) },
      include: { user: { select: { id: true, email: true, status: true, deletedAt: true } } },
    });

    if (
      row === null ||
      row.usedAt !== null ||
      row.expiresAt.getTime() <= now.getTime() ||
      row.user.deletedAt !== null ||
      row.user.status !== 'ACTIVE'
    ) {
      throw new BusinessRuleError(
        'AUTH_RESET_TOKEN_INVALID',
        'That reset link has expired. Start again from forgot password.',
      );
    }

    const passwordHash = await this.passwords.hash(password);

    await this.prisma.admin.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: row.userId },
        data: {
          passwordHash,
          mustChangePassword: false,
          failedLoginCount: 0,
          lockedUntil: null,
          tokenVersion: { increment: 1 },
        },
      });
      await tx.passwordReset.update({
        where: { id: row.id },
        data: { usedAt: now },
      });
      await tx.passwordReset.updateMany({
        where: { userId: row.userId, usedAt: null, id: { not: row.id } },
        data: { usedAt: now },
      });
    });

    await this.sessions.revokeAllForUser(row.userId, now, 'password-reset');

    return { email: row.user.email };
  }

  private async findActiveUser(
    email: string,
    schoolSlug: string | undefined,
  ): Promise<{ id: string; schoolId: string; email: string; name: string } | undefined> {
    if (schoolSlug !== undefined) {
      const school = await this.prisma.admin.school.findUnique({
        where: { slug: schoolSlug },
        select: { id: true },
      });
      if (school === null) {
        return undefined;
      }

      const user = await this.prisma.admin.user.findFirst({
        where: {
          schoolId: school.id,
          email,
          deletedAt: null,
          status: 'ACTIVE',
        },
        select: { id: true, schoolId: true, email: true, name: true },
      });
      return user ?? undefined;
    }

    const user = await this.prisma.admin.user.findFirst({
      where: { email, deletedAt: null, status: 'ACTIVE' },
      select: { id: true, schoolId: true, email: true, name: true },
      orderBy: { createdAt: 'asc' },
    });
    return user ?? undefined;
  }
}

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

function formatOtp(value: number): string {
  return value.toString().padStart(6, '0');
}

function addMinutes(now: Date, minutes: number): Date {
  return new Date(now.getTime() + minutes * 60 * 1000);
}
