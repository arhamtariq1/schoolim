import { ROUTES } from '@ilm/contracts';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { Test } from '@nestjs/testing';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { AppModule } from '../app.module';
import { createAdminClient, type PrismaClient } from '../prisma';
import { PasswordService } from '../shared/auth/password.service';
import { MAIL } from '../shared/mail/mail.port';

import { RecordingMailer } from './signup-flow';

/**
 * Who hears about what.
 *
 * One school, one person in every role. Every action below is followed by the
 * same question asked of everybody: did you hear, and should you have? The
 * failures this guards are the quiet ones — a notification nobody got, one
 * somebody got twice, and one a family got about another family's child.
 */

const SCHOOL = '33333333-3333-4333-8333-3333333333ec';
const OWNER = '44444444-4444-4444-8444-4444444444ec';
const PRINCIPAL = '44444444-4444-4444-8444-4444444444ed';
const SESSION = '55555555-5555-4555-8555-5555555555ec';
const CLASS_ONE = '66666666-6666-4666-8666-6666666666ec';
const CLASS_TWO = '66666666-6666-4666-8666-6666666666ed';
const HEAD = '99999999-9999-4999-8999-9999999999ec';

const HOST = 'notif-recipients-e2e.localhost';
const PASSWORD = 'correct-horse-battery-staple';
const CHOSEN = 'The1-Person-Picked!';

const mailer = new RecordingMailer();
let app: NestFastifyApplication;
let admin: PrismaClient;
let sequence = 0;

const cookies: Record<string, string> = {};

