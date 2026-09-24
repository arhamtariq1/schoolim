import { createHash, randomBytes, randomInt } from 'node:crypto';

import {
  RESERVED_SLUGS,
  TRIAL_DAYS,
  type SignupCompleteRequest,
  type SignupResendOtpResult,
  type SignupResult,
  type SignupStartRequest,
  type SignupStartResult,
  type SignupStatus,
  type SignupVerifyOtpResult,
  type SlugAvailability,
} from '@ilm/contracts';
import { Inject, Injectable, Logger } from '@nestjs/common';

import { ENV, type Env } from '../../config/env';
import { PrismaService } from '../../prisma/prisma.service';
import { PasswordService } from '../../shared/auth/password.service';
import { BusinessRuleError, ConflictError } from '../../shared/errors/domain-error';
import { MAIL, type MailPort } from '../../shared/mail/mail.port';
import { signupOtpTemplate } from '../../shared/mail/templates/signup-otp.template';
import { schoolOrigin } from '../../shared/tenancy/school-origin';
import { HandoffService } from '../auth/handoff.service';
import { decodeAndVerify } from '../schools/school-logo.service';

/**
 * Self-serve signup — credentials → OTP (creates tenant) → /profile onboarding.
 *
 * Runs on the **admin** connection until the school exists; after OTP the owner
 * holds a real session on the school host.
 */

/** Overall intent lifetime. Restart from /signup after this. */
const INTENT_TTL_HOURS = 24;
/** OTP window — short; resend is free. */
const OTP_TTL_MINUTES = 10;
const RESEND_COOLDOWN_SECONDS = 60;
const MAX_OTP_ATTEMPTS = 5;

export interface SignupCookieContext {
  readonly ip?: string | undefined;
  readonly userAgent?: string | undefined;
}

export interface SignupStartOutcome {
  readonly result: SignupStartResult;
  /** Cleartext cookie value. Never logged. */
  readonly sessionToken: string;
  readonly expiresAt: Date;
}

@Injectable()
export class SignupService {
  private readonly logger = new Logger(SignupService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly passwords: PasswordService,
    private readonly handoffs: HandoffService,
    @Inject(MAIL) private readonly mail: MailPort,
    @Inject(ENV) private readonly env: Env,
  ) {}

  async checkSlug(slug: string): Promise<SlugAvailability> {
    const normalised = slug.trim().toLowerCase();

    if (normalised.length < 2 || !SLUG_SHAPE.test(normalised)) {
      return { slug: normalised, available: false, reason: 'invalid' };
    }

    if (RESERVED_SLUGS.has(normalised)) {
      return { slug: normalised, available: false, reason: 'reserved' };
    }

    const existing = await this.prisma.admin.school.findUnique({
      where: { slug: normalised },
      select: { id: true },
    });

    return existing === null
      ? { slug: normalised, available: true }
      : { slug: normalised, available: false, reason: 'taken' };
  }

  /**
   * Step 1 — store credentials, mail a 6-digit OTP, return a cookie token.
   */
  async start(
    input: SignupStartRequest,
    now: Date,
    context: SignupCookieContext,
  ): Promise<SignupStartOutcome> {
    const passwordHash = await this.passwords.hash(input.password);
    const sessionToken = randomBytes(32).toString('base64url');
    const code = formatOtp(randomInt(0, 1_000_000));
    const otpExpiresAt = addMinutes(now, OTP_TTL_MINUTES);
    const expiresAt = addHours(now, INTENT_TTL_HOURS);

    // One active intent per email: replace any open attempt so a mistyped
    // password on the first try does not leave a stranded row forever.
    await this.prisma.admin.signupIntent.deleteMany({
      where: {
        email: input.email,
        completedAt: null,
      },
    });

    await this.prisma.admin.signupIntent.create({
      data: {
        email: input.email,
        name: input.name,
        passwordHash,
        termsVersion: input.termsVersion,
        otpHash: hashToken(code),
        otpExpiresAt,
        otpSentAt: now,
        otpAttempts: 0,
        sessionTokenHash: hashToken(sessionToken),
        expiresAt,
        ip: context.ip ?? null,
        userAgent: context.userAgent ?? null,
      },
    });

    const sent = await this.mail.send(
      signupOtpTemplate({
        to: input.email,
        recipientName: input.name,
        code,
        expiresInMinutes: OTP_TTL_MINUTES,
      }),
    );

    if (!sent.sent) {
      this.logger.warn(
        { email: input.email, error: sent.error },
        'Signup OTP email did not go out; the person can resend',
      );
    }

    return {
      sessionToken,
      expiresAt,
      result: {
        email: input.email,
        otpExpiresAt: otpExpiresAt.toISOString(),
      },
    };
  }

