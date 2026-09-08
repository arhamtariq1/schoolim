import {
  ROUTES,
  signupRequestSchema,
  type SignupResult,
  type SlugAvailability,
} from '@ilm/contracts';
import { Body, Controller, Get, Inject, Post, Query, Req } from '@nestjs/common';
import { type FastifyRequest } from 'fastify';

import { Public } from '../../shared/auth/auth.guard';
import { RateLimit } from '../../shared/http/rate-limit.guard';
import { CLOCK, type Clock } from '../../shared/time/clock.provider';

import { SignupService } from './signup.service';

/**
 * The unauthenticated surface — ADR-0010.
 *
 * Two endpoints, and the count is deliberate. This is the only part of the API
 * anyone on the internet can call without a session, so it is kept small enough
 * to hold in your head: one that creates a tenant, one that answers yes or no
 * about a name. Anything else that wants to live here should be asked twice.
 *
 * Both are rate limited (see `RateLimitGuard` for what that limit is and is
 * not), and neither has a tenant — they run before one exists, which is why
 * they are `@Public()` and why `TenantGuard` steps aside.
 */
@Controller()
export class PublicController {
  constructor(
    private readonly signups: SignupService,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  /**
   * Create a school and start its trial.
   *
   * Ten per hour per address. A school signs up once; a person retrying a
   * failed form does it three or four times, and a rejected attempt costs a
   * slot too because the limit runs before validation. Anything beyond that is
   * not a school, and each attempt that got through would be a tenant row and a
   * subdomain claimed.
   */
  @Public()
  @RateLimit({ limit: 10, windowSeconds: 3600 })
  @Post(ROUTES.public.signup)
  async signup(
    @Body() body: unknown,
    @Req() request: FastifyRequest,
  ): Promise<{ data: SignupResult }> {
    const input = signupRequestSchema.parse(body);

    const result = await this.signups.signup(input, this.clock.now(), {
      ip: request.ip,
      userAgent: request.headers['user-agent'],
    });

    return { data: result };
  }

  /**
   * Is this subdomain available?
   *
   * Generous, because it fires while someone types. Tight enough that it is not
   * a convenient way to enumerate every school on the platform at speed — which
   * it can do slowly regardless, and which is discussed honestly in the service.
   */
  @Public()
  @RateLimit({ limit: 60, windowSeconds: 60 })
  @Get(ROUTES.public.slugAvailable)
  async slugAvailable(@Query('slug') slug?: string): Promise<{ data: SlugAvailability }> {
    return { data: await this.signups.checkSlug(slug ?? '') };
  }
}
