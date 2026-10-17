import {
  ROUTES,
  type StaffSalaryDetail,
  type StaffSalaryList,
} from '@ilm/contracts';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { Test } from '@nestjs/testing';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { AppModule } from '../app.module';
import { createAdminClient, type PrismaClient } from '../prisma';
import { PasswordService } from '../shared/auth/password.service';

/**
 * Staff salaries: one monthly record, many payments.
 *
 * The cases that matter are the ones that go wrong with money: a second payment
 * must see the first, an overpayment must be refused, a retried request must not
 * pay twice, a raise must not rewrite a month already running, and one school
 * must never see another's payroll.
 */

const SCHOOL = '33333333-3333-4333-8333-3333333333b1';
const OTHER_SCHOOL = '33333333-3333-4333-8333-3333333333b2';
const STAFF_A = '88888888-8888-4888-8888-8888888888a1';
const STAFF_B = '88888888-8888-4888-8888-8888888888a2';
const OTHER_STAFF = '88888888-8888-4888-8888-8888888888a3';

const HOST = 'salary-e2e.localhost';
const OTHER_HOST = 'salary-other-e2e.localhost';
const PASSWORD = 'correct-horse-battery-staple';

const MONTH = new Date().toISOString().slice(0, 7);
const TODAY = new Date().toISOString().slice(0, 10);

const USERS = [
  { id: '44444444-4444-4444-8444-4444444444b1', email: 'owner@salary-e2e.test', role: 'OWNER' },
  { id: '44444444-4444-4444-8444-4444444444b2', email: 'principal@salary-e2e.test', role: 'PRINCIPAL' },
  { id: '44444444-4444-4444-8444-4444444444b3', email: 'office@salary-e2e.test', role: 'RECEPTION' },
  { id: '44444444-4444-4444-8444-4444444444b4', email: 'teacher@salary-e2e.test', role: 'TEACHER' },
] as const;
const OTHER_USER = '44444444-4444-4444-8444-4444444444b5';

let app: NestFastifyApplication;
let admin: PrismaClient;
const jars = new Map<string, string>();

