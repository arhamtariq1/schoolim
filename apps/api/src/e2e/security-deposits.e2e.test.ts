import { ROUTES, type SecurityDepositList } from '@ilm/contracts';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { Test } from '@nestjs/testing';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { AppModule } from '../app.module';
import { createAdminClient, type PrismaClient } from '../prisma';
import { PasswordService } from '../shared/auth/password.service';

/**
 * Deposits held, and refunds out of them.
 *
 * The scenario the whole module exists for: a child deposits 5,000, breaks a
 * window worth 2,000, and the school returns 3,000 while keeping the rest. So
 * these tests care much less about the happy path than about the ways money can
 * escape — a refund larger than the balance, two refunds racing for the same
 * remainder, a double-clicked Confirm, and an amount returned with no reason
 * recorded against it.
 */

const SCHOOL_A = '33333333-3333-4333-8333-3333333333e1';
const SCHOOL_B = '33333333-3333-4333-8333-3333333333e2';
const USER_A = '44444444-4444-4444-8444-4444444444e1';
const SESSION_A = '55555555-5555-4555-8555-5555555555e1';
const SESSION_B = '55555555-5555-4555-8555-5555555555e2';
const CLASS_A = '66666666-6666-4666-8666-6666666666e1';
const CLASS_B = '66666666-6666-4666-8666-6666666666e2';

const AASIA = '77777777-7777-4777-8777-7777777777e1';
const BILAL = '77777777-7777-4777-8777-7777777777e2';
const FARAZ = '77777777-7777-4777-8777-7777777777e3';

const HOST_A = 'deposit-a-e2e.localhost';
const PASSWORD = 'correct-horse-battery-staple';

let app: NestFastifyApplication;
let admin: PrismaClient;
let jar = '';

async function wipe(): Promise<void> {
  const ids = [SCHOOL_A, SCHOOL_B];
  for (const table of [
    'security_deposit_refunds',
    'security_deposits',
    'enrollments',
    'students',
    'class_levels',
    'academic_sessions',
    'job_runs',
    'sessions',
    'audit_logs',
    'user_roles',
    'users',
  ]) {
    await admin.$executeRawUnsafe(
      `DELETE FROM ${table} WHERE school_id IN ($1::uuid, $2::uuid)`,
      ...ids,
    );
  }
  await admin.$executeRaw`DELETE FROM schools WHERE id IN (${SCHOOL_A}::uuid, ${SCHOOL_B}::uuid)`;
}

