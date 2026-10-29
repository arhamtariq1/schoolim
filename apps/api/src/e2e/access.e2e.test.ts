import { ROUTES } from '@ilm/contracts';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { Test } from '@nestjs/testing';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { AppModule } from '../app.module';
import { createAdminClient, type PrismaClient } from '../prisma';
import { PasswordService } from '../shared/auth/password.service';

/**
 * Access customisation end to end (ADR-0025).
 *
 * What matters is not that the toggles save — it is that a saved change is what
 * the API enforces on the very next request, and that nobody can use the screen
 * to give themselves, or a peer, more than they already have.
 */

const SCHOOL_A = '33333333-3333-4333-8333-3333333333d1';
const SCHOOL_B = '33333333-3333-4333-8333-3333333333d2';
const OWNER_A = '44444444-4444-4444-8444-4444444444d1';
const ADMIN_A = '44444444-4444-4444-8444-4444444444d2';
const TEACHER_A = '44444444-4444-4444-8444-4444444444d3';
const TEACHER_A2 = '44444444-4444-4444-8444-4444444444d4';
const OWNER_B = '44444444-4444-4444-8444-4444444444d5';

const HOST_A = 'access-a-e2e.localhost';
const HOST_B = 'access-b-e2e.localhost';
const PASSWORD = 'correct-horse-battery-staple';

let app: NestFastifyApplication;
let admin: PrismaClient;
let owner = '';
let schoolAdmin = '';
let teacher = '';
let teacher2 = '';
let ownerB = '';

const OVERRIDE_TABLES = ['role_permission_overrides', 'user_permission_overrides'];

async function wipe(): Promise<void> {
  for (const table of [...OVERRIDE_TABLES, 'sessions', 'audit_logs', 'user_roles', 'users']) {
    await admin.$executeRawUnsafe(
      `DELETE FROM ${table} WHERE school_id IN ($1::uuid, $2::uuid)`,
      SCHOOL_A,
      SCHOOL_B,
    );
  }
  await admin.$executeRaw`DELETE FROM schools WHERE id IN (${SCHOOL_A}::uuid, ${SCHOOL_B}::uuid)`;
}

async function seed(): Promise<void> {
  await admin.$executeRaw`
    INSERT INTO schools (id, name, slug, created_at, updated_at) VALUES
      (${SCHOOL_A}::uuid, 'Access E2E A', 'access-a-e2e', now(), now()),
      (${SCHOOL_B}::uuid, 'Access E2E B', 'access-b-e2e', now(), now())
  `;
  const hash = await new PasswordService().hash(PASSWORD);
  for (const [id, school, email, role] of [
    [OWNER_A, SCHOOL_A, 'owner@access-a-e2e.test', 'OWNER'],
    [ADMIN_A, SCHOOL_A, 'admin@access-a-e2e.test', 'ADMIN'],
    [TEACHER_A, SCHOOL_A, 'teacher@access-a-e2e.test', 'TEACHER'],
    [TEACHER_A2, SCHOOL_A, 'teacher2@access-a-e2e.test', 'TEACHER'],
    [OWNER_B, SCHOOL_B, 'owner@access-b-e2e.test', 'OWNER'],
  ] as const) {
    await admin.$executeRawUnsafe(
      `INSERT INTO users (id, school_id, email, name, password_hash, status, profile_completed_at, created_at, updated_at)
       VALUES ($1::uuid, $2::uuid, $3, $3, $4, 'ACTIVE', now(), now(), now())`,
      id,
      school,
      email,
      hash,
    );
    await admin.$executeRawUnsafe(
      `INSERT INTO user_roles (id, school_id, user_id, role, created_at)
       VALUES (gen_random_uuid(), $1::uuid, $2::uuid, $3::school_role, now())`,
      school,
      id,
      role,
    );
  }
}

async function signIn(host: string, email: string): Promise<string> {
  const response = await app.inject({
    method: 'POST',
    url: ROUTES.auth.login,
    headers: { host },
    payload: { identifier: email, password: PASSWORD },
  });
  const raw = response.headers['set-cookie'];
  const list = Array.isArray(raw) ? raw : [String(raw)];
  return list
    .map((entry) => entry.split(';')[0] ?? '')
    .filter((pair) => !pair.endsWith('='))
    .join('; ');
}

async function call(
  method: 'GET' | 'PUT',
  url: string,
  cookie: string,
  payload?: Record<string, unknown>,
  host = HOST_A,
) {
  return app.inject({
    method,
    url,
    headers: { host, cookie },
    ...(payload === undefined ? {} : { payload }),
  });
}

async function sessionPermissions(cookie: string): Promise<string[]> {
  const response = await call('GET', ROUTES.auth.session, cookie);
  return response.json<{ data: { permissions: string[] } }>().data.permissions;
}

beforeAll(async () => {
  admin = createAdminClient({ url: process.env['DATABASE_ADMIN_URL'] ?? '' });
  await wipe();
  await seed();

  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  app = moduleRef.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
  const { default: cookie } = await import('@fastify/cookie');
  await app.register(cookie);
  await app.init();
  await app.getHttpAdapter().getInstance().ready();

  owner = await signIn(HOST_A, 'owner@access-a-e2e.test');
  schoolAdmin = await signIn(HOST_A, 'admin@access-a-e2e.test');
  teacher = await signIn(HOST_A, 'teacher@access-a-e2e.test');
  teacher2 = await signIn(HOST_A, 'teacher2@access-a-e2e.test');
  ownerB = await signIn(HOST_B, 'owner@access-b-e2e.test');
}, 120_000);

afterAll(async () => {
  await app?.close();
  await wipe();
  await admin.$disconnect();
});