  async status(sessionToken: string | undefined, now: Date): Promise<SignupStatus> {
    const intent = await this.requireIntent(sessionToken, now);
    return {
      email: intent.email,
      step: 'otp',
    };
  }

  /**
   * Abandon the in-progress signup so the person can type a different email.
   *
   * Deletes the open intent and leaves the cookie for the controller to clear.
   * No-op when there is nothing to cancel — Back / Start over must always land
   * on a clean credentials form.
   */
  async cancel(sessionToken: string | undefined): Promise<void> {
    if (sessionToken === undefined || sessionToken === '') {
      return;
    }

    await this.prisma.admin.signupIntent.deleteMany({
      where: {
        sessionTokenHash: hashToken(sessionToken),
        completedAt: null,
      },
    });
  }

  async verifyOtp(
    sessionToken: string | undefined,
    code: string,
    now: Date,
    context: SignupCookieContext,
  ): Promise<SignupVerifyOtpResult> {
    const intent = await this.requireIntent(sessionToken, now);

    // OTP must still be valid unless we already stamped emailVerifiedAt in a
    // prior attempt that created nothing (should not happen — verify + provision
    // share one transaction). Requiring the code again keeps retries honest.
    if (intent.emailVerifiedAt === null) {
      if (intent.otpHash === null || intent.otpExpiresAt === null) {
        throw new BusinessRuleError(
          'SIGNUP_OTP_EXPIRED',
          'That code has expired. Ask for a new one.',
        );
      }

      if (intent.otpExpiresAt.getTime() <= now.getTime()) {
        throw new BusinessRuleError(
          'SIGNUP_OTP_EXPIRED',
          'That code has expired. Ask for a new one.',
        );
      }

      if (intent.otpAttempts >= MAX_OTP_ATTEMPTS) {
        throw new BusinessRuleError(
          'SIGNUP_OTP_INVALID',
          'Too many incorrect attempts. Ask for a new code.',
        );
      }

      if (hashToken(code) !== intent.otpHash) {
        await this.prisma.admin.signupIntent.update({
          where: { id: intent.id },
          data: { otpAttempts: { increment: 1 } },
        });
        throw new BusinessRuleError(
          'SIGNUP_OTP_INVALID',
          'That code is not correct. Check the email and try again.',
        );
      }
    }

    // Create the tenant and hand the browser onto the school host at /profile.
    // Email verification is stamped in the same transaction as the school.
    return this.provisionAfterOtp(intent.id, now, context);
  }