const TABLES = [
  'notifications',
  'device_tokens',
  'fee_payment_allocations',
  'fee_payments',
  'fee_voucher_arrears',
  'fee_voucher_lines',
  'fee_voucher_periods',
  'fee_vouchers',
  'job_runs',
  'invitations',
  'student_guardians',
  'guardians',
  'student_fees',
  'enrollments',
  'students',
  'staff_class_assignments',
  'staff',
  'holidays',
  'fee_heads',
  'audit_logs',
  'sessions',
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

async function signIn(identifier: string, password: string): Promise<string> {
  const response = await app.inject({
    method: 'POST',
    url: ROUTES.auth.login,
    headers: { host: HOST },
    payload: { identifier, password },
  });
  const raw = response.headers['set-cookie'];
  if (raw === undefined) return '';
  return (Array.isArray(raw) ? raw : [String(raw)])
    .map((entry) => entry.split(';')[0] ?? '')
    .filter((pair) => !pair.endsWith('='))
    .join('; ');
}

async function call(method: 'GET' | 'POST', url: string, who: string, payload?: unknown) {
  const response = await app.inject({
    method,
    url,
    headers: { host: HOST, cookie: cookies[who] ?? '' },
    ...(payload === undefined ? {} : { payload: payload as object }),
  });
  return {
    status: response.statusCode,
    body: JSON.parse(response.body || '{}') as { data: unknown },
  };
}

interface Bell {
  items: { kind: string; title: string; entityId: string | null; readAt: string | null }[];
  unreadCount: number;
}

async function bell(who: string): Promise<Bell> {
  const response = await call('GET', ROUTES.notifications.list, who);
  expect(response.status).toBe(200);
  return response.body.data as Bell;
}

async function kindsFor(who: string): Promise<string[]> {
  return (await bell(who)).items.map((item) => item.kind);
}

async function clearBells(): Promise<void> {
  await admin.$executeRawUnsafe(`DELETE FROM notifications WHERE school_id = $1::uuid`, SCHOOL);
}

async function acceptInvite(email: string): Promise<string> {
  let token: string | undefined;
  for (let index = mailer.delivered.length - 1; index >= 0 && token === undefined; index -= 1) {
    const message = mailer.delivered[index];
    if (message?.to === email) {
      token = /\/invite\?t=([A-Za-z0-9_-]+)/.exec(message.text)?.[1];
    }
  }
  if (token === undefined) throw new Error(`No invitation was mailed to ${email}`);
  const accepted = await app.inject({
    method: 'POST',
    url: ROUTES.auth.acceptInvite,
    headers: { host: HOST },
    payload: { token, password: CHOSEN },
  });
  expect(accepted.statusCode).toBe(201);
  return signIn(email, CHOSEN);
}

async function addStaff(who: string, name: string, email: string, role: string, classes: string[]) {
  sequence += 1;
  const created = await call('POST', ROUTES.staff.create, 'owner', {
    name,
    email,
    phone: '+923001234567',
    role,
    cnic: `35202-${String(1_000_000 + sequence)}-1`,
    classLevelIds: classes,
  });
  expect(created.status).toBe(201);
  cookies[who] = await acceptInvite(email);
}

async function admit(first: string, email: string, classLevelId = CLASS_ONE): Promise<string> {
  const result = await call('POST', ROUTES.students.create, 'owner', {
    firstName: first,
    lastName: 'Khan',
    gender: 'MALE',
    enrollment: { sessionId: SESSION, classLevelId },
    guardian: {
      name: `Parent of ${first}`,
      relation: 'FATHER',
      phone: '+923001234567',
      address: 'House 1, Street 2',
      email,
    },
    fees: [],
  });
  expect(result.status).toBe(201);
  const id = (result.body.data as { id: string }).id;
  await admin.$executeRawUnsafe(
    `INSERT INTO student_fees (id, school_id, student_id, fee_head_id, amount, effective_from, created_at, updated_at)
     VALUES (gen_random_uuid(), $1::uuid, $2::uuid, $3::uuid, '5000.00'::numeric, '2026-01-01'::date, now(), now())`,
    SCHOOL,
    id,
    HEAD,
  );
  return id;
}

beforeAll(async () => {
  admin = createAdminClient({ url: process.env['DATABASE_ADMIN_URL'] ?? '' });
  await wipe();

  await admin.$executeRaw`
    INSERT INTO schools (id, name, slug, created_at, updated_at)
    VALUES (${SCHOOL}::uuid, 'Notification Recipients E2E', 'notif-recipients-e2e', now(), now())`;

  const hash = await new PasswordService().hash(PASSWORD);
  for (const [id, email, role] of [
    [OWNER, 'owner@notif-recipients-e2e.test', 'OWNER'],
    [PRINCIPAL, 'principal@notif-recipients-e2e.test', 'PRINCIPAL'],
  ] as const) {
    await admin.$executeRawUnsafe(
      `INSERT INTO users (id, school_id, email, name, password_hash, status, created_at, updated_at)
       VALUES ($1::uuid, $2::uuid, $3, $4, $5, 'ACTIVE', now(), now())`,
      id,
      SCHOOL,
      email,
      role,
      hash,
    );
    await admin.$executeRawUnsafe(
      `INSERT INTO user_roles (id, school_id, user_id, role, created_at)
       VALUES (gen_random_uuid(), $1::uuid, $2::uuid, $3::"school_role", now())`,
      SCHOOL,
      id,
      role,
    );
  }
  await admin.$executeRawUnsafe(
    `INSERT INTO academic_sessions (id, school_id, name, start_date, end_date, status, is_current, created_at, updated_at)
     VALUES ($1::uuid, $2::uuid, '2026-2027', '2026-08-01', '2027-07-31', 'ACTIVE', true, now(), now())`,
    SESSION,
    SCHOOL,
  );
  for (const [id, name, order] of [
    [CLASS_ONE, 'Class 1', 1],
    [CLASS_TWO, 'Class 2', 2],
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
  await admin.$executeRawUnsafe(
    `INSERT INTO fee_heads (id, school_id, type, name, default_amount, frequency, sort_order, late_fee_applies, created_at, updated_at)
     VALUES ($1::uuid, $2::uuid, 'TUITION'::"fee_head_type", 'Tuition Fee', '5000.00'::numeric, 'MONTHLY'::"fee_frequency", 0, true, now(), now())`,
    HEAD,
    SCHOOL,
  );
  await admin.$executeRawUnsafe(
    `INSERT INTO number_sequences (id, school_id, kind, next_value, updated_at)
     VALUES (gen_random_uuid(), $1::uuid, 'gr', 1, now())`,
    SCHOOL,
  );
  await admin.$executeRawUnsafe(
    `INSERT INTO number_sequences (id, school_id, kind, next_value, prefix, pad, updated_at)
     VALUES (gen_random_uuid(), $1::uuid, 'voucher', 1, 'FV-', 6, now())`,
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

  cookies['owner'] = await signIn('owner@notif-recipients-e2e.test', PASSWORD);
  cookies['principal'] = await signIn('principal@notif-recipients-e2e.test', PASSWORD);

  await addStaff('teacherOne', 'Teacher One', 'teacher1@notif-recipients-e2e.test', 'TEACHER', [CLASS_ONE]);
  await addStaff('teacherTwo', 'Teacher Two', 'teacher2@notif-recipients-e2e.test', 'TEACHER', [CLASS_TWO]);
  await addStaff('accountant', 'Office Clerk', 'accounts@notif-recipients-e2e.test', 'OFFICE_STAFF', []);
}, 120_000);

afterAll(async () => {
  await wipe();
  await admin.$disconnect();
  await app.close();
});

describe('an admission', () => {
  it("tells the office and that class's teacher, and nobody else", async () => {
    await clearBells();
    await admit('Aamir', 'parent-a@notif-recipients-e2e.test');

    expect(await kindsFor('principal')).toEqual(['student.admitted']);
    expect(await kindsFor('teacherOne')).toEqual(['student.admitted']);
    // Office staff can admit, so they hear. Another class's teacher and the
    // person who did it do not.
    expect(await kindsFor('accountant')).toEqual(['student.admitted']);
    expect(await kindsFor('teacherTwo')).toEqual([]);
    expect(await kindsFor('owner')).toEqual([]);
  });

  it('counts it as unread, and clears it when read', async () => {
    expect((await bell('principal')).unreadCount).toBe(1);

    const cleared = await call('POST', ROUTES.notifications.read, 'principal', {});
    expect(cleared.status).toBe(201);
    expect((await bell('principal')).unreadCount).toBe(0);
  });
});

describe('vouchers and payments', () => {
  it("reach the child's own family and the finance people, and not another family", async () => {
    await clearBells();
    const one = 'family-one@notif-recipients-e2e.test';
    const two = 'family-two@notif-recipients-e2e.test';
    await admit('Faraz', one);
    await admit('Fatima', two);
    cookies['familyOne'] = await acceptInvite(one);
    cookies['familyTwo'] = await acceptInvite(two);
    await clearBells();

    const generated = await call('POST', ROUTES.vouchers.generate, 'owner', {
      sessionId: SESSION,
      scope: { kind: 'CLASS', classLevelId: CLASS_ONE },
      heads: [{ feeHeadId: HEAD }],
      billMonths: ['2026-10'],
      issueDate: '2026-10-01',
      dueDate: '2026-10-20',
      validTill: '2026-10-20',
      includeArrears: false,
      applyLateFee: false,
      idempotencyKey: `recipients-${String(Date.now())}`,
    });
    expect(generated.status).toBe(201);

    expect(await kindsFor('familyOne')).toEqual(['voucher.generated']);
    expect(await kindsFor('familyTwo')).toEqual(['voucher.generated']);
    expect(await kindsFor('teacherOne')).toEqual([]);

    // Each family's notification points at their own child's voucher only.
    const mine = (await bell('familyOne')).items.map((item) => item.entityId);
    const theirs = new Set((await bell('familyTwo')).items.map((item) => item.entityId));
    for (const id of mine) expect(theirs.has(id)).toBe(false);

    await clearBells();
    const voucherId = mine[0] as string;
    const paid = await call('POST', ROUTES.vouchers.pay(voucherId), 'accountant', {
      method: 'CASH',
      paidOn: '2026-10-05',
      idempotencyKey: `pay-${String(Date.now())}`,
    });
    expect(paid.status).toBe(201);

    expect(await kindsFor('familyOne')).toEqual(['voucher.payment_received']);
    expect(await kindsFor('familyTwo')).toEqual([]);
    // The owner watches income; the accountant took it and already knows.
    expect(await kindsFor('owner')).toEqual(['voucher.payment_recorded']);
    expect(await kindsFor('accountant')).toEqual([]);
    expect(await kindsFor('teacherOne')).toEqual([]);
  });

  it('are not announced twice when the same payment is sent again', async () => {
    await clearBells();
    const voucherId = (await admin.feeVoucher.findFirst({ select: { id: true } }))?.id;
    expect(voucherId).toBeDefined();
    // The first voucher is already settled, so a replay is refused or answered
    // from the first receipt; either way nobody hears a second time.
    const body = { method: 'CASH', paidOn: '2026-10-05', idempotencyKey: 'replay-key-fixed' };
    await call('POST', ROUTES.vouchers.pay(voucherId ?? ''), 'accountant', body);
    const heard = (await bell('owner')).items.length;
    await call('POST', ROUTES.vouchers.pay(voucherId ?? ''), 'accountant', body);
    expect((await bell('owner')).items.length).toBe(heard);
  });
});

describe('a holiday', () => {
  it('goes to the audience it applies to', async () => {
    await clearBells();
    const created = await call('POST', ROUTES.academics.holidays, 'owner', {
      sessionId: SESSION,
      name: 'Staff Training Day',
      type: 'HOLIDAY',
      appliesTo: 'STAFF',
      startDate: '2026-11-10',
      colorKey: 'rose',
    });
    expect(created.status).toBe(201);

    expect(await kindsFor('principal')).toEqual(['holiday.announced']);
    expect(await kindsFor('teacherOne')).toEqual(['holiday.announced']);
    expect(await kindsFor('familyOne')).toEqual([]);

    await clearBells();
    await call('POST', ROUTES.academics.holidays, 'owner', {
      sessionId: SESSION,
      name: 'Parents Day',
      type: 'HOLIDAY',
      appliesTo: 'STUDENTS',
      startDate: '2026-11-12',
      colorKey: 'rose',
    });
    expect(await kindsFor('familyOne')).toEqual(['holiday.announced']);
    expect(await kindsFor('teacherOne')).toEqual([]);
  });
});

describe('new staff', () => {
  it('tells the people who manage staff, not the staff or families', async () => {
    await clearBells();
    await addStaff('newTeacher', 'New Hire', 'newhire@notif-recipients-e2e.test', 'TEACHER', []);
    expect(await kindsFor('principal')).toEqual(['staff.added']);
    expect(await kindsFor('teacherOne')).toEqual([]);
    expect(await kindsFor('familyOne')).toEqual([]);
  });
});

describe('the bell is only ever your own', () => {
  it("cannot mark somebody else's notification read", async () => {
    await clearBells();
    await admit('Zara', 'zara-parent@notif-recipients-e2e.test');
    const rows = await admin.notification.findMany({
      where: { schoolId: SCHOOL, userId: PRINCIPAL },
      select: { id: true },
    });
    expect(rows).toHaveLength(1);
    await call('POST', ROUTES.notifications.read, 'teacherTwo', { ids: [rows[0]?.id ?? ''] });
    expect((await bell('principal')).unreadCount).toBe(1);
  });
});

describe('paging the bell', () => {
  it('hands out twenty at a time, newest first, with none repeated or skipped', async () => {
    await clearBells();
    // Same timestamp on purpose: one voucher run writes hundreds of rows in a
    // single transaction, which is what a time-only cursor gets wrong.
    await admin.$executeRawUnsafe(
      `INSERT INTO notifications (id, school_id, user_id, kind, title, entity_type, entity_id, created_at)
       SELECT gen_random_uuid(), $1::uuid, $2::uuid, 'holiday.announced', 'Holiday ' || n, 'holiday', gen_random_uuid(), now()
       FROM generate_series(1, 45) n`,
      SCHOOL,
      PRINCIPAL,
    );

    const seen: string[] = [];
    let cursor: string | null = null;
    const sizes: number[] = [];
    do {
      const url: string = cursor === null ? ROUTES.notifications.list : `${ROUTES.notifications.list}?cursor=${encodeURIComponent(cursor)}`;
      const page = (await call('GET', url, 'principal')).body.data as Bell & { nextCursor: string | null };
      sizes.push(page.items.length);
      seen.push(...page.items.map((item) => item.title));
      expect(page.unreadCount).toBe(45);
      cursor = page.nextCursor;
    } while (cursor !== null);

    expect(sizes).toEqual([20, 20, 5]);
    expect(new Set(seen).size).toBe(45);
  });
});
