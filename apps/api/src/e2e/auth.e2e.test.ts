import { COOKIES, ROUTES } from '@ilm/contracts';
import { createAdminClient, type PrismaClient } from '@ilm/db';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { Test } from '@nestjs/testing';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { AppModule } from '../app.module';
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

    const body = response.json<{ data: { roles: string[]; permissions: string[] } }>();
    expect(body.data.roles).toEqual(['OWNER']);
    expect(body.data.permissions.length).toBeGreaterThan(0);
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
    expect(response.json<{ data: { schoolId: string } }>().data.schoolId).toBe(SCHOOL_A);
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

describe('the refresh token never leaves its own path', () => {
  it('is scoped to the refresh endpoint', async () => {
    const response = await app.inject({
      method: 'POST',
      url: ROUTES.auth.login,
      headers: { host: HOST_A },
      payload: { identifier: 'head@school-a-e2e.test', password: PASSWORD },
    });

    const raw = response.headers['set-cookie'];
    const list = Array.isArray(raw) ? raw : [String(raw)];
    const refresh = list.find((entry) => entry.startsWith(COOKIES.refreshToken));

    // An XSS that could read cookies still would not get this one attached to
    // an arbitrary request.
    expect(refresh).toContain(`Path=${ROUTES.auth.refresh}`);
  });
});