beforeEach(async () => {
  for (const table of OVERRIDE_TABLES) {
    await admin.$executeRawUnsafe(
      `DELETE FROM ${table} WHERE school_id IN ($1::uuid, $2::uuid)`,
      SCHOOL_A,
      SCHOOL_B,
    );
  }
});

describe('a change is what the API enforces, on the next request', () => {
  it('gives every teacher a screen when the role is changed', async () => {
    expect((await call('GET', ROUTES.staff.list, teacher)).statusCode).toBe(403);

    const saved = await call('PUT', ROUTES.access.role('TEACHER'), owner, {
      grant: ['staff.record.read'],
      revoke: [],
    });
    expect(saved.statusCode).toBe(200);

    expect((await call('GET', ROUTES.staff.list, teacher)).statusCode).toBe(200);
    expect((await call('GET', ROUTES.staff.list, teacher2)).statusCode).toBe(200);
    expect(await sessionPermissions(teacher)).toContain('staff.record.read');
  });

  it('takes a screen from one person without touching the rest of the role', async () => {
    await call('PUT', ROUTES.access.role('TEACHER'), owner, { grant: ['staff.record.read'], revoke: [] });
    const saved = await call('PUT', ROUTES.access.user(TEACHER_A2), owner, {
      grant: [],
      revoke: ['staff.record.read'],
    });
    expect(saved.statusCode).toBe(200);

    expect((await call('GET', ROUTES.staff.list, teacher)).statusCode).toBe(200);
    expect((await call('GET', ROUTES.staff.list, teacher2)).statusCode).toBe(403);
    expect(await sessionPermissions(teacher2)).not.toContain('staff.record.read');
  });

  it('gives one person a screen their role does not have', async () => {
    await call('PUT', ROUTES.access.user(TEACHER_A), owner, { grant: ['staff.record.read'], revoke: [] });

    expect((await call('GET', ROUTES.staff.list, teacher)).statusCode).toBe(200);
    expect((await call('GET', ROUTES.staff.list, teacher2)).statusCode).toBe(403);
  });

  it('goes back to the default when the change is cleared', async () => {
    await call('PUT', ROUTES.access.user(TEACHER_A), owner, { grant: ['staff.record.read'], revoke: [] });
    await call('PUT', ROUTES.access.user(TEACHER_A), owner, { grant: [], revoke: [] });

    expect((await call('GET', ROUTES.staff.list, teacher)).statusCode).toBe(403);
  });

  it('records who changed what, with the before and the after', async () => {
    await call('PUT', ROUTES.access.user(TEACHER_A), owner, { grant: ['staff.record.read'], revoke: [] });

    const rows = await admin.$queryRaw<{ actor_user_id: string; after: { grant: string[] } }[]>`
      SELECT actor_user_id, after FROM audit_logs
       WHERE school_id = ${SCHOOL_A}::uuid AND action = 'access.user.update' AND entity_id = ${TEACHER_A}
       ORDER BY at DESC LIMIT 1`;
    expect(rows[0]?.actor_user_id).toBe(OWNER_A);
    expect(rows[0]?.after.grant).toEqual(['staff.record.read']);
  });
});

describe('nobody promotes themselves', () => {
  it('refuses a role at or above your own', async () => {
    const response = await call('PUT', ROUTES.access.role('ADMIN'), schoolAdmin, {
      grant: [],
      revoke: ['students.student.read'],
    });
    expect(response.statusCode).toBe(403);
    expect(response.json<{ code: string }>().code).toBe('ACCESS_CHANGE_REFUSED');
  });

  it('refuses your own account', async () => {
    const response = await call('PUT', ROUTES.access.user(ADMIN_A), schoolAdmin, {
      grant: [],
      revoke: ['students.student.read'],
    });
    expect(response.statusCode).toBe(403);
  });

  it('refuses giving what you do not hold yourself', async () => {
    // An administrator does not read the audit log (docs/08 s4), so cannot hand it out.
    const response = await call('PUT', ROUTES.access.role('TEACHER'), schoolAdmin, {
      grant: ['audit.log.read'],
      revoke: [],
    });
    expect(response.statusCode).toBe(403);
    expect((await call('GET', ROUTES.access.roles, schoolAdmin)).statusCode).toBe(200);
  });

  it('lets an administrator take away from a role below theirs', async () => {
    const response = await call('PUT', ROUTES.access.role('TEACHER'), schoolAdmin, {
      grant: [],
      revoke: ['attendance.record.create'],
    });
    expect(response.statusCode).toBe(200);
  });

  it('keeps the owner off the screen entirely', async () => {
    expect((await call('GET', ROUTES.access.user(OWNER_A), owner)).statusCode).toBe(404);
    expect((await call('PUT', ROUTES.access.role('OWNER'), owner, { grant: [], revoke: [] })).statusCode).toBe(
      404,
    );
  });

  it('closes the screen to anyone without user management', async () => {
    expect((await call('GET', ROUTES.access.roles, teacher)).statusCode).toBe(403);
  });

  it('refuses locked permissions', async () => {
    const response = await call('PUT', ROUTES.access.user(TEACHER_A), owner, {
      grant: [],
      revoke: ['dashboard.workspace.read'],
    });
    expect(response.statusCode).toBe(400);
  });
});

describe('tenant isolation', () => {
  it('hides another school’s people', async () => {
    const response = await call('GET', ROUTES.access.user(TEACHER_A), ownerB, undefined, HOST_B);
    expect(response.statusCode).toBe(404);
  });

  it('leaves other schools untouched by a role change', async () => {
    await call('PUT', ROUTES.access.role('TEACHER'), ownerB, { grant: ['staff.record.read'], revoke: [] }, HOST_B);
    expect((await call('GET', ROUTES.staff.list, teacher)).statusCode).toBe(403);
  });
});
