import { createHash, randomBytes } from 'node:crypto';

import { Inject, Injectable, Logger } from '@nestjs/common';

import { ENV, type Env } from '../../config/env';
import { BusinessRuleError } from '../../shared/errors/domain-error';
import { MAIL, type MailPort } from '../../shared/mail/mail.port';
import { verifyEmailTemplate } from '../../shared/mail/templates/verify-email.template';
import { PrismaService } from '../../shared/prisma/prisma.service';
import { schoolOrigin } from '../../shared/tenancy/school-origin';

/**
 * Proving that somebody can read mail at the address they typed. ADR-0012.
 *
 * ## Why this exists, stated plainly
 *
 * ADR-0010 shipped self-serve signup and listed this as the gap it knowingly
 * left. The gap is not "unverified data is untidy" — it is that **the owner's
 * email is the only route back into a self-serve tenant.** There is no operator
 * to telephone. A school whose owner mistyped their own address is one
 * forgotten password away from being unreachable, with its students' records
 * inside it.
 *
 * ## What it deliberately does not do
 *
 * It does not block sign-in, and it does not gate the trial. ADR-0010 argued
 * that a dead end between intent and product is where trials die, and that
 * argument did not stop being true. Verification is a banner and a nudge until
 * Phase 5, when trial conversion starts requiring it. Anything stronger today
 * would be a gate with nothing behind it.
 *
 * Like the rest of `AuthService`, this runs on the **admin** connection: the
 * link in the email arrives with no session and therefore no tenant context.
 */

/**
 * A day. Long enough for someone who signs up at midnight and reads their mail
 * after breakfast; short enough that a forwarded message is not a standing key.
 *
 * Handoff tokens live two minutes because a browser redeems them immediately.
 * A human reads email on their own schedule, and re-sending is free.
 */
const VERIFICATION_TTL_HOURS = 24;

/**
 * Resend cooldown. Not the rate limiter's job: that one counts requests per
 * address and this one counts messages per *recipient*, which is what stops the
 * button being used to post mail at somebody.
 */
const RESEND_COOLDOWN_SECONDS = 60;

@Injectable()
export class EmailVerificationService {
  private readonly logger = new Logger(EmailVerificationService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(MAIL) private readonly mail: MailPort,
    @Inject(ENV) private readonly env: Env,
  ) {}

