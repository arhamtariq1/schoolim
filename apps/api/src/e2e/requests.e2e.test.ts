import { randomUUID } from 'node:crypto';

import {
  ROUTES,
  type NotificationList,
  type RequestAttachment,
  type RequestDetail,
  type RequestListItem,
  type RequestSummary,
} from '@ilm/contracts';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { Test } from '@nestjs/testing';
import { type Client } from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { AppModule } from '../app.module';
import { createAdminClient, type PrismaClient } from '../prisma';
import { connectApp, withTenant } from '../prisma/testing/database';
import { PasswordService } from '../shared/auth/password.service';

/**
 * Requests and concerns, end to end (ADR-0016).
 *
 * Real roles, real cookies, a real database with row-level security. What is
 * pinned: who can see which request (a requester reads only their own; the
 * office reads the school's; another school reads nothing), the status flow and
 * who may drive it, who is told what and who is not, pictures, and the two
 * guarantees the database itself holds — an append-only timeline and
 * tenant isolation.
 */

const SCHOOL = '33333333-3333-4333-8333-3333333333d1';
const OTHER_SCHOOL = '33333333-3333-4333-8333-3333333333d2';
const SESSION = '55555555-5555-4555-8555-5555555555d1';
const CLASS_A = '66666666-6666-4666-8666-6666666666d1';
const CLASS_B = '66666666-6666-4666-8666-6666666666d2';
const STAFF_TEACHER = '88888888-8888-4888-8888-8888888888d1';
const HOST = 'requests-e2e.localhost';
const PASSWORD = 'correct-horse-battery-staple';

const CHILD_OF_ONE = '77777777-7777-4777-8777-77777777770a';
const CHILD_OF_TWO = '77777777-7777-4777-8777-77777777770b';
const CLASS_B_CHILD = '77777777-7777-4777-8777-77777777770c';

const USERS = {
  OWNER: { id: '44444444-4444-4444-8444-4444444444d1', role: 'OWNER', name: 'Olivia Owner' },
  PRINCIPAL: { id: '44444444-4444-4444-8444-4444444444d2', role: 'PRINCIPAL', name: 'Paul Principal' },
  OFFICE: { id: '44444444-4444-4444-8444-4444444444d3', role: 'RECEPTION', name: 'Rita Office' },
  TEACHER: { id: '44444444-4444-4444-8444-4444444444d4', role: 'TEACHER', name: 'Tariq Teacher' },
  PARENT_ONE: { id: '44444444-4444-4444-8444-4444444444d5', role: 'PARENT', name: 'Amna Parent' },
  PARENT_TWO: { id: '44444444-4444-4444-8444-4444444444d6', role: 'PARENT', name: 'Bilal Parent' },
  ACCOUNTANT: { id: '44444444-4444-4444-8444-4444444444d7', role: 'ACCOUNTANT', name: 'Asma Accounts' },
} as const;

type Who = keyof typeof USERS;

/** A 1×1 PNG. */
const PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';

let app: NestFastifyApplication;
let admin: PrismaClient;
const jars = new Map<Who, string>();

const TABLES_WITH_SCHOOL = [
  'notifications',
  'request_attachments',
  'request_events',
  'requests',
  'student_guardians',
  'guardians',
  'enrollments',
  'students',
  'staff_class_assignments',
  'staff',
  'class_levels',
  'academic_sessions',
  'sessions',
  'audit_logs',
  'user_roles',
  'users',
] as const;

async function wipe(): Promise<void> {
  for (const school of [SCHOOL, OTHER_SCHOOL]) {
    for (const table of TABLES_WITH_SCHOOL) {
      await admin.$executeRawUnsafe(`DELETE FROM ${table} WHERE school_id = $1::uuid`, school);
    }
    await admin.$executeRawUnsafe(`DELETE FROM number_sequences WHERE school_id = $1::uuid`, school);
    await admin.$executeRawUnsafe(`DELETE FROM schools WHERE id = $1::uuid`, school);
  }
}

/** Everything a test creates, so each one starts from an empty queue. */
async function resetRequests(): Promise<void> {
  for (const table of ['notifications', 'request_attachments', 'request_events', 'requests']) {
    await admin.$executeRawUnsafe(`DELETE FROM ${table} WHERE school_id = ANY($1::uuid[])`, [
      SCHOOL,
      OTHER_SCHOOL,
    ]);
  }
  await admin.$executeRawUnsafe(
    `DELETE FROM number_sequences WHERE school_id = ANY($1::uuid[]) AND kind = 'request'`,
    [SCHOOL, OTHER_SCHOOL],
  );
  await admin.$executeRawUnsafe(`DELETE FROM audit_logs WHERE school_id = $1::uuid`, SCHOOL);
}

async function call(
  who: Who,
  method: 'GET' | 'POST',
  url: string,
  payload?: Record<string, unknown>,
) {
  return app.inject({
    method,
    url,
    headers: { host: HOST, cookie: jars.get(who) ?? '' },
    ...(payload === undefined ? {} : { payload }),
  });
}

const key = (): string => randomUUID();

interface RaiseOptions {
  category?: string;
  priority?: string;
  subject?: string;
  description?: string;
  studentId?: string;
  idempotencyKey?: string;
}

async function raise(who: Who, over: RaiseOptions = {}): Promise<RequestDetail> {
  const response = await call(who, 'POST', ROUTES.requests.list, {
    category: 'FEE',
    subject: 'Fee voucher shows the wrong month',
    description: 'The October voucher is billed for September as well.',
    idempotencyKey: key(),
    ...over,
  });
  expect(response.statusCode, response.body).toBe(201);
  return response.json<{ data: RequestDetail }>().data;
}