  /**
   * Create the school + owner and mint a handoff onto `/profile`.
   *
   * School details are provisional — the owner finishes them inside the portal
   * before `profileCompleted` unlocks navigation.
   */
  private async provisionAfterOtp(
    intentId: string,
    now: Date,
    context: SignupCookieContext,
  ): Promise<SignupVerifyOtpResult> {
    const intent = await this.prisma.admin.signupIntent.findUnique({ where: { id: intentId } });
    if (intent === null || intent.completedAt !== null) {
      throw new BusinessRuleError(
        'SIGNUP_SESSION_REQUIRED',
        'Your signup session has ended. Start again from the beginning.',
      );
    }

    const trialEndsAt = addDays(now, TRIAL_DAYS);
    const slug = await this.allocateProvisionalSlug(intent.email);
    const emailVerifiedAt = intent.emailVerifiedAt ?? now;

    const created = await this.prisma.admin
      .$transaction(async (tx) => {
        // Claim the intent first so a double-submit cannot mint two schools.
        const claimed = await tx.signupIntent.updateMany({
          where: { id: intent.id, completedAt: null },
          data: {
            emailVerifiedAt,
            otpHash: null,
            otpExpiresAt: null,
            otpAttempts: 0,
            completedAt: now,
          },
        });
        if (claimed.count !== 1) {
          throw new BusinessRuleError(
            'SIGNUP_SESSION_REQUIRED',
            'Your signup session has ended. Start again from the beginning.',
          );
        }

        const school = await tx.school.create({
          data: {
            name: `${intent.name}'s School`,
            slug,
            email: intent.email,
            timezone: 'Asia/Karachi',
            locale: 'en',
            status: 'TRIAL',
            // Stays null until /profile onboarding saves real school details.
            onboardedAt: null,
            trialEndsAt,
          },
          select: { id: true, name: true, slug: true },
        });

        const owner = await tx.user.create({
          data: {
            schoolId: school.id,
            email: intent.email,
            name: intent.name,
            passwordHash: intent.passwordHash,
            status: 'ACTIVE',
            mustChangePassword: false,
            emailVerifiedAt,
            profileCompletedAt: null,
          },
          select: { id: true },
        });

        await tx.userRole.create({
          data: { schoolId: school.id, userId: owner.id, role: 'OWNER' },
        });

        await tx.schoolAgreement.create({
          data: {
            schoolId: school.id,
            documentType: 'TERMS_OF_SERVICE',
            version: intent.termsVersion,
            acceptedAt: now,
            acceptedByUserId: owner.id,
            acceptedByName: intent.name,
            acceptedByEmail: intent.email,
            ip: context.ip ?? null,
            userAgent: context.userAgent ?? null,
          },
        });

        await tx.auditLog.create({
          data: {
            schoolId: school.id,
            action: 'school.signup',
            entityType: 'School',
            entityId: school.id,
            actorType: 'USER',
            actorUserId: owner.id,
            after: {
              name: school.name,
              slug: school.slug,
              status: 'TRIAL',
              provisional: true,
              trialEndsAt: trialEndsAt.toISOString(),
            },
            ip: context.ip ?? null,
            userAgent: context.userAgent ?? null,
            at: now,
          },
        });

        return { school, ownerId: owner.id };
      })
      .catch((error: unknown) => {
        if (isUniqueViolation(error)) {
          throw new ConflictError(
            'Could not reserve a web address for your school. Try signup again in a moment.',
          );
        }
        throw error;
      });

    this.logger.log(
      { schoolId: created.school.id, slug: created.school.slug },
      'School provisioned after signup OTP',
    );

    const token = await this.handoffs.mint(created.school.id, created.ownerId, now, context);
    const origin = schoolOrigin(
      created.school.slug,
      this.env.APP_DOMAIN,
      this.env.WEB_URL,
      this.env.PORTAL_TENANT_MODE,
    );

    return {
      email: intent.email,
      verified: true,
      continueTo: {
        schoolId: created.school.id,
        name: created.school.name,
        slug: created.school.slug,
        // Land on /profile so onboarding is the first authenticated screen.
        continueUrl: `${origin}/auth/continue?t=${token}&next=${encodeURIComponent('/profile/create')}`,
      },
    };
  }