beforeAll(async () => {
  admin = createAdminClient({ url: process.env['DATABASE_ADMIN_URL'] ?? '' });
  await wipe();

  await admin.$executeRaw`
    INSERT INTO schools (id, name, slug, created_at, updated_at) VALUES
      (${SCHOOL_A}::uuid, 'Deposit E2E A', 'deposit-a-e2e', now(), now()),
      (${SCHOOL_B}::uuid, 'Deposit E2E B', 'deposit-b-e2e', now(), now())
  `;

  const hash = await new PasswordService().hash(PASSWORD);
  await admin.$executeRaw`
    INSERT INTO users (id, school_id, email, name, password_hash, status, created_at, updated_at)
    VALUES (${USER_A}::uuid, ${SCHOOL_A}::uuid, 'head@deposit-a-e2e.test', 'Head A', ${hash}, 'ACTIVE', now(), now())
  `;
  await admin.$executeRaw`
    INSERT INTO user_roles (id, school_id, user_id, role, created_at)
    VALUES (gen_random_uuid(), ${SCHOOL_A}::uuid, ${USER_A}::uuid, 'OWNER', now())
  `;

  for (const [school, session, classLevel] of [
    [SCHOOL_A, SESSION_A, CLASS_A],
    [SCHOOL_B, SESSION_B, CLASS_B],
  ] as const) {
    await admin.$executeRawUnsafe(
      `INSERT INTO academic_sessions (id, school_id, name, start_date, end_date, status, is_current, created_at, updated_at)
       VALUES ($1::uuid, $2::uuid, '2026-2027', '2026-04-01', '2027-03-31', 'ACTIVE', true, now(), now())`,
      session,
      school,
    );
    await admin.$executeRawUnsafe(
      `INSERT INTO class_levels (id, school_id, name, numeric_order, created_at, updated_at)
       VALUES ($1::uuid, $2::uuid, 'Nursery', 0, now(), now())`,
      classLevel,
      school,
    );
  }

  for (const [id, first, gr, school, session, classLevel] of [
    [AASIA, 'Aasia', 'GR-7001', SCHOOL_A, SESSION_A, CLASS_A],
    [BILAL, 'Bilal', 'GR-7002', SCHOOL_A, SESSION_A, CLASS_A],
    [FARAZ, 'Faraz', 'GR-7003', SCHOOL_B, SESSION_B, CLASS_B],
  ] as const) {
    await admin.$executeRawUnsafe(
      `INSERT INTO students (id, school_id, gr_no, student_code, first_name, last_name, status, created_at, updated_at)
       VALUES ($1::uuid, $2::uuid, $3, $3, $4, 'Khan', 'ACTIVE', now(), now())`,
      id,
      school,
      gr,
      first,
    );
    await admin.$executeRawUnsafe(
      `INSERT INTO enrollments (id, school_id, student_id, session_id, class_level_id, status, created_at, updated_at)
       VALUES (gen_random_uuid(), $1::uuid, $2::uuid, $3::uuid, $4::uuid, 'ENROLLED', now(), now())`,
      school,
      id,
      session,
      classLevel,
    );
  }

  // The other school holds an identical deposit, so a tenancy leak reads as a
  // doubled total rather than as something obviously foreign.
  await admin.$executeRawUnsafe(
    `INSERT INTO security_deposits (id, school_id, student_id, amount, received_on, created_at, updated_at)
     VALUES (gen_random_uuid(), $1::uuid, $2::uuid, '5000.00'::numeric, '2026-04-15'::date, now(), now())`,
    SCHOOL_B,
    FARAZ,
  );

  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  app = moduleRef.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
  const { default: cookie } = await import('@fastify/cookie');
  await app.register(cookie);
  await app.init();
  await app.getHttpAdapter().getInstance().ready();

  const signIn = await app.inject({
    method: 'POST',
    url: ROUTES.auth.login,
    headers: { host: HOST_A },
    payload: { identifier: 'head@deposit-a-e2e.test', password: PASSWORD },
  });
  const raw = signIn.headers['set-cookie'];
  const cookies = Array.isArray(raw) ? raw : [String(raw)];
  jar = cookies
    .map((entry) => entry.split(';')[0] ?? '')
    .filter((pair) => !pair.endsWith('='))
    .join('; ');
}, 90_000);

afterAll(async () => {
  await app?.close();
  await wipe();
  await admin.$disconnect();
});

async function list(query = ''): Promise<{ status: number; body: { data: SecurityDepositList } }> {
  const response = await app.inject({
    method: 'GET',
    url: `${ROUTES.securityDeposits.list}${query}`,
    headers: { host: HOST_A, cookie: jar },
  });
  return { status: response.statusCode, body: response.json<{ data: SecurityDepositList }>() };
}

async function record(body: Record<string, unknown>): Promise<{ status: number; id: string }> {
  const response = await app.inject({
    method: 'POST',
    url: ROUTES.securityDeposits.create,
    headers: { host: HOST_A, cookie: jar },
    payload: body,
  });
  return {
    status: response.statusCode,
    id: response.json<{ data?: { id: string } }>().data?.id ?? '',
  };
}

async function refund(
  depositId: string,
  body: Record<string, unknown>,
): Promise<{ status: number; raw: string; id: string }> {
  const response = await app.inject({
    method: 'POST',
    url: ROUTES.securityDeposits.refund(depositId),
    headers: { host: HOST_A, cookie: jar },
    payload: body,
  });
  return {
    status: response.statusCode,
    raw: response.body,
    id: response.json<{ data?: { id: string } }>().data?.id ?? '',
  };
}

/** A fresh 5,000 deposit, since most tests here spend one. */
async function freshDeposit(student = AASIA, amountMinor = 500_000): Promise<string> {
  const { id } = await record({ studentId: student, amountMinor, receivedOn: '2026-05-20' });
  return id;
}