async function open(who: Who, id: string): Promise<RequestDetail> {
  const response = await call(who, 'GET', ROUTES.requests.detail(id));
  expect(response.statusCode, response.body).toBe(200);
  return response.json<{ data: RequestDetail }>().data;
}

async function setStatus(who: Who, id: string, status: string, note?: string) {
  return call(who, 'POST', ROUTES.requests.status(id), {
    status,
    ...(note === undefined ? {} : { note }),
  });
}

async function bell(who: Who): Promise<NotificationList> {
  const response = await call(who, 'GET', ROUTES.notifications.list);
  expect(response.statusCode).toBe(200);
  return response.json<{ data: NotificationList }>().data;
}

async function list(who: Who, query = ''): Promise<{ data: RequestListItem[]; total: number }> {
  const response = await call(who, 'GET', `${ROUTES.requests.list}${query}`);
  expect(response.statusCode, response.body).toBe(200);
  const body = response.json<{ data: RequestListItem[]; meta: { page: { total: number } } }>();
  return { data: body.data, total: body.meta.page.total };
}

async function count(sql: string, ...params: unknown[]): Promise<number> {
  const rows = await admin.$queryRawUnsafe<{ n: bigint }[]>(sql, ...params);
  return Number(rows[0]?.n ?? 0);
}

beforeAll(async () => {
  admin = createAdminClient({ url: process.env['DATABASE_ADMIN_URL'] ?? '' });
  await wipe();
  const hash = await new PasswordService().hash(PASSWORD);

  for (const [id, name, slug] of [
    [SCHOOL, 'Requests E2E', 'requests-e2e'],
    [OTHER_SCHOOL, 'Requests Other E2E', 'requests-other-e2e'],
  ] as const) {
    await admin.$executeRawUnsafe(
      `INSERT INTO schools (id, name, slug, created_at, updated_at) VALUES ($1::uuid, $2, $3, now(), now())`,
      id,
      name,
      slug,
    );
  }

  for (const [who, user] of Object.entries(USERS)) {
    const email = `${who.toLowerCase().replace('_', '-')}@requests-e2e.test`;
    await admin.$executeRawUnsafe(
      `INSERT INTO users (id, school_id, email, name, password_hash, status, created_at, updated_at)
       VALUES ($1::uuid, $2::uuid, $3, $4, $5, 'ACTIVE', now(), now())`,
      user.id,
      SCHOOL,
      email,
      user.name,
      hash,
    );
    await admin.$executeRawUnsafe(
      `INSERT INTO user_roles (id, school_id, user_id, role, created_at)
       VALUES (gen_random_uuid(), $1::uuid, $2::uuid, $3::school_role, now())`,
      SCHOOL,
      user.id,
      user.role,
    );
  }

  await admin.$executeRawUnsafe(
    `INSERT INTO academic_sessions (id, school_id, name, start_date, end_date, status, is_current, created_at, updated_at)
     VALUES ($1::uuid, $2::uuid, '2026-2027', '2026-04-01', '2999-03-31', 'ACTIVE', true, now(), now())`,
    SESSION,
    SCHOOL,
  );
  for (const [id, name, order] of [
    [CLASS_A, 'Class A', 1],
    [CLASS_B, 'Class B', 2],
  ] as const) {
    await admin.$executeRawUnsafe(
      `INSERT INTO class_levels (id, school_id, name, numeric_order, is_active, created_at, updated_at)
       VALUES ($1::uuid, $2::uuid, $3, $4, true, now(), now())`,
      id,
      SCHOOL,
      name,
      order,
    );
  }

  // Two children in class A, one in class B.
  for (const [id, first, classId, gr] of [
    [CHILD_OF_ONE, 'Zara', CLASS_A, 'REQ-1'],
    [CHILD_OF_TWO, 'Yusuf', CLASS_A, 'REQ-2'],
    [CLASS_B_CHILD, 'Xena', CLASS_B, 'REQ-3'],
  ] as const) {
    await admin.$executeRawUnsafe(
      `INSERT INTO students (id, school_id, gr_no, student_code, first_name, last_name, status, created_at, updated_at)
       VALUES ($1::uuid, $2::uuid, $3, $3, $4, 'Khan', 'ACTIVE', now(), now())`,
      id,
      SCHOOL,
      gr,
      first,
    );
    await admin.$executeRawUnsafe(
      `INSERT INTO enrollments (id, school_id, student_id, session_id, class_level_id, status, created_at, updated_at)
       VALUES (gen_random_uuid(), $1::uuid, $2::uuid, $3::uuid, $4::uuid, 'ENROLLED', now(), now())`,
      SCHOOL,
      id,
      SESSION,
      classId,
    );
  }

  // Each parent is the guardian of one child, and only one.
  for (const [parent, child] of [
    [USERS.PARENT_ONE, CHILD_OF_ONE],
    [USERS.PARENT_TWO, CHILD_OF_TWO],
  ] as const) {
    const guardianId = randomUUID();
    await admin.$executeRawUnsafe(
      `INSERT INTO guardians (id, school_id, name, relation, user_id, created_at, updated_at)
       VALUES ($1::uuid, $2::uuid, $3, 'FATHER', $4::uuid, now(), now())`,
      guardianId,
      SCHOOL,
      parent.name,
      parent.id,
    );
    await admin.$executeRawUnsafe(
      `INSERT INTO student_guardians (id, school_id, student_id, guardian_id, is_primary, created_at)
       VALUES (gen_random_uuid(), $1::uuid, $2::uuid, $3::uuid, true, now())`,
      SCHOOL,
      child,
      guardianId,
    );
  }

  // The teacher takes class A only.
  await admin.$executeRawUnsafe(
    `INSERT INTO staff (id, school_id, employee_no, user_id, name, email, phone, role, status, basic_salary, created_at, updated_at)
     VALUES ($1::uuid, $2::uuid, 'R-1', $3::uuid, 'Tariq Teacher', 'teacher@requests-e2e.test', '+923001234567', 'TEACHER', 'ACTIVE', 40000, now(), now())`,
    STAFF_TEACHER,
    SCHOOL,
    USERS.TEACHER.id,
  );
  await admin.$executeRawUnsafe(
    `INSERT INTO staff_class_assignments (id, school_id, staff_id, class_level_id, created_at)
     VALUES (gen_random_uuid(), $1::uuid, $2::uuid, $3::uuid, now())`,
    SCHOOL,
    STAFF_TEACHER,
    CLASS_A,
  );

  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  app = moduleRef.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
  const { default: cookie } = await import('@fastify/cookie');
  await app.register(cookie);
  await app.init();
  await app.getHttpAdapter().getInstance().ready();

  for (const [who, user] of Object.entries(USERS)) {
    const response = await app.inject({
      method: 'POST',
      url: ROUTES.auth.login,
      headers: { host: HOST },
      payload: {
        identifier: `${who.toLowerCase().replace('_', '-')}@requests-e2e.test`,
        password: PASSWORD,
      },
    });
    expect(response.statusCode, `${user.name} could not sign in`).toBeLessThan(300);
    const raw = response.headers['set-cookie'];
    const cookies = Array.isArray(raw) ? raw : [String(raw)];
    jars.set(
      who as Who,
      cookies
        .map((entry) => entry.split(';')[0] ?? '')
        .filter((pair) => !pair.endsWith('='))
        .join('; '),
    );
  }
}, 180_000);

