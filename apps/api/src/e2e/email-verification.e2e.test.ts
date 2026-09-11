import { COOKIES, CURRENT_TERMS_VERSION, ROUTES } from '@ilm/contracts';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { Test } from '@nestjs/testing';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { AppModule } from '../app.module';
import { createAdminClient, type PrismaClient } from '../prisma';
import { MAIL, type MailMessage, type MailPort, type MailResult } from '../shared/mail/mail.port';

/**
 * Email verification — ADR-0012.
 *
 * ADR-0010 shipped self-serve signup with this listed as a known gap: the
 * owner's address is the only route back into a tenant nobody has an operator
 * for, and an unproved address is a school one forgotten password from being
 * lost.
 *
 * What is under test is mostly the *negative* space — the link cannot be
 * replayed, cannot be used against another school, and cannot quietly verify an
 * address that changed after it was sent. The happy path is one assertion; the
 * ways a token must fail are six.
 *
 * ## The mailer is replaced, not disabled
 *
 * `MAIL` is overridden with a recorder, so these tests read the token out of
 * **the message a recipient would actually receive** rather than out of the
 * database. That matters: a token that is correct in the row but missing or
 * malformed in the email is a bug this suite would otherwise not see.
 *
 * It also makes delivery failure testable, which is the one thing a log mailer
 * can never do — and there is a regression below that depends on it.
 */

const SLUG = 'verify-e2e-school';
const HOST = `${SLUG}.localhost`;
const OTHER_SLUG = 'verify-e2e-other';
const OTHER_HOST = `${OTHER_SLUG}.localhost`;
/** Its own school, because the resend regression mutates timestamps. */
const RESEND_SLUG = 'verify-e2e-resend';
const RESEND_HOST = `${RESEND_SLUG}.localhost`;
const APEX = 'localhost';

const OWNER_EMAIL = 'founder@verify-e2e.test';
const OTHER_EMAIL = `other@${OTHER_SLUG}.test`;
const RESEND_EMAIL = `owner@${RESEND_SLUG}.test`;
const PASSWORD = 'a-long-enough-passphrase';

const ALL_SLUGS = [SLUG, OTHER_SLUG, RESEND_SLUG];

/**
 * A mailer that keeps what it was given, and can be told to fail once.
 *
 * `failNext` is what makes the "a failed send must not strand the recipient"
 * regression expressible at all.
 */
class RecordingMailer implements MailPort {
  readonly driver = 'recording';
  readonly delivered: MailMessage[] = [];
  failNext = false;

  send(message: MailMessage): Promise<MailResult> {
    if (this.failNext) {
      this.failNext = false;
      return Promise.resolve({ sent: false, error: 'simulated relay failure' });
    }
    this.delivered.push(message);
    return Promise.resolve({ sent: true, id: `test-${String(this.delivered.length)}` });
  }

  /** The token out of the most recent message to this address, as a person would. */
  tokenFor(email: string): string | undefined {
    for (let index = this.delivered.length - 1; index >= 0; index -= 1) {
      const message = this.delivered[index];
      if (message?.to === email) {
        return /\/verify-email\?t=([A-Za-z0-9_-]+)/.exec(message.text)?.[1];
      }
    }
    return undefined;
  }

  countTo(email: string): number {
    return this.delivered.filter((message) => message.to === email).length;
  }
}

let app: NestFastifyApplication;
let admin: PrismaClient;
let mailer: RecordingMailer;

async function wipe(): Promise<void> {
  const rows = await admin.$queryRaw<{ id: string }[]>`
    SELECT id FROM schools WHERE slug = ANY(${ALL_SLUGS})
  `;
  const ids = rows.map((row) => row.id);
  if (ids.length === 0) {
    return;
  }

  for (const table of [
    'email_verifications',
    'auth_handoffs',
    'school_agreements',
    'sessions',
    'audit_logs',
    'user_roles',
    'users',
  ]) {
    await admin.$executeRawUnsafe(`DELETE FROM "${table}" WHERE school_id = ANY($1::uuid[])`, ids);
  }
  await admin.$executeRawUnsafe(`DELETE FROM schools WHERE id = ANY($1::uuid[])`, ids);
}

