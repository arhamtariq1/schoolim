import {
  COOKIES,
  loginRequestSchema,
  ROUTES,
  type SessionUser,
  type LoginRequest,
} from '@ilm/contracts';
import { Body, Controller, Get, Inject, Post, Req, Res } from '@nestjs/common';
import { type FastifyReply, type FastifyRequest } from 'fastify';

import { ENV, type Env } from '../../config/env';
import { Public } from '../../shared/auth/auth.guard';
import { BusinessRuleError } from '../../shared/errors/domain-error';
import { CLOCK, type Clock } from '../../shared/time/clock.provider';

import { AuthService, type LoginResult } from './auth.service';

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
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(ENV) private readonly env: Env,
  ) {}

  @Public()
  @Post(ROUTES.auth.login)
  async login(
    @Body() body: unknown,
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ): Promise<{ data: SessionUser }> {
    const input: LoginRequest = loginRequestSchema.parse(body);

    const result = await this.auth.login(
      request.headers.host,
      input.identifier,
      input.password,
      this.clock.now(),
      { ip: request.ip, userAgent: request.headers['user-agent'] },
    );

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

  private setSessionCookies(reply: FastifyReply, result: LoginResult): void {
    const secure = this.env.NODE_ENV === 'production';

    void reply.setCookie(COOKIES.accessToken, result.accessToken, {
      httpOnly: true,
      secure,
      // Lax, not Strict: a parent following a fee-reminder link from WhatsApp
      // must arrive signed in. Lax still blocks the cross-site POST that CSRF
      // needs, and state-changing requests additionally carry a CSRF token.
      sameSite: 'lax',
      path: '/',
      domain: this.env.COOKIE_DOMAIN,
    });

    void reply.setCookie(COOKIES.refreshToken, result.refreshToken, {
      httpOnly: true,
      secure,
      sameSite: 'lax',
      // Scoped to the refresh endpoint: an XSS that could read cookies still
      // would not have this one attached to an arbitrary request.
      path: ROUTES.auth.refresh,
      domain: this.env.COOKIE_DOMAIN,
      expires: result.refreshExpiresAt,
    });
  }

  private clearSessionCookies(reply: FastifyReply): void {
    void reply.clearCookie(COOKIES.accessToken, { path: '/', domain: this.env.COOKIE_DOMAIN });
    void reply.clearCookie(COOKIES.refreshToken, {
      path: ROUTES.auth.refresh,
      domain: this.env.COOKIE_DOMAIN,
    });
  }
}