beforeEach(resetRequests);

afterAll(async () => {
  await app?.close();
  await wipe();
  await admin.$disconnect();
});

describe('raising a request', () => {
  it('starts Pending, unassigned, numbered, and records that it was raised', async () => {
    const made = await raise('PARENT_ONE');

    expect(made.requestNo).toBe('REQ-0001');
    expect(made.status).toBe('PENDING');
    expect(made.priority).toBe('NORMAL');
    expect(made.assignee).toBeNull();
    expect(made.requester).toMatchObject({ name: 'Amna Parent', roleLabel: 'Parent' });
    expect(made.isRequester).toBe(true);
    expect(made.events).toHaveLength(1);
    expect(made.events[0]).toMatchObject({ kind: 'CREATED', actor: { name: 'Amna Parent' } });
  });

  it('numbers them in order, per school', async () => {
    await raise('PARENT_ONE');
    const second = await raise('TEACHER');
    expect(second.requestNo).toBe('REQ-0002');
  });

  it('is one request however many times the form is submitted', async () => {
    const idempotencyKey = key();
    const first = await raise('PARENT_ONE', { idempotencyKey });
    const second = await raise('PARENT_ONE', { idempotencyKey });

    expect(second.id).toBe(first.id);
    expect(await count(`SELECT count(*) AS n FROM requests WHERE school_id = $1::uuid`, SCHOOL)).toBe(1);
  });

  it('is open to a teacher and to office staff as well as to a parent', async () => {
    for (const who of ['TEACHER', 'ACCOUNTANT', 'OFFICE'] as const) {
      const made = await raise(who);
      expect(made.requester.name).toBe(USERS[who].name);
    }
  });

  it('refuses a missing subject or a category it does not know', async () => {
    const noSubject = await call('PARENT_ONE', 'POST', ROUTES.requests.list, {
      category: 'FEE',
      subject: '  ',
      description: 'Something is wrong here.',
      idempotencyKey: key(),
    });
    const badCategory = await call('PARENT_ONE', 'POST', ROUTES.requests.list, {
      category: 'LUNCH',
      subject: 'Not a category',
      description: 'Something is wrong here.',
      idempotencyKey: key(),
    });
    expect(noSubject.statusCode).toBe(400);
    expect(badCategory.statusCode).toBe(400);
  });

  it('cannot set its own status or assignee', async () => {
    const response = await call('PARENT_ONE', 'POST', ROUTES.requests.list, {
      category: 'FEE',
      subject: 'Please resolve me',
      description: 'Trying to skip the queue.',
      idempotencyKey: key(),
      status: 'RESOLVED',
      assigneeId: USERS.OWNER.id,
    });
    expect(response.statusCode).toBe(400);
  });
});