function signupPayload(slug: string, email: string) {
  return {
    school: {
      name: `Verify ${slug}`,
      slug,
      city: 'Lahore',
      phone: '+923001234567',
      email: `office@${slug}.test`,
      timezone: 'Asia/Karachi',
      locale: 'en' as const,
    },
    owner: { name: 'Founder', email, password: PASSWORD },
    acceptedTerms: true as const,
    termsVersion: CURRENT_TERMS_VERSION,
  };
}

/** Sign in and return the access-token cookie value. */
async function accessTokenFor(host: string, email: string): Promise<string> {
  const response = await app.inject({
    method: 'POST',
    url: ROUTES.auth.login,
    headers: { host },
    payload: { identifier: email, password: PASSWORD },
  });

  const raw = response.headers['set-cookie'];
  const jar = (Array.isArray(raw) ? raw : [String(raw)]).join(';');
  return new RegExp(`${COOKIES.accessToken}=([^;]+)`).exec(jar)?.[1] ?? '';
}

/**
 * Step a token's `sent_at` back past the resend cooldown.
 *
 * The timestamp is computed **here and passed as a parameter**, never as SQL
 * `now() - interval '...'`. That distinction cost an hour once and is worth the
 * comment: a timestamp a `$queryRaw` computes inline comes back through Prisma
 * misread by the session's UTC offset (Asia/Karachi, so five hours), while a
 * JS `Date` sent as a parameter round-trips exactly. Written the SQL way, this
 * moved `sent_at` into the *future* and every resend was silently refused by
 * the cooldown — which made the regression below pass for the wrong reason.
 *
 * Stored columns are unaffected either way; this is a raw-SQL authoring trap,
 * not a data one.
 */
async function stepPastCooldown(email: string): Promise<void> {
  const wellBefore = new Date(Date.now() - 5 * 60 * 1000);
  await admin.$executeRaw`
    UPDATE email_verifications SET sent_at = ${wellBefore} WHERE email = ${email}
  `;
}

function verifyWith(host: string, token: string) {
  return app.inject({
    method: 'POST',
    url: ROUTES.auth.verifyEmail,
    headers: { host },
    payload: { token },
  });
}

beforeAll(async () => {
  process.env['APP_DOMAIN'] = 'localhost';

  admin = createAdminClient({ url: process.env['DATABASE_ADMIN_URL'] ?? '' });
  await wipe();

  mailer = new RecordingMailer();

  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(MAIL)
    .useValue(mailer)
    .compile();

  app = moduleRef.createNestApplication<NestFastifyApplication>(new FastifyAdapter());

  const { default: cookie } = await import('@fastify/cookie');
  await app.register(cookie);
  await app.init();
  await app.getHttpAdapter().getInstance().ready();

  for (const [slug, email] of [
    [SLUG, OWNER_EMAIL],
    [OTHER_SLUG, OTHER_EMAIL],
    [RESEND_SLUG, RESEND_EMAIL],
  ] as const) {
    const response = await app.inject({
      method: 'POST',
      url: ROUTES.public.signup,
      headers: { host: APEX },
      payload: signupPayload(slug, email),
    });
    expect(response.statusCode).toBe(201);
  }
}, 60_000);

afterAll(async () => {
  await app?.close();
  await wipe();
  await admin.$disconnect();
});