describe('recording a deposit', () => {
  it('shows up with the whole amount still held', async () => {
    const id = await freshDeposit();
    const { status, body } = await list();
    const row = body.data.rows.find((entry) => entry.id === id);

    expect(status).toBe(200);
    expect(row?.depositedMinor).toBe(500_000);
    expect(row?.refundedMinor).toBe(0);
    expect(row?.leftMinor).toBe(500_000);
    expect(row?.refunds).toEqual([]);
  });

  it('files it under the month it was received', async () => {
    const id = await freshDeposit();
    const { body } = await list();

    expect(body.data.rows.find((entry) => entry.id === id)?.month).toBe('2026-05');
  });

  it('refuses a deposit for a student who does not exist', async () => {
    const { status } = await record({
      studentId: '77777777-7777-4777-8777-777777770000',
      amountMinor: 500_000,
      receivedOn: '2026-05-20',
    });

    expect(status).toBe(404);
  });

  it('refuses a negative or zero amount', async () => {
    for (const amountMinor of [0, -500_000]) {
      const { status } = await record({ studentId: AASIA, amountMinor, receivedOn: '2026-05-20' });
      expect(status).toBe(400);
    }
  });

  it('never shows another school’s deposits', async () => {
    const { body } = await list();

    expect(body.data.rows.map((row) => row.grNo)).not.toContain('GR-7003');
  });
});

describe('refunding part of a deposit', () => {
  it('returns 3,000 of 5,000 and leaves the 2,000 the school kept', async () => {
    const id = await freshDeposit();

    const given = await refund(id, {
      amountMinor: 300_000,
      reason: 'Refund less Rs 2,000 for a broken window',
      refundedOn: '2026-06-01',
      idempotencyKey: `refund-window-${id}`,
    });
    expect(given.status).toBe(201);

    const { body } = await list();
    const row = body.data.rows.find((entry) => entry.id === id);

    expect(row?.depositedMinor).toBe(500_000);
    expect(row?.refundedMinor).toBe(300_000);
    expect(row?.leftMinor).toBe(200_000);
  });

  it('keeps every repayment on the row, with the reason it was given', async () => {
    const id = await freshDeposit();

    for (const [amount, reason] of [
      [100_000, 'First instalment'],
      [150_000, 'Second instalment'],
    ] as const) {
      await refund(id, {
        amountMinor: amount,
        reason,
        refundedOn: '2026-06-01',
        idempotencyKey: `refund-${reason}-${id}`,
      });
    }

    const { body } = await list();
    const row = body.data.rows.find((entry) => entry.id === id);

    expect(row?.refunds).toHaveLength(2);
    expect(row?.refunds.map((entry) => entry.reason)).toEqual([
      'First instalment',
      'Second instalment',
    ]);
    expect(row?.refundedMinor).toBe(250_000);
    expect(row?.leftMinor).toBe(250_000);
  });

  it('refuses more than is left, and says how much that is', async () => {
    const id = await freshDeposit();
    await refund(id, {
      amountMinor: 400_000,
      reason: 'Most of it back',
      refundedOn: '2026-06-01',
      idempotencyKey: `refund-most-${id}`,
    });

    const tooMuch = await refund(id, {
      amountMinor: 200_000,
      reason: 'More than remains',
      refundedOn: '2026-06-02',
      idempotencyKey: `refund-toomuch-${id}`,
    });

    expect(tooMuch.status).toBe(422);
    expect(tooMuch.raw).toContain('FEES_REFUND_EXCEEDS_DEPOSIT');
    // The message names the remaining 1,000 rather than only saying "too much".
    expect(tooMuch.raw).toMatch(/1,?000/);

    const { body } = await list();
    expect(body.data.rows.find((entry) => entry.id === id)?.leftMinor).toBe(100_000);
  });

  it('refuses anything at all once it is fully refunded', async () => {
    const id = await freshDeposit();
    await refund(id, {
      amountMinor: 500_000,
      reason: 'Returned in full on leaving',
      refundedOn: '2026-06-01',
      idempotencyKey: `refund-all-${id}`,
    });

    const again = await refund(id, {
      amountMinor: 100,
      reason: 'One rupee more',
      refundedOn: '2026-06-02',
      idempotencyKey: `refund-again-${id}`,
    });

    expect(again.status).toBe(422);
    expect(again.raw).toContain('already been refunded in full');
  });

  it('refuses a refund with no reason recorded against it', async () => {
    const id = await freshDeposit();

    for (const reason of ['', '   ']) {
      const { status } = await refund(id, {
        amountMinor: 100_000,
        reason,
        refundedOn: '2026-06-01',
        idempotencyKey: `refund-blank-${id}-${reason.length}`,
      });
      expect(status).toBe(400);
    }
  });

  it('refuses a refund against a deposit that does not exist', async () => {
    const { status } = await refund('01a09509-0000-7000-8000-000000000000', {
      amountMinor: 100_000,
      reason: 'Nothing to refund from',
      refundedOn: '2026-06-01',
      idempotencyKey: 'refund-missing-deposit-01',
    });

    expect(status).toBe(404);
  });

  it('lets a double-clicked Confirm through only once', async () => {
    const id = await freshDeposit();
    const body = {
      amountMinor: 300_000,
      reason: 'Refund on leaving',
      refundedOn: '2026-06-01',
      idempotencyKey: `refund-replay-${id}`,
    };

    const first = await refund(id, body);
    const second = await refund(id, body);

    // The same refund comes back, not a second one.
    expect(second.id).toBe(first.id);

    const { body: after } = await list();
    const row = after.data.rows.find((entry) => entry.id === id);
    expect(row?.refunds).toHaveLength(1);
    expect(row?.leftMinor).toBe(200_000);
  });

  it('does not let two clerks refund the same remainder at once', async () => {
    const id = await freshDeposit();

    // Both ask for 3,000 of the same 5,000, at the same moment, with different
    // keys — so idempotency cannot save it and the row lock has to.
    const [one, two] = await Promise.all([
      refund(id, {
        amountMinor: 300_000,
        reason: 'Clerk one',
        refundedOn: '2026-06-01',
        idempotencyKey: `refund-race-a-${id}`,
      }),
      refund(id, {
        amountMinor: 300_000,
        reason: 'Clerk two',
        refundedOn: '2026-06-01',
        idempotencyKey: `refund-race-b-${id}`,
      }),
    ]);

    // One succeeds, one is refused. Never both.
    expect([one.status, two.status].sort()).toEqual([201, 422]);

    const { body } = await list();
    const row = body.data.rows.find((entry) => entry.id === id);
    expect(row?.refundedMinor).toBe(300_000);
    expect(row?.leftMinor).toBe(200_000);
  });
});

