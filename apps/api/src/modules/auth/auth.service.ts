import { permissionsFor, type SchoolRole, type SessionUser } from '@ilm/contracts';
import { Injectable, Logger } from '@nestjs/common';

import { PasswordService } from '../../shared/auth/password.service';
import { TokenService } from '../../shared/auth/token.service';
import { BusinessRuleError } from '../../shared/errors/domain-error';
import { PrismaService } from '../../shared/prisma/prisma.service';

import { SessionService, type RefreshContext } from './session.service';

/**
 * Sign-in, refresh and sign-out.
 *
 * Everything here runs **before** tenant context exists — the user is not
 * authenticated yet, so there is nothing to scope by. That is why this service
 * uses the admin client and takes the school as a resolved slug from the
 * controller. It is the one place in the API where `schoolId` is legitimately
 * derived rather than read from context, and it is why the derivation is
 * confined to this file.
 */

/** Consecutive failures before an account is locked. */
const MAX_FAILED_LOGINS = 8;
const LOCKOUT_MINUTES = 15;

export interface LoginResult {
  readonly accessToken: string;
  readonly refreshToken: string;
  readonly refreshExpiresAt: Date;
  readonly user: SessionUser;
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly passwords: PasswordService,
    private readonly tokens: TokenService,
    private readonly sessions: SessionService,
  ) {}

  /**
   * Sign in against one school.
   *
   * Takes the resolved `slug`, not the raw host: the controller resolves it
   * with `resolveTenantSlug`, the same function the tenant guard uses. When
   * this resolved the host itself the two disagreed — the guard understood a
   * browser arriving through the portal and this did not, so a correct password
   * came back as "that email or password is not correct".
   */
  async login(
    slug: string | undefined,
    identifier: string,
    password: string,
    now: Date,
    context: RefreshContext,
  ): Promise<LoginResult> {
    if (slug === undefined) {
      throw new BusinessRuleError('AUTH_INVALID_CREDENTIALS', GENERIC_FAILURE);
    }

    const school = await this.prisma.admin.school.findUnique({
      where: { slug },
      select: { id: true, name: true, slug: true, timezone: true, locale: true, status: true },
    });

    // `status` was being selected and then ignored, which meant a school that
    // had left could still sign in indefinitely. Only CHURNED closes the door:
    // PAST_DUE and SUSPENDED must still be able to get in, because a school
    // that cannot sign in cannot read its own records or settle its bill, and
    // dunning never takes data away (docs/19 §4). SUSPENDED is made read-only
    // by the tenant guard instead.
    if (school === null || school.status === 'CHURNED') {
      throw new BusinessRuleError('AUTH_INVALID_CREDENTIALS', GENERIC_FAILURE);
    }

    const normalised = identifier.trim().toLowerCase();
    const user = await this.prisma.admin.user.findFirst({
      where: {
        schoolId: school.id,
        deletedAt: null,
        OR: [{ email: normalised }, { phone: identifier.trim() }],
      },
      select: {
        id: true,
        name: true,
        email: true,
        status: true,
        passwordHash: true,
        tokenVersion: true,
        mustChangePassword: true,
        failedLoginCount: true,
        lockedUntil: true,
        roles: { select: { role: true } },
      },
    });

    // Verify a dummy hash when the user does not exist, so the response time
    // does not reveal which addresses have accounts.
    if (user === null) {
      await this.passwords.verify(DUMMY_HASH, password);
      throw new BusinessRuleError('AUTH_INVALID_CREDENTIALS', GENERIC_FAILURE);
    }

    if (user.lockedUntil !== null && user.lockedUntil > now) {
      throw new BusinessRuleError(
        'AUTH_ACCOUNT_LOCKED',
        'Too many failed attempts. Try again in a few minutes, or reset your password.',
      );
    }

    const valid =
      user.passwordHash !== null && (await this.passwords.verify(user.passwordHash, password));

    if (!valid) {
      await this.recordFailure(user.id, user.failedLoginCount + 1, now);
      throw new BusinessRuleError('AUTH_INVALID_CREDENTIALS', GENERIC_FAILURE);
    }

    // An invited-but-not-activated or disabled account fails the same way as a
    // wrong password: the caller learns nothing about account state.
    if (user.status !== 'ACTIVE') {
      throw new BusinessRuleError('AUTH_INVALID_CREDENTIALS', GENERIC_FAILURE);
    }

    await this.prisma.admin.user.update({
      where: { id: user.id },
      data: { failedLoginCount: 0, lockedUntil: null, lastLoginAt: now },
    });

    const roles = user.roles.map((held) => held.role) as SchoolRole[];

    const accessToken = await this.tokens.signAccessToken({
      sub: user.id,
      sid: school.id,
      rol: roles,
      ver: user.tokenVersion,
      typ: 'tenant',
    });

    const refresh = await this.sessions.issue(school.id, user.id, now, context);

    return {
      accessToken,
      refreshToken: refresh.token,
      refreshExpiresAt: refresh.expiresAt,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        roles,
        permissions: permissionsFor(roles),
        mustChangePassword: user.mustChangePassword,
        school: {
          id: school.id,
          name: school.name,
          slug: school.slug,
          timezone: school.timezone,
          locale: school.locale,
        },
      },
    };
  }

  /**
   * Exchange a refresh token for a new pair.
   *
   * `tokenVersion` is re-read from the user here, not trusted from the old
   * access token: that is what makes bumping it an immediate global revocation
   * for a compromised account or a role change.
   */
  async refresh(
    presentedToken: string,
    now: Date,
    context: RefreshContext,
  ): Promise<LoginResult | undefined> {
    const rotated = await this.sessions.rotate(presentedToken, now, context);
    if (rotated === undefined) {
      return undefined;
    }

    const user = await this.prisma.admin.user.findUnique({
      where: { id: rotated.userId },
      select: {
        id: true,
        name: true,
        email: true,
        status: true,
        tokenVersion: true,
        mustChangePassword: true,
        roles: { select: { role: true } },
        school: { select: { id: true, name: true, slug: true, timezone: true, locale: true } },
      },
    });

    if (user === null || user.status !== 'ACTIVE') {
      await this.sessions.revokeAllForUser(rotated.userId, now, 'user-not-active');
      return undefined;
    }

    const roles = user.roles.map((held) => held.role) as SchoolRole[];

    const accessToken = await this.tokens.signAccessToken({
      sub: user.id,
      sid: user.school.id,
      rol: roles,
      ver: user.tokenVersion,
      typ: 'tenant',
    });

    return {
      accessToken,
      refreshToken: rotated.issued.token,
      refreshExpiresAt: rotated.issued.expiresAt,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        roles,
        permissions: permissionsFor(roles),
        mustChangePassword: user.mustChangePassword,
        school: user.school,
      },
    };
  }

  /**
   * The signed-in user, for rendering the shell.
   *
   * Roles and permissions are re-read from the database rather than taken from
   * the token: a role revoked five minutes ago must stop granting menu items
   * immediately, and the access token lives for fifteen.
   */
  async sessionUser(userId: string): Promise<SessionUser | undefined> {
    const user = await this.prisma.admin.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        name: true,
        email: true,
        status: true,
        mustChangePassword: true,
        roles: { select: { role: true } },
        school: { select: { id: true, name: true, slug: true, timezone: true, locale: true } },
      },
    });

    if (user === null || user.status !== 'ACTIVE') {
      return undefined;
    }

    const roles = user.roles.map((held) => held.role) as SchoolRole[];

    return {
      id: user.id,
      name: user.name,
      email: user.email,
      roles,
      permissions: permissionsFor(roles),
      mustChangePassword: user.mustChangePassword,
      school: user.school,
    };
  }

  async logout(presentedToken: string | undefined, now: Date): Promise<void> {
    if (presentedToken === undefined || presentedToken === '') {
      return;
    }
    await this.sessions.revoke(presentedToken, now);
  }

  private async recordFailure(userId: string, failures: number, now: Date): Promise<void> {
    const locked = failures >= MAX_FAILED_LOGINS;
    await this.prisma.admin.user.update({
      where: { id: userId },
      data: {
        failedLoginCount: failures,
        lockedUntil: locked ? new Date(now.getTime() + LOCKOUT_MINUTES * 60_000) : null,
      },
    });

    if (locked) {
      this.logger.warn({ userId, failures }, 'Account locked after repeated failed sign-ins');
    }
  }
}

/**
 * One message for every sign-in failure.
 *
 * "No such account" versus "wrong password" is a free account-enumeration
 * oracle, and for a school portal the enumerable set is every parent's email.
 */
const GENERIC_FAILURE = 'That email or password is not correct.';

/**
 * A real argon2id hash of a random value, verified against when no user
 * matched, so a missing account costs the same time as a wrong password.
 */
const DUMMY_HASH =
  '$argon2id$v=19$m=19456,t=2,p=1$c29tZXNhbHR2YWx1ZQ$Zm9vYmFyYmF6cXV4Y29ycmVjdGhvcnNlYmF0dGVyeQ';