  /** Unique slug from the email local-part; never a reserved name. */
  private async allocateProvisionalSlug(email: string): Promise<string> {
    const base = slugBaseFromEmail(email);
    for (let attempt = 0; attempt < 12; attempt += 1) {
      const candidate =
        attempt === 0 ? base : `${base.slice(0, 40)}-${randomBytes(2).toString('hex')}`;
      if (RESERVED_SLUGS.has(candidate) || !SLUG_SHAPE.test(candidate) || candidate.length < 2) {
        continue;
      }
      const taken = await this.prisma.admin.school.findUnique({
        where: { slug: candidate },
        select: { id: true },
      });
      if (taken === null) {
        return candidate;
      }
    }
    return `school-${randomBytes(4).toString('hex')}`;
  }

  async resendOtp(
    sessionToken: string | undefined,
    now: Date,
  ): Promise<SignupResendOtpResult> {
    const intent = await this.requireIntent(sessionToken, now);

    if (intent.emailVerifiedAt !== null) {
      return { sent: false };
    }

    if (intent.otpSentAt !== null) {
      const elapsed = (now.getTime() - intent.otpSentAt.getTime()) / 1000;
      if (elapsed < RESEND_COOLDOWN_SECONDS) {
        return {
          sent: false,
          retryAfterSeconds: Math.ceil(RESEND_COOLDOWN_SECONDS - elapsed),
        };
      }
    }

    const code = formatOtp(randomInt(0, 1_000_000));
    const otpExpiresAt = addMinutes(now, OTP_TTL_MINUTES);

    const sent = await this.mail.send(
      signupOtpTemplate({
        to: intent.email,
        recipientName: intent.name,
        code,
        expiresInMinutes: OTP_TTL_MINUTES,
      }),
    );

    if (!sent.sent) {
      // Keep the previous OTP alive — same rule as email-verification.service.
      return { sent: false };
    }

    await this.prisma.admin.signupIntent.update({
      where: { id: intent.id },
      data: {
        otpHash: hashToken(code),
        otpExpiresAt,
        otpSentAt: now,
        otpAttempts: 0,
      },
    });

    return { sent: true, otpExpiresAt: otpExpiresAt.toISOString() };
  }

