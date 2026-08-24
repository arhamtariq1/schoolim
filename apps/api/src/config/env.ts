import { z } from 'zod';

/**
 * Environment, validated at boot.
 *
 * docs/03 section 8: the process **refuses to start** on an invalid environment.
 * A misconfigured production start is far worse than a failed one — a server
 * that boots with a missing JWT secret or a database URL pointing somewhere
 * unexpected will do damage before anyone notices.
 */
const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),

  // --- Database -------------------------------------------------------------
  /** The RLS-enforcing application role. All tenant traffic. Never BYPASSRLS. */
  DATABASE_URL: z.string().min(1),
  /** The owner role. Migrations, platform routes and tenant resolution only. */
  DATABASE_ADMIN_URL: z.string().min(1),

  // --- Auth -----------------------------------------------------------------
  /**
   * 32 bytes minimum. Shorter secrets are brute-forceable offline once a single
   * token leaks, and tokens leak from logs, proxies and browser extensions.
   */
  JWT_ACCESS_SECRET: z.string().min(32),
  JWT_ACCESS_TTL: z.string().default('15m'),
  REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().min(1).max(365).default(30),
  COOKIE_DOMAIN: z.string().default('localhost'),

  // --- HTTP -----------------------------------------------------------------
  API_PORT: z.coerce.number().int().min(1).max(65_535).default(4000),
  API_URL: z.string().default('http://localhost:4000'),

  /**
   * The apex domain tenant subdomains hang off, e.g. `ilm.pk` for
   * `beacon.ilm.pk`. Used by the tenant guard to extract the slug from the
   * request host.
   */
  APP_DOMAIN: z.string().default('localhost'),

  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
});

export type Env = z.infer<typeof envSchema>;

/**
 * Parse and validate. Throws with every problem listed at once, rather than
 * one per restart.
 */
export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const parsed = envSchema.safeParse(source);

  if (!parsed.success) {
    const problems = parsed.error.issues
      .map((issue) => `  ${issue.path.join('.')}: ${issue.message}`)
      .join('\n');
    throw new Error(`Invalid environment:\n${problems}`);
  }

  return parsed.data;
}

/**
 * DI token. `Env` is a zod-inferred type, not a class, so it cannot be a Nest
 * provider token on its own.
 */
export const ENV = 'ENV';
