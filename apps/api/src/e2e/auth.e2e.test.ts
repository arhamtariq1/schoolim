import { COOKIES, ROUTES } from '@ilm/contracts';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { Test } from '@nestjs/testing';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { AppModule } from '../app.module';
import { createAdminClient, type PrismaClient } from '../prisma';
import { PasswordService } from '../shared/auth/password.service';

/**
 * Gate 2 (docs/20): the guard chain fails closed, and a refresh token cannot be
 * replayed.
 *
 * Driven through Fastify's `inject`, so the whole real pipeline runs —
 * middleware, all three guards, the interceptor and the exception filter — with
 * no port binding and no HTTP client.
 *
 * These tests need a real database and must never be skipped: what they prove
 * is the thing that ends the company if it breaks.
 */

const SCHOOL_A = '33333333-3333-4333-8333-333333333331';
const SCHOOL_B = '33333333-3333-4333-8333-333333333332';
const USER_A = '44444444-4444-4444-8444-444444444441';

const HOST_A = 'school-a-e2e.localhost';
const HOST_B = 'school-b-e2e.localhost';
const PASSWORD = 'correct-horse-battery-staple';

let app: NestFastifyApplication;
let admin: PrismaClient;

function cookiesFrom(headers: Record<string, unknown>): Record<string, string> {
  const raw = headers['set-cookie'];
  const list: string[] = Array.isArray(raw)
    ? (raw as string[])
    : typeof raw === 'string'
      ? [raw]
      : [];
  const jar: Record<string, string> = {};
  for (const entry of list) {
    const [pair] = entry.split(';');
    const index = pair?.indexOf('=') ?? -1;
    if (pair !== undefined && index > 0) {
      jar[pair.slice(0, index)] = pair.slice(index + 1);
    }
  }
  return jar;
}

beforeAll(async () => {
  process.env['APP_DOMAIN'] = 'localhost';

  admin = createAdminClient({ url: process.env['DATABASE_ADMIN_URL'] ?? '' });

  await admin.$executeRaw`DELETE FROM sessions WHERE school_id IN (${SCHOOL_A}::uuid, ${SCHOOL_B}::uuid)`;
  await admin.$executeRaw`DELETE FROM audit_logs WHERE school_id IN (${SCHOOL_A}::uuid, ${SCHOOL_B}::uuid)`;
  await admin.$executeRaw`DELETE FROM user_roles WHERE school_id IN (${SCHOOL_A}::uuid, ${SCHOOL_B}::uuid)`;
  await admin.$executeRaw`DELETE FROM users WHERE school_id IN (${SCHOOL_A}::uuid, ${SCHOOL_B}::uuid)`;
  await admin.$executeRaw`DELETE FROM schools WHERE id IN (${SCHOOL_A}::uuid, ${SCHOOL_B}::uuid)`;

  await admin.$executeRaw`
    INSERT INTO schools (id, name, slug, created_at, updated_at) VALUES
      (${SCHOOL_A}::uuid, 'E2E School A', 'school-a-e2e', now(), now()),
      (${SCHOOL_B}::uuid, 'E2E School B', 'school-b-e2e', now(), now())
  `;

  const hash = await new PasswordService().hash(PASSWORD);
  await admin.$executeRaw`
    INSERT INTO users (id, school_id, email, name, password_hash, status, created_at, updated_at)
    VALUES (${USER_A}::uuid, ${SCHOOL_A}::uuid, 'head@school-a-e2e.test', 'Head A', ${hash}, 'ACTIVE', now(), now())
  `;
  await admin.$executeRaw`
    INSERT INTO user_roles (id, school_id, user_id, role, created_at)
    VALUES (gen_random_uuid(), ${SCHOOL_A}::uuid, ${USER_A}::uuid, 'OWNER', now())
  `;

  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  app = moduleRef.createNestApplication<NestFastifyApplication>(new FastifyAdapter());

  const { default: cookie } = await import('@fastify/cookie');
  await app.register(cookie);
  await app.init();
  await app.getHttpAdapter().getInstance().ready();
}, 60_000);

