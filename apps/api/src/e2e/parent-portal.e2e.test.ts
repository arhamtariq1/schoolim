import { ROUTES } from '@ilm/contracts';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { Test } from '@nestjs/testing';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { AppModule } from '../app.module';
import { createAdminClient, type PrismaClient } from '../prisma';
import { PasswordService } from '../shared/auth/password.service';
import { MAIL } from '../shared/mail/mail.port';

import { RecordingMailer } from './signup-flow';

/**
 * The parent portal, end to end.
 *
 * admission → invitation → password → sign in → portal, and then the half that
 * matters more: what a parent must NOT be able to do. A guardian who can read
 * another family's child, or edit their own, is a data breach with a login
 * screen in front of it.
 */

const SCHOOL = '33333333-3333-4333-8333-3333333333ea';
const OWNER = '44444444-4444-4444-8444-4444444444ea';
const SESSION = '55555555-5555-4555-8555-5555555555ea';
const CLASS_LEVEL = '66666666-6666-4666-8666-6666666666ea';

const HOST = 'parent-e2e.localhost';
const PASSWORD = 'correct-horse-battery-staple';
const CHOSEN = 'The1-Parent-Picked!';

const FAMILY_ONE = 'family-one@parent-e2e.test';
const FAMILY_TWO = 'family-two@parent-e2e.test';

const mailer = new RecordingMailer();

let app: NestFastifyApplication;
let admin: PrismaClient;
let owner = '';

const TABLES = [
  'invitations',
  'student_guardians',
  'guardians',
  'enrollments',
  'attendance_records',
  'student_fees',
  'students',
  'sections',
  'sessions',
  'audit_logs',
  'user_roles',
  'number_sequences',
  'class_levels',
  'academic_sessions',
  'users',
];

async function wipe(): Promise<void> {
  for (const table of TABLES) {
    await admin.$executeRawUnsafe(`DELETE FROM ${table} WHERE school_id = $1::uuid`, SCHOOL);
  }
  await admin.$executeRaw`DELETE FROM schools WHERE id = ${SCHOOL}::uuid`;
}

beforeAll(async () => {
  admin = createAdminClient({ url: process.env['DATABASE_ADMIN_URL'] ?? '' });
  await wipe();

  await admin.$executeRaw`
    INSERT INTO schools (id, name, slug, created_at, updated_at)
    VALUES (${SCHOOL}::uuid, 'Parent E2E', 'parent-e2e', now(), now())`;

  const hash = await new PasswordService().hash(PASSWORD);
  await admin.$executeRawUnsafe(
    `INSERT INTO users (id, school_id, email, name, password_hash, status, created_at, updated_at)
     VALUES ($1::uuid, $2::uuid, 'owner@parent-e2e.test', 'Owner', $3, 'ACTIVE', now(), now())`,
    OWNER,
    SCHOOL,
    hash,
  );
  await admin.$executeRawUnsafe(
    `INSERT INTO user_roles (id, school_id, user_id, role, created_at)
     VALUES (gen_random_uuid(), $1::uuid, $2::uuid, 'OWNER', now())`,
    SCHOOL,
    OWNER,
  );
  await admin.$executeRawUnsafe(
    `INSERT INTO academic_sessions (id, school_id, name, start_date, end_date, status, is_current, created_at, updated_at)
     VALUES ($1::uuid, $2::uuid, '2026-2027', '2026-08-01', '2027-07-31', 'ACTIVE', true, now(), now())`,
    SESSION,
    SCHOOL,
  );
  await admin.$executeRawUnsafe(
    `INSERT INTO class_levels (id, school_id, name, numeric_order, is_active, created_at, updated_at)
     VALUES ($1::uuid, $2::uuid, 'Class 1', 1, true, now(), now())`,
    CLASS_LEVEL,
    SCHOOL,
  );

  // Nobody can be admitted until an administrator has chosen where GR numbering starts.
  await admin.$executeRawUnsafe(
    `INSERT INTO number_sequences (id, school_id, kind, next_value, updated_at)
     VALUES (gen_random_uuid(), $1::uuid, 'gr', 1, now())`,
    SCHOOL,
  );

  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(MAIL)
    .useValue(mailer)
    .compile();
  app = moduleRef.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
  const { default: cookie } = await import('@fastify/cookie');
  await app.register(cookie);
  await app.init();
  await app.getHttpAdapter().getInstance().ready();

  owner = await signIn('owner@parent-e2e.test', PASSWORD);
}, 90_000);

