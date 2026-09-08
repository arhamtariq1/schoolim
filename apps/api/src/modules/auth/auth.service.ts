import {
  permissionsFor,
  type SchoolChoice,
  type SchoolRole,
  type SessionUser,
} from '@ilm/contracts';
import { Inject, Injectable, Logger } from '@nestjs/common';

import { ENV, type Env } from '../../config/env';
import { PasswordService } from '../../shared/auth/password.service';
import { TokenService } from '../../shared/auth/token.service';
import { BusinessRuleError } from '../../shared/errors/domain-error';
import { PrismaService } from '../../shared/prisma/prisma.service';
import { schoolOrigin } from '../../shared/tenancy/school-origin';

import { HandoffService } from './handoff.service';
import { SessionService, type RefreshContext } from './session.service';

/**
 * Sign-in, refresh and sign-out.
 *
 * Everything here runs **before** tenant context exists — the user is not
 * authenticated yet, so there is nothing to scope by. That is why this service
 * uses the admin client. It is the one place in the API where `schoolId` is
 * legitimately derived rather than read from context, and it is why the
 * derivation is confined to this file.
 *
 * ## Two front doors, one rule
 *
 * `login` runs on a school's own hostname: the tenant is in the address, and
 * the credentials are checked against that school only. `globalLogin` runs on
 * the apex, where there is no address to read, and resolves the school from the
 * credentials themselves (ADR-0009).
 *
 * The rule both obey: **nothing about which schools exist is observable before
 * a correct password.** `globalLogin` never says which school an email belongs
 * to, never says whether an email is registered at all, and only names a school
 * to someone who has just proved they hold an account there.
 */

/** Consecutive failures before an account is locked. */
const MAX_FAILED_LOGINS = 8;
const LOCKOUT_MINUTES = 15;

/**
 * How many accounts one identifier is checked against at the apex, and — more
 * importantly — how many argon2 verifications every apex sign-in performs,
 * match or no match.
 *
 * The padding is the point. Verifying only the real candidates would make the
 * response time count them: fast means "this email is registered nowhere",
 * slower means "at two schools". That is a cross-tenant enumeration oracle for
 * every parent's email address on the platform, readable with a stopwatch. Four
 * fixed verifications cost roughly 200ms and leak nothing.
 *
 * Four rather than more because a person with accounts at five schools on this
 * platform does not exist yet; when they do, they can still sign in at their
 * school's own address, which checks one.
 */
const CANDIDATE_SLOTS = 4;

export interface LoginResult {
  readonly accessToken: string;
  readonly refreshToken: string;
  readonly refreshExpiresAt: Date;
  readonly user: SessionUser;
}