describe('the child a request is about', () => {
  it('lets a parent raise one about their own child', async () => {
    const made = await raise('PARENT_ONE', { studentId: CHILD_OF_ONE });
    expect(made.student).toMatchObject({ name: 'Zara Khan', className: 'Class A' });
  });

  it('refuses another family’s child, and says no more than for one that does not exist', async () => {
    const theirs = await call('PARENT_ONE', 'POST', ROUTES.requests.list, {
      category: 'CONCERN',
      subject: 'About someone else’s child',
      description: 'This should not be allowed.',
      studentId: CHILD_OF_TWO,
      idempotencyKey: key(),
    });
    const invented = await call('PARENT_ONE', 'POST', ROUTES.requests.list, {
      category: 'CONCERN',
      subject: 'About a child who is not there',
      description: 'This should not be allowed either.',
      studentId: randomUUID(),
      idempotencyKey: key(),
    });

    expect(theirs.statusCode).toBe(400);
    expect(invented.statusCode).toBe(400);
    expect(theirs.json<{ detail: string }>().detail).toBe(invented.json<{ detail: string }>().detail);
  });

  it('offers a parent only their own children, and a teacher only their classes', async () => {
    const parent = await call('PARENT_ONE', 'GET', ROUTES.requests.students);
    expect(parent.json<{ data: { name: string }[] }>().data.map((s) => s.name)).toEqual(['Zara Khan']);

    const teacher = await call('TEACHER', 'GET', ROUTES.requests.students);
    expect(
      teacher
        .json<{ data: { name: string }[] }>()
        .data.map((s) => s.name)
        .sort(),
    ).toEqual(['Yusuf Khan', 'Zara Khan']);

    const office = await call('OFFICE', 'GET', ROUTES.requests.students);
    expect(office.json<{ data: unknown[] }>().data).toHaveLength(3);
  });

  it('refuses a teacher a child outside their classes', async () => {
    const response = await call('TEACHER', 'POST', ROUTES.requests.list, {
      category: 'ACADEMIC',
      subject: 'About a child in another class',
      description: 'This is not one of mine.',
      studentId: CLASS_B_CHILD,
      idempotencyKey: key(),
    });
    expect(response.statusCode).toBe(400);
  });

  it('searches the picker', async () => {
    const found = await call('OFFICE', 'GET', `${ROUTES.requests.students}?q=yusuf`);
    expect(found.json<{ data: { name: string }[] }>().data.map((s) => s.name)).toEqual(['Yusuf Khan']);
  });
});

describe('who can see which request', () => {
  it('shows a requester only their own', async () => {
    const mine = await raise('PARENT_ONE', { subject: 'Mine, from the first parent' });
    await raise('PARENT_TWO', { subject: 'Theirs, from the second parent' });

    const seen = await list('PARENT_ONE');
    expect(seen.total).toBe(1);
    expect(seen.data[0]?.id).toBe(mine.id);
  });

  it('answers “not found” for somebody else’s, exactly as for one that is not there', async () => {
    const theirs = await raise('PARENT_TWO');

    const other = await call('PARENT_ONE', 'GET', ROUTES.requests.detail(theirs.id));
    const missing = await call('PARENT_ONE', 'GET', ROUTES.requests.detail(randomUUID()));

    expect(other.statusCode).toBe(404);
    expect(missing.statusCode).toBe(404);
  });

  it('shows the Admin, Principal and Office Staff every request in the school', async () => {
    await raise('PARENT_ONE');
    await raise('PARENT_TWO');
    await raise('TEACHER');

    for (const who of ['OWNER', 'PRINCIPAL', 'OFFICE'] as const) {
      expect((await list(who)).total, who).toBe(3);
    }
  });

  it('shows a teacher or an accountant no request but their own', async () => {
    const parents = await raise('PARENT_ONE');
    const mine = await raise('TEACHER');

    const seen = await list('TEACHER');
    expect(seen.data.map((r) => r.id)).toEqual([mine.id]);

    const hidden = await call('TEACHER', 'GET', ROUTES.requests.detail(parents.id));
    expect(hidden.statusCode).toBe(404);
    expect((await list('ACCOUNTANT')).total).toBe(0);
  });

  it('counts the summary over what the caller may see', async () => {
    await raise('PARENT_ONE');
    const second = await raise('PARENT_TWO');
    await setStatus('OFFICE', second.id, 'IN_PROGRESS');

    const summaryOf = async (who: Who): Promise<RequestSummary> =>
      (await call(who, 'GET', ROUTES.requests.summary)).json<{ data: RequestSummary }>().data;

    expect(await summaryOf('OFFICE')).toMatchObject({ total: 2, pending: 1, inProgress: 1 });
    expect(await summaryOf('PARENT_ONE')).toMatchObject({ total: 1, pending: 1, inProgress: 0 });
    expect(await summaryOf('ACCOUNTANT')).toMatchObject({ total: 0 });
  });

  it('never reaches another school’s requests', async () => {
    // Written directly: the other school's data is not reachable through the API.
    const foreignUser = randomUUID();
    await admin.$executeRawUnsafe(
      `INSERT INTO users (id, school_id, email, name, status, created_at, updated_at)
       VALUES ($1::uuid, $2::uuid, 'owner@other.test', 'Other Owner', 'ACTIVE', now(), now())`,
      foreignUser,
      OTHER_SCHOOL,
    );
    const foreignRequest = randomUUID();
    await admin.$executeRawUnsafe(
      `INSERT INTO requests (id, school_id, request_no, created_by, requester_role, category, subject, description, updated_at)
       VALUES ($1::uuid, $2::uuid, 'REQ-0001', $3::uuid, 'OWNER', 'OTHER', 'Another school', 'Not yours to read.', now())`,
      foreignRequest,
      OTHER_SCHOOL,
      foreignUser,
    );

    expect((await list('OWNER')).total).toBe(0);
    expect((await call('OWNER', 'GET', ROUTES.requests.detail(foreignRequest))).statusCode).toBe(404);
    expect((await setStatus('OWNER', foreignRequest, 'RESOLVED')).statusCode).toBe(404);
  });

  it('gives the office a way to contact the requester, and nobody else', async () => {
    await admin.$executeRawUnsafe(
      `UPDATE users SET phone = '+923001112223' WHERE id = $1::uuid`,
      USERS.PARENT_ONE.id,
    );
    const made = await raise('PARENT_ONE');

    const office = await open('OFFICE', made.id);
    expect(office.requesterContact).toEqual({
      phone: '+923001112223',
      email: 'parent-one@requests-e2e.test',
    });
    // The person who raised it already knows their own number.
    expect((await open('PARENT_ONE', made.id)).requesterContact).toBeNull();
  });

  it('needs a session', async () => {
    const response = await app.inject({
      method: 'GET',
      url: ROUTES.requests.list,
      headers: { host: HOST },
    });
    expect(response.statusCode).toBe(401);
  });
});