afterAll(async () => {
  await app?.close();
  await admin.$executeRaw`DELETE FROM sessions WHERE school_id IN (${SCHOOL_A}::uuid, ${SCHOOL_B}::uuid)`;
  await admin.$executeRaw`DELETE FROM audit_logs WHERE school_id IN (${SCHOOL_A}::uuid, ${SCHOOL_B}::uuid)`;
  await admin.$executeRaw`DELETE FROM user_roles WHERE school_id IN (${SCHOOL_A}::uuid, ${SCHOOL_B}::uuid)`;
  await admin.$executeRaw`DELETE FROM users WHERE school_id IN (${SCHOOL_A}::uuid, ${SCHOOL_B}::uuid)`;
  await admin.$executeRaw`DELETE FROM schools WHERE id IN (${SCHOOL_A}::uuid, ${SCHOOL_B}::uuid)`;
  await admin.$disconnect();
});

async function login(host = HOST_A): Promise<{ status: number; jar: Record<string, string> }> {
  const response = await app.inject({
    method: 'POST',
    url: ROUTES.auth.login,
    headers: { host },
    payload: { identifier: 'head@school-a-e2e.test', password: PASSWORD },
  });
  return { status: response.statusCode, jar: cookiesFrom(response.headers) };
}

describe('the guard chain fails closed', () => {
  it('rejects a protected route with no token', async () => {
    const response = await app.inject({
      method: 'GET',
      url: ROUTES.auth.session,
      headers: { host: HOST_A },
    });
    expect(response.statusCode).toBe(401);
  });

  it('answers with problem+json, carrying a stable code and a request id', async () => {
    const response = await app.inject({
      method: 'GET',
      url: ROUTES.auth.session,
      headers: { host: HOST_A },
    });
    expect(response.headers['content-type']).toContain('application/problem+json');

    const body = response.json<{ code: string; requestId: string; status: number }>();
    expect(body.code).toBe('AUTH_TOKEN_INVALID');
    expect(body.requestId).toBeTruthy();
    expect(body.status).toBe(401);
  });

  it('rejects a garbage token without saying why', async () => {
    const response = await app.inject({
      method: 'GET',
      url: ROUTES.auth.session,
      headers: { host: HOST_A, cookie: `${COOKIES.accessToken}=not-a-jwt` },
    });
    expect(response.statusCode).toBe(401);
    expect(response.body).not.toContain('malformed');
  });

  it('leaves a public route reachable', async () => {
    const response = await app.inject({ method: 'GET', url: ROUTES.health });
    expect(response.statusCode).toBe(200);
  });
});

describe('sign-in', () => {
  it('accepts the right password and sets httpOnly cookies', async () => {
    const response = await app.inject({
      method: 'POST',
      url: ROUTES.auth.login,
      headers: { host: HOST_A },
      payload: { identifier: 'head@school-a-e2e.test', password: PASSWORD },
    });

    expect(response.statusCode).toBe(201);

    const raw = response.headers['set-cookie'];
    const list = Array.isArray(raw) ? raw : [String(raw)];
    // A token readable by script is a token any XSS can exfiltrate.
    expect(list.every((entry) => entry.includes('HttpOnly'))).toBe(true);

    // On a school's own hostname the outcome is a session, already set here.
    // The `handoff` variant only happens at the apex — see global-signin.e2e.
    const body = response.json<{
      data: { kind: string; user: { roles: string[]; permissions: string[] } };
    }>();
    expect(body.data.kind).toBe('session');
    expect(body.data.user.roles).toEqual(['OWNER']);
    expect(body.data.user.permissions.length).toBeGreaterThan(0);
    // Tokens never appear in the body.
    expect(response.body).not.toContain('eyJ');
  });

  it('gives the same answer for a wrong password and an unknown account', async () => {
    // Distinguishing them is a free account-enumeration oracle, and here the
    // enumerable set is every parent's email address.
    const wrongPassword = await app.inject({
      method: 'POST',
      url: ROUTES.auth.login,
      headers: { host: HOST_A },
      payload: { identifier: 'head@school-a-e2e.test', password: 'wrong-password-entirely' },
    });
    const unknownUser = await app.inject({
      method: 'POST',
      url: ROUTES.auth.login,
      headers: { host: HOST_A },
      payload: { identifier: 'nobody@school-a-e2e.test', password: PASSWORD },
    });

    expect(wrongPassword.statusCode).toBe(unknownUser.statusCode);
    expect(wrongPassword.json<{ code: string }>().code).toBe(
      unknownUser.json<{ code: string }>().code,
    );
    expect(wrongPassword.json<{ detail: string }>().detail).toBe(
      unknownUser.json<{ detail: string }>().detail,
    );
  });

  it('refuses a user from another school on this host', async () => {
    // The school is resolved from the host, so School A's account cannot sign
    // in at School B's address.
    const response = await app.inject({
      method: 'POST',
      url: ROUTES.auth.login,
      headers: { host: HOST_B },
      payload: { identifier: 'head@school-a-e2e.test', password: PASSWORD },
    });
    expect(response.statusCode).toBe(401);
  });

  it('refuses an unknown host outright', async () => {
    // A host that names a school which does not exist. Distinct from the apex,
    // which names no school at all and is global sign-in (ADR-0009).
    const response = await app.inject({
      method: 'POST',
      url: ROUTES.auth.login,
      headers: { host: 'nonexistent-school.localhost' },
      payload: { identifier: 'head@school-a-e2e.test', password: PASSWORD },
    });
    expect(response.statusCode).toBe(401);
  });

  it('rejects an unknown field rather than ignoring it', async () => {
    const response = await app.inject({
      method: 'POST',
      url: ROUTES.auth.login,
      headers: { host: HOST_A },
      payload: { identifier: 'head@school-a-e2e.test', password: PASSWORD, schoolId: SCHOOL_B },
    });
    // A caller must never be able to smuggle a tenant in through the body.
    expect(response.statusCode).toBeGreaterThanOrEqual(400);
  });
});

