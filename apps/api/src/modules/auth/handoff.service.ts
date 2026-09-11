import { createHash, randomBytes } from 'node:crypto';

import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../prisma/prisma.service';

/**
 * The bridge from "password verified at the apex" to "session on the school's
 * own hostname". ADR-0009.
 *
 * ## Why this exists at all
 *
 * Session cookies in this product are **host-only** — `COOKIE_DOMAIN` is
 * deliberately unset (docs/04), so a school's session is bound to
 * `{slug}.<domain>` and no other tenant's browser ever transmits it. That is a
 * property worth keeping, and it has one consequence: the apex can verify a
 * password but physically cannot set the cookie that signs the person in. The
 * browser has to travel to the school's address and be issued one there.
 *
 * The alternative — setting `Domain=<apex>` so one cookie covers every
 * subdomain — would turn any single school's XSS into a foothold against all of
 * them. That trade is not worth one redirect.
 *
 * ## Why a table and not a self-contained signed token
 *
 * Single use has to be enforced somewhere. `UPDATE ... WHERE consumed_at IS
 * NULL` is atomic and unambiguous; a stateless token replayed inside its window
 * is two sessions from one password, and the URL carrying it lands in browser
 * history, in referrer headers, and in whatever the person pastes to a
 * colleague.
 */

/**
 * Two minutes. Long enough for a redirect and a slow phone on 3G, short enough
 * that a URL found in history tomorrow is worth nothing.
 */
const HANDOFF_TTL_SECONDS = 120;

export interface HandoffContext {
  readonly ip?: string;
  readonly userAgent?: string;
}

@Injectable()
export class HandoffService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Mint a token for a user whose password has **already been verified**.
   *
   * There is no check here that it has been, because there cannot be one — this
   * is a private step of sign-in, not an endpoint. `AuthService` is the only
   * caller, and it calls this after argon2 has said yes.
   */
  async mint(
    schoolId: string,
    userId: string,
    now: Date,
    context: HandoffContext,
  ): Promise<string> {
    // 32 bytes from a CSPRNG. This travels in a URL, so base64url rather than
    // hex: same entropy, shorter, and nothing to percent-encode.
    const token = randomBytes(32).toString('base64url');

    await this.prisma.admin.authHandoff.create({
      data: {
        schoolId,
        userId,
        // Only the hash is stored. A leaked database backup must not hand out
        // live sessions, the same reason refresh tokens are stored hashed.
        tokenHash: hash(token),
        expiresAt: new Date(now.getTime() + HANDOFF_TTL_SECONDS * 1000),
        ip: context.ip ?? null,
        userAgent: context.userAgent ?? null,
      },
    });

    return token;
  }

  /**
   * Redeem a token, once, for the school whose hostname it arrived on.
   *
   * `schoolId` is not taken from the token — it is passed in by the controller,
   * derived from the request host, and matched. A token minted for one school
   * therefore cannot be replayed against another school's address even if the
   * row said otherwise, which keeps this endpoint from becoming a way to select
   * a tenant.
   *
   * Returns the user id, or `undefined` for every failure: unknown, expired,
   * already consumed, and wrong school are one answer on purpose.
   */
  async consume(token: string, schoolId: string, now: Date): Promise<string | undefined> {
    const tokenHash = hash(token);

    // The `consumedAt: null` predicate is what makes this single-use: two
    // concurrent redemptions both attempt the update, exactly one reports a
    // row, and the loser gets nothing. Reading the row first and then updating
    // it would be a race with a session at stake.
    const claimed = await this.prisma.admin.authHandoff.updateMany({
      where: { tokenHash, schoolId, consumedAt: null, expiresAt: { gt: now } },
      data: { consumedAt: now },
    });

    if (claimed.count !== 1) {
      return undefined;
    }

    const row = await this.prisma.admin.authHandoff.findUnique({
      where: { tokenHash },
      select: { userId: true },
    });

    // Opportunistic housekeeping, on the one path that runs at most once per
    // sign-in and is already writing. These rows are worthless within two
    // minutes; letting them accumulate until a retention job exists would be a
    // table that only ever grows, for no reason.
    await this.prisma.admin.authHandoff.deleteMany({
      where: { schoolId, expiresAt: { lt: new Date(now.getTime() - 60_000) } },
    });

    return row?.userId;
  }
}

function hash(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}
