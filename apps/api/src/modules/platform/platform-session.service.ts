import { createHash, randomBytes, randomUUID } from 'node:crypto';

import { Inject, Injectable, Logger } from '@nestjs/common';

import { ENV, type Env } from '../../config/env';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * Refresh tokens for platform staff.
 *
 * Deliberately a near-copy of `SessionService` rather than a shared base class.
 * The two look alike today and are under different pressures: a school session
 * is one of tens of thousands and will grow a device list and a "sign out
 * everywhere" screen; this one belongs to a handful of people who can reach
 * every tenant and will grow mandatory 2FA and a shorter leash. Coupling them
 * now means every future change to either has to be safe for both, and the
 * failure mode of getting that wrong is a platform-wide session bug.
 *
 * The mechanics that matter are identical, and identical for the same reasons:
 * opaque tokens, stored as a SHA-256 hash, rotated on every use, with reuse
 * detection revoking the whole family.
 */

const TOKEN_BYTES = 32;

/** Shorter than a school session. This one can see every school. */
const PLATFORM_TTL_DAYS = 7;

export interface IssuedPlatformToken {
  readonly token: string;
  readonly expiresAt: Date;
}

export interface SessionContext {
  readonly ip?: string | undefined;
  readonly userAgent?: string | undefined;
}

@Injectable()
export class PlatformSessionService {
  private readonly logger = new Logger(PlatformSessionService.name);
  private readonly ttlDays: number;

  constructor(
    @Inject(ENV) env: Env,
    private readonly prisma: PrismaService,
  ) {
    // Never longer than a school session, whatever the environment says.
    this.ttlDays = Math.min(env.REFRESH_TOKEN_TTL_DAYS, PLATFORM_TTL_DAYS);
  }

  private static hash(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  private expiry(now: Date): Date {
    return new Date(now.getTime() + this.ttlDays * 24 * 60 * 60 * 1000);
  }

  async issue(
    platformUserId: string,
    now: Date,
    context: SessionContext,
  ): Promise<IssuedPlatformToken> {
    const token = randomBytes(TOKEN_BYTES).toString('base64url');
    const expiresAt = this.expiry(now);

    await this.prisma.admin.platformSession.create({
      data: {
        platformUserId,
        familyId: randomUUID(),
        refreshTokenHash: PlatformSessionService.hash(token),
        expiresAt,
        ip: context.ip ?? null,
        userAgent: context.userAgent ?? null,
      },
    });

    return { token, expiresAt };
  }

  /**
   * Rotate. `undefined` for unknown, expired and revoked alike — the caller
   * must not be able to tell which token once existed.
   */
  async rotate(
    presented: string,
    now: Date,
    context: SessionContext,
  ): Promise<{ platformUserId: string; issued: IssuedPlatformToken } | undefined> {
    const session = await this.prisma.admin.platformSession.findUnique({
      where: { refreshTokenHash: PlatformSessionService.hash(presented) },
      select: {
        id: true,
        platformUserId: true,
        familyId: true,
        expiresAt: true,
        revokedAt: true,
      },
    });

    if (session === null) {
      return undefined;
    }

    if (session.revokedAt !== null) {
      // Already consumed. Either a replay or a stolen copy, and there is no way
      // to tell, so the whole family goes.
      await this.revokeFamily(session.familyId, now, 'refresh-token-reuse-detected');
      this.logger.warn(
        { familyId: session.familyId, platformUserId: session.platformUserId },
        'Platform refresh token reuse detected; session family revoked',
      );
      return undefined;
    }

    if (session.expiresAt <= now) {
      return undefined;
    }

    const token = randomBytes(TOKEN_BYTES).toString('base64url');
    const expiresAt = this.expiry(now);

    // Atomic: a crash between consume and mint would sign the user out with no
    // live token in the family and no way to tell why.
    await this.prisma.admin.$transaction([
      this.prisma.admin.platformSession.update({
        where: { id: session.id },
        data: { revokedAt: now, revokedReason: 'rotated', lastUsedAt: now },
      }),
      this.prisma.admin.platformSession.create({
        data: {
          platformUserId: session.platformUserId,
          familyId: session.familyId,
          refreshTokenHash: PlatformSessionService.hash(token),
          expiresAt,
          ip: context.ip ?? null,
          userAgent: context.userAgent ?? null,
        },
      }),
    ]);

    return { platformUserId: session.platformUserId, issued: { token, expiresAt } };
  }

  async revoke(presented: string | undefined, now: Date): Promise<void> {
    if (presented === undefined || presented === '') {
      return;
    }
    await this.prisma.admin.platformSession.updateMany({
      where: { refreshTokenHash: PlatformSessionService.hash(presented), revokedAt: null },
      data: { revokedAt: now, revokedReason: 'signed-out' },
    });
  }

  private async revokeFamily(familyId: string, now: Date, reason: string): Promise<void> {
    await this.prisma.admin.platformSession.updateMany({
      where: { familyId, revokedAt: null },
      data: { revokedAt: now, revokedReason: reason },
    });
  }
}
