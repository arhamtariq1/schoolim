import { ROUTES, type LateFeePolicy, type VoucherDetail } from '@ilm/contracts';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { Test } from '@nestjs/testing';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { AppModule } from '../app.module';
import { createAdminClient, type PrismaClient } from '../prisma';
import { PasswordService } from '../shared/auth/password.service';

/**
 * The late fee a school charges after a due date.
 *
 * Two things worth testing and neither is the happy path.
 *
 * The first is the **conversion**: the column is a `numeric(5,2)` percentage and
 * the wire carries basis points, so 2.5% is `2.50` in one place and `250` in the
 * other. A rate that survives a round trip wrong is a school charging a
 * hundredth of what it meant, or a hundred times.
 *
 * The second is that changing the policy **does not re-rate an issued voucher**.
 * A parent holding a challan that says "6,300 after the 15th" must owe 6,300,
 * whatever the school decides next week.
 *
 * The third, since the policy gained `feeHeadIds`, is that the surcharge is
 * charged on **the heads the school picked**, off the voucher's own lines — not
 * on its net payable. A rate with no head chosen charges nothing, which is the
 * safe way round: a school that sets 5% and has not yet said what it applies to
 * should surcharge nobody rather than everybody.
 */

const SCHOOL = '33333333-3333-4333-8333-3333333333fa';
const USER = '44444444-4444-4444-8444-4444444444fa';
const SESSION = '55555555-5555-4555-8555-5555555555fa';
const STUDENT = '77777777-7777-4777-8777-7777777777fa';
/** Tuition, the head the surcharge is charged on. */
const HEAD = '88888888-8888-4888-8888-8888888888fa';
/** A second head, deliberately left out of the policy. */
const OTHER_HEAD = '99999999-9999-4999-8999-9999999999fa';

const HOST = 'late-fee-e2e.localhost';
const PASSWORD = 'correct-horse-battery-staple';

let app: NestFastifyApplication;
let admin: PrismaClient;
let jar = '';

async function wipe(): Promise<void> {
  for (const table of [
    'fee_payment_allocations',
    'fee_payments',
    'fee_voucher_periods',
    'fee_voucher_lines',
    'fee_vouchers',
    'student_fees',
    'fee_heads',
    'students',
    'academic_sessions',
    'sessions',
    'audit_logs',
    'user_roles',
    'users',
  ]) {
    await admin.$executeRawUnsafe(`DELETE FROM ${table} WHERE school_id = $1::uuid`, SCHOOL);
  }
  await admin.$executeRaw`DELETE FROM schools WHERE id = ${SCHOOL}::uuid`;
}

beforeAll(async () => {
  admin = createAdminClient({ url: process.env['DATABASE_ADMIN_URL'] ?? '' });
  await wipe();

  await admin.$executeRaw`
    INSERT INTO schools (id, name, slug, created_at, updated_at)
    VALUES (${SCHOOL}::uuid, 'Late Fee E2E', 'late-fee-e2e', now(), now())
  `;

  const hash = await new PasswordService().hash(PASSWORD);
  await admin.$executeRaw`
    INSERT INTO users (id, school_id, email, name, password_hash, status, created_at, updated_at)
    VALUES (${USER}::uuid, ${SCHOOL}::uuid, 'head@late-fee-e2e.test', 'Head', ${hash}, 'ACTIVE', now(), now())
  `;
  await admin.$executeRaw`
    INSERT INTO user_roles (id, school_id, user_id, role, created_at)
    VALUES (gen_random_uuid(), ${SCHOOL}::uuid, ${USER}::uuid, 'OWNER', now())
  `;
  await admin.$executeRaw`
    INSERT INTO academic_sessions (id, school_id, name, start_date, end_date, status, is_current, created_at, updated_at)
    VALUES (${SESSION}::uuid, ${SCHOOL}::uuid, '2026-2027', '2026-04-01', '2027-03-31', 'ACTIVE', true, now(), now())
  `;
  await admin.$executeRawUnsafe(
    `INSERT INTO students (id, school_id, gr_no, student_code, first_name, last_name, status, created_at, updated_at)
     VALUES ($1::uuid, $2::uuid, 'GR-4001', 'GR-4001', 'Aasia', 'Khan', 'ACTIVE', now(), now())`,
    STUDENT,
    SCHOOL,
  );
  await admin.$executeRawUnsafe(
    `INSERT INTO fee_heads (id, school_id, type, name, default_amount, sort_order, created_at, updated_at)
     VALUES ($1::uuid, $3::uuid, 'TUITION', 'Tuition Fee', '6000.00'::numeric, 0, now(), now()),
            ($2::uuid, $3::uuid, 'CUSTOM', 'Transport', '2000.00'::numeric, 1, now(), now())`,
    HEAD,
    OTHER_HEAD,
    SCHOOL,
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
    headers: { host: HOST },
    payload: { identifier: 'head@late-fee-e2e.test', password: PASSWORD },
  });
  const raw = signIn.headers['set-cookie'];
  const cookies = Array.isArray(raw) ? raw : [String(raw)];
  jar = cookies
    .map((entry) => entry.split(';')[0] ?? '')
    .filter((pair) => !pair.endsWith('='))
    .join('; ');
}, 90_000);

