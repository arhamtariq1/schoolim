import { ROUTES, type ParentChallan, type ParentVoucherList } from '@ilm/contracts';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { Test } from '@nestjs/testing';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { AppModule } from '../app.module';
import { createAdminClient, type PrismaClient } from '../prisma';
import { PasswordService } from '../shared/auth/password.service';
import { MAIL } from '../shared/mail/mail.port';

import { RecordingMailer } from './signup-flow';

/**
 * Fee vouchers reaching a parent, end to end.
 *
 * The office generates; the guardian of each child finds the voucher on their
 * own page and is told about it once. Then the half that matters more: nobody
 * reads another family's voucher, and a re-sent generation tells nobody twice.
 */

const SCHOOL = '33333333-3333-4333-8333-3333333333eb';
const OWNER = '44444444-4444-4444-8444-4444444444eb';
const SESSION = '55555555-5555-4555-8555-5555555555eb';
const CLASS_LEVEL = '66666666-6666-4666-8666-6666666666eb';
const HEAD_TUITION = '99999999-9999-4999-8999-9999999999eb';

const HOST = 'parent-vouchers-e2e.localhost';
const PASSWORD = 'correct-horse-battery-staple';
const CHOSEN = 'The1-Parent-Picked!';

const FAMILY_ONE = 'family-one@parent-vouchers-e2e.test';
const FAMILY_TWO = 'family-two@parent-vouchers-e2e.test';

const mailer = new RecordingMailer();

let app: NestFastifyApplication;
let admin: PrismaClient;
let owner = '';
let keyCounter = 0;

const TABLES = [
  'notifications',
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
  const cookies = Array.isArray(raw) ? raw : [String(raw)];
  return cookies
    .map((entry) => entry.split(';')[0] ?? '')
    .filter((pair) => !pair.endsWith('='))
    .join('; ');
}

async function call(method: 'GET' | 'POST', url: string, cookie: string, payload?: unknown) {
  const response = await app.inject({
    method,
    url,
    headers: { host: HOST, cookie },
    ...(payload === undefined ? {} : { payload: payload as object }),
  });
  return {
    status: response.statusCode,
    body: JSON.parse(response.body || '{}') as { data: unknown; meta?: unknown },
  };
}

function inviteToken(email: string): string {
  for (let index = mailer.delivered.length - 1; index >= 0; index -= 1) {
    const message = mailer.delivered[index];
    if (message?.to === email) {
      const token = /\/invite\?t=([A-Za-z0-9_-]+)/.exec(message.text)?.[1];
      if (token !== undefined) return token;
    }
  }
  throw new Error(`No invitation was mailed to ${email}`);
}

async function parentCookie(email: string): Promise<string> {
  const accepted = await app.inject({
    method: 'POST',
    url: ROUTES.auth.acceptInvite,
    headers: { host: HOST },
    payload: { token: inviteToken(email), password: CHOSEN },
  });
  expect(accepted.statusCode).toBe(201);
  return signIn(email, CHOSEN);
}

