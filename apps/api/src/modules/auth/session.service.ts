import { createHash, randomBytes } from 'node:crypto';

import { Inject, Injectable, Logger } from '@nestjs/common';

import { ENV, type Env } from '../../config/env';
import { PrismaService } from '../../shared/prisma/prisma.service';

/**
 * Refresh tokens: opaque, stored hashed, rotated on every use, with reuse
 * detection (docs/11 section 8, docs/04 section 4).
 *
 * **Why opaque and not a JWT.** A refresh token must be revocable the instant
 * it is stolen. A self-contained token cannot be, without a revocation list —
 * at which point it is a database lookup anyway, and an opaque random string is
 * simpler and leaks nothing if logged.
 *
 * **Why hashed.** The database stores a SHA-256 of the token, never the token.
 * A dump of `sessions` therefore grants nobody a login. SHA-256 rather than
 * argon2 here on purpose: the token is 32 bytes of CSPRNG output, so there is
 * no dictionary to attack and no reason to pay argon2's cost on every refresh.
 *
 * **Why rotation with reuse detection.** Each refresh mints a new token and
 * consumes the old one. If a *consumed* token is presented again, either the
 * user replayed it or an attacker is using a copy — and there is no way to tell
 * which. So the entire family is revoked and everyone re-authenticates. A
 * noisy false positive is a far better failure than a silent session takeover.
 */

const TOKEN_BYTES = 32;

/**
 * How long after a rotation the old token is still treated as a race rather
 * than a replay.
 *
 * Long enough to cover a page navigation and a parallel fetch that both carried
 * the cookie the browser had a moment ago; short enough that a token lifted
 * from a machine and used later still trips reuse detection. Ten seconds is
 * comfortably more than a round trip and far less than an attacker's window.
 */
const ROTATION_GRACE_MS = 10_000;

export interface IssuedRefreshToken {
  readonly token: string;
  readonly familyId: string;
  readonly expiresAt: Date;
}

export interface RefreshContext {
  readonly ip?: string | undefined;
  readonly userAgent?: string | undefined;
}

@Injectable()
export class SessionService {
  private readonly logger = new Logger(SessionService.name);
  private readonly ttlDays: number;

  constructor(
    @Inject(ENV) env: Env,
    private readonly prisma: PrismaService,
  ) {
    this.ttlDays = env.REFRESH_TOKEN_TTL_DAYS;
  }

