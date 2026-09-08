import {
  continueRequestSchema,
  COOKIES,
  loginRequestSchema,
  ROUTES,
  type LoginOutcome,
  verifyEmailRequestSchema,
  type LoginRequest,
  type ResendVerificationResult,
  type SessionUser,
} from '@ilm/contracts';
import { Body, Controller, Get, Inject, Post, Req, Res } from '@nestjs/common';
import { type FastifyReply, type FastifyRequest } from 'fastify';

import { ENV, type Env } from '../../config/env';
import { Public } from '../../shared/auth/auth.guard';
import { BusinessRuleError } from '../../shared/errors/domain-error';
import { RateLimit } from '../../shared/http/rate-limit.guard';
import { resolveTenantSlug } from '../../shared/tenancy/resolve-tenant-slug';
import { CLOCK, type Clock } from '../../shared/time/clock.provider';

import { AuthService, type LoginResult } from './auth.service';
import { EmailVerificationService } from './email-verification.service';

/**
 * Authentication endpoints.
 *
 * All of these are `@Public`: they run before a session exists, so the guard
 * chain has nothing to check. That makes them the most exposed surface in the
 * API and the reason `AuthService` returns one generic failure for every
 * unsuccessful sign-in.
 *
 * Tokens are set as **httpOnly cookies** and never returned in the body
 * (docs/11 section 8).
 */