beforeEach(async () => {
  await admin.$executeRaw`
    UPDATE schools
       SET late_fee_percent = 0, late_fee_flat = 0, late_fee_grace_days = 0
     WHERE id = ${SCHOOL}::uuid
  `;
  // Which heads the surcharge applies to is part of the policy, so it resets
  // with the rest of it — otherwise one test's choice rates the next one's
  // voucher and the failure lands in whichever test happens to run second.
  await admin.$executeRaw`
    UPDATE fee_heads SET late_fee_applies = false WHERE school_id = ${SCHOOL}::uuid
  `;
});

afterAll(async () => {
  await app?.close();
  await wipe();
  await admin.$disconnect();
});

async function read(): Promise<LateFeePolicy> {
  const response = await app.inject({
    method: 'GET',
    url: ROUTES.fees.lateFeePolicy,
    headers: { host: HOST, cookie: jar },
  });
  return response.json<{ data: LateFeePolicy }>().data;
}

async function write(body: Record<string, unknown>): Promise<{ status: number; data: LateFeePolicy }> {
  const response = await app.inject({
    method: 'PUT',
    url: ROUTES.fees.lateFeePolicy,
    headers: { host: HOST, cookie: jar },
    payload: body,
  });
  return { status: response.statusCode, data: response.json<{ data: LateFeePolicy }>().data };
}