describe('a session is bound to its school', () => {
  it('accepts the token on its own host', async () => {
    const { jar } = await login();
    const response = await app.inject({
      method: 'GET',
      url: ROUTES.auth.session,
      headers: { host: HOST_A, cookie: `${COOKIES.accessToken}=${jar[COOKIES.accessToken] ?? ''}` },
    });
    expect(response.statusCode).toBe(200);

    // The endpoint returns the whole session, not just ids: the shell needs the
    // name, roles and permission list to render, and a second round trip for
    // those would leave the navigation flickering on every page.
    const session = response.json<{
      data: { school: { id: string }; roles: string[]; permissions: string[] };
    }>().data;

    expect(session.school.id).toBe(SCHOOL_A);
    expect(session.roles).toEqual(['OWNER']);
    expect(session.permissions.length).toBeGreaterThan(0);
  });

  it('rejects the same token on another school’s host', async () => {
    // This is the check that makes a stolen token useless elsewhere: the guard
    // compares the JWT tenant claim against the request host, not just the JWT.
    const { jar } = await login();
    const response = await app.inject({
      method: 'GET',
      url: ROUTES.auth.session,
      headers: { host: HOST_B, cookie: `${COOKIES.accessToken}=${jar[COOKIES.accessToken] ?? ''}` },
    });
    expect(response.statusCode).toBe(401);
    expect(response.json<{ code: string }>().code).toBe('AUTH_TENANT_MISMATCH');
  });
});

describe('refresh token rotation', () => {
  it('rotates the token and keeps the session alive', async () => {
    const { jar } = await login();
    const first = jar[COOKIES.refreshToken] ?? '';

    const response = await app.inject({
      method: 'POST',
      url: ROUTES.auth.refresh,
      headers: { host: HOST_A, cookie: `${COOKIES.refreshToken}=${first}` },
    });

    expect(response.statusCode).toBe(201);
    const rotated = cookiesFrom(response.headers)[COOKIES.refreshToken] ?? '';
    expect(rotated).not.toBe('');
    expect(rotated).not.toBe(first);
  });

  it('revokes the whole family when a consumed token is replayed', async () => {
    const { jar } = await login();
    const original = jar[COOKIES.refreshToken] ?? '';

    // Consume it once, legitimately.
    const rotate = await app.inject({
      method: 'POST',
      url: ROUTES.auth.refresh,
      headers: { host: HOST_A, cookie: `${COOKIES.refreshToken}=${original}` },
    });
    expect(rotate.statusCode).toBe(201);
    const replacement = cookiesFrom(rotate.headers)[COOKIES.refreshToken] ?? '';

    // Age the rotation past the concurrency grace window.
    //
    // This assertion used to replay immediately, and that stopped being a
    // replay when automatic refresh landed: two tabs, or a navigation racing a
    // fetch, present the same cookie within milliseconds of each other, and
    // treating the loser as an attack signed people out for using the product
    // normally. Inside the window a second presentation is now served; outside
    // it, this is unchanged and the family still dies.
    await admin.session.updateMany({
      where: { schoolId: SCHOOL_A, revokedReason: 'rotated' },
      data: { revokedAt: new Date(Date.now() - 5 * 60 * 1000) },
    });

    // Replay the consumed one. Either the user did, or a copy is in play, and
    // there is no way to tell — so everything in the family dies.
    const replay = await app.inject({
      method: 'POST',
      url: ROUTES.auth.refresh,
      headers: { host: HOST_A, cookie: `${COOKIES.refreshToken}=${original}` },
    });
    expect(replay.statusCode).toBe(401);

    // The legitimate replacement must now be dead too. If it still worked, an
    // attacker who stole the original would simply keep using their own copy.
    const afterBreach = await app.inject({
      method: 'POST',
      url: ROUTES.auth.refresh,
      headers: { host: HOST_A, cookie: `${COOKIES.refreshToken}=${replacement}` },
    });
    expect(afterBreach.statusCode).toBe(401);
  });

  it('rejects an unknown refresh token', async () => {
    const response = await app.inject({
      method: 'POST',
      url: ROUTES.auth.refresh,
      headers: { host: HOST_A, cookie: `${COOKIES.refreshToken}=made-up-token` },
    });
    expect(response.statusCode).toBe(401);
  });

  it('stops working after sign-out', async () => {
    const { jar } = await login();
    const token = jar[COOKIES.refreshToken] ?? '';

    await app.inject({
      method: 'POST',
      url: ROUTES.auth.logout,
      headers: { host: HOST_A, cookie: `${COOKIES.refreshToken}=${token}` },
    });

    const response = await app.inject({
      method: 'POST',
      url: ROUTES.auth.refresh,
      headers: { host: HOST_A, cookie: `${COOKIES.refreshToken}=${token}` },
    });
    expect(response.statusCode).toBe(401);
  });
});