beforeEach(async () => {
  mailer.delivered.length = 0;
  for (const table of [
    'invitations',
    'student_guardians',
    'guardians',
    'enrollments',
    'attendance_records',
    'student_fees',
    'students',
  ]) {
    await admin.$executeRawUnsafe(`DELETE FROM ${table} WHERE school_id = $1::uuid`, SCHOOL);
  }
  await admin.$executeRawUnsafe(`DELETE FROM user_roles WHERE school_id = $1::uuid AND user_id <> $2::uuid`, SCHOOL, OWNER);
  await admin.$executeRawUnsafe(`DELETE FROM sessions WHERE school_id = $1::uuid AND user_id <> $2::uuid`, SCHOOL, OWNER);
  await admin.$executeRawUnsafe(`DELETE FROM users WHERE school_id = $1::uuid AND id <> $2::uuid`, SCHOOL, OWNER);
});

afterAll(async () => {
  await app?.close();
  await wipe();
  await admin.$disconnect();
});

async function signIn(identifier: string, password: string): Promise<string> {
  const response = await app.inject({
    method: 'POST',
    url: ROUTES.auth.login,
    headers: { host: HOST },
    payload: { identifier, password },
  });
  const raw = response.headers['set-cookie'];
  if (raw === undefined) {
    return '';
  }
  const cookies = Array.isArray(raw) ? raw : [String(raw)];
  return cookies
    .map((entry) => entry.split(';')[0] ?? '')
    .filter((pair) => !pair.endsWith('='))
    .join('; ');
}

async function call(method: 'GET' | 'POST' | 'PATCH' | 'DELETE', url: string, cookie: string, payload?: unknown) {
  const response = await app.inject({
    method,
    url,
    headers: { host: HOST, cookie },
    ...(payload === undefined ? {} : { payload: payload as object }),
  });
  return {
    status: response.statusCode,
    json: () => JSON.parse(response.body) as { data: Record<string, unknown> & unknown[] },
  };
}

function admission(first: string, guardianEmail: string, guardianName = 'Fahim Khan') {
  return {
    firstName: first,
    lastName: 'Khan',
    gender: 'MALE',
    enrollment: { sessionId: SESSION, classLevelId: CLASS_LEVEL },
    guardian: {
      name: guardianName,
      relation: 'FATHER',
      phone: '+923001234567',
      address: 'House 1, Street 2',
      email: guardianEmail,
    },
    fees: [],
  };
}

async function admit(first: string, email: string) {
  const result = await call('POST', ROUTES.students.create, owner, admission(first, email));
  return result;
}

function inviteToken(email: string): string {
  for (let index = mailer.delivered.length - 1; index >= 0; index -= 1) {
    const message = mailer.delivered[index];
    if (message?.to === email) {
      const token = /\/invite\?t=([A-Za-z0-9_-]+)/.exec(message.text)?.[1];
      if (token !== undefined) {
        return token;
      }
    }
  }
  throw new Error(`No invitation was mailed to ${email}`);
}

async function acceptInvitation(email: string): Promise<string> {
  const accepted = await app.inject({
    method: 'POST',
    url: ROUTES.auth.acceptInvite,
    headers: { host: HOST },
    payload: { token: inviteToken(email), password: CHOSEN },
  });
  expect(accepted.statusCode).toBe(201);
  return signIn(email, CHOSEN);
}

async function childIds(cookie: string): Promise<string[]> {
  const list = await call('GET', ROUTES.parent.children, cookie);
  return (list.json().data as unknown as { id: string }[]).map((child) => child.id);
}