describe('reading and writing the policy', () => {
  it('starts at nothing, which is what an unconfigured school charges', async () => {
    const policy = await read();

    expect(policy).toEqual({ percentBasisPoints: 0, flatMinor: 0, graceDays: 0, feeHeadIds: [] });
  });

  it('survives the round trip through a numeric(5,2) column', async () => {
    // 2.5% is `250` on the wire and `2.50` in the column. Getting this wrong by
    // a factor of a hundred is the whole reason the test exists.
    const saved = await write({
      percentBasisPoints: 250,
      flatMinor: 20_000,
      graceDays: 5,
      feeHeadIds: [HEAD],
    });
    const expected = {
      percentBasisPoints: 250,
      flatMinor: 20_000,
      graceDays: 5,
      feeHeadIds: [HEAD],
    };

    expect(saved.status).toBe(200);
    expect(saved.data).toEqual(expected);
    expect(await read()).toEqual(expected);

    const row = await admin.$queryRawUnsafe<
      { percent: string; flat: string; grace: number }[]
    >(
      `SELECT late_fee_percent::text AS percent, late_fee_flat::text AS flat,
              late_fee_grace_days AS grace
         FROM schools WHERE id = $1::uuid`,
      SCHOOL,
    );
    expect(row[0]?.percent).toBe('2.50');
    expect(row[0]?.flat).toBe('200.00');
    expect(row[0]?.grace).toBe(5);
  });

  it('takes a percentage on its own, and a flat amount on its own', async () => {
    expect(
      (await write({ percentBasisPoints: 500, flatMinor: 0, graceDays: 0, feeHeadIds: [HEAD] }))
        .data,
    ).toEqual({ percentBasisPoints: 500, flatMinor: 0, graceDays: 0, feeHeadIds: [HEAD] });
    expect(
      (await write({ percentBasisPoints: 0, flatMinor: 50_000, graceDays: 0, feeHeadIds: [HEAD] }))
        .data,
    ).toEqual({ percentBasisPoints: 0, flatMinor: 50_000, graceDays: 0, feeHeadIds: [HEAD] });
  });

  it('can be turned back off', async () => {
    await write({ percentBasisPoints: 500, flatMinor: 50_000, graceDays: 3, feeHeadIds: [HEAD] });
    const off = await write({
      percentBasisPoints: 0,
      flatMinor: 0,
      graceDays: 0,
      feeHeadIds: [],
    });

    // Turning the policy off releases the heads too, so a school that switches
    // it back on later starts from "nothing is surcharged" rather than from a
    // choice nobody remembers making.
    expect(off.data).toEqual({
      percentBasisPoints: 0,
      flatMinor: 0,
      graceDays: 0,
      feeHeadIds: [],
    });
  });

  it('refuses a head that belongs to another school', async () => {
    const response = await app.inject({
      method: 'PUT',
      url: ROUTES.fees.lateFeePolicy,
      headers: { host: HOST, cookie: jar },
      payload: {
        percentBasisPoints: 500,
        flatMinor: 0,
        graceDays: 0,
        feeHeadIds: ['11111111-1111-4111-8111-111111111111'],
      },
    });

    expect(response.statusCode).toBe(404);
  });

  it('refuses a rate over 100% or below zero', async () => {
    for (const percentBasisPoints of [10_001, -1]) {
      const response = await app.inject({
        method: 'PUT',
        url: ROUTES.fees.lateFeePolicy,
        headers: { host: HOST, cookie: jar },
        payload: { percentBasisPoints, flatMinor: 0, graceDays: 0 },
      });
      expect(response.statusCode).toBe(400);
    }
  });

  it('refuses a negative flat amount, and a fractional basis point', async () => {
    const negative = await app.inject({
      method: 'PUT',
      url: ROUTES.fees.lateFeePolicy,
      headers: { host: HOST, cookie: jar },
      payload: { percentBasisPoints: 0, flatMinor: -100, graceDays: 0 },
    });
    expect(negative.statusCode).toBe(400);

    const fractional = await app.inject({
      method: 'PUT',
      url: ROUTES.fees.lateFeePolicy,
      headers: { host: HOST, cookie: jar },
      payload: { percentBasisPoints: 250.5, flatMinor: 0, graceDays: 0 },
    });
    expect(fractional.statusCode).toBe(400);
  });

  it('will not take half a policy', async () => {
    // A PUT replaces the whole setting, so a body naming one half would leave
    // the other at whatever it happened to be — which is not what the person
    // sending it meant either way.
    const response = await app.inject({
      method: 'PUT',
      url: ROUTES.fees.lateFeePolicy,
      headers: { host: HOST, cookie: jar },
      payload: { percentBasisPoints: 250 },
    });

    expect(response.statusCode).toBe(400);
  });
});