describe('the list', () => {
  it('pages by twenty, newest activity first', async () => {
    for (let index = 0; index < 25; index += 1) {
      await raise('PARENT_ONE', { subject: `Request number ${String(index + 1)}` });
    }

    const first = await list('OWNER');
    expect(first.total).toBe(25);
    expect(first.data).toHaveLength(20);
    expect(first.data[0]?.subject).toBe('Request number 25');

    const second = await list('OWNER', '?offset=20');
    expect(second.data).toHaveLength(5);
  });

  it('filters by status, category, priority and assignee', async () => {
    const urgent = await raise('PARENT_ONE', { category: 'CONCERN', priority: 'URGENT' });
    const fee = await raise('PARENT_TWO', { category: 'FEE', priority: 'LOW' });
    await setStatus('OFFICE', fee.id, 'IN_PROGRESS');
    await call('OFFICE', 'POST', ROUTES.requests.assign(urgent.id), { assigneeId: USERS.OFFICE.id });

    expect((await list('OWNER', '?status=IN_PROGRESS')).data.map((r) => r.id)).toEqual([fee.id]);
    expect((await list('OWNER', '?category=CONCERN')).data.map((r) => r.id)).toEqual([urgent.id]);
    expect((await list('OWNER', '?priority=LOW')).data.map((r) => r.id)).toEqual([fee.id]);
    expect((await list('OFFICE', '?assignee=me')).data.map((r) => r.id)).toEqual([urgent.id]);
    expect((await list('OFFICE', '?assignee=unassigned')).data.map((r) => r.id)).toEqual([fee.id]);
  });

  it('searches the subject, the number, the requester and the child', async () => {
    const made = await raise('PARENT_ONE', { subject: 'Bus stop is too far', studentId: CHILD_OF_ONE });
    await raise('PARENT_TWO', { subject: 'Something unrelated' });

    for (const q of ['bus stop', made.requestNo.toLowerCase(), 'amna', 'zara']) {
      expect((await list('OWNER', `?q=${encodeURIComponent(q)}`)).data.map((r) => r.id), q).toEqual([
        made.id,
      ]);
    }
  });

  it('narrows to one child, list and counts alike, and never past what the caller may see', async () => {
    const aboutZara = await raise('PARENT_ONE', { subject: 'About Zara', studentId: CHILD_OF_ONE });
    await raise('PARENT_ONE', { subject: 'About nobody in particular' });
    const aboutTheirs = await raise('PARENT_TWO', { subject: 'About their child', studentId: CHILD_OF_TWO });

    const summaryFor = async (who: Who, studentId: string): Promise<RequestSummary> =>
      (await call(who, 'GET', `${ROUTES.requests.summary}?studentId=${studentId}`)).json<{
        data: RequestSummary;
      }>().data;

    expect((await list('PARENT_ONE', `?studentId=${CHILD_OF_ONE}`)).data.map((r) => r.id)).toEqual([
      aboutZara.id,
    ]);
    expect(await summaryFor('PARENT_ONE', CHILD_OF_ONE)).toMatchObject({ total: 1, pending: 1 });

    // Another family's child: an empty answer, not their requests.
    expect((await list('PARENT_ONE', `?studentId=${CHILD_OF_TWO}`)).total).toBe(0);
    expect(await summaryFor('PARENT_ONE', CHILD_OF_TWO)).toMatchObject({ total: 0 });

    // The office sees every request, so for them it is a plain filter.
    expect((await list('OWNER', `?studentId=${CHILD_OF_TWO}`)).data.map((r) => r.id)).toEqual([
      aboutTheirs.id,
    ]);

    const malformed = await call('PARENT_ONE', 'GET', `${ROUTES.requests.summary}?studentId=nope`);
    expect(malformed.statusCode).toBe(400);
  });

  it('sorts by priority in the order a person means, not the alphabet', async () => {
    await raise('PARENT_ONE', { priority: 'LOW', subject: 'Low one' });
    await raise('PARENT_ONE', { priority: 'URGENT', subject: 'Urgent one' });
    await raise('PARENT_ONE', { priority: 'NORMAL', subject: 'Normal one' });
    await raise('PARENT_ONE', { priority: 'HIGH', subject: 'High one' });

    const sorted = await list('OWNER', '?sort=priority&order=desc');
    expect(sorted.data.map((r) => r.priority)).toEqual(['URGENT', 'HIGH', 'NORMAL', 'LOW']);
  });

  it('rejects a misspelt filter instead of returning everything', async () => {
    const response = await call('OWNER', 'GET', `${ROUTES.requests.list}?statuss=PENDING`);
    expect(response.statusCode).toBe(400);
  });
});