  /**
   * Issue a token and send the message.
   *
   * **Never throws on a mail failure.** Signup calls this after its transaction
   * has committed; a relay that is down must not turn a created school into an
   * error page.
   *
   * **Order matters, and it is not the obvious one.** The new token is minted
   * and sent *before* any earlier one is superseded, because superseding first
   * and then failing to deliver the replacement leaves the person holding
   * nothing: their working link is dead and the new one never arrived. So an
   * earlier delivered link keeps working until a replacement actually reaches
   * them.
   *
   * Returns whether the message was actually sent, so the caller can decide
   * what to tell them — not so it can fail.
   */
  async sendVerification(userId: string, now: Date): Promise<{ sent: boolean }> {
    const user = await this.prisma.admin.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        name: true,
        email: true,
        emailVerifiedAt: true,
        schoolId: true,
        school: { select: { name: true, slug: true } },
      },
    });

    if (user === null || user.emailVerifiedAt !== null) {
      // Already verified, or gone. Nothing to do, and nothing worth saying.
      return { sent: false };
    }

    const token = randomBytes(32).toString('base64url');

    const issued = await this.prisma.admin.emailVerification.create({
      data: {
        schoolId: user.schoolId,
        userId: user.id,
        // The address it is being sent to, copied. If they change their email
        // tomorrow, this token must not verify the new one.
        email: user.email,
        tokenHash: hash(token),
        expiresAt: new Date(now.getTime() + VERIFICATION_TTL_HOURS * 3_600_000),
      },
      select: { id: true },
    });

    const origin = schoolOrigin(
      user.school.slug,
      this.env.APP_DOMAIN,
      this.env.WEB_URL,
      this.env.PORTAL_TENANT_MODE,
    );

    const result = await this.mail.send(
      verifyEmailTemplate({
        to: user.email,
        recipientName: user.name,
        schoolName: user.school.name,
        verifyUrl: `${origin}/verify-email?t=${token}`,
        expiresInHours: VERIFICATION_TTL_HOURS,
      }),
    );

    if (!result.sent) {
      // Nothing is superseded. Whatever link the person already has keeps
      // working, which is the whole reason the supersede lives below this
      // branch rather than above the send.
      //
      // The undelivered row is left in place: it expires in a day, and the
      // 60-second resend cooldown bounds how fast these can accumulate.
      this.logger.warn(
        { userId: user.id, schoolId: user.schoolId, reason: result.error },
        'Verification email could not be sent; any earlier link still works and this can be resent',
      );
      return { sent: false };
    }

    // Delivered, so this is now the link that works. Retiring the earlier ones
    // is what makes "the most recent link" a true statement rather than a
    // convention — and a link somebody abandoned an hour ago should not still
    // open their account.
    await this.prisma.admin.emailVerification.updateMany({
      where: { userId: user.id, consumedAt: null, id: { not: issued.id } },
      data: { consumedAt: now },
    });

    await this.prisma.admin.emailVerification.update({
      where: { id: issued.id },
      data: { sentAt: now },
    });

    return { sent: true };
  }

  /**
   * Redeem a token, on the school's own hostname.
   *
   * `slug` comes from the request host and scopes the lookup, for the same
   * reason as the sign-in handoff (ADR-0009): a token is redeemable only at the
   * address it belongs to, so this endpoint cannot be used to reach across
   * tenants.
   *
   * The token's `email` is compared against the user's current address. They
   * differ when somebody changed their email after the link was sent, and in
   * that case the link proves nothing about the address on the account.
   */
  async verify(slug: string, token: string, now: Date): Promise<{ email: string }> {
    const school = await this.prisma.admin.school.findUnique({
      where: { slug },
      select: { id: true },
    });

    if (school === null) {
      throw new BusinessRuleError('AUTH_TOKEN_INVALID', EXPIRED);
    }

    // Atomic claim, exactly as the handoff does it: reading the row and then
    // updating it is a race, and here the prize is a verified account.
    const claimed = await this.prisma.admin.emailVerification.updateMany({
      where: {
        tokenHash: hash(token),
        schoolId: school.id,
        consumedAt: null,
        expiresAt: { gt: now },
      },
      data: { consumedAt: now },
    });

    if (claimed.count !== 1) {
      throw new BusinessRuleError('AUTH_TOKEN_INVALID', EXPIRED);
    }

    const row = await this.prisma.admin.emailVerification.findUnique({
      where: { tokenHash: hash(token) },
      select: { userId: true, email: true, user: { select: { email: true } } },
    });

    if (row === null || row.email !== row.user.email) {
      // The address changed after the link was sent. The token proved control
      // of an address this account no longer uses, which is not the claim being
      // made. They need a new link for the new address.
      throw new BusinessRuleError('AUTH_TOKEN_INVALID', ADDRESS_CHANGED);
    }

    await this.prisma.admin.user.update({
      where: { id: row.userId },
      data: { emailVerifiedAt: now },
    });

    // Housekeeping on the one path that is already writing and runs at most
    // once per account. Expired tokens are worthless and this table would
    // otherwise only ever grow.
    await this.prisma.admin.emailVerification.deleteMany({
      where: { schoolId: school.id, expiresAt: { lt: now } },
    });

    this.logger.log({ userId: row.userId, schoolId: school.id }, 'Email address verified');

    return { email: row.email };
  }

  /**
   * Send another one, for the person who deleted the first.
   *
   * Requires a session — the caller can only ever ask for a message to be sent
   * to their own account's address, so this is not a way to mail strangers.
   * The cooldown is per recipient rather than per caller, because the thing
   * being rationed is somebody's inbox.
   */
  async resend(userId: string, now: Date): Promise<{ sent: boolean; retryAfterSeconds?: number }> {
    const recent = await this.prisma.admin.emailVerification.findFirst({
      where: { userId, sentAt: { not: null } },
      orderBy: { sentAt: 'desc' },
      select: { sentAt: true },
    });

    if (recent !== null && recent.sentAt !== null) {
      const elapsed = (now.getTime() - recent.sentAt.getTime()) / 1000;
      if (elapsed < RESEND_COOLDOWN_SECONDS) {
        return { sent: false, retryAfterSeconds: Math.ceil(RESEND_COOLDOWN_SECONDS - elapsed) };
      }
    }

    return this.sendVerification(userId, now);
  }
}

function hash(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/** Unknown, expired, already used and wrong school are one answer on purpose. */
const EXPIRED = 'That confirmation link has expired. Ask for a new one from your dashboard.';

const ADDRESS_CHANGED =
  'That link was sent to a different email address. Ask for a new one from your dashboard.';
