import { ROUTES } from '@ilm/contracts';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { Test } from '@nestjs/testing';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { AppModule } from '../app.module';
import { createAdminClient, type PrismaClient } from '../prisma';
import { PasswordService } from '../shared/auth/password.service';

/**
 * Finance › Revenue end to end.
 *
 * The figure that matters is `revenue = received - deposit held`. A security
 * deposit is the family's money (fees-and-finance §10), so every test here is
 * about where that line falls: a deposit paid in one go, a deposit paid in two
 * parts, and a part payment before any deposit is held at all.
 */

const SCHOOL_A = '33333333-3333-4333-8333-3333333333c1';
const SCHOOL_B = '33333333-3333-4333-8333-3333333333c2';
const OWNER_A = '44444444-4444-4444-8444-4444444444c1';
const PRINCIPAL_A = '44444444-4444-4444-8444-4444444444c2';
const SESSION_A = '55555555-5555-4555-8555-5555555555c1';
const SESSION_B = '55555555-5555-4555-8555-5555555555c2';
const CLASS_A = '66666666-6666-4666-8666-6666666666c1';
const CLASS_B = '66666666-6666-4666-8666-6666666666c2';
const HEAD_TUITION = '77777777-7777-4777-8777-7777777777c1';
const HEAD_SECURITY = '77777777-7777-4777-8777-7777777777c2';
const HEAD_TUITION_B = '77777777-7777-4777-8777-7777777777c3';
const AASIA = '88888888-8888-4888-8888-8888888888c1';
const BILAL = '88888888-8888-4888-8888-8888888888c2';
const FARAZ = '88888888-8888-4888-8888-8888888888c3';

const HOST_A = 'revenue-a-e2e.localhost';
const HOST_B = 'revenue-b-e2e.localhost';
const PASSWORD = 'correct-horse-battery-staple';

let app: NestFastifyApplication;
let admin: PrismaClient;
let owner = '';
let principal = '';
let ownerB = '';

const TABLES = [
  'security_deposit_refunds',
  'security_deposits',
  'fee_payment_allocations',
  'fee_payments',
  'fee_voucher_arrears',
  'fee_voucher_periods',
  'fee_voucher_lines',
  'fee_vouchers',
  'job_runs',
  'notifications',
];