describe('assigning', () => {
  it('lets a manager give a request to someone in the office, and tells both of them', async () => {
    const made = await raise('PARENT_ONE');
    const assigned = await call('OWNER', 'POST', ROUTES.requests.assign(made.id), {
      assigneeId: USERS.PRINCIPAL.id,
    });

    expect(assigned.statusCode).toBe(201);
    const detail = assigned.json<{ data: RequestDetail }>().data;
    expect(detail.assignee).toMatchObject({ name: 'Paul Principal', roleLabel: 'Principal' });
    expect(detail.events.at(-1)).toMatchObject({ kind: 'ASSIGNED', actor: { name: 'Olivia Owner' } });

    const principal = await bell('PRINCIPAL');
    expect(principal.items.some((n) => n.kind === 'request.assigned')).toBe(true);
    const parent = await bell('PARENT_ONE');
    expect(parent.items.map((n) => n.kind)).toContain('request.assigned');
  });

  it('refuses somebody who could not open it', async () => {
    const made = await raise('PARENT_ONE');
    for (const who of ['TEACHER', 'PARENT_TWO', 'ACCOUNTANT'] as const) {
      const response = await call('OWNER', 'POST', ROUTES.requests.assign(made.id), {
        assigneeId: USERS[who].id,
      });
      expect(response.statusCode, who).toBe(400);
    }
    expect((await open('OWNER', made.id)).assignee).toBeNull();
  });

  it('is not a thing a requester or a teacher can do', async () => {
    const made = await raise('PARENT_ONE');
    for (const who of ['PARENT_ONE', 'TEACHER'] as const) {
      const response = await call(who, 'POST', ROUTES.requests.assign(made.id), {
        assigneeId: USERS.OWNER.id,
      });
      expect(response.statusCode, who).toBe(403);
    }
  });

  it('can be taken back, and giving it to the same person again changes nothing', async () => {
    const made = await raise('PARENT_ONE');
    const give = () =>
      call('OWNER', 'POST', ROUTES.requests.assign(made.id), { assigneeId: USERS.OFFICE.id });
    await give();
    const events = (await open('OWNER', made.id)).events.length;
    await give();
    expect((await open('OWNER', made.id)).events).toHaveLength(events);

    const cleared = await call('OWNER', 'POST', ROUTES.requests.assign(made.id), { assigneeId: null });
    expect(cleared.json<{ data: RequestDetail }>().data.assignee).toBeNull();
  });

  it('lists only people who can be given one', async () => {
    const response = await call('OWNER', 'GET', ROUTES.requests.assignees);
    const names = response.json<{ data: { name: string }[] }>().data.map((p) => p.name);
    expect(names).toEqual(['Olivia Owner', 'Paul Principal', 'Rita Office']);
    expect((await call('PARENT_ONE', 'GET', ROUTES.requests.assignees)).statusCode).toBe(403);
  });
});

describe('the status flow', () => {
  it('runs Pending → In progress → Resolved, recording each step and who took it', async () => {
    const made = await raise('PARENT_ONE');

    const working = await setStatus('OFFICE', made.id, 'IN_PROGRESS');
    expect(working.statusCode).toBe(201);
    const resolved = await setStatus('OFFICE', made.id, 'RESOLVED', 'Voucher corrected.');
    const detail = resolved.json<{ data: RequestDetail }>().data;

    expect(detail.status).toBe('RESOLVED');
    expect(detail.resolvedAt).not.toBeNull();
    const steps = detail.events.filter((e) => e.kind === 'STATUS_CHANGED');
    expect(steps.map((e) => [e.fromStatus, e.toStatus])).toEqual([
      ['PENDING', 'IN_PROGRESS'],
      ['IN_PROGRESS', 'RESOLVED'],
    ]);
    expect(steps[1]).toMatchObject({ body: 'Voucher corrected.', actor: { name: 'Rita Office' } });
  });

  it('will not make a move the flow does not allow', async () => {
    const made = await raise('PARENT_ONE');
    await setStatus('OFFICE', made.id, 'RESOLVED');

    const back = await setStatus('OFFICE', made.id, 'IN_PROGRESS');
    const pending = await setStatus('OFFICE', made.id, 'PENDING');
    expect(back.statusCode).toBe(422);
    // Pending is a real status, just never somewhere a request goes back to.
    expect(pending.statusCode).toBe(422);
    expect((await open('OFFICE', made.id)).status).toBe('RESOLVED');
  });

  it('needs a reason to reject', async () => {
    const made = await raise('PARENT_ONE');
    expect((await setStatus('OFFICE', made.id, 'REJECTED')).statusCode).toBe(400);

    const rejected = await setStatus('OFFICE', made.id, 'REJECTED', 'Outside school policy.');
    expect(rejected.statusCode).toBe(201);
    expect(rejected.json<{ data: RequestDetail }>().data.status).toBe('REJECTED');
  });

  it('lets the requester reopen a closed request — and nothing else about its status', async () => {
    const made = await raise('PARENT_ONE');

    // Open: the requester may not move it at all.
    expect((await setStatus('PARENT_ONE', made.id, 'RESOLVED')).statusCode).toBe(422);
    expect((await setStatus('PARENT_ONE', made.id, 'IN_PROGRESS')).statusCode).toBe(422);

    await setStatus('OFFICE', made.id, 'RESOLVED');
    expect((await setStatus('PARENT_ONE', made.id, 'IN_PROGRESS')).statusCode).toBe(422);

    const reopened = await setStatus('PARENT_ONE', made.id, 'REOPENED', 'It is still happening.');
    const detail = reopened.json<{ data: RequestDetail }>().data;
    expect(detail.status).toBe('REOPENED');
    // Reopening clears the resolution: it is not "resolved at" anything now.
    expect(detail.resolvedAt).toBeNull();
  });

  it('tells each person only the moves they may make', async () => {
    const made = await raise('PARENT_ONE');
    expect((await open('OFFICE', made.id)).allowedStatuses).toEqual(['IN_PROGRESS', 'RESOLVED', 'REJECTED']);
    expect((await open('PARENT_ONE', made.id)).allowedStatuses).toEqual([]);

    await setStatus('OFFICE', made.id, 'RESOLVED');
    expect((await open('OFFICE', made.id)).allowedStatuses).toEqual(['REOPENED']);
    expect((await open('PARENT_ONE', made.id)).allowedStatuses).toEqual(['REOPENED']);
  });

  it('lets only one of two simultaneous changes win', async () => {
    const made = await raise('PARENT_ONE');

    const [resolve, reject] = await Promise.all([
      setStatus('OFFICE', made.id, 'RESOLVED'),
      setStatus('OWNER', made.id, 'REJECTED', 'Not something we can do.'),
    ]);

    // One wins. The other is refused: 409 when it read the request before the
    // winner committed and lost the guarded update, 422 when it read it after,
    // when the move is no longer one the flow allows. Either way, not applied.
    const codes = [resolve.statusCode, reject.statusCode].sort();
    expect(codes[0]).toBe(201);
    expect([409, 422]).toContain(codes[1]);
    const final = await open('OWNER', made.id);
    expect(final.events.filter((e) => e.kind === 'STATUS_CHANGED')).toHaveLength(1);
  });

  it('audits every status change with before and after', async () => {
    const made = await raise('PARENT_ONE');
    await setStatus('OFFICE', made.id, 'IN_PROGRESS');

    const rows = await admin.$queryRawUnsafe<{ before: { status: string }; after: { status: string } }[]>(
      `SELECT "before", "after" FROM audit_logs
        WHERE school_id = $1::uuid AND action = 'requests.status.change' AND entity_id = $2`,
      SCHOOL,
      made.id,
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ before: { status: 'PENDING' }, after: { status: 'IN_PROGRESS' } });
  });
});

