import {
  COOKIES,
  ROUTES,
  signupCompleteRequestSchema,
  signupStartRequestSchema,
  signupVerifyOtpRequestSchema,
  type SignupCompleteRequest,
  type SignupResendOtpResult,
  type SignupResult,
  type SignupStartRequest,
  type SignupStartResult,
  type SignupStatus,
  type SignupVerifyOtpResult,
  type SlugAvailability,
} from '@ilm/contracts';
import { Body, Controller, Get, HttpCode, Inject, Post, Query, Req, Res } from '@nestjs/common';
import { type FastifyReply, type FastifyRequest } from 'fastify';

import { ENV, type Env } from '../../config/env';
import { Public } from '../../shared/auth/auth.guard';
import { RateLimit } from '../../shared/http/rate-limit.guard';
import { CLOCK, type Clock } from '../../shared/time/clock.provider';

import { SignupService } from './signup.service';

/**
 * Unauthenticated signup surface — three steps, one cookie.
 *
 * The cookie is the only credential between steps. Tokens never appear in JSON
 * bodies (docs/11 §8).
 */
@Controller()
export class PublicController {
  constructor(
    private readonly signups: SignupService,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(ENV) private readonly env: Env,
  ) {}

  @Public()
  @RateLimit({ limit: 10, windowSeconds: 3600 })
  @HttpCode(201)
  @Post(ROUTES.public.signupStart)
  async start(
    @Body() body: unknown,
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ): Promise<{ data: SignupStartResult }> {
    const input: SignupStartRequest = signupStartRequestSchema.parse(body);
    const outcome = await this.signups.start(input, this.clock.now(), {
      ip: request.ip,
      userAgent: request.headers['user-agent'],
    });

    this.setSignupCookie(reply, outcome.sessionToken, outcome.expiresAt);
    return { data: outcome.result };
  }

  @Public()
  @RateLimit({ limit: 60, windowSeconds: 300 })
  @Get(ROUTES.public.signupStatus)
  async status(@Req() request: FastifyRequest): Promise<{ data: SignupStatus }> {
    const token = this.readSignupCookie(request);
    return { data: await this.signups.status(token, this.clock.now()) };
  }

  @Public()
  @RateLimit({ limit: 30, windowSeconds: 300 })
  @Post(ROUTES.public.signupVerifyOtp)
  async verifyOtp(
    @Body() body: unknown,
    @Req() request: FastifyRequest,
  ): Promise<{ data: SignupVerifyOtpResult }> {
    const input = signupVerifyOtpRequestSchema.parse(body);
    return {
      data: await this.signups.verifyOtp(this.readSignupCookie(request), input.code, this.clock.now()),
    };
  }

  @Public()
  @RateLimit({ limit: 10, windowSeconds: 300 })
  @Post(ROUTES.public.signupResendOtp)
  async resendOtp(@Req() request: FastifyRequest): Promise<{ data: SignupResendOtpResult }> {
    return {
      data: await this.signups.resendOtp(this.readSignupCookie(request), this.clock.now()),
    };
  }

  @Public()
  @RateLimit({ limit: 10, windowSeconds: 3600 })
  @HttpCode(201)
  @Post(ROUTES.public.signupComplete)
  async complete(
    @Body() body: unknown,
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ): Promise<{ data: SignupResult }> {
    const input: SignupCompleteRequest = signupCompleteRequestSchema.parse(body);
    const result = await this.signups.complete(this.readSignupCookie(request), input, this.clock.now(), {
      ip: request.ip,
      userAgent: request.headers['user-agent'],
    });

    this.clearSignupCookie(reply);
    return { data: result };
  }

  @Public()
  @RateLimit({ limit: 60, windowSeconds: 60 })
  @Get(ROUTES.public.slugAvailable)
  async slugAvailable(@Query('slug') slug?: string): Promise<{ data: SlugAvailability }> {
    return { data: await this.signups.checkSlug(slug ?? '') };
  }

  private readSignupCookie(request: FastifyRequest): string | undefined {
    const cookies = request.cookies as Record<string, string | undefined> | undefined;
    const value = cookies?.[COOKIES.signupToken];
    return value === undefined || value === '' ? undefined : value;
  }

  private cookieScope(): { domain?: string } {
    return this.env.COOKIE_DOMAIN === undefined ? {} : { domain: this.env.COOKIE_DOMAIN };
  }

  private setSignupCookie(reply: FastifyReply, token: string, expiresAt: Date): void {
    void reply.setCookie(COOKIES.signupToken, token, {
      httpOnly: true,
      secure: this.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      expires: expiresAt,
      ...this.cookieScope(),
    });
  }

  private clearSignupCookie(reply: FastifyReply): void {
    void reply.clearCookie(COOKIES.signupToken, { path: '/', ...this.cookieScope() });
  }
}