  /**
   * Step 3 — create the school and owner, then send them to sign in.
   *
   * `emailVerifiedAt` is set on the user because the OTP already proved the
   * address. The intent row is marked completed and is no longer usable.
   * Profile stays incomplete so the first real session lands on `/profile`.
   *
   * @deprecated Prefer OTP provision + `/me/onboarding`. Kept for older clients
   * that still POST school details against a live signup cookie.
   */
  async complete(
    sessionToken: string | undefined,
    input: SignupCompleteRequest,
    now: Date,
    context: SignupCookieContext,
  ): Promise<SignupResult> {
    const intent = await this.requireIntent(sessionToken, now);

    if (intent.emailVerifiedAt === null) {
      throw new BusinessRuleError(
        'SIGNUP_EMAIL_UNVERIFIED',
        'Confirm the code we emailed you before setting up the school.',
      );
    }

    if (RESERVED_SLUGS.has(input.school.slug)) {
      throw new ConflictError(`"${input.school.slug}" is reserved. Choose another short name.`);
    }

    const trialEndsAt = addDays(now, TRIAL_DAYS);

    const created = await this.prisma.admin
      .$transaction(async (tx) => {
        const school = await tx.school.create({
          data: {
            name: input.school.name,
            slug: input.school.slug,
            city: input.school.city,
            phone: input.school.phone,
            email: input.school.email,
            timezone: input.school.timezone,
            locale: input.school.locale,
            status: 'TRIAL',
            onboardedAt: now,
            trialEndsAt,
          },
          select: { id: true, name: true, slug: true },
        });

        const owner = await tx.user.create({
          data: {
            schoolId: school.id,
            email: intent.email,
            name: intent.name,
            passwordHash: intent.passwordHash,
            status: 'ACTIVE',
            mustChangePassword: false,
            // OTP already proved this address.
            emailVerifiedAt: intent.emailVerifiedAt,
            // First login must finish the profile form before the rest of the portal.
            profileCompletedAt: null,
          },
          select: { id: true },
        });

        await tx.userRole.create({
          data: { schoolId: school.id, userId: owner.id, role: 'OWNER' },
        });

        if (input.logo !== undefined) {
          const { bytes, etag } = decodeAndVerify(input.logo);
          await tx.schoolLogo.create({
            data: {
              schoolId: school.id,
              bytes: new Uint8Array(bytes),
              mimeType: input.logo.mimeType,
              etag,
              byteSize: bytes.byteLength,
              createdBy: owner.id,
            },
          });
        }

        await tx.schoolAgreement.create({
          data: {
            schoolId: school.id,
            documentType: 'TERMS_OF_SERVICE',
            version: intent.termsVersion,
            acceptedAt: now,
            acceptedByUserId: owner.id,
            acceptedByName: intent.name,
            acceptedByEmail: intent.email,
            ip: context.ip ?? null,
            userAgent: context.userAgent ?? null,
          },
        });

        await tx.auditLog.create({
          data: {
            schoolId: school.id,
            action: 'school.signup',
            entityType: 'School',
            entityId: school.id,
            actorType: 'USER',
            actorUserId: owner.id,
            after: {
              name: school.name,
              slug: school.slug,
              status: 'TRIAL',
              trialEndsAt: trialEndsAt.toISOString(),
            },
            ip: context.ip ?? null,
            userAgent: context.userAgent ?? null,
            at: now,
          },
        });

        await tx.signupIntent.update({
          where: { id: intent.id },
          data: { completedAt: now },
        });

        return { school, ownerId: owner.id };
      })
      .catch((error: unknown) => {
        if (isUniqueViolation(error)) {
          throw new ConflictError(
            `A school already uses the short name "${input.school.slug}". Try another.`,
          );
        }
        throw error;
      });

    this.logger.log(
      { schoolId: created.school.id, slug: created.school.slug },
      'School signed up self-serve',
    );

    const origin = schoolOrigin(
      created.school.slug,
      this.env.APP_DOMAIN,
      this.env.WEB_URL,
      this.env.PORTAL_TENANT_MODE,
    );

    return {
      school: created.school,
      trialEndsAt: trialEndsAt.toISOString(),
      email: intent.email,
      loginUrl: `${origin}/login?email=${encodeURIComponent(intent.email)}`,
    };
  }

  private async requireIntent(sessionToken: string | undefined, now: Date) {
    if (sessionToken === undefined || sessionToken === '') {
      throw new BusinessRuleError(
        'SIGNUP_SESSION_REQUIRED',
        'Your signup session has ended. Start again from the beginning.',
      );
    }

    const intent = await this.prisma.admin.signupIntent.findUnique({
      where: { sessionTokenHash: hashToken(sessionToken) },
    });

    if (
      intent === null ||
      intent.completedAt !== null ||
      intent.expiresAt.getTime() <= now.getTime()
    ) {
      throw new BusinessRuleError(
        'SIGNUP_SESSION_REQUIRED',
        'Your signup session has ended. Start again from the beginning.',
      );
    }

    return intent;
  }
}

const SLUG_SHAPE = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/;

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

function formatOtp(value: number): string {
  return value.toString().padStart(6, '0');
}

function addMinutes(now: Date, minutes: number): Date {
  return new Date(now.getTime() + minutes * 60 * 1000);
}

function addHours(now: Date, hours: number): Date {
  return new Date(now.getTime() + hours * 60 * 60 * 1000);
}

function addDays(now: Date, days: number): Date {
  return new Date(now.getTime() + days * 24 * 60 * 60 * 1000);
}

function slugBaseFromEmail(email: string): string {
  const local = email.split('@')[0] ?? 'school';
  const cleaned = local
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+/, '')
    .replace(/-+$/, '')
    .slice(0, 40);
  return cleaned.length >= 2 ? cleaned : 'school';
}

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: string }).code === 'P2002'
  );
}