describe('what it does to a voucher', () => {
  /**
   * An unpaid 6,000 voucher — 6,000 of tuition — rated under whatever the
   * policy is now.
   *
   * The line matters: the surcharge is a percentage of the lines whose head the
   * school picked, so a voucher with a total and no lines is surcharged nothing
   * however the policy reads. That is the shape a real voucher has, and a
   * fixture without lines quietly tests nothing.
   */
  async function voucher(): Promise<string> {
    await admin.$executeRawUnsafe(
      `DELETE FROM fee_voucher_lines WHERE school_id = $1::uuid`,
      SCHOOL,
    );
    await admin.$executeRawUnsafe(
      `DELETE FROM fee_vouchers WHERE school_id = $1::uuid`,
      SCHOOL,
    );
    const rows = await admin.$queryRawUnsafe<{ id: string }[]>(
      `INSERT INTO fee_vouchers
         (id, school_id, session_id, student_id, voucher_no, status, issue_date, due_date,
          valid_till, bill_months, gross_amount, net_payable, late_fee_amount, paid_amount,
          created_at, updated_at)
       VALUES (gen_random_uuid(), $1::uuid, $2::uuid, $3::uuid, 'LF-0001', 'UNPAID',
               '2026-09-01'::date, '2026-09-15'::date, '2026-09-25'::date,
               ARRAY['2026-09-01'::date], '6000.00'::numeric, '6000.00'::numeric, 0, 0,
               now(), now())
       RETURNING id`,
      SCHOOL,
      SESSION,
      STUDENT,
    );
    const id = rows[0]?.id ?? '';
    await admin.$executeRawUnsafe(
      `INSERT INTO fee_voucher_lines
         (id, school_id, voucher_id, fee_head_id, kind, label, bill_month, amount, discount,
          sort_order, created_at)
       VALUES (gen_random_uuid(), $1::uuid, $2::uuid, $3::uuid, 'FEE', 'Tuition Fee',
               '2026-09-01'::date, '6000.00'::numeric, 0, 0, now())`,
      SCHOOL,
      id,
      HEAD,
    );
    return id;
  }

  async function detail(id: string): Promise<VoucherDetail> {
    const response = await app.inject({
      method: 'GET',
      url: ROUTES.vouchers.detail(id),
      headers: { host: HOST, cookie: jar },
    });
    return response.json<{ data: VoucherDetail }>().data;
  }

  it('adds nothing while the policy is off', async () => {
    const id = await voucher();

    await app.inject({
      method: 'PATCH',
      url: ROUTES.vouchers.update(id),
      headers: { host: HOST, cookie: jar },
      payload: { dueDate: '2026-09-20' },
    });

    // Which is exactly why an unconfigured school's challan reads the same
    // figure for "payable within" and "payable after".
    expect((await detail(id)).lateFeeMinor).toBe(0);
  });

  it('rates a voucher at the policy in force when it is written', async () => {
    await write({ percentBasisPoints: 500, flatMinor: 10_000, graceDays: 0, feeHeadIds: [HEAD] });
    const id = await voucher();

    await app.inject({
      method: 'PATCH',
      url: ROUTES.vouchers.update(id),
      headers: { host: HOST, cookie: jar },
      payload: { dueDate: '2026-09-20' },
    });

    // 5% of 6,000 is 300, plus the flat 100.
    expect((await detail(id)).lateFeeMinor).toBe(40_000);
  });

  it('leaves an already-issued voucher alone when the policy changes', async () => {
    await write({ percentBasisPoints: 500, flatMinor: 0, graceDays: 0, feeHeadIds: [HEAD] });
    const id = await voucher();
    await app.inject({
      method: 'PATCH',
      url: ROUTES.vouchers.update(id),
      headers: { host: HOST, cookie: jar },
      payload: { dueDate: '2026-09-20' },
    });
    expect((await detail(id)).lateFeeMinor).toBe(30_000);

    // The school doubles its late fee. The challan the parent is holding still
    // says 300, so the voucher must still say 300.
    await write({ percentBasisPoints: 1000, flatMinor: 0, graceDays: 0, feeHeadIds: [HEAD] });

    expect((await detail(id)).lateFeeMinor).toBe(30_000);
  });

  it('charges nothing when a rate is set but no head is chosen', async () => {
    // The safe way round, and the one that is easy to get backwards: a school
    // that has set 5% and not yet said what it applies to surcharges nobody.
    await write({ percentBasisPoints: 500, flatMinor: 10_000, graceDays: 0, feeHeadIds: [] });
    const id = await voucher();

    await app.inject({
      method: 'PATCH',
      url: ROUTES.vouchers.update(id),
      headers: { host: HOST, cookie: jar },
      payload: { dueDate: '2026-09-20' },
    });

    expect((await detail(id)).lateFeeMinor).toBe(0);
  });

  it('charges only on the heads the school picked', async () => {
    // The voucher is all tuition; the policy applies to transport alone. The
    // flat amount goes with the percentage: both hang off a base of nothing.
    await write({
      percentBasisPoints: 500,
      flatMinor: 10_000,
      graceDays: 0,
      feeHeadIds: [OTHER_HEAD],
    });
    const id = await voucher();

    await app.inject({
      method: 'PATCH',
      url: ROUTES.vouchers.update(id),
      headers: { host: HOST, cookie: jar },
      payload: { dueDate: '2026-09-20' },
    });

    expect((await detail(id)).lateFeeMinor).toBe(0);
  });

  it('drops the late fee when the switch on the voucher is turned off', async () => {
    await write({ percentBasisPoints: 500, flatMinor: 0, graceDays: 0, feeHeadIds: [HEAD] });
    const id = await voucher();

    await app.inject({
      method: 'PATCH',
      url: ROUTES.vouchers.update(id),
      headers: { host: HOST, cookie: jar },
      payload: { applyLateFee: false },
    });

    expect((await detail(id)).lateFeeMinor).toBe(0);
  });
});
