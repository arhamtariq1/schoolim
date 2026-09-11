import { PLATFORM_CAPABILITIES, type PlatformRole, type PlatformSession } from '@ilm/contracts';
import { Injectable, Logger } from '@nestjs/common';

import { PrismaService } from '../../prisma/prisma.service';
import { PasswordService } from '../../shared/auth/password.service';
import { TokenService } from '../../shared/auth/token.service';
import { BusinessRuleError } from '../../shared/errors/domain-error';

import { PlatformSessionService, type SessionContext } from './platform-session.service';

/**
 * Sign-in for platform staff.
 *
 * Separate from `AuthService` on purpose, and not because the code differs
 * much. This login reaches every school in the product; a shared code path
 * would mean any future change to school sign-in — a new identifier type, an
 * SSO branch, a lockout tweak — silently applies to the account that can see
 * everything. Two files is the cheapest way to make that impossible.
 *
 * There is **no school here at all**: no host to resolve, no tenant claim, no
 * `x-school-slug`. The console is reached on its own hostname.
 */

const GENERIC_FAILURE = 'That email or password is not correct.';

/** A dummy hash, so a missing account costs the same time as a wrong password. */
const DUMMY_HASH =
  '$argon2id$v=19$m=19456,t=2,p=1$c29tZXNhbHR2YWx1ZQ$RdescudvJCsgt3ub+b+dWRWJTmaaJObG';

export interface PlatformLoginResult {
  readonly accessToken: string;
  readonly refreshToken: string;
  readonly refreshExpiresAt: Date;
  readonly user: PlatformSession;
}

@Injectable()
export class PlatformAuthService {
  private readonly logger = new Logger(PlatformAuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly passwords: PasswordService,
    private readonly tokens: TokenService,
    private readonly sessions: PlatformSessionService,
  ) {}

  async login(
    email: string,
    password: string,
    now: Date,
    context: SessionContext,
  ): Promise<PlatformLoginResult> {
    const user = await this.prisma.admin.platformUser.findUnique({
      where: { email: email.trim().toLowerCase() },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        passwordHash: true,
        isActive: true,
        tokenVersion: true,
      },
    });

    if (user === null) {
      await this.passwords.verify(DUMMY_HASH, password);
      throw new BusinessRuleError('AUTH_INVALID_CREDENTIALS', GENERIC_FAILURE);
    }

    if (!(await this.passwords.verify(user.passwordHash, password))) {
      // Logged, unlike a school sign-in failure: a failed attempt against the
      // console is worth someone's attention on its own.
      this.logger.warn({ email: user.email }, 'Failed platform sign-in');
      throw new BusinessRuleError('AUTH_INVALID_CREDENTIALS', GENERIC_FAILURE);
    }

    // A disabled account fails exactly like a wrong password: whether an
    // account is merely disabled rather than gone is not the caller's business.
    if (!user.isActive) {
      throw new BusinessRuleError('AUTH_INVALID_CREDENTIALS', GENERIC_FAILURE);
    }

    await this.prisma.admin.platformUser.update({
      where: { id: user.id },
      data: { lastLoginAt: now },
    });

    const accessToken = await this.tokens.signAccessToken({
      sub: user.id,
      ver: user.tokenVersion,
      typ: 'platform',
      // No `sid`, no `rol`. A platform token names no school, and the role is
      // re-read from the database on every request so a revocation is instant.
    });

    const refresh = await this.sessions.issue(user.id, now, context);

    return {
      accessToken,
      refreshToken: refresh.token,
      refreshExpiresAt: refresh.expiresAt,
      user: toSession(user),
    };
  }

  /** The current user, re-read so a role change takes effect immediately. */
  async session(platformUserId: string): Promise<PlatformSession | undefined> {
    const user = await this.prisma.admin.platformUser.findUnique({
      where: { id: platformUserId },
      select: { id: true, name: true, email: true, role: true, isActive: true },
    });

    return user === null || !user.isActive ? undefined : toSession(user);
  }

  async logout(refreshToken: string | undefined, now: Date): Promise<void> {
    await this.sessions.revoke(refreshToken, now);
  }
}

function toSession(user: {
  id: string;
  name: string;
  email: string;
  role: string;
}): PlatformSession {
  const role = user.role as PlatformRole;
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role,
    capabilities: [...PLATFORM_CAPABILITIES[role]],
  };
}