async function wipe(): Promise<void> {
  for (const school of [SCHOOL, OTHER_SCHOOL]) {
    for (const table of [
      'staff_salary_adjustments',
      'staff_salary_payments',
      'staff_salary_periods',
      'staff',
      'sessions',
      'audit_logs',
      'user_roles',
      'users',
    ]) {
      await admin.$executeRawUnsafe(`DELETE FROM ${table} WHERE school_id = $1::uuid`, school);
    }
    await admin.$executeRawUnsafe(`DELETE FROM schools WHERE id = $1::uuid`, school);
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
  const cookies = Array.isArray(raw) ? raw : [String(raw)];
  return cookies
    .map((entry) => entry.split(';')[0] ?? '')
    .filter((pair) => !pair.endsWith('='))
    .join('; ');
}

beforeAll(async () => {
  admin = createAdminClient({ url: process.env['DATABASE_ADMIN_URL'] ?? '' });
  await wipe();

  const hash = await new PasswordService().hash(PASSWORD);

  await admin.$executeRawUnsafe(
    `INSERT INTO schools (id, name, slug, created_at, updated_at)
     VALUES ($1::uuid, 'Salary E2E', 'salary-e2e', now(), now()),
            ($2::uuid, 'Other Salary E2E', 'salary-other-e2e', now(), now())`,
    SCHOOL,
    OTHER_SCHOOL,
  );

  for (const user of USERS) {
    await admin.$executeRawUnsafe(
      `INSERT INTO users (id, school_id, email, name, password_hash, status, created_at, updated_at)
       VALUES ($1::uuid, $2::uuid, $3, $4, $5, 'ACTIVE', now(), now())`,
      user.id,
      SCHOOL,
      user.email,
      user.role,
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
    `INSERT INTO users (id, school_id, email, name, password_hash, status, created_at, updated_at)
     VALUES ($1::uuid, $2::uuid, 'owner@salary-other-e2e.test', 'Other owner', $3, 'ACTIVE', now(), now())`,
    OTHER_USER,
    OTHER_SCHOOL,
    hash,
  );
  await admin.$executeRawUnsafe(
    `INSERT INTO user_roles (id, school_id, user_id, role, created_at)
     VALUES (gen_random_uuid(), $1::uuid, $2::uuid, 'OWNER', now())`,
    OTHER_SCHOOL,
    OTHER_USER,
  );

  const staff: [string, string, string, string, number][] = [
    [STAFF_A, SCHOOL, 'SAL-001', 'Amna Tester', 50_000],
    [STAFF_B, SCHOOL, 'SAL-002', 'Bilal Tester', 30_000],
    [OTHER_STAFF, OTHER_SCHOOL, 'SAL-901', 'Other School Person', 99_000],
  ];
  for (const [id, school, no, name, salary] of staff) {
    await admin.$executeRawUnsafe(
      `INSERT INTO staff (id, school_id, employee_no, name, phone, email, role, status, basic_salary, joined_on, created_at, updated_at)
       VALUES ($1::uuid, $2::uuid, $3, $4, '+923001234567', lower($3) || '@salary-e2e.test', 'TEACHER', 'ACTIVE', $5::numeric, $6::date, now(), now())`,
      id,
      school,
      no,
      name,
      salary,
      `${MONTH}-01`,
    );
  }

  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  app = moduleRef.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
  const { default: cookie } = await import('@fastify/cookie');
  await app.register(cookie);
  await app.init();
  await app.getHttpAdapter().getInstance().ready();

  for (const user of USERS) {
    jars.set(user.role, await signIn(HOST, user.email));
  }
  jars.set('OTHER', await signIn(OTHER_HOST, 'owner@salary-other-e2e.test'));
}, 120_000);

afterAll(async () => {
  await app?.close();
  await wipe();
  await admin.$disconnect();
});

type Result<T> = { status: number; data: T; message?: string };

async function call<T>(
  who: string,
  method: 'GET' | 'POST' | 'PATCH',
  url: string,
  payload?: Record<string, unknown>,
): Promise<Result<T>> {
  const host = who === 'OTHER' ? OTHER_HOST : HOST;
  const response = await app.inject({
    method,
    url,
    headers: { host, cookie: jars.get(who) ?? '' },
    ...(payload === undefined ? {} : { payload }),
  });
  const body = response.json<{ data?: T; detail?: string }>();
  return {
    status: response.statusCode,
    data: body.data as T,
    ...(body.detail === undefined ? {} : { message: body.detail }),
  };
}

const pay = (who: string, staffId: string, body: Record<string, unknown>) =>
  call<StaffSalaryDetail>(who, 'POST', ROUTES.staff.salaryPayments(staffId), {
    month: MONTH,
    paidOn: TODAY,
    ...body,
  });

describe('listing and generation', () => {
  it('makes the month payable once for everyone on the payroll and totals it', async () => {
    const first = await call<StaffSalaryList>('OWNER', 'GET', `${ROUTES.staffSalaries.list}?month=${MONTH}`);
    expect(first.status).toBe(200);
    expect(first.data.items).toHaveLength(2);
    expect(first.data.summary.totalPayrollMinor).toBe(8_000_000);
    expect(first.data.summary.totalPaidMinor).toBe(0);
    expect(first.data.summary.unpaidStaffCount).toBe(2);

    // Reading again must not make a second record.
    await call('OWNER', 'GET', `${ROUTES.staffSalaries.list}?month=${MONTH}`);
    const rows = await admin.$queryRawUnsafe<{ n: bigint }[]>(
      `SELECT COUNT(*) AS n FROM staff_salary_periods WHERE school_id = $1::uuid AND month = $2::date`,
      SCHOOL,
      `${MONTH}-01`,
    );
    expect(Number(rows[0]?.n)).toBe(2);
  });

  it('does not make future months payable', async () => {
    const next = new Date(`${MONTH}-01T00:00:00Z`);
    next.setUTCMonth(next.getUTCMonth() + 1);
    const future = next.toISOString().slice(0, 7);
    const response = await call<StaffSalaryList>('OWNER', 'GET', `${ROUTES.staffSalaries.list}?month=${future}`);
    expect(response.data.items).toHaveLength(0);
  });
});

describe('payments', () => {
  it('takes a part payment, then the rest, against one monthly record', async () => {
    const first = await pay('OWNER', STAFF_A, { amountMinor: 3_000_000, method: 'CASH' });
    expect(first.status).toBe(201);
    const afterFirst = first.data.months.find((month) => month.month === MONTH);
    expect(afterFirst?.paidMinor).toBe(3_000_000);
    expect(afterFirst?.remainingMinor).toBe(2_000_000);
    expect(afterFirst?.status).toBe('PARTIAL');

    const second = await pay('OWNER', STAFF_A, {
      amountMinor: 2_000_000,
      method: 'BANK_TRANSFER',
      reference: 'TXN-1',
    });
    const afterSecond = second.data.months.find((month) => month.month === MONTH);
    expect(afterSecond?.remainingMinor).toBe(0);
    expect(afterSecond?.status).toBe('PAID');
    expect(second.data.payments.filter((payment) => payment.month === MONTH)).toHaveLength(2);

    const records = await admin.$queryRawUnsafe<{ n: bigint }[]>(
      `SELECT COUNT(*) AS n FROM staff_salary_periods WHERE staff_id = $1::uuid AND month = $2::date`,
      STAFF_A,
      `${MONTH}-01`,
    );
    expect(Number(records[0]?.n)).toBe(1);
  });

  it('refuses to pay a settled salary again, and an overpayment', async () => {
    const settled = await pay('OWNER', STAFF_A, { amountMinor: 100 });
    expect(settled.status).toBe(422);

    const over = await pay('OWNER', STAFF_B, { amountMinor: 3_000_100 });
    expect(over.status).toBe(422);
    expect(over.message, 'overpay message').toMatch(/more than/i);
  });

  it('refuses a zero, a negative and a future-dated payment', async () => {
    expect((await pay('OWNER', STAFF_B, { amountMinor: 0 })).status).toBe(400);
    expect((await pay('OWNER', STAFF_B, { amountMinor: -5 })).status).toBe(400);
    expect((await pay('OWNER', STAFF_B, { amountMinor: 100, paidOn: '2999-01-01' })).status).toBe(422);
  });

  it('does not pay twice when the same request is sent twice', async () => {
    const body = { amountMinor: 1_000_000, idempotencyKey: 'dialog-key-0001' };
    const first = await pay('OWNER', STAFF_B, body);
    const again = await pay('OWNER', STAFF_B, body);
    expect(first.status).toBe(201);
    expect(again.status).toBe(201);
    const paid = again.data.months.find((month) => month.month === MONTH)?.paidMinor;
    expect(paid).toBe(1_000_000);
  });

  it('serialises two payments racing for the same balance', async () => {
    // STAFF_B has 2,000,000 left. Two payments of 1,500,000 cannot both fit.
    const [a, b] = await Promise.all([
      pay('OWNER', STAFF_B, { amountMinor: 1_500_000 }),
      pay('PRINCIPAL', STAFF_B, { amountMinor: 1_500_000 }),
    ]);
    expect([a.status, b.status].sort()).toEqual([201, 422]);
    const detail = await call<StaffSalaryDetail>('OWNER', 'GET', ROUTES.staff.salary(STAFF_B));
    const month = detail.data.months.find((entry) => entry.month === MONTH);
    expect(month?.paidMinor).toBe(2_500_000);
    expect(month?.paidMinor).toBeLessThanOrEqual(month?.netMinor ?? 0);
  });
});

describe('adjustments', () => {
  it('adds a bonus, and refuses a deduction that cuts below what is already paid', async () => {
    const bonus = await call<StaffSalaryDetail>('OWNER', 'POST', ROUTES.staff.salaryAdjustments(STAFF_B), {
      month: MONTH,
      kind: 'BONUS',
      amountMinor: 500_000,
      reason: 'Exam duty',
    });
    expect(bonus.status).toBe(201);
    const month = bonus.data.months.find((entry) => entry.month === MONTH);
    expect(month?.netMinor).toBe(3_500_000);
    expect(month?.remainingMinor).toBe(1_000_000);

    const tooDeep = await call<StaffSalaryDetail>('OWNER', 'POST', ROUTES.staff.salaryAdjustments(STAFF_B), {
      month: MONTH,
      kind: 'DEDUCTION',
      amountMinor: 2_000_000,
      reason: 'Too much',
    });
    expect(tooDeep.status).toBe(422);

    const fine = await call<StaffSalaryDetail>('OWNER', 'POST', ROUTES.staff.salaryAdjustments(STAFF_B), {
      month: MONTH,
      kind: 'DEDUCTION',
      amountMinor: 200_000,
      reason: 'Half-day absence',
    });
    expect(fine.data.months.find((entry) => entry.month === MONTH)?.netMinor).toBe(3_300_000);
    expect(fine.data.adjustments.map((entry) => entry.kind)).toEqual(['DEDUCTION', 'BONUS']);
  });

  it('needs a reason', async () => {
    const response = await call('OWNER', 'POST', ROUTES.staff.salaryAdjustments(STAFF_B), {
      month: MONTH,
      kind: 'BONUS',
      amountMinor: 100,
      reason: '',
    });
    expect(response.status).toBe(400);
  });
});

describe('history survives a raise', () => {
  it('keeps this month at the salary it was made at', async () => {
    const raise = await call('OWNER', 'PATCH', ROUTES.staff.update(STAFF_A), {
      basicSalaryMinor: 6_000_000,
    });
    expect(raise.status, raise.message).toBe(200);

    const detail = await call<StaffSalaryDetail>('OWNER', 'GET', ROUTES.staff.salary(STAFF_A));
    expect(detail.data.summary.currentMonthlySalaryMinor).toBe(6_000_000);
    expect(detail.data.months.find((entry) => entry.month === MONTH)?.baseMinor).toBe(5_000_000);
  });
});

describe('who may', () => {
  it('lets the admin, principal and office staff see and pay salaries', async () => {
    for (const who of ['OWNER', 'PRINCIPAL', 'RECEPTION']) {
      const list = await call<StaffSalaryList>(who, 'GET', `${ROUTES.staffSalaries.list}?month=${MONTH}`);
      expect(list.status).toBe(200);
    }
    const byOffice = await call<StaffSalaryDetail>('RECEPTION', 'POST', ROUTES.staff.salaryAdjustments(STAFF_B), {
      month: MONTH,
      kind: 'ALLOWANCE',
      amountMinor: 100_000,
      reason: 'Travel',
    });
    expect(byOffice.status).toBe(201);
  });

  it('keeps salaries from a teacher', async () => {
    const list = await call('TEACHER', 'GET', ROUTES.staffSalaries.list);
    expect(list.status).toBe(403);
    const paid = await pay('TEACHER', STAFF_B, { amountMinor: 100 });
    expect(paid.status).toBe(403);
  });
});

describe('one school never sees another', () => {
  it("does not list or open another school's staff, and cannot pay them", async () => {
    const list = await call<StaffSalaryList>('OTHER', 'GET', `${ROUTES.staffSalaries.list}?month=${MONTH}`);
    expect(list.data.items.map((item) => item.staffId)).toEqual([OTHER_STAFF]);

    expect((await call('OTHER', 'GET', ROUTES.staff.salary(STAFF_A))).status).toBe(404);
    expect((await pay('OTHER', STAFF_A, { amountMinor: 100 })).status).toBe(404);
  });
});