describe('a session survives its access token expiring', () => {
  it('rotates on refresh and keeps working', async () => {
    // The whole point of the refresh token: the 15-minute access token running
    // out must not end a 30-day session.
    const { jar } = await login();

    const rotated = await app.inject({
      method: 'POST',
      url: ROUTES.auth.refresh,
      headers: {
        host: HOST_A,
        cookie: `${COOKIES.refreshToken}=${jar[COOKIES.refreshToken] ?? ''}`,
      },
    });

    expect(rotated.statusCode).toBe(201);

    const next = cookiesFrom(rotated.headers);
    // A fresh access token, and the session behind it still resolves.
    const session = await app.inject({
      method: 'GET',
      url: ROUTES.auth.session,
      headers: {
        host: HOST_A,
        cookie: `${COOKIES.accessToken}=${next[COOKIES.accessToken] ?? ''}`,
      },
    });
    expect(session.statusCode).toBe(200);
  });

  it('survives two requests refreshing at the same instant', async () => {
    // The race that automatic refresh creates: a page navigation and an
    // in-flight fetch both carry the cookie the browser had a moment ago, and
    // one of them necessarily arrives second. Before the grace window that
    // second request revoked the family and signed the person out — so
    // automatic refresh would have caused the logouts it exists to prevent.
    const { jar } = await login();
    const token = jar[COOKIES.refreshToken] ?? '';

    const [first, second] = await Promise.all([
      app.inject({
        method: 'POST',
        url: ROUTES.auth.refresh,
        headers: { host: HOST_A, cookie: `${COOKIES.refreshToken}=${token}` },
      }),
      app.inject({
        method: 'POST',
        url: ROUTES.auth.refresh,
        headers: { host: HOST_A, cookie: `${COOKIES.refreshToken}=${token}` },
      }),
    ]);

    expect(first.statusCode).toBe(201);
    expect(second.statusCode).toBe(201);

    // And the family is still usable afterwards, which is the part that
    // actually matters to the person at the desk.
    const survivor = cookiesFrom(second.headers)[COOKIES.refreshToken] ?? '';
    const again = await app.inject({
      method: 'POST',
      url: ROUTES.auth.refresh,
      headers: { host: HOST_A, cookie: `${COOKIES.refreshToken}=${survivor}` },
    });
    expect(again.statusCode).toBe(201);
  });

  it('still catches a token replayed well after its rotation', async () => {
    // The grace window must not disarm reuse detection, only narrow it to the
    // races it was written for.
    const { jar } = await login();
    const original = jar[COOKIES.refreshToken] ?? '';

    const rotate = await app.inject({
      method: 'POST',
      url: ROUTES.auth.refresh,
      headers: { host: HOST_A, cookie: `${COOKIES.refreshToken}=${original}` },
    });
    expect(rotate.statusCode).toBe(201);
    const replacement = cookiesFrom(rotate.headers)[COOKIES.refreshToken] ?? '';

    // Push the rotation outside the window rather than sleeping for it.
    //
    // Through the typed client with a date computed here, never raw SQL
    // `now()`: a timestamp the database computes inline comes back through
    // Prisma misread by the session's UTC offset, which silently made this
    // backdate land in the *future* and the replay look like a race.
    await admin.session.updateMany({
      where: { schoolId: SCHOOL_A, revokedReason: 'rotated' },
      data: { revokedAt: new Date(Date.now() - 5 * 60 * 1000) },
    });

    const replay = await app.inject({
      method: 'POST',
      url: ROUTES.auth.refresh,
      headers: { host: HOST_A, cookie: `${COOKIES.refreshToken}=${original}` },
    });
    expect(replay.statusCode).toBe(401);

    // The whole family dies with it, including the legitimate replacement —
    // otherwise an attacker who stole the original simply keeps using theirs.
    const afterBreach = await app.inject({
      method: 'POST',
      url: ROUTES.auth.refresh,
      headers: { host: HOST_A, cookie: `${COOKIES.refreshToken}=${replacement}` },
    });
    expect(afterBreach.statusCode).toBe(401);
  });
});

