import {
  COOKIES,
  createSchoolSchema,
  platformLoginSchema,
  ROUTES,
  schoolListQuerySchema,
  slugSchema,
  type CreateSchoolResult,
  type PlatformSession,
  type SchoolListItem,
} from '@ilm/contracts';
import { Body, Controller, Get, Inject, Post, Query, Req, Res } from '@nestjs/common';
import { type FastifyReply, type FastifyRequest } from 'fastify';

import { ENV, type Env } from '../../config/env';
import { Public } from '../../shared/auth/auth.guard';
import { PlatformRoute, RequiresPlatform } from '../../shared/auth/platform.guard';
import { BusinessRuleError } from '../../shared/errors/domain-error';
import { CLOCK, type Clock } from '../../shared/time/clock.provider';

import { PlatformAuthService, type PlatformLoginResult } from './platform-auth.service';
import { SchoolsService } from './schools.service';

/**
 * The platform console API.
 *
 * `@PlatformRoute()` on the class, not on each method — an endpoint added here
 * later is guarded by default rather than by remembering. It changes the whole
 * chain: the token is read from `ilm_pat`, the tenant guard steps aside, and
 * `PlatformGuard` demands a live platform account plus the declared capability.
 *
 * Cookies here are **host-only and separate**. The console lives on its own
 * hostname with its own cookie names, so a browser signed into both a school
 * and the console holds two sessions that cannot be substituted for one
 * another, even by accident.
 */
@PlatformRoute()
@Controller()
export class PlatformController {
  constructor(
    private readonly auth: PlatformAuthService,
    private readonly schools: SchoolsService,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(ENV) private readonly env: Env,
  ) {}

  @Public()
  @Post(ROUTES.platform.auth.login)
  async login(
    @Body() body: unknown,
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ): Promise<{ data: PlatformSession }> {
    const input = platformLoginSchema.parse(body);

    const result = await this.auth.login(input.email, input.password, this.clock.now(), {
      ip: request.ip,
      userAgent: request.headers['user-agent'],
    });

    this.setCookies(reply, result);
    return { data: result.user };
  }

  @Post(ROUTES.platform.auth.logout)
  @Public()
  async logout(
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ): Promise<{ data: { ok: true } }> {
    const cookies = request.cookies as Record<string, string | undefined> | undefined;
    await this.auth.logout(cookies?.[COOKIES.platformRefreshToken], this.clock.now());
    this.clearCookies(reply);
    return { data: { ok: true } };
  }

  @Get(ROUTES.platform.auth.session)
  async session(@Req() request: FastifyRequest): Promise<{ data: PlatformSession }> {
    const platformUser = request.platformUser;
    if (platformUser === undefined) {
      throw new BusinessRuleError('AUTH_TOKEN_INVALID', 'Sign in to continue.');
    }

    const user = await this.auth.session(platformUser.id);
    if (user === undefined) {
      throw new BusinessRuleError('AUTH_TOKEN_INVALID', 'Your session has ended. Sign in again.');
    }

    return { data: user };
  }

  @Get(ROUTES.platform.schools.list)
  @RequiresPlatform('schools.read')
  async listSchools(
    @Query() query: unknown,
  ): Promise<{ data: SchoolListItem[]; meta: { total: number } }> {
    const parsed = schoolListQuerySchema.parse(query ?? {});
    const { rows, total } = await this.schools.list(parsed);
    return { data: rows, meta: { total } };
  }

  /**
   * Is this short name free?
   *
   * Behind the platform guard, so it discloses a tenant's existence only to
   * someone who can already list every tenant. The same endpoint on a public
   * route would be a customer-list oracle.
   */
  @Get(ROUTES.platform.schools.slugAvailable)
  @RequiresPlatform('schools.read')
  async slugAvailable(
    @Query('slug') slug: unknown,
  ): Promise<{ data: { slug: string; available: boolean } }> {
    const parsed = slugSchema.safeParse(slug);
    if (!parsed.success) {
      return { data: { slug: typeof slug === 'string' ? slug : '', available: false } };
    }
    return {
      data: { slug: parsed.data, available: await this.schools.isSlugAvailable(parsed.data) },
    };
  }

  @Post(ROUTES.platform.schools.create)
  @RequiresPlatform('schools.create')
  async createSchool(@Body() body: unknown): Promise<{ data: CreateSchoolResult }> {
    const input = createSchoolSchema.parse(body);
    return { data: await this.schools.create(input, this.clock.now()) };
  }

  private cookieScope(): { domain?: string } {
    return this.env.COOKIE_DOMAIN === undefined ? {} : { domain: this.env.COOKIE_DOMAIN };
  }

  private setCookies(reply: FastifyReply, result: PlatformLoginResult): void {
    const secure = this.env.NODE_ENV === 'production';

    void reply.setCookie(COOKIES.platformAccessToken, result.accessToken, {
      httpOnly: true,
      secure,
      // Strict, not Lax. Nothing should ever navigate into the console from
      // another site, so there is no reason to send this cookie on one.
      sameSite: 'strict',
      path: '/',
      ...this.cookieScope(),
    });

    void reply.setCookie(COOKIES.platformRefreshToken, result.refreshToken, {
      httpOnly: true,
      secure,
      sameSite: 'strict',
      path: '/',
      expires: result.refreshExpiresAt,
      ...this.cookieScope(),
    });
  }

  private clearCookies(reply: FastifyReply): void {
    void reply.clearCookie(COOKIES.platformAccessToken, { path: '/', ...this.cookieScope() });
    void reply.clearCookie(COOKIES.platformRefreshToken, { path: '/', ...this.cookieScope() });
  }
}
