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
  /**
   * Deliberately **unset by default**, which makes session cookies host-only.
   *
   * Every school gets its own hostname, so a host-only cookie means Beacon's
   * browser never transmits Demo's session token at all — rather than sending
   * it and relying on the tenant guard to reject it. Setting this to the apex
   * domain would share one cookie across every tenant subdomain and turn any
   * one school's XSS into a foothold against the others.
   *
   * Set it only if a deployment genuinely needs a cookie shared across
   * subdomains. Nothing does today.
   */
  COOKIE_DOMAIN: z.string().min(1).optional(),

  // --- HTTP -----------------------------------------------------------------
  API_PORT: z.coerce.number().int().min(1).max(65_535).default(4000),
  API_URL: z.string().default('http://localhost:4000'),
  /**
   * Where the school portal is served. Used only to build absolute URLs that
   * point back at it — the sign-in handoff (ADR-0009) and the login link the
   * platform console shows after creating a school. In production the apex
   * domain implies the port; locally it does not.
   */
  WEB_URL: z.string().default('http://localhost:3000'),

  /**
   * The apex domain tenant subdomains hang off, e.g. `example.pk` for
   * `beacon.example.pk`. Used by the tenant guard to extract the slug from the
   * request host.
   */
  APP_DOMAIN: z.string().default('localhost'),

  /**
   * How the portal names a school in a URL.
   *
   * `subdomain` — the default and the intended production mode — is
   * `beacon.<APP_DOMAIN>`. `path` is a temporary mode for hosts that cannot
   * issue wildcard subdomains, where the school is the first path segment
   * instead: `<WEB_URL>/beacon`.
   *
   * The API only needs to know because it builds absolute links back into the
   * portal — the sign-in handoff, the email-confirmation link, and the login URL
   * the platform console shows after creating a school. Tenant *resolution* is
   * unaffected: the portal names the school in `x-school-slug` either way.
   *
   * Must match the portal's `PORTAL_TENANT_MODE`. See docs/SINGLE-HOST-MODE.md.
   */
  PORTAL_TENANT_MODE: z.enum(['subdomain', 'path']).default('subdomain'),

  // --- Mail -----------------------------------------------------------------
  /**
   * Which `MailPort` implementation to construct (ADR-0011).
   *
   * Defaults to `log`, which sends nothing and says so. That default is
   * deliberate and not laziness: a deployment that forgets to configure mail
   * should send none rather than silently send it from whatever identity
   * happens to be lying around. Failing to send is recoverable; sending as the
   * wrong sender is not.
   */
  MAIL_DRIVER: z.enum(['log', 'smtp']).default('log'),
  SMTP_HOST: z.string().default('localhost'),
  SMTP_PORT: z.coerce.number().int().min(1).max(65_535).default(1025),
  /**
   * Implicit TLS from the first byte — port 465. Port 587 starts in the clear
   * and upgrades, so it is `false` here and STARTTLS is required by the driver.
   * The two are not interchangeable: `true` on 587 hangs until the socket
   * times out.
   */
  SMTP_SECURE: z
    .union([z.boolean(), z.enum(['true', 'false'])])
    .transform((value) => value === true || value === 'true')
    .default(false),
  /** Unset for mailpit, which wants no credentials and refuses an empty AUTH. */
  SMTP_USER: z.string().min(1).optional(),
  SMTP_PASS: z.string().min(1).optional(),
  /**
   * The envelope sender. Most relays — Gmail among them — reject or rewrite a
   * `From` that is not the authenticated account, so this normally equals
   * `SMTP_USER`.
   */
  MAIL_FROM: z.string().min(1).default('no-reply@localhost'),

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