describe('admission → invitation → password → portal', () => {
  it('invites the guardian by email and links the account to the child', async () => {
    const result = await admit('Ahmed', FAMILY_ONE);
    expect(result.status).toBe(201);
    expect(result.json().data['parentInvite']).toMatchObject({ sent: true, email: FAMILY_ONE });

    const rows = await admin.$queryRawUnsafe<{ status: string; role: string }[]>(
      `SELECT u.status::text AS status, r.role::text AS role
         FROM users u JOIN user_roles r ON r.user_id = u.id
        WHERE u.school_id = $1::uuid AND u.email = $2`,
      SCHOOL,
      FAMILY_ONE,
    );
    expect(rows).toEqual([{ status: 'INVITED', role: 'PARENT' }]);
  });

  it('cannot sign in until the password is chosen, and can afterwards', async () => {
    await admit('Ahmed', FAMILY_ONE);
    expect(await signIn(FAMILY_ONE, CHOSEN)).toBe('');

    const cookie = await acceptInvitation(FAMILY_ONE);
    expect(cookie).not.toBe('');

    const me = await call('GET', ROUTES.auth.session, cookie);
    expect(me.status).toBe(200);
  });

  it('shows the parent their child, with profile and attendance', async () => {
    const admitted = await admit('Ahmed', FAMILY_ONE);
    const studentId = admitted.json().data['id'] as string;
    const cookie = await acceptInvitation(FAMILY_ONE);

    const children = await call('GET', ROUTES.parent.children, cookie);
    expect(children.status).toBe(200);
    expect(children.json().data).toHaveLength(1);

    const profile = await call('GET', ROUTES.parent.child(studentId), cookie);
    expect(profile.status).toBe(200);
    expect(profile.json().data).toMatchObject({ name: 'Ahmed Khan', className: 'Class 1' });

    const attendance = await call('GET', ROUTES.parent.attendance(studentId), cookie);
    expect(attendance.status).toBe(200);
    expect(attendance.json().data['markedDays']).toBe(0);
  });
});

describe('one account per guardian email', () => {
  it('links a second child to the same parent instead of creating a duplicate', async () => {
    await admit('Ahmed', FAMILY_ONE);
    await admit('Bilal', FAMILY_ONE);

    const users = await admin.$queryRawUnsafe<{ count: bigint }[]>(
      `SELECT count(*) FROM users WHERE school_id = $1::uuid AND email = $2`,
      SCHOOL,
      FAMILY_ONE,
    );
    expect(Number(users[0]?.count)).toBe(1);

    const guardians = await admin.$queryRawUnsafe<{ count: bigint }[]>(
      `SELECT count(*) FROM guardians WHERE school_id = $1::uuid AND email = $2`,
      SCHOOL,
      FAMILY_ONE,
    );
    expect(Number(guardians[0]?.count)).toBe(1);

    // One email, because the first link is still live — a second would
    // supersede it and break the parent's first link.
    expect(mailer.delivered.filter((message) => message.to === FAMILY_ONE)).toHaveLength(1);

    const cookie = await acceptInvitation(FAMILY_ONE);
    expect(await childIds(cookie)).toHaveLength(2);
  });
});

describe('what a parent must not be able to do', () => {
  it('cannot read another family’s child — it answers as if the child does not exist', async () => {
    await admit('Ahmed', FAMILY_ONE);
    const other = await admit('Zara', FAMILY_TWO);
    const otherChild = other.json().data['id'] as string;
    const cookie = await acceptInvitation(FAMILY_ONE);

    expect((await call('GET', ROUTES.parent.child(otherChild), cookie)).status).toBe(404);
    expect((await call('GET', ROUTES.parent.attendance(otherChild), cookie)).status).toBe(404);
    expect(await childIds(cookie)).not.toContain(otherChild);
  });

  it('is refused every staff screen, so no scoped grant leaks another child', async () => {
    await admit('Ahmed', FAMILY_ONE);
    const other = await admit('Zara', FAMILY_TWO);
    const otherChild = other.json().data['id'] as string;
    const cookie = await acceptInvitation(FAMILY_ONE);

    expect((await call('GET', ROUTES.students.list, cookie)).status).toBe(403);
    expect((await call('GET', ROUTES.students.detail(otherChild), cookie)).status).toBe(403);
    expect((await call('GET', ROUTES.staff.list, cookie)).status).toBe(403);
  });

  it('cannot create, edit or delete a student', async () => {
    const admitted = await admit('Ahmed', FAMILY_ONE);
    const studentId = admitted.json().data['id'] as string;
    const cookie = await acceptInvitation(FAMILY_ONE);

    expect(
      (await call('POST', ROUTES.students.create, cookie, admission('Sneaky', FAMILY_ONE))).status,
    ).toBe(403);
    expect(
      (await call('PATCH', ROUTES.students.update(studentId), cookie, { firstName: 'Changed' }))
        .status,
    ).toBe(403);
    expect((await call('DELETE', ROUTES.students.update(studentId), cookie)).status).toBe(403);

    const rows = await admin.$queryRawUnsafe<{ first_name: string }[]>(
      `SELECT first_name FROM students WHERE id = $1::uuid`,
      studentId,
    );
    expect(rows[0]?.first_name).toBe('Ahmed');
  });

  it('cannot reach the parent portal as staff: an owner has no children linked', async () => {
    await admit('Ahmed', FAMILY_ONE);
    expect((await call('GET', ROUTES.parent.children, owner)).status).toBe(403);
  });
});