/** Shape shared by both sign-in paths once a school row has been loaded. */
interface SchoolRow {
  readonly id: string;
  readonly name: string;
  readonly slug: string;
  readonly timezone: string;
  readonly locale: string;
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly passwords: PasswordService,
    private readonly tokens: TokenService,
    private readonly sessions: SessionService,
    private readonly handoffs: HandoffService,
    @Inject(ENV) private readonly env: Env,
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
    slug: string,
    identifier: string,
    password: string,
    now: Date,
    context: RefreshContext,
  ): Promise<LoginResult> {
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
        status: true,
        passwordHash: true,
        failedLoginCount: true,
        lockedUntil: true,
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

    return this.issueFor(school, user.id, now, context);
  }

  /**
   * Sign in at the apex, where the address names no school — ADR-0009.
   *
   * Returns one entry per school the credentials actually unlocked, each
   * carrying a single-use handoff URL on that school's own hostname. One entry
   * is the ordinary case and the client redirects; several means the same
   * person holds accounts at several schools with the same email and password,
   * and they get a picker.
   *
   * **The picker appears after the password, never before.** A school list
   * offered up front is the tenant list handed to anyone who loads the page,
   * which is the thing subdomain tenancy exists to prevent. A list offered
   * afterwards contains only what the person just proved they already had.
   *
   * No session is created here. Cookies belong on the school's hostname, and
   * this request is on the apex — `continueSession` finishes the job.
   */
  async globalLogin(
    identifier: string,
    password: string,
    now: Date,
    context: RefreshContext,
  ): Promise<SchoolChoice[]> {
    const trimmed = identifier.trim();

    const candidates = await this.prisma.admin.user.findMany({
      where: {
        deletedAt: null,
        // Filtering here rather than after verification is safe only because
        // the verification count below is fixed: an excluded account costs a
        // dummy hash, not a shorter response.
        status: 'ACTIVE',
        OR: [{ email: trimmed.toLowerCase() }, { phone: trimmed }],
        school: { status: { not: 'CHURNED' } },
      },
      // Deterministic, and bounded by the same constant as the work below.
      orderBy: { createdAt: 'asc' },
      take: CANDIDATE_SLOTS,
      select: {
        id: true,
        passwordHash: true,
        failedLoginCount: true,
        lockedUntil: true,
        school: { select: { id: true, name: true, slug: true } },
      },
    });

    // `flatMap` rather than `filter` so the narrowed `passwordHash: string`
    // survives into the loop without a non-null assertion.
    const checkable = candidates.flatMap((candidate) =>
      candidate.passwordHash !== null &&
      (candidate.lockedUntil === null || candidate.lockedUntil <= now)
        ? [{ ...candidate, passwordHash: candidate.passwordHash }]
        : [],
    );

    const matched: (typeof checkable)[number][] = [];

    // Sequential, and always exactly CANDIDATE_SLOTS iterations. Sequential
    // because four concurrent argon2 verifications hold four 19MB buffers at
    // once, and a login endpoint is the wrong place to make memory scale with
    // however many schools share an email. Always four because a variable count
    // is a timing oracle — see the constant.
    for (let slot = 0; slot < CANDIDATE_SLOTS; slot += 1) {
      const candidate = checkable[slot];

      if (candidate === undefined) {
        await this.passwords.verify(DUMMY_HASH, password);
        continue;
      }

      if (await this.passwords.verify(candidate.passwordHash, password)) {
        matched.push(candidate);
      }
    }

    if (matched.length === 0) {
      // Nothing matched, so the password is wrong everywhere it was tried, and
      // every candidate's counter moves — exactly as it would at each school's
      // own address. Sign-in at the apex must not be a way to guess passwords
      // without tripping lockout.
      await Promise.all(
        candidates.map(async (candidate) =>
          this.recordFailure(candidate.id, candidate.failedLoginCount + 1, now),
        ),
      );
      throw new BusinessRuleError('AUTH_INVALID_CREDENTIALS', GENERIC_APEX_FAILURE);
    }

    await this.prisma.admin.user.updateMany({
      where: { id: { in: matched.map((candidate) => candidate.id) } },
      data: { failedLoginCount: 0, lockedUntil: null, lastLoginAt: now },
    });

    const choices: SchoolChoice[] = [];
    for (const candidate of matched) {
      const token = await this.handoffs.mint(candidate.school.id, candidate.id, now, context);
      choices.push({
        schoolId: candidate.school.id,
        name: candidate.school.name,
        slug: candidate.school.slug,
        continueUrl: `${schoolOrigin(candidate.school.slug, this.env.APP_DOMAIN, this.env.WEB_URL)}/auth/continue?t=${token}`,
      });
    }

    return choices;
  }

  /**
   * Redeem a handoff token, on the school's own hostname — ADR-0009.
   *
   * `slug` comes from the request host, not from the token, and the redemption
   * is scoped to the school it names. A token minted for one school and
   * presented at another school's address finds nothing, so this endpoint
   * cannot be used to select a tenant.
   *
   * The account is re-checked here rather than trusted from two minutes ago:
   * disabling a user must take effect immediately, including against a handoff
   * already in flight.
   */
  async continueSession(
    slug: string,
    token: string,
    now: Date,
    context: RefreshContext,
  ): Promise<LoginResult> {
    const school = await this.prisma.admin.school.findUnique({
      where: { slug },
      select: { id: true, name: true, slug: true, timezone: true, locale: true, status: true },
    });

    if (school === null || school.status === 'CHURNED') {
      throw new BusinessRuleError('AUTH_TOKEN_INVALID', HANDOFF_FAILURE);
    }

    const userId = await this.handoffs.consume(token, school.id, now);
    if (userId === undefined) {
      throw new BusinessRuleError('AUTH_TOKEN_INVALID', HANDOFF_FAILURE);
    }

    const user = await this.prisma.admin.user.findUnique({
      where: { id: userId },
      select: { id: true, status: true, deletedAt: true },
    });

    if (user === null || user.deletedAt !== null || user.status !== 'ACTIVE') {
      throw new BusinessRuleError('AUTH_TOKEN_INVALID', HANDOFF_FAILURE);
    }

    return this.issueFor(school, user.id, now, context);
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
        emailVerifiedAt: true,
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
        emailVerified: user.emailVerifiedAt !== null,
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
        emailVerifiedAt: true,
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
      emailVerified: user.emailVerifiedAt !== null,
      school: user.school,
    };
  }

  async logout(presentedToken: string | undefined, now: Date): Promise<void> {
    if (presentedToken === undefined || presentedToken === '') {
      return;
    }
    await this.sessions.revoke(presentedToken, now);
  }

  /**
   * Mint the session.
   *
   * The last step of every way in — school-host sign-in, apex handoff, and the
   * auto-sign-in that follows signup — so that "signed in" is defined in one
   * place rather than in three that drift.
   */
  private async issueFor(
    school: SchoolRow,
    userId: string,
    now: Date,
    context: RefreshContext,
  ): Promise<LoginResult> {
    const user = await this.prisma.admin.user.findUniqueOrThrow({
      where: { id: userId },
      select: {
        id: true,
        name: true,
        email: true,
        tokenVersion: true,
        mustChangePassword: true,
        emailVerifiedAt: true,
        roles: { select: { role: true } },
      },
    });

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
        emailVerified: user.emailVerifiedAt !== null,
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
 * The apex variant, which additionally has to cover being locked out without
 * saying so.
 *
 * At a school's own address, "too many attempts" reveals only that an account
 * exists at a school the caller already named. At the apex it would reveal that
 * an account exists **somewhere on the platform**, which is a global oracle for
 * any email address. So the two cases share one message — and it still tells a
 * genuinely locked-out person the one useful thing, which is to wait.
 */
const GENERIC_APEX_FAILURE =
  'That email or password is not correct. If you have tried several times, wait a few minutes before trying again.';

/** Unknown, expired, already used and wrong school are one answer on purpose. */
const HANDOFF_FAILURE = 'That sign-in link has expired. Sign in again.';

/**
 * A real argon2id hash of a random value, verified against when no user
 * matched, so a missing account costs the same time as a wrong password.
 */
const DUMMY_HASH =
  '$argon2id$v=19$m=19456,t=2,p=1$c29tZXNhbHR2YWx1ZQ$Zm9vYmFyYmF6cXV4Y29ycmVjdGhvcnNlYmF0dGVyeQ';