describe('the list', () => {
  it('cannot be made to show a negative remainder', async () => {
    const { body } = await list();

    for (const row of body.data.rows) {
      expect(row.leftMinor).toBeGreaterThanOrEqual(0);
      expect(row.depositedMinor).toBe(row.refundedMinor + row.leftMinor);
    }
  });

  it('separates what is still held from what is settled', async () => {
    const settled = await freshDeposit(BILAL);
    await refund(settled, {
      amountMinor: 500_000,
      reason: 'Returned in full',
      refundedOn: '2026-06-01',
      idempotencyKey: `refund-settle-${settled}`,
    });

    const held = await list('?state=held');
    expect(held.body.data.rows.every((row) => row.leftMinor > 0)).toBe(true);
    expect(held.body.data.rows.map((row) => row.id)).not.toContain(settled);

    const done = await list('?state=settled');
    expect(done.body.data.rows.every((row) => row.leftMinor === 0)).toBe(true);
    expect(done.body.data.rows.map((row) => row.id)).toContain(settled);
  });

  it('totals the whole filter rather than the page', async () => {
    const all = await list();
    const page = await list('?limit=1&offset=0');

    expect(page.body.data.rows).toHaveLength(1);
    expect(page.body.data.total).toBe(all.body.data.total);
    expect(page.body.data.totalDepositedMinor).toBe(all.body.data.totalDepositedMinor);
    expect(page.body.data.totalLeftMinor).toBe(all.body.data.totalLeftMinor);
  });

  it('adds the cards up from the rows beneath them', async () => {
    const { body } = await list('?limit=100');

    const deposited = body.data.rows.reduce((sum, row) => sum + row.depositedMinor, 0);
    const left = body.data.rows.reduce((sum, row) => sum + row.leftMinor, 0);

    expect(body.data.totalDepositedMinor).toBe(deposited);
    expect(body.data.totalLeftMinor).toBe(left);
  });
});