async function wipe(): Promise<void> {
  for (const table of [
    ...TABLES,
    'student_fees',
    'fee_heads',
    'enrollments',
    'students',
    'class_levels',
    'number_sequences',
    'academic_sessions',
    'sessions',
    'audit_logs',
    'user_roles',
    'users',
  ]) {
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
      (${SCHOOL_A}::uuid, 'Revenue E2E A', 'revenue-a-e2e', now(), now()),
      (${SCHOOL_B}::uuid, 'Revenue E2E B', 'revenue-b-e2e', now(), now())
  `;
  const hash = await new PasswordService().hash(PASSWORD);
  for (const [id, school, email, role] of [
    [OWNER_A, SCHOOL_A, 'owner@revenue-a-e2e.test', 'OWNER'],
    [PRINCIPAL_A, SCHOOL_A, 'principal@revenue-a-e2e.test', 'PRINCIPAL'],
    ['44444444-4444-4444-8444-4444444444c3', SCHOOL_B, 'owner@revenue-b-e2e.test', 'OWNER'],
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

  for (const [school, session, classLevel, head] of [
    [SCHOOL_A, SESSION_A, CLASS_A, HEAD_TUITION],
    [SCHOOL_B, SESSION_B, CLASS_B, HEAD_TUITION_B],
  ] as const) {
    await admin.$executeRawUnsafe(
      `INSERT INTO academic_sessions (id, school_id, name, start_date, end_date, status, is_current, created_at, updated_at)
       VALUES ($1::uuid, $2::uuid, '2026-2027', '2026-04-01', '2027-03-31', 'ACTIVE', true, now(), now())`,
      session,
      school,
    );
    await admin.$executeRawUnsafe(
      `INSERT INTO class_levels (id, school_id, name, numeric_order, created_at, updated_at)
       VALUES ($1::uuid, $2::uuid, 'Grade 1', 1, now(), now())`,
      classLevel,
      school,
    );
    await admin.$executeRawUnsafe(
      `INSERT INTO fee_heads (id, school_id, type, name, default_amount, frequency, sort_order, late_fee_applies, created_at, updated_at)
       VALUES ($1::uuid, $2::uuid, 'TUITION', 'Tuition Fee', 5000, 'MONTHLY', 0, true, now(), now())`,
      head,
      school,
    );
  }
  await admin.$executeRawUnsafe(
    `INSERT INTO fee_heads (id, school_id, type, name, default_amount, frequency, sort_order, late_fee_applies, created_at, updated_at)
     VALUES ($1::uuid, $2::uuid, 'SECURITY', 'Security Deposit', 15000, 'ONE_TIME', 1, false, now(), now())`,
    HEAD_SECURITY,
    SCHOOL_A,
  );

  for (const [id, first, gr, school, session, classLevel, head] of [
    [AASIA, 'Aasia', 'GR-R1', SCHOOL_A, SESSION_A, CLASS_A, HEAD_TUITION],
    [BILAL, 'Bilal', 'GR-R2', SCHOOL_A, SESSION_A, CLASS_A, HEAD_TUITION],
    [FARAZ, 'Faraz', 'GR-R3', SCHOOL_B, SESSION_B, CLASS_B, HEAD_TUITION_B],
  ] as const) {
    await admin.$executeRawUnsafe(
      `INSERT INTO students (id, school_id, gr_no, student_code, first_name, last_name, status, admitted_on, created_at, updated_at)
       VALUES ($1::uuid, $2::uuid, $3, $3, $4, 'Khan', 'ACTIVE', '2026-04-01', now(), now())`,
      id,
      school,
      gr,
      first,
    );
    await admin.$executeRawUnsafe(
      `INSERT INTO enrollments (id, school_id, student_id, session_id, class_level_id, status, enrolled_on, created_at, updated_at)
       VALUES (gen_random_uuid(), $1::uuid, $2::uuid, $3::uuid, $4::uuid, 'ENROLLED', '2026-04-01', now(), now())`,
      school,
      id,
      session,
      classLevel,
    );
    await admin.$executeRawUnsafe(
      `INSERT INTO student_fees (id, school_id, student_id, fee_head_id, amount, effective_from, created_at, updated_at)
       VALUES (gen_random_uuid(), $1::uuid, $2::uuid, $3::uuid, 5000, '2026-04-01', now(), now())`,
      school,
      id,
      head,
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

  owner = await signIn(HOST_A, 'owner@revenue-a-e2e.test');
  principal = await signIn(HOST_A, 'principal@revenue-a-e2e.test');
  ownerB = await signIn(HOST_B, 'owner@revenue-b-e2e.test');
}, 120_000);

afterAll(async () => {
  await app?.close();
  await wipe();
  await admin.$disconnect();
});

beforeEach(async () => {
  for (const table of TABLES) {
    await admin.$executeRawUnsafe(
      `DELETE FROM ${table} WHERE school_id IN ($1::uuid, $2::uuid)`,
      SCHOOL_A,
      SCHOOL_B,
    );
  }
  await admin.$executeRawUnsafe(
    `INSERT INTO number_sequences (id, school_id, kind, next_value, prefix, pad, updated_at)
     SELECT gen_random_uuid(), school, 'voucher', 1, 'RV-', 6, now()
       FROM unnest(ARRAY[$1::uuid, $2::uuid]) AS school
     ON CONFLICT (school_id, kind) DO NOTHING`,
    SCHOOL_A,
    SCHOOL_B,
  );
});

let keyCounter = 0;
function freshKey(): string {
  keyCounter += 1;
  return `e2e-revenue-${String(Date.now())}-${String(keyCounter)}`;
}

async function call(
  method: 'GET' | 'POST',
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

/** One voucher for one student; returns its id. */
async function bill(
  studentId: string,
  heads: { feeHeadId: string; amountMinor?: number }[],
): Promise<string> {
  const generated = await call('POST', ROUTES.vouchers.generate, owner, {
    sessionId: SESSION_A,
    scope: { kind: 'STUDENT', studentId },
    heads,
    billMonths: ['2026-09'],
    issueDate: '2026-09-01',
    dueDate: '2026-09-30',
    validTill: '2026-10-31',
    includeArrears: false,
    applyLateFee: false,
    idempotencyKey: freshKey(),
  });
  expect(generated.statusCode).toBe(201);
  const list = await call('GET', `${ROUTES.vouchers.list}?studentId=${studentId}`, owner);
  const rows = list.json<{ data: { id: string; status: string }[] }>().data;
  const open = rows.find((row) => row.status === 'UNPAID');
  return open?.id ?? '';
}

async function pay(voucherId: string, paidOn: string, extra: Record<string, unknown> = {}) {
  const response = await call('POST', ROUTES.vouchers.pay(voucherId), owner, {
    method: 'CASH',
    paidOn,
    idempotencyKey: freshKey(),
    ...extra,
  });
  expect(response.statusCode).toBe(201);
}

interface RevenueBody {
  data: {
    receiptNo: string;
    studentName: string;
    method: string;
    voucherNos: string[];
    receivedMinor: number;
    depositMinor: number;
    revenueMinor: number;
  }[];
  meta: {
    page: { total: number };
    totals: { count: number; receivedMinor: number; depositMinor: number; revenueMinor: number };
  };
}

async function revenue(query = '', cookie = owner, host = HOST_A) {
  const response = await call('GET', `${ROUTES.revenue.list}${query}`, cookie, undefined, host);
  return { status: response.statusCode, body: response.json<RevenueBody>() };
}

describe('what was received, and what was earned', () => {
  it('counts a tuition payment as revenue in full', async () => {
    await pay(await bill(AASIA, [{ feeHeadId: HEAD_TUITION }]), '2026-09-10');

    const { status, body } = await revenue();
    expect(status).toBe(200);
    expect(body.data).toEqual([
      expect.objectContaining({
        studentName: 'Aasia Khan',
        method: 'CASH',
        receivedMinor: 500_000,
        depositMinor: 0,
        revenueMinor: 500_000,
      }),
    ]);
  });

  it('takes a security deposit out of revenue', async () => {
    const id = await bill(AASIA, [
      { feeHeadId: HEAD_TUITION },
      { feeHeadId: HEAD_SECURITY, amountMinor: 1_500_000 },
    ]);
    await pay(id, '2026-09-10');

    const { body } = await revenue();
    expect(body.data[0]).toEqual(
      expect.objectContaining({ receivedMinor: 2_000_000, depositMinor: 1_500_000, revenueMinor: 500_000 }),
    );
    expect(body.meta.totals).toEqual({
      count: 1,
      receivedMinor: 2_000_000,
      depositMinor: 1_500_000,
      revenueMinor: 500_000,
    });
  });

  it('splits a deposit paid in two parts, deposit first, and the parts add up', async () => {
    const id = await bill(AASIA, [
      { feeHeadId: HEAD_TUITION },
      { feeHeadId: HEAD_SECURITY, amountMinor: 1_500_000 },
    ]);
    await pay(id, '2026-09-05', { amountMinor: 1_200_000 });

    // Not paid in full yet, so no deposit is held: the receipt is revenue so far.
    let { body } = await revenue();
    expect(body.meta.totals.depositMinor).toBe(0);

    await pay(id, '2026-09-20');
    ({ body } = await revenue('?sort=paidOn&order=asc'));
    expect(body.data.map((row) => [row.receivedMinor, row.depositMinor, row.revenueMinor])).toEqual([
      [1_200_000, 1_200_000, 0],
      [800_000, 300_000, 500_000],
    ]);
    expect(body.meta.totals).toEqual({
      count: 2,
      receivedMinor: 2_000_000,
      depositMinor: 1_500_000,
      revenueMinor: 500_000,
    });
  });

  it('names the vouchers a receipt settled', async () => {
    const id = await bill(BILAL, [{ feeHeadId: HEAD_TUITION }]);
    await pay(id, '2026-09-10');
    const voucherNo = (await call('GET', ROUTES.vouchers.detail(id), owner)).json<{
      data: { voucherNo: string };
    }>().data.voucherNo;

    const { body } = await revenue();
    expect(body.data[0]?.voucherNos).toEqual([voucherNo]);
  });
});

describe('the filters', () => {
  beforeEach(async () => {
    await pay(await bill(AASIA, [{ feeHeadId: HEAD_TUITION }]), '2026-09-10');
    await pay(await bill(BILAL, [{ feeHeadId: HEAD_TUITION }]), '2026-10-02', {
      method: 'BANK_TRANSFER',
      reference: 'TXN-778',
    });
  });

  it('bounds the day the money arrived, inclusively', async () => {
    const { body } = await revenue('?from=2026-10-01&to=2026-10-31');
    expect(body.data.map((row) => row.studentName)).toEqual(['Bilal Khan']);
    expect((await revenue('?from=2026-09-10&to=2026-09-10')).body.meta.totals.count).toBe(1);
  });

  it('filters by method, and finds a bank reference by search', async () => {
    expect((await revenue('?method=CASH')).body.data.map((row) => row.studentName)).toEqual([
      'Aasia Khan',
    ]);
    expect((await revenue('?q=TXN-778')).body.data.map((row) => row.studentName)).toEqual([
      'Bilal Khan',
    ]);
  });

  it('totals the whole filter, not the page', async () => {
    const { body } = await revenue('?limit=1');
    expect(body.data).toHaveLength(1);
    expect(body.meta.page.total).toBe(2);
    expect(body.meta.totals.receivedMinor).toBe(1_000_000);
  });

  it('refuses a filter it does not know', async () => {
    expect((await revenue('?sort=password')).status).toBe(400);
  });
});

describe('who may read it', () => {
  it('is the owner’s alone: the principal is refused', async () => {
    expect((await revenue('', principal)).status).toBe(403);
  });

  it('never shows another school’s money', async () => {
    await pay(await bill(AASIA, [{ feeHeadId: HEAD_TUITION }]), '2026-09-10');
    const other = await revenue('', ownerB, HOST_B);
    expect(other.status).toBe(200);
    expect(other.body.data).toEqual([]);
  });
});
