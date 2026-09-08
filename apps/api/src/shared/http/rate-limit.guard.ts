import { CanActivate, Injectable, SetMetadata, type ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { type FastifyRequest } from 'fastify';

import { BusinessRuleError } from '../errors/domain-error';

/**
 * A fixed-window rate limit for the unauthenticated surface.
 *
 * ## Why this exists now
 *
 * Everything else in the API is behind a session. `POST /public/signup` and
 * apex sign-in are not: anyone on the internet can call them, signup writes a
 * row per call, and apex sign-in performs four argon2 verifications per call by
 * design (see `CANDIDATE_SLOTS`). Four unbounded argon2 runs per request is a
 * CPU-exhaustion primitive handed out for free, so the limit ships with the
 * endpoints rather than after the first incident.
 *
 * ## What it is not
 *
 * **In-memory, therefore per-instance.** Two API instances allow twice the
 * quota, and a restart forgets everything. That is honest for a single-instance
 * deployment and wrong the moment there are two — the counter moves to Redis
 * (already a dependency, docs/05) before the API is scaled horizontally, and
 * the interface here does not change when it does.
 *
 * It is also not a defence against a distributed attacker, who has more IPs
 * than this has buckets. It stops the accidental loop and the single-host
 * script, which is most of what actually happens.
 */

interface RateLimitRule {
  /** Requests allowed per window. */
  readonly limit: number;
  readonly windowSeconds: number;
}

export const RATE_LIMIT = 'rate_limit';

export const RateLimit = (rule: RateLimitRule) => SetMetadata(RATE_LIMIT, rule);

interface Bucket {
  count: number;
  resetAt: number;
}

@Injectable()
export class RateLimitGuard implements CanActivate {
  private readonly buckets = new Map<string, Bucket>();

  /**
   * A ceiling on distinct keys held at once. Without it, a stream of spoofed
   * source addresses turns the rate limiter itself into the memory leak it was
   * added to prevent.
   */
  private static readonly MAX_BUCKETS = 10_000;

  constructor(private readonly reflector: Reflector) {}

  canActivate(execution: ExecutionContext): boolean {
    const rule = this.reflector.getAllAndOverride<RateLimitRule | undefined>(RATE_LIMIT, [
      execution.getHandler(),
      execution.getClass(),
    ]);

    if (rule === undefined) {
      return true;
    }

    const request = execution.switchToHttp().getRequest<FastifyRequest>();
    // Fastify runs with `trustProxy`, so `request.ip` is the client's address
    // and not the portal's — which is the difference between limiting one
    // person and limiting everyone behind the same proxy.
    const key = `${request.routeOptions.url ?? request.url}:${request.ip}`;
    const now = Date.now();

    this.evictExpired(now);

    const bucket = this.buckets.get(key);

    if (bucket === undefined || bucket.resetAt <= now) {
      this.buckets.set(key, { count: 1, resetAt: now + rule.windowSeconds * 1000 });
      return true;
    }

    bucket.count += 1;

    if (bucket.count > rule.limit) {
      throw new BusinessRuleError(
        'RATE_LIMITED',
        'Too many attempts from this device. Wait a minute and try again.',
      );
    }

    return true;
  }

  /**
   * Sweep on write rather than on a timer: a `setInterval` in a guard keeps the
   * process alive in tests and has to be torn down by whoever constructed it,
   * which is a lifecycle problem for a counter this small.
   */
  private evictExpired(now: number): void {
    if (this.buckets.size < RateLimitGuard.MAX_BUCKETS) {
      return;
    }

    for (const [key, bucket] of this.buckets) {
      if (bucket.resetAt <= now) {
        this.buckets.delete(key);
      }
    }

    // Still full after evicting the expired ones means genuine pressure, not
    // stale entries. Drop the oldest rather than growing without bound; a
    // dropped bucket costs one caller a reset, and unbounded growth costs the
    // process.
    if (this.buckets.size >= RateLimitGuard.MAX_BUCKETS) {
      const oldest = this.buckets.keys().next();
      if (!oldest.done) {
        this.buckets.delete(oldest.value);
      }
    }
  }
}