@Controller()
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly verification: EmailVerificationService,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(ENV) private readonly env: Env,
  ) {}

  /**
   * Sign in. One endpoint, two behaviours, decided by the address it arrives on.
   *
   * - **A school's hostname** — the tenant is already known, so the credentials
   *   are checked against that school and the cookies are set right here. The
   *   caller gets `kind: 'session'`.
   * - **The apex** — there is no school in the address, so the school comes out
   *   of the credentials instead (ADR-0009). Cookies cannot be set from here:
   *   they are host-only, and this is the wrong host. The caller gets
   *   `kind: 'handoff'` and a URL per school the password unlocked.
   *
   * Two endpoints would have been the obvious alternative, and worse: the
   * client would have to know which one it is allowed to call, which is the
   * same tenant question this is supposed to answer.
   *
   * ## The rate limit, and why it is loose
   *
   * Two things are true at once: apex sign-in runs four argon2 verifications
   * per call by design (ADR-0009 §4), so an unbounded loop here is a
   * CPU-exhaustion primitive; and a school of 500 parents sits behind one NAT,
   * so a tight per-IP limit would lock out a whole school at 8am. A hundred per
   * five minutes sits where automated abuse lives and ordinary bursts do not.
   *
   * Password guessing is not what this defends against — account lockout after
   * eight consecutive failures is, and that is per account rather than per
   * address.
   */
  @Public()
  @RateLimit({ limit: 100, windowSeconds: 300 })
  @Post(ROUTES.auth.login)
  async login(
    @Body() body: unknown,
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ): Promise<{ data: LoginOutcome }> {
    const input: LoginRequest = loginRequestSchema.parse(body);
    const now = this.clock.now();
    const context = { ip: request.ip, userAgent: request.headers['user-agent'] };

    // The same resolver the tenant guard uses. Sign-in reading the host
    // directly while the guard read the header is what made a browser's
    // correct password come back as "not correct".
    const slug = resolveTenantSlug(request, this.env.APP_DOMAIN);

    if (slug === undefined) {
      const choices = await this.auth.globalLogin(input.identifier, input.password, now, context);
      return { data: { kind: 'handoff', choices } };
    }

    const result = await this.auth.login(slug, input.identifier, input.password, now, context);

    this.setSessionCookies(reply, result);
    return { data: { kind: 'session', user: result.user } };
  }

  /**
   * Redeem a handoff token for a session — the second half of an apex sign-in.
   *
   * Only meaningful on a school's own hostname, which is enforced rather than
   * assumed: with no slug there is no school to scope the redemption to, and
   * the token is refused rather than searched for. That is what stops this
   * being a way to trade a token for whichever tenant the caller names.
   */
  @Public()
  @Post(ROUTES.auth.continue)
  async continueSession(
    @Body() body: unknown,
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ): Promise<{ data: SessionUser }> {
    const input = continueRequestSchema.parse(body);
    const slug = resolveTenantSlug(request, this.env.APP_DOMAIN);

    if (slug === undefined) {
      throw new BusinessRuleError(
        'AUTH_TOKEN_INVALID',
        'That sign-in link has expired. Sign in again.',
      );
    }

    const result = await this.auth.continueSession(slug, input.token, this.clock.now(), {
      ip: request.ip,
      userAgent: request.headers['user-agent'],
    });

    this.setSessionCookies(reply, result);
    return { data: result.user };
  }

  @Public()
  @Post(ROUTES.auth.refresh)
  async refresh(
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ): Promise<{ data: SessionUser }> {
    const cookies = request.cookies as Record<string, string | undefined> | undefined;
    const presented = cookies?.[COOKIES.refreshToken];

    const result =
      presented === undefined
        ? undefined
        : await this.auth.refresh(presented, this.clock.now(), {
            ip: request.ip,
            userAgent: request.headers['user-agent'],
          });

    if (result === undefined) {
      // Unknown, expired, revoked and reuse-detected are indistinguishable to
      // the caller on purpose. Clear the cookies so the client stops retrying.
      this.clearSessionCookies(reply);
      throw new BusinessRuleError('AUTH_TOKEN_EXPIRED', 'Your session has ended. Sign in again.');
    }

    this.setSessionCookies(reply, result);
    return { data: result.user };
  }

  @Public()
  @Post(ROUTES.auth.logout)
  async logout(
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ): Promise<{ data: { ok: true } }> {
    const cookies = request.cookies as Record<string, string | undefined> | undefined;
    await this.auth.logout(cookies?.[COOKIES.refreshToken], this.clock.now());
    this.clearSessionCookies(reply);
    return { data: { ok: true } };
  }

  /**
   * Confirm an email address — ADR-0012.
   *
   * `@Public` because the person following the link may not be signed in: they
   * are on a phone, two days later, in a browser that has never seen this site.
   * Requiring a session would mean the most common path is "click link, get a
   * login page, lose the token".
   *
   * The token itself is the authentication, and it is single-use, expiring, and
   * scoped to the school whose hostname it arrives on.
   */
  @Public()
  @RateLimit({ limit: 30, windowSeconds: 300 })
  @Post(ROUTES.auth.verifyEmail)
  async verifyEmail(
    @Body() body: unknown,
    @Req() request: FastifyRequest,
  ): Promise<{ data: { email: string } }> {
    const input = verifyEmailRequestSchema.parse(body);
    const slug = resolveTenantSlug(request, this.env.APP_DOMAIN);

    if (slug === undefined) {
      throw new BusinessRuleError(
        'AUTH_TOKEN_INVALID',
        'That confirmation link has expired. Ask for a new one from your dashboard.',
      );
    }

    return { data: await this.verification.verify(slug, input.token, this.clock.now()) };
  }

  /**
   * Send another confirmation message.
   *
   * Deliberately **not** `@Public`: it takes no email address and mails only
   * the signed-in account's own. A public version taking an address would be
   * both an existence oracle and a way to post mail at strangers.
   */
  @Post(ROUTES.auth.resendVerification)
  async resendVerification(
    @Req() request: FastifyRequest,
  ): Promise<{ data: ResendVerificationResult }> {
    const claims = request.claims;
    if (claims === undefined) {
      throw new BusinessRuleError('AUTH_TOKEN_INVALID', 'Sign in to continue.');
    }

    return { data: await this.verification.resend(claims.sub, this.clock.now()) };
  }

  /**
   * Who am I. Requires a valid session, so it is not `@Public`.
   *
   * Returns the whole session rather than just ids, because the shell needs the
   * name, the roles and the permission list to render at all — and a second
   * round trip for those would leave the navigation flickering on every page.
   */
  @Get(ROUTES.auth.session)
  async session(@Req() request: FastifyRequest): Promise<{ data: SessionUser }> {
    const claims = request.claims;
    if (claims === undefined) {
      throw new BusinessRuleError('AUTH_TOKEN_INVALID', 'Sign in to continue.');
    }

    const user = await this.auth.sessionUser(claims.sub);
    if (user === undefined) {
      // The token is valid but the account is gone or disabled. Same answer as
      // no token: sign in again.
      throw new BusinessRuleError('AUTH_TOKEN_INVALID', 'Your session has ended. Sign in again.');
    }

    return { data: user };
  }

  /**
   * Cookie scope, which is a tenant-isolation decision and not a formality.
   *
   * `COOKIE_DOMAIN` is normally unset, so these are **host-only** cookies bound
   * to the exact school hostname that issued them. A browser holding Demo's
   * session will not send it to `beacon.<domain>` at all. The alternative —
   * `Domain=<apex>` — hands one cookie to every tenant subdomain and makes a
   * single school's XSS everyone's problem.
   */
  private cookieScope(): { domain?: string } {
    return this.env.COOKIE_DOMAIN === undefined ? {} : { domain: this.env.COOKIE_DOMAIN };
  }

  /**
   * Delete the refresh cookie a previous version of this file left behind.
   *
   * The cookie used to be set at `path: ROUTES.auth.refresh`. Widening it to
   * `/` did not remove the old one: browsers key cookies by name **and** path,
   * so a browser signed in before that change still holds `ilm_rt` pinned to
   * `/api/v1/auth/refresh`, and there it is invisible to everything that
   * matters — the proxy never sees it on a page request, so it cannot renew,
   * and `clearCookie(path: '/')` never removes it, so signing out does not
   * clear it either. The result was the reported bug exactly: signed out
   * fifteen minutes in, an empty shell, and signing in again did not help
   * because the stale cookie outlived the session that replaced it.
   *
   * Two `Set-Cookie` headers on sign-in and sign-out end it permanently. This
   * can be deleted once no browser can still be holding one — a refresh
   * lifetime after this ships.
   */
  private clearLegacyRefreshCookie(reply: FastifyReply): void {
    void reply.clearCookie(COOKIES.refreshToken, {
      path: ROUTES.auth.refresh,
      // Attribute parity with the cookie being retired. A browser matches a
      // deletion on name, domain and path alone, so none of this is required —
      // but every `Set-Cookie` this API emits carrying a token name should be
      // `httpOnly`, and a lone exception is the sort of thing a scanner flags
      // and a reader has to stop and reason about.
      httpOnly: true,
      secure: this.env.NODE_ENV === 'production',
      sameSite: 'lax',
      ...this.cookieScope(),
    });
  }

  private setSessionCookies(reply: FastifyReply, result: LoginResult): void {
    const secure = this.env.NODE_ENV === 'production';

    this.clearLegacyRefreshCookie(reply);

    void reply.setCookie(COOKIES.accessToken, result.accessToken, {
      httpOnly: true,
      secure,
      // Lax, not Strict: a parent following a fee-reminder link from WhatsApp
      // must arrive signed in. Lax still blocks the cross-site POST that CSRF
      // needs, and state-changing requests additionally carry a CSRF token.
      sameSite: 'lax',
      path: '/',
      /**
       * Outlives the token inside it, deliberately — and by a wide margin.
       *
       * It had no expiry at all, which made it a browser-session cookie that
       * long outlived the fifteen-minute token it carried. Anything reasoning
       * about "is there a cookie" therefore got the wrong answer for the whole
       * of the fourteen minutes and forty-five seconds that mattered.
       *
       * The proxy now reads the token's own `exp` instead, so this is belt to
       * that braces. It is set to the **refresh** window rather than the access
       * window on purpose: a cookie that vanished at the fifteen-minute mark
       * would take the only evidence of an expired session with it, and the
       * proxy would have nothing to look at.
       */
      expires: result.refreshExpiresAt,
      ...this.cookieScope(),
    });

    void reply.setCookie(COOKIES.refreshToken, result.refreshToken, {
      httpOnly: true,
      secure,
      sameSite: 'lax',
      /**
       * Site-wide, and this was deliberately narrowed once — the note here used
       * to read "scoped to the refresh endpoint, so an XSS would not have it
       * attached to an arbitrary request".
       *
       * That reasoning does not survive contact with the requirement. Path
       * scoping made the token invisible to everything except one endpoint, so
       * nothing could refresh a session on a page navigation, and a person was
       * signed out fifteen minutes into their working day.
       *
       * It also bought less than it appeared to. The cookie is `httpOnly`, so
       * script never reads it; the refresh endpoint returns its tokens only as
       * `httpOnly` cookies, so calling it discloses nothing; and an XSS holding
       * the access token can already act as the user. The narrow path shortened
       * an attacker's window from 30 days to 15 minutes — real, but paid for by
       * every legitimate session ending mid-afternoon.
       *
       * What replaces it is rotation with reuse detection, which is the control
       * that actually matters: a stolen token is single-use, and using it after
       * the real client has kills the whole family.
       */
      path: '/',
      expires: result.refreshExpiresAt,
      ...this.cookieScope(),
    });
  }

  private clearSessionCookies(reply: FastifyReply): void {
    void reply.clearCookie(COOKIES.accessToken, { path: '/', ...this.cookieScope() });
    // Cleared at the same path it was set at, or the browser keeps it.
    void reply.clearCookie(COOKIES.refreshToken, { path: '/', ...this.cookieScope() });
    this.clearLegacyRefreshCookie(reply);
  }
}