describe('who is told what', () => {
  it('tells the Admin, Principal and Office Staff when a request is raised — and nobody else', async () => {
    const made = await raise('PARENT_ONE', { subject: 'The bus did not come' });

    for (const who of ['OWNER', 'PRINCIPAL', 'OFFICE'] as const) {
      const heard = await bell(who);
      expect(heard.unreadCount, who).toBe(1);
      expect(heard.items[0]).toMatchObject({
        kind: 'request.submitted',
        entityType: 'request',
        entityId: made.id,
      });
      expect(heard.items[0]?.title).toContain('The bus did not come');
    }
    for (const who of ['PARENT_ONE', 'PARENT_TWO', 'TEACHER', 'ACCOUNTANT'] as const) {
      expect((await bell(who)).unreadCount, who).toBe(0);
    }
  });

  it('never tells somebody about what they did themselves', async () => {
    // The Admin raises one: the other two managers hear, the Admin does not.
    await raise('OWNER');
    expect((await bell('OWNER')).unreadCount).toBe(0);
    expect((await bell('PRINCIPAL')).unreadCount).toBe(1);
    expect((await bell('OFFICE')).unreadCount).toBe(1);
  });

  it('tells the requester when the status changes', async () => {
    const made = await raise('PARENT_ONE');
    await setStatus('OFFICE', made.id, 'RESOLVED', 'Fixed.');

    const heard = await bell('PARENT_ONE');
    expect(heard.items[0]).toMatchObject({ kind: 'request.status_changed', entityId: made.id });
    expect(heard.items[0]?.title.toLowerCase()).toContain('resolved');
  });

  it('is only ever your own bell', async () => {
    const made = await raise('PARENT_ONE');
    const officeBell = await bell('OFFICE');
    const officeIds = officeBell.items.map((n) => n.id);
    expect(officeIds.length).toBeGreaterThan(0);

    // Marking somebody else's as read does nothing to theirs.
    const response = await call('PARENT_ONE', 'POST', ROUTES.notifications.read, { ids: officeIds });
    expect(response.statusCode).toBe(201);
    expect((await bell('OFFICE')).unreadCount).toBe(officeIds.length);
    expect(made.id).toBeTruthy();
  });

  it('marks some, or all, as read', async () => {
    await raise('PARENT_ONE');
    await raise('PARENT_TWO');
    const heard = await bell('OFFICE');
    expect(heard.unreadCount).toBe(2);

    const one = await call('OFFICE', 'POST', ROUTES.notifications.read, { ids: [heard.items[0]?.id] });
    expect(one.json<{ data: { unreadCount: number } }>().data.unreadCount).toBe(1);

    const all = await call('OFFICE', 'POST', ROUTES.notifications.read, {});
    expect(all.json<{ data: { unreadCount: number } }>().data.unreadCount).toBe(0);
    expect((await bell('OFFICE')).items.every((n) => n.readAt !== null)).toBe(true);
  });

  it('writes the notification and the change together, or neither', async () => {
    // An assignment refused for going to somebody who could not open it must not
    // leave a "was assigned to you" behind for anyone to chase.
    const made = await raise('PARENT_ONE');
    await call('OWNER', 'POST', ROUTES.notifications.read, {});
    await call('PARENT_ONE', 'POST', ROUTES.notifications.read, {});

    const refused = await call('OWNER', 'POST', ROUTES.requests.assign(made.id), {
      assigneeId: USERS.TEACHER.id,
    });
    expect(refused.statusCode).toBe(400);
    expect((await bell('TEACHER')).unreadCount).toBe(0);
    expect((await bell('PARENT_ONE')).unreadCount).toBe(0);
  });
});