describe('the refresh cookie is reachable from every path', () => {
  /**
   * The regression this pins down.
   *
   * The cookie was once scoped to `path: ROUTES.auth.refresh`. Widening it to
   * `/` did not remove the old one — browsers key cookies by name *and* path —
   * so a browser signed in before that change kept an `ilm_rt` pinned to the
   * refresh endpoint, where the proxy never sees it on a page navigation and a
   * `clearCookie(path: '/')` never deletes it. The person was signed out
   * fifteen minutes into the day, and signing in again did not help, because
   * the stale cookie outlived every session that replaced it.
   */
  async function signIn() {
    return app.inject({
      method: 'POST',
      url: ROUTES.auth.login,
      headers: { host: HOST_A },
      payload: { identifier: 'head@school-a-e2e.test', password: PASSWORD },
    });
  }

  function setCookieList(headers: Record<string, unknown>): string[] {
    const raw = headers['set-cookie'];
    return Array.isArray(raw) ? (raw as string[]) : typeof raw === 'string' ? [raw] : [];
  }

  const isDeletion = (entry: string) => entry.includes('Max-Age=0') || entry.includes('1970');

  it('issues it site-wide, so a page navigation can spend it', async () => {
    const list = setCookieList((await signIn()).headers);
    const live = list.filter(
      (entry) => entry.startsWith(`${COOKIES.refreshToken}=`) && !isDeletion(entry),
    );

    expect(live).toHaveLength(1);
    expect(live[0]).toContain('Path=/;');
  });

  it('retires the narrow-path cookie a previous version left in browsers', async () => {
    const list = setCookieList((await signIn()).headers);
    const retired = list.filter(
      (entry) => entry.startsWith(`${COOKIES.refreshToken}=`) && isDeletion(entry),
    );

    expect(retired).toHaveLength(1);
    expect(retired[0]).toContain(`Path=${ROUTES.auth.refresh}`);
  });

  it('emits the deletion before the replacement, so last-wins parsers get the token', async () => {
    const list = setCookieList((await signIn()).headers);
    const entries = list.filter((entry) => entry.startsWith(`${COOKIES.refreshToken}=`));

    // Order is load-bearing: a client that keeps the last value it sees must
    // end up holding the real token, not the empty string from the deletion.
    expect(entries).toHaveLength(2);
    expect(isDeletion(entries[0] ?? '')).toBe(true);
    expect(isDeletion(entries[1] ?? '')).toBe(false);
  });

  it('clears it at both paths on sign-out, or the stale one survives', async () => {
    const jar = cookiesFrom((await signIn()).headers);

    const out = await app.inject({
      method: 'POST',
      url: ROUTES.auth.logout,
      headers: {
        host: HOST_A,
        cookie: `${COOKIES.accessToken}=${jar[COOKIES.accessToken]}; ${COOKIES.refreshToken}=${jar[COOKIES.refreshToken]}`,
      },
    });

    const deleted = setCookieList(out.headers).filter(
      (entry) => entry.startsWith(`${COOKIES.refreshToken}=`) && isDeletion(entry),
    );

    expect(deleted).toHaveLength(2);
    expect(deleted.some((entry) => entry.includes('Path=/;'))).toBe(true);
    expect(deleted.some((entry) => entry.includes(`Path=${ROUTES.auth.refresh}`))).toBe(true);
  });
});