  /** Hash a token for storage or lookup. Never store the token itself. */
  private static hash(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  private static newToken(): string {
    return randomBytes(TOKEN_BYTES).toString('base64url');
  }

  private expiry(now: Date): Date {
    return new Date(now.getTime() + this.ttlDays * 24 * 60 * 60 * 1000);
  }

  /**
   * Start a new session family. Called on a fresh sign-in, never on refresh.
   *
   * Runs on the admin client because sign-in happens before tenant context
   * exists; `schoolId` is supplied by the caller, which has already resolved
   * the school from the request host.
   */
  async issue(
    schoolId: string,
    userId: string,
    now: Date,
    context: RefreshContext,
  ): Promise<IssuedRefreshToken> {
    const token = SessionService.newToken();
    const expiresAt = this.expiry(now);

    const session = await this.prisma.admin.session.create({
      data: {
        schoolId,
        userId,
        familyId: crypto.randomUUID(),
        refreshTokenHash: SessionService.hash(token),
        expiresAt,
        ip: context.ip ?? null,
        userAgent: context.userAgent ?? null,
      },
    });

    return { token, familyId: session.familyId, expiresAt };
  }

  /**
   * Rotate a refresh token.
   *
   * Returns `undefined` when the token is unknown, expired or already revoked —
   * the caller must treat all three identically and re-authenticate, because
   * distinguishing them tells an attacker which tokens once existed.
   */
  async rotate(
    presentedToken: string,
    now: Date,
    context: RefreshContext,
  ): Promise<{ userId: string; schoolId: string; issued: IssuedRefreshToken } | undefined> {
    const hash = SessionService.hash(presentedToken);

    const session = await this.prisma.admin.session.findUnique({
      where: { refreshTokenHash: hash },
      select: {
        id: true,
        schoolId: true,
        userId: true,
        familyId: true,
        expiresAt: true,
        revokedAt: true,
        revokedReason: true,
      },
    });

    if (session === null) {
      return undefined;
    }

    // A revoked row means this token was already consumed, and someone is
    // presenting it a second time.
    if (session.revokedAt !== null) {
      // ...but two of *our own* requests racing is not an attack, and it is the
      // common case now that refresh happens automatically. A page navigation
      // and an in-flight fetch both carry the same cookie, both reach here, and
      // one of them necessarily arrives second.
      //
      // Without this window that second request revokes the whole family and
      // signs the person out — which would make automatic refresh *cause* the
      // logouts it exists to prevent. So a token consumed by a rotation moments
      // ago is treated as the race it almost certainly is: mint a fresh token
      // in the same family and revoke nothing.
      //
      // This is deliberately narrow. Only `rotated` qualifies (never `logout`
      // or a previous reuse revocation), only inside the window, and only while
      // the family is still live. A stolen token replayed minutes later still
      // trips the alarm, which is the case reuse detection is actually for.
      // Bounded at both ends. The lower bound is not pedantry: a `revokedAt`
      // sitting in the future — a clock that stepped, a timestamp written by
      // something other than the app — makes the subtraction negative, which
      // would pass an upper-bound-only test and quietly widen this window to
      // forever. Reuse detection has to fail toward revoking.
      const sinceRotation = now.getTime() - session.revokedAt.getTime();
      const rotatedRecently =
        session.revokedReason === 'rotated' &&
        sinceRotation >= 0 &&
        sinceRotation <= ROTATION_GRACE_MS;

      if (rotatedRecently) {
        const familyStillLive = await this.prisma.admin.session.count({
          where: { familyId: session.familyId, revokedAt: null, expiresAt: { gt: now } },
        });

        if (familyStillLive > 0) {
          const token = SessionService.newToken();
          const expiresAt = this.expiry(now);

          await this.prisma.admin.session.create({
            data: {
              schoolId: session.schoolId,
              userId: session.userId,
              familyId: session.familyId,
              refreshTokenHash: SessionService.hash(token),
              expiresAt,
              ip: context.ip ?? null,
              userAgent: context.userAgent ?? null,
            },
          });

          this.logger.debug(
            { familyId: session.familyId, userId: session.userId },
            'Concurrent refresh inside the grace window; issued a second token rather than revoking',
          );

          return {
            userId: session.userId,
            schoolId: session.schoolId,
            issued: { token, familyId: session.familyId, expiresAt },
          };
        }
      }

      // Either the user replayed it or a copy is in play; there is no way to
      // tell, so assume the worse case.
      await this.revokeFamily(session.familyId, now, 'refresh-token-reuse-detected');
      this.logger.warn(
        { familyId: session.familyId, userId: session.userId },
        'Refresh token reuse detected; session family revoked',
      );
      return undefined;
    }

    if (session.expiresAt <= now) {
      return undefined;
    }

    const token = SessionService.newToken();
    const expiresAt = this.expiry(now);

    // Consume the old row and mint the new one atomically. Without the
    // transaction, a crash between the two leaves a family with no live token
    // and the user silently signed out.
    await this.prisma.admin.$transaction([
      this.prisma.admin.session.update({
        where: { id: session.id },
        data: { revokedAt: now, revokedReason: 'rotated', lastUsedAt: now },
      }),
      this.prisma.admin.session.create({
        data: {
          schoolId: session.schoolId,
          userId: session.userId,
          familyId: session.familyId,
          refreshTokenHash: SessionService.hash(token),
          expiresAt,
          ip: context.ip ?? null,
          userAgent: context.userAgent ?? null,
        },
      }),
    ]);

    return {
      userId: session.userId,
      schoolId: session.schoolId,
      issued: { token, familyId: session.familyId, expiresAt },
    };
  }

  /** Sign out one device. */
  async revoke(presentedToken: string, now: Date): Promise<void> {
    await this.prisma.admin.session.updateMany({
      where: { refreshTokenHash: SessionService.hash(presentedToken), revokedAt: null },
      data: { revokedAt: now, revokedReason: 'logout' },
    });
  }

  /** Revoke every token in a family — the reuse-detection response. */
  async revokeFamily(familyId: string, now: Date, reason: string): Promise<void> {
    await this.prisma.admin.session.updateMany({
      where: { familyId, revokedAt: null },
      data: { revokedAt: now, revokedReason: reason },
    });
  }

  /** Sign out everywhere. Used on password reset and on role change. */
  async revokeAllForUser(userId: string, now: Date, reason: string): Promise<void> {
    await this.prisma.admin.session.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: now, revokedReason: reason },
    });
  }
}