describe('pictures', () => {
  async function attach(who: Who, id: string, eventId: string, over: Record<string, unknown> = {}) {
    return call(who, 'POST', ROUTES.requests.eventAttachments(id, eventId), {
      mimeType: 'image/png',
      dataBase64: PNG_BASE64,
      fileName: 'voucher.png',
      ...over,
    });
  }

  it('is attached to the request it was raised with, and served to the office', async () => {
    const made = await raise('PARENT_ONE');
    const eventId = made.events[0]?.id ?? '';

    const uploaded = await attach('PARENT_ONE', made.id, eventId);
    expect(uploaded.statusCode).toBe(201);
    const picture = uploaded.json<{ data: RequestAttachment }>().data;
    expect(picture).toMatchObject({ fileName: 'voucher.png', mimeType: 'image/png' });

    expect((await open('OFFICE', made.id)).events[0]?.attachments).toHaveLength(1);

    const served = await call('OFFICE', 'GET', ROUTES.requests.attachment(picture.id));
    expect(served.statusCode).toBe(200);
    expect(served.headers['content-type']).toBe('image/png');
    expect(served.headers['x-content-type-options']).toBe('nosniff');
    expect(served.headers['cache-control']).toContain('private');
    expect(Buffer.from(served.rawPayload).toString('base64')).toBe(PNG_BASE64);
  });

  it('is served to the person who raised it and to nobody else', async () => {
    const made = await raise('PARENT_ONE');
    const uploaded = await attach('PARENT_ONE', made.id, made.events[0]?.id ?? '');
    const picture = uploaded.json<{ data: RequestAttachment }>().data;

    expect((await call('PARENT_ONE', 'GET', ROUTES.requests.attachment(picture.id))).statusCode).toBe(200);
    for (const who of ['PARENT_TWO', 'TEACHER', 'ACCOUNTANT'] as const) {
      expect((await call(who, 'GET', ROUTES.requests.attachment(picture.id))).statusCode, who).toBe(404);
    }
  });

  it('refuses what is not a picture, or is not the picture it claims to be', async () => {
    const made = await raise('PARENT_ONE');
    const eventId = made.events[0]?.id ?? '';
    const text = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>').toString('base64');

    expect((await attach('PARENT_ONE', made.id, eventId, { dataBase64: text })).statusCode).toBe(400);
    expect((await attach('PARENT_ONE', made.id, eventId, { mimeType: 'image/jpeg' })).statusCode).toBe(400);
    expect((await attach('PARENT_ONE', made.id, eventId, { mimeType: 'application/pdf' })).statusCode).toBe(
      400,
    );
  });

  it('refuses a fourth picture on one message', async () => {
    const made = await raise('PARENT_ONE');
    const eventId = made.events[0]?.id ?? '';
    for (let index = 0; index < 3; index += 1) {
      expect((await attach('PARENT_ONE', made.id, eventId)).statusCode).toBe(201);
    }
    expect((await attach('PARENT_ONE', made.id, eventId)).statusCode).toBe(422);
  });

  it('cannot be added once something has happened, which would change what it was', async () => {
    const made = await raise('PARENT_ONE');
    const eventId = made.events[0]?.id ?? '';
    await setStatus('OFFICE', made.id, 'IN_PROGRESS');

    // Something has happened since: the request as first sent is history now.
    expect((await attach('PARENT_ONE', made.id, eventId)).statusCode).toBe(422);
  });

  it('cannot be put on a status change or an assignment, only on the request', async () => {
    const made = await raise('PARENT_ONE');
    const moved = await setStatus('OFFICE', made.id, 'IN_PROGRESS');
    const eventId = moved.json<{ data: RequestDetail }>().data.events.at(-1)?.id ?? '';

    expect((await attach('OFFICE', made.id, eventId)).statusCode).toBe(422);
  });
});

describe('what the database itself guarantees', () => {
  let appClient: Client;

  beforeAll(async () => {
    appClient = await connectApp();
  });

  afterAll(async () => {
    await appClient?.end();
  });

  it('keeps the timeline append-only: the application role cannot edit or delete it', async () => {
    const made = await raise('PARENT_ONE');
    await setStatus('OFFICE', made.id, 'IN_PROGRESS');

    await withTenant(appClient, SCHOOL, async () => {
      await expect(
        appClient.query(`UPDATE request_events SET body = 'rewritten' WHERE school_id = $1::uuid`, [SCHOOL]),
      ).rejects.toThrow(/permission denied/i);
    });
    await withTenant(appClient, SCHOOL, async () => {
      await expect(
        appClient.query(`DELETE FROM request_events WHERE school_id = $1::uuid`, [SCHOOL]),
      ).rejects.toThrow(/permission denied/i);
    });
    await withTenant(appClient, SCHOOL, async () => {
      await expect(
        appClient.query(`DELETE FROM requests WHERE school_id = $1::uuid`, [SCHOOL]),
      ).rejects.toThrow(/permission denied/i);
    });
  });

  it('keeps pictures append-only too', async () => {
    await withTenant(appClient, SCHOOL, async () => {
      await expect(
        appClient.query(`UPDATE request_attachments SET file_name = 'x' WHERE school_id = $1::uuid`, [SCHOOL]),
      ).rejects.toThrow(/permission denied/i);
    });
  });

  it('only shows a school its own rows, even to a query that asks for everything', async () => {
    const made = await raise('PARENT_ONE');
    expect(made.id).toBeTruthy();

    await withTenant(appClient, OTHER_SCHOOL, async () => {
      const result = await appClient.query<{ n: number }>(`SELECT count(*)::int AS n FROM requests`);
      expect(result.rows[0]?.n).toBe(0);
    });
    await withTenant(appClient, SCHOOL, async () => {
      const result = await appClient.query<{ n: number }>(`SELECT count(*)::int AS n FROM requests`);
      expect(result.rows[0]?.n).toBe(1);
    });
  });

  it('will not store a resolved request with no resolution time, or the reverse', async () => {
    await expect(
      admin.$executeRawUnsafe(
        `INSERT INTO requests (id, school_id, request_no, created_by, requester_role, category, status, subject, description, updated_at)
         VALUES (gen_random_uuid(), $1::uuid, 'REQ-9999', $2::uuid, 'PARENT', 'OTHER', 'RESOLVED', 'Resolved with no time', 'It cannot be.', now())`,
        SCHOOL,
        USERS.PARENT_ONE.id,
      ),
    ).rejects.toThrow(/resolved_at_matches_status/);
  });
});