describe('signup sends a confirmation message', () => {
  it('emails the owner a link carrying a usable token', () => {
    expect(mailer.countTo(OWNER_EMAIL)).toBe(1);

    const message = mailer.delivered.find((entry) => entry.to === OWNER_EMAIL);
    expect(message?.subject).toContain('Confirm your email');
    // Both parts, always: some people read the text one, and every spam filter
    // does — an HTML-only message scores badly before anyone sees it.
    expect(message?.text).toContain('/verify-email?t=');
    expect(message?.html).toContain('/verify-email?t=');
    // The link must point at the school's own hostname, never the apex.
    expect(message?.text).toContain(`${SLUG}.localhost`);

    expect(mailer.tokenFor(OWNER_EMAIL)).toBeTruthy();
  });

  it('creates the owner unverified', async () => {
    const users = await admin.$queryRaw<{ email_verified_at: Date | null }[]>`
      SELECT email_verified_at FROM users WHERE email = ${OWNER_EMAIL}
    `;
    expect(users).toHaveLength(1);
    // Signing up is a claim about an address, not proof of it.
    expect(users[0]?.email_verified_at).toBeNull();
  });

  it('reports the owner as unverified in the session, so the shell can nag', async () => {
    const signIn = await app.inject({
      method: 'POST',
      url: ROUTES.auth.login,
      headers: { host: HOST },
      payload: { identifier: OWNER_EMAIL, password: PASSWORD },
    });

    expect(signIn.statusCode).toBe(201);
    const body = signIn.json<{ data: { kind: string; user: { emailVerified: boolean } } }>();
    expect(body.data.kind).toBe('session');
    expect(body.data.user.emailVerified).toBe(false);
  });

  it('does not block sign-in', async () => {
    // ADR-0010's argument — a dead end between intent and product is where
    // trials die — did not stop being true when verification arrived.
    const response = await app.inject({
      method: 'POST',
      url: ROUTES.auth.login,
      headers: { host: HOST },
      payload: { identifier: OWNER_EMAIL, password: PASSWORD },
    });
    expect(response.statusCode).toBe(201);
  });
});

describe('following the link', () => {
  it('cannot be redeemed at another school’s address', async () => {
    // Checked before the happy path so the token is still unspent. The token
    // belongs to OTHER_SLUG; present it at SLUG.
    const token = mailer.tokenFor(OTHER_EMAIL) ?? '';
    expect(await verifyWith(HOST, token).then((r) => r.statusCode)).toBe(401);

    // And it must still work where it belongs — a failed attempt elsewhere must
    // not burn it.
    expect(await verifyWith(OTHER_HOST, token).then((r) => r.statusCode)).toBe(201);
  });

  it('is refused at the apex, where there is no school to scope it to', async () => {
    const token = mailer.tokenFor(OWNER_EMAIL) ?? '';
    const response = await verifyWith(APEX, token);
    expect(response.statusCode).toBe(401);
  });

  it('rejects a made-up token', async () => {
    const response = await verifyWith(HOST, 'not-a-real-token');
    expect(response.statusCode).toBe(401);
  });

  it('confirms the address', async () => {
    const token = mailer.tokenFor(OWNER_EMAIL) ?? '';
    const response = await verifyWith(HOST, token);

    expect(response.statusCode).toBe(201);
    expect(response.json<{ data: { email: string } }>().data.email).toBe(OWNER_EMAIL);

    const users = await admin.$queryRaw<{ email_verified_at: Date | null }[]>`
      SELECT email_verified_at FROM users WHERE email = ${OWNER_EMAIL}
    `;
    expect(users[0]?.email_verified_at).not.toBeNull();
  });

  it('shows the session as verified afterwards', async () => {
    const response = await app.inject({
      method: 'POST',
      url: ROUTES.auth.login,
      headers: { host: HOST },
      payload: { identifier: OWNER_EMAIL, password: PASSWORD },
    });
    expect(
      response.json<{ data: { user: { emailVerified: boolean } } }>().data.user.emailVerified,
    ).toBe(true);
  });

  it('cannot be followed twice', async () => {
    const token = mailer.tokenFor(OWNER_EMAIL) ?? '';
    const response = await verifyWith(HOST, token);
    expect(response.statusCode).toBe(401);
  });

  it('will not verify an address that changed after the link was sent', async () => {
    // OTHER_EMAIL was verified above, so start it over with a fresh unverified
    // state and a fresh link.
    await admin.$executeRaw`
      UPDATE users SET email_verified_at = NULL WHERE email = ${OTHER_EMAIL}
    `;
    await stepPastCooldown(OTHER_EMAIL);

    const token = await accessTokenFor(OTHER_HOST, OTHER_EMAIL);
    const resend = await app.inject({
      method: 'POST',
      url: ROUTES.auth.resendVerification,
      headers: { host: OTHER_HOST, cookie: `${COOKIES.accessToken}=${token}` },
    });
    expect(resend.statusCode).toBe(201);

    const link = mailer.tokenFor(OTHER_EMAIL) ?? '';

    // The person changes their address between the link being sent and clicked.
    // The token proved control of the old one, which is not the claim the
    // account would be recording.
    await admin.$executeRaw`
      UPDATE users SET email = ${`changed-${OTHER_EMAIL}`} WHERE email = ${OTHER_EMAIL}
    `;

    expect(await verifyWith(OTHER_HOST, link).then((r) => r.statusCode)).toBe(401);

    const users = await admin.$queryRaw<{ email_verified_at: Date | null }[]>`
      SELECT email_verified_at FROM users WHERE email = ${`changed-${OTHER_EMAIL}`}
    `;
    expect(users[0]?.email_verified_at).toBeNull();
  });
});