async function admit(first: string, email: string): Promise<string> {
  const result = await call('POST', ROUTES.students.create, owner, {
    firstName: first,
    lastName: 'Khan',
    gender: 'MALE',
    enrollment: { sessionId: SESSION, classLevelId: CLASS_LEVEL },
    guardian: {
      name: 'Fahim Khan',
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
    HEAD_TUITION,
  );
  return id;
}

async function generate(billMonth: string, dueDate: string, key?: string) {
  keyCounter += 1;
  const response = await call('POST', ROUTES.vouchers.generate, owner, {
    sessionId: SESSION,
    scope: { kind: 'CLASS', classLevelId: CLASS_LEVEL },
    heads: [{ feeHeadId: HEAD_TUITION }],
    billMonths: [billMonth],
    issueDate: `${billMonth}-01`,
    dueDate,
    validTill: dueDate,
    includeArrears: false,
    applyLateFee: false,
    idempotencyKey: key ?? `parent-vouchers-key-${String(Date.now())}-${String(keyCounter)}`,
  });
  expect(response.status).toBe(201);
  return response;
}

async function vouchersFor(cookie: string, query = ''): Promise<ParentVoucherList> {
  const response = await call('GET', `${ROUTES.parent.vouchers}${query}`, cookie);
  expect(response.status).toBe(200);
  return response.body.data as ParentVoucherList;
}

async function notificationsFor(cookie: string) {
  const response = await call('GET', ROUTES.notifications.list, cookie);
  return (response.body.data as { items: { kind: string; title: string; body: string | null; entityType: string | null; entityId: string | null }[] }).items;
}

beforeAll(async () => {
  admin = createAdminClient({ url: process.env['DATABASE_ADMIN_URL'] ?? '' });
  await wipe();

  await admin.$executeRaw`
    INSERT INTO schools (id, name, slug, created_at, updated_at)
    VALUES (${SCHOOL}::uuid, 'Parent Vouchers E2E', 'parent-vouchers-e2e', now(), now())`;

  const hash = await new PasswordService().hash(PASSWORD);
  await admin.$executeRawUnsafe(
    `INSERT INTO users (id, school_id, email, name, password_hash, status, created_at, updated_at)
     VALUES ($1::uuid, $2::uuid, 'owner@parent-vouchers-e2e.test', 'Owner', $3, 'ACTIVE', now(), now())`,
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
  await admin.$executeRawUnsafe(
    `INSERT INTO fee_heads (id, school_id, type, name, default_amount, frequency, sort_order, late_fee_applies, created_at, updated_at)
     VALUES ($1::uuid, $2::uuid, 'TUITION'::"fee_head_type", 'Tuition Fee', '5000.00'::numeric, 'MONTHLY'::"fee_frequency", 0, true, now(), now())`,
    HEAD_TUITION,
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

  owner = await signIn('owner@parent-vouchers-e2e.test', PASSWORD);
}, 90_000);

beforeEach(async () => {
  mailer.delivered.length = 0;
  for (const table of [
    'notifications',
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
  ]) {
    await admin.$executeRawUnsafe(`DELETE FROM ${table} WHERE school_id = $1::uuid`, SCHOOL);
  }
  await admin.$executeRawUnsafe(`DELETE FROM user_roles WHERE school_id = $1::uuid AND user_id <> $2::uuid`, SCHOOL, OWNER);
  await admin.$executeRawUnsafe(`DELETE FROM sessions WHERE school_id = $1::uuid AND user_id <> $2::uuid`, SCHOOL, OWNER);
  await admin.$executeRawUnsafe(`DELETE FROM users WHERE school_id = $1::uuid AND id <> $2::uuid`, SCHOOL, OWNER);
  await admin.$executeRawUnsafe(`UPDATE number_sequences SET next_value = 1 WHERE school_id = $1::uuid AND kind = 'voucher'`, SCHOOL);
});

afterAll(async () => {
  await app?.close();
  await wipe();
  await admin.$disconnect();
});

describe('a generated voucher reaches the parent', () => {
  it('appears on their page, with what a parent needs to read, and tells them once', async () => {
    const ahmed = await admit('Ahmed', FAMILY_ONE);
    await admit('Zara', FAMILY_TWO);
    const cookie = await parentCookie(FAMILY_ONE);

    expect((await vouchersFor(cookie)).total).toBe(0);
    await generate('2026-12', '2026-12-20');

    const list = await vouchersFor(cookie);
    expect(list.total).toBe(1);
    expect(list.items[0]).toMatchObject({
      studentId: ahmed,
      studentName: 'Ahmed Khan',
      className: 'Class 1',
      billMonths: ['2026-12-01'],
      totalPayableMinor: 500_000,
      dueDate: '2026-12-20',
      paymentStatus: 'UNPAID',
    });
    expect(list.items[0]?.voucherNo).toMatch(/^FV-/);

    const notices = (await notificationsFor(cookie)).filter((item) => item.kind === 'voucher.generated');
    expect(notices).toHaveLength(1);
    expect(notices[0]).toMatchObject({ entityType: 'voucher', entityId: list.items[0]?.id });
    expect(notices[0]?.title).toContain('Ahmed Khan');
    expect(notices[0]?.body).toContain('December 2026');
    expect(notices[0]?.body).toContain('Rs 5,000');
    expect(notices[0]?.body).toContain('20-Dec-2026');
  });

  it('does not notify twice, or bill twice, when the same generation is sent again', async () => {
    await admit('Ahmed', FAMILY_ONE);
    const cookie = await parentCookie(FAMILY_ONE);

    await generate('2026-12', '2026-12-20', 'same-key-for-both');
    await generate('2026-12', '2026-12-20', 'same-key-for-both');
    // A fresh key for the same month finds it already billed and writes nothing.
    await generate('2026-12', '2026-12-20');

    expect((await vouchersFor(cookie)).total).toBe(1);
    expect((await notificationsFor(cookie)).filter((item) => item.kind === 'voucher.generated')).toHaveLength(1);
  });

  it('tells nobody for a student who is not billed', async () => {
    await admit('Ahmed', FAMILY_ONE);
    const cookie = await parentCookie(FAMILY_ONE);
    await admin.$executeRawUnsafe(`DELETE FROM student_fees WHERE school_id = $1::uuid`, SCHOOL);

    await generate('2026-12', '2026-12-20');

    expect((await vouchersFor(cookie)).total).toBe(0);
    expect(await notificationsFor(cookie)).toHaveLength(0);
  });
});

describe('a parent with more than one child', () => {
  it('sees them all, and can filter by child, month and status', async () => {
    const ahmed = await admit('Ahmed', FAMILY_ONE);
    const bilal = await admit('Bilal', FAMILY_ONE);
    const cookie = await parentCookie(FAMILY_ONE);

    // September is long past due; December is not due yet.
    await generate('2026-09', '2026-09-15');
    await generate('2026-12', '2026-12-20');

    const all = await vouchersFor(cookie);
    expect(all.total).toBe(4);
    expect(all.children.map((child) => child.id).sort()).toEqual([ahmed, bilal].sort());
    expect(all.months).toEqual(['2026-12', '2026-09']);

    expect((await vouchersFor(cookie, `?studentId=${ahmed}`)).total).toBe(2);
    expect((await vouchersFor(cookie, '?month=2026-09')).total).toBe(2);
    expect((await vouchersFor(cookie, '?status=OVERDUE')).items.every((item) => item.billMonths[0] === '2026-09-01')).toBe(true);
    expect((await vouchersFor(cookie, '?status=OVERDUE')).total).toBe(2);
    expect((await vouchersFor(cookie, '?status=UNPAID')).total).toBe(2);
    expect((await vouchersFor(cookie, `?studentId=${bilal}&month=2026-12&status=UNPAID`)).total).toBe(1);
    expect((await vouchersFor(cookie, '?q=Ahmed')).total).toBe(2);
    expect((await vouchersFor(cookie, '?q=FV-000001')).total).toBe(1);
    expect((await vouchersFor(cookie, '?q=nobody')).total).toBe(0);

    // Latest first by default; the order can be turned over, and sorted by another column.
    const newest = (await vouchersFor(cookie)).items.map((item) => item.billMonths[0]);
    expect(newest).toEqual(['2026-12-01', '2026-12-01', '2026-09-01', '2026-09-01']);
    const oldest = (await vouchersFor(cookie, '?order=asc')).items.map((item) => item.billMonths[0]);
    expect(oldest).toEqual(['2026-09-01', '2026-09-01', '2026-12-01', '2026-12-01']);
    const byName = (await vouchersFor(cookie, '?sort=studentName&order=asc')).items.map((item) => item.studentName);
    expect(byName).toEqual(['Ahmed Khan', 'Ahmed Khan', 'Bilal Khan', 'Bilal Khan']);
    expect((await call('GET', `${ROUTES.parent.vouchers}?sort=password`, cookie)).status).toBe(400);
    const paged = await vouchersFor(cookie, '?limit=3&offset=3');
    expect(paged.total).toBe(4);
    expect(paged.items).toHaveLength(1);
  });

  it('follows a payment: part-paid, then paid, with no duplicate', async () => {
    await admit('Ahmed', FAMILY_ONE);
    const cookie = await parentCookie(FAMILY_ONE);
    await generate('2026-12', '2026-12-20');
    const voucherId = (await vouchersFor(cookie)).items[0]?.id ?? '';

    await call('POST', ROUTES.vouchers.pay(voucherId), owner, {
      amountMinor: 200_000,
      method: 'CASH',
      paidOn: '2026-10-05',
      idempotencyKey: `pay-part-${String(Date.now())}`,
    });
    expect((await vouchersFor(cookie)).items[0]?.paymentStatus).toBe('PARTIALLY_PAID');
    // What the dashboard's Fee status adds up: due, paid, and what is left.
    expect((await vouchersFor(cookie)).totals).toEqual({ dueMinor: 500_000, paidMinor: 200_000, pendingMinor: 300_000 });

    await call('POST', ROUTES.vouchers.pay(voucherId), owner, {
      method: 'CASH',
      paidOn: '2026-10-06',
      idempotencyKey: `pay-rest-${String(Date.now())}`,
    });
    const after = await vouchersFor(cookie);
    expect(after.total).toBe(1);
    expect(after.items[0]?.paymentStatus).toBe('PAID');
    expect((await vouchersFor(cookie, '?status=PAID')).total).toBe(1);
  });
});

describe('the children the dashboard draws', () => {
  it('names each child’s class, section, status and where to ask the timetable', async () => {
    await admit('Ahmed', FAMILY_ONE);
    const cookie = await parentCookie(FAMILY_ONE);
    const response = await call('GET', ROUTES.parent.children, cookie);
    const [child] = response.body.data as { className: string; classLevelId: string; sectionId: string | null; status: string }[];
    expect(child).toMatchObject({ className: 'Class 1', classLevelId: CLASS_LEVEL, status: 'ACTIVE' });
  });
});

describe('the voucher to preview and download', () => {
  it('comes with the school’s letterhead and Voucher Settings, and the same figures as the list', async () => {
    await admit('Ahmed', FAMILY_ONE);
    const cookie = await parentCookie(FAMILY_ONE);
    await generate('2026-12', '2026-12-20');
    const item = (await vouchersFor(cookie)).items[0];

    const response = await call('GET', ROUTES.parent.voucher(item?.id ?? ''), cookie);
    expect(response.status).toBe(200);
    const bundle = response.body.data as ParentChallan;
    expect(bundle.challan.voucherNo).toBe(item?.voucherNo);
    expect(bundle.challan.totalPayableMinor).toBe(item?.totalPayableMinor);
    expect(bundle.school.name).toBe('Parent Vouchers E2E');
    expect(bundle.settings.copyLabels.length).toBeGreaterThan(0);
    expect(bundle.paymentStatus).toBe('UNPAID');
  });
});

describe('what a parent must not be able to do', () => {
  it('cannot see, open or filter by another family’s voucher', async () => {
    await admit('Ahmed', FAMILY_ONE);
    const zara = await admit('Zara', FAMILY_TWO);
    const one = await parentCookie(FAMILY_ONE);
    const two = await parentCookie(FAMILY_TWO);
    await generate('2026-12', '2026-12-20');

    const theirs = (await vouchersFor(two)).items[0];
    expect(theirs?.studentId).toBe(zara);
    expect((await vouchersFor(one)).items.map((entry) => entry.id)).not.toContain(theirs?.id);

    // The same 404 as a voucher that does not exist.
    expect((await call('GET', ROUTES.parent.voucher(theirs?.id ?? ''), one)).status).toBe(404);
    expect((await call('GET', ROUTES.parent.voucher('99999999-9999-4999-8999-999999999999'), one)).status).toBe(404);
    expect((await call('GET', `${ROUTES.parent.vouchers}?studentId=${zara}`, one)).status).toBe(404);
  });

  it('is refused the staff voucher screens and every write', async () => {
    await admit('Ahmed', FAMILY_ONE);
    const cookie = await parentCookie(FAMILY_ONE);
    await generate('2026-12', '2026-12-20');
    const voucherId = (await vouchersFor(cookie)).items[0]?.id ?? '';

    expect((await call('GET', ROUTES.vouchers.list, cookie)).status).toBe(403);
    expect((await call('GET', ROUTES.vouchers.detail(voucherId), cookie)).status).toBe(403);
    expect((await call('POST', ROUTES.vouchers.challans, cookie, { ids: [voucherId] })).status).toBe(403);
    expect((await call('POST', ROUTES.vouchers.generate, cookie, {})).status).toBe(403);
    expect(
      (await call('POST', ROUTES.vouchers.pay(voucherId), cookie, { method: 'CASH', paidOn: '2026-12-06', idempotencyKey: 'sneaky-payment-key' })).status,
    ).toBe(403);
  });

  it('is turned away when not signed in as a guardian', async () => {
    expect((await call('GET', ROUTES.parent.vouchers, '')).status).toBe(401);
  });
});