describe('asking for another message', () => {
  it('refuses without a session, so it cannot mail strangers', async () => {
    const response = await app.inject({
      method: 'POST',
      url: ROUTES.auth.resendVerification,
      headers: { host: RESEND_HOST },
    });
    expect(response.statusCode).toBe(401);
  });

  it('takes no email address at all', async () => {
    // The endpoint's signature is the defence: there is no field to put someone
    // else's address in, so it cannot become an existence oracle.
    const token = await accessTokenFor(HOST, OWNER_EMAIL);
    const before = mailer.delivered.length;

    const response = await app.inject({
      method: 'POST',
      url: ROUTES.auth.resendVerification,
      headers: { host: HOST, cookie: `${COOKIES.accessToken}=${token}` },
      payload: { email: 'somebody-else@example.test' },
    });

    // This owner is verified by now, so nothing is sent — and certainly nothing
    // to the address in the body.
    expect(response.statusCode).toBe(201);
    expect(response.json<{ data: { sent: boolean } }>().data.sent).toBe(false);
    expect(mailer.delivered.length).toBe(before);
  });

  it('holds off a second message inside the cooldown', async () => {
    const token = await accessTokenFor(RESEND_HOST, RESEND_EMAIL);

    const response = await app.inject({
      method: 'POST',
      url: ROUTES.auth.resendVerification,
      headers: { host: RESEND_HOST, cookie: `${COOKIES.accessToken}=${token}` },
    });

    const body = response.json<{ data: { sent: boolean; retryAfterSeconds?: number } }>().data;
    expect(body.sent).toBe(false);
    // "Wait 43 seconds" is actionable; "could not send" invites another click.
    expect(body.retryAfterSeconds).toBeGreaterThan(0);
  });

  /**
   * The regression that motivated reordering `sendVerification`.
   *
   * Superseding earlier tokens *before* attempting the send meant a relay
   * failure left the person with nothing: the link they already had was dead
   * and its replacement had never arrived. The recovery was to click "Send
   * again" and hope — on a path they reach precisely because sending is
   * already failing.
   */
  it('leaves the earlier link working when the replacement cannot be sent', async () => {
    const original = mailer.tokenFor(RESEND_EMAIL) ?? '';
    expect(original).toBeTruthy();

    // Step past the cooldown without sleeping for a minute.
    await stepPastCooldown(RESEND_EMAIL);

    mailer.failNext = true;
    const token = await accessTokenFor(RESEND_HOST, RESEND_EMAIL);

    const resend = await app.inject({
      method: 'POST',
      url: ROUTES.auth.resendVerification,
      headers: { host: RESEND_HOST, cookie: `${COOKIES.accessToken}=${token}` },
    });

    expect(resend.statusCode).toBe(201);

    const body = resend.json<{ data: { sent: boolean; retryAfterSeconds?: number } }>().data;
    expect(body.sent).toBe(false);
    // It must have failed *at the relay*, not been turned away by the cooldown.
    // Without this the test passes for the wrong reason: a cooldown block never
    // reaches the supersede, so the earlier link survives either way.
    expect(body.retryAfterSeconds).toBeUndefined();
    expect(mailer.failNext).toBe(false);

    // The point of the whole test: the link they are holding still works.
    const response = await verifyWith(RESEND_HOST, original);
    expect(response.statusCode).toBe(201);
    expect(response.json<{ data: { email: string } }>().data.email).toBe(RESEND_EMAIL);
  });
});
