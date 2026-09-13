import { ROUTES, type VoucherDetail } from '@ilm/contracts';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { Test } from '@nestjs/testing';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { AppModule } from '../app.module';
import { createAdminClient, type PrismaClient } from '../prisma';
import { PasswordService } from '../shared/auth/password.service';

/**
 * Editing an issued voucher.
 *
 * The feature is "the lab fee was left off, put it on" — and the whole question
 * is when that stops being a correction and starts being a rewrite of a record
 * somebody is holding a receipt for. The boundary is the first rupee received,
 * so most of what follows is about money arriving and the door closing.
 *
 * The other half is the period claim. `fee_voucher_periods` is what stops a
 * family being billed twice for September; a line that moves without its claim
 * is a double-bill or a month that can never be billed again, and neither
 * surfaces until somebody runs generation weeks later.
 */

const SCHOOL = '33333333-3333-4333-8333-3333333333e9';
const USER = '44444444-4444-4444-8444-4444444444e9';
const SESSION = '55555555-5555-4555-8555-5555555555e9';
const CLASS = '66666666-6666-4666-8666-6666666666e9';
const STUDENT = '77777777-7777-4777-8777-7777777777e9';

const HEAD_TUITION = '88888888-8888-4888-8888-8888888888e1';
const HEAD_LAB = '88888888-8888-4888-8888-8888888888e2';
const HEAD_ADMISSION = '88888888-8888-4888-8888-8888888888e3';
const HEAD_RETIRED = '88888888-8888-4888-8888-8888888888e4';

const HOST = 'edit-voucher-e2e.localhost';
const PASSWORD = 'correct-horse-battery-staple';

let app: NestFastifyApplication;
let admin: PrismaClient;
let jar = '';
let voucherId = '';

async function wipe(): Promise<void> {
  for (const table of [
    'fee_payment_allocations',
    'fee_payments',
    'fee_voucher_arrears',
    'fee_voucher_periods',
    'fee_voucher_lines',
    'fee_vouchers',
    'student_fees',
    'enrollments',
    'students',
    'fee_heads',
    'class_levels',
    'number_sequences',
    'academic_sessions',
    'job_runs',
    'sessions',
    'audit_logs',
    'user_roles',
    'users',
  ]) {
    await admin.$executeRawUnsafe(`DELETE FROM ${table} WHERE school_id = $1::uuid`, SCHOOL);
  }
  await admin.$executeRaw`DELETE FROM schools WHERE id = ${SCHOOL}::uuid`;
}

/**
 * One September voucher: tuition 5,000 and an admission fee of 25,000, with the
 * period claims generation would have written. Rebuilt before every test, since
 * most of them spend it.
 */
async function freshVoucher(): Promise<string> {
  // Payments first: allocations reference the voucher with RESTRICT, so a test
  // that recorded one would otherwise leave a voucher nothing can delete.
  for (const table of [
    'fee_payment_allocations',
    'fee_payments',
    'fee_voucher_arrears',
    'fee_voucher_periods',
    'fee_voucher_lines',
    'fee_vouchers',
  ]) {
    await admin.$executeRawUnsafe(`DELETE FROM ${table} WHERE school_id = $1::uuid`, SCHOOL);
  }

  const rows = await admin.$queryRawUnsafe<{ id: string }[]>(
    `INSERT INTO fee_vouchers
       (id, school_id, session_id, student_id, voucher_no, status, issue_date, due_date,
        valid_till, bill_months, gross_amount, net_payable, paid_amount, created_at, updated_at)
     VALUES (gen_random_uuid(), $1::uuid, $2::uuid, $3::uuid, 'EV-0001', 'UNPAID',
             '2026-09-01'::date, '2026-09-15'::date, '2026-09-25'::date,
             ARRAY['2026-09-01'::date], '30000.00'::numeric, '30000.00'::numeric, 0, now(), now())
     RETURNING id`,
    SCHOOL,
    SESSION,
    STUDENT,
  );
  const id = rows[0]?.id ?? '';

  for (const [head, label, month, amount, sort] of [
    [HEAD_TUITION, 'Tuition Fee - September 2026', '2026-09-01', '5000.00', 100],
    [HEAD_ADMISSION, 'Admission Fee', null, '25000.00', 110],
  ] as const) {
    await admin.$executeRawUnsafe(
      `INSERT INTO fee_voucher_lines
         (id, school_id, voucher_id, fee_head_id, kind, label, bill_month, amount, discount, sort_order, created_at)
       VALUES (gen_random_uuid(), $1::uuid, $2::uuid, $3::uuid, 'FEE', $4, $5::date, $6::numeric, 0, $7, now())`,
      SCHOOL,
      id,
      head,
      label,
      month,
      amount,
      sort,
    );
    await admin.$executeRawUnsafe(
      `INSERT INTO fee_voucher_periods
         (id, school_id, voucher_id, student_id, fee_head_id, period_key, created_at)
       VALUES (gen_random_uuid(), $1::uuid, $2::uuid, $3::uuid, $4::uuid, $5, now())`,
      SCHOOL,
      id,
      STUDENT,
      head,
      head === HEAD_TUITION ? '2026-09' : 'once',
    );
  }

  return id;
}

beforeAll(async () => {
  admin = createAdminClient({ url: process.env['DATABASE_ADMIN_URL'] ?? '' });
  await wipe();

  await admin.$executeRaw`
    INSERT INTO schools (id, name, slug, created_at, updated_at)
    VALUES (${SCHOOL}::uuid, 'Edit Voucher E2E', 'edit-voucher-e2e', now(), now())
  `;

  const hash = await new PasswordService().hash(PASSWORD);
  await admin.$executeRaw`
    INSERT INTO users (id, school_id, email, name, password_hash, status, created_at, updated_at)
    VALUES (${USER}::uuid, ${SCHOOL}::uuid, 'head@edit-voucher-e2e.test', 'Head', ${hash}, 'ACTIVE', now(), now())
  `;
  await admin.$executeRaw`
    INSERT INTO user_roles (id, school_id, user_id, role, created_at)
    VALUES (gen_random_uuid(), ${SCHOOL}::uuid, ${USER}::uuid, 'OWNER', now())
  `;
  await admin.$executeRaw`
    INSERT INTO academic_sessions (id, school_id, name, start_date, end_date, status, is_current, created_at, updated_at)
    VALUES (${SESSION}::uuid, ${SCHOOL}::uuid, '2026-2027', '2026-04-01', '2027-03-31', 'ACTIVE', true, now(), now())
  `;
  await admin.$executeRaw`
    INSERT INTO class_levels (id, school_id, name, numeric_order, created_at, updated_at)
    VALUES (${CLASS}::uuid, ${SCHOOL}::uuid, 'Nursery', 0, now(), now())
  `;

  for (const [id, name, type, frequency, amount, active] of [
    [HEAD_TUITION, 'Tuition Fee', 'TUITION', 'MONTHLY', '5000.00', true],
    [HEAD_LAB, 'Lab Fee', 'LAB', 'MONTHLY', '1000.00', true],
    [HEAD_ADMISSION, 'Admission Fee', 'ADMISSION', 'ONE_TIME', '25000.00', true],
    [HEAD_RETIRED, 'Computer Fee', 'CUSTOM', 'MONTHLY', '800.00', false],
  ] as const) {
    await admin.$executeRawUnsafe(
      `INSERT INTO fee_heads (id, school_id, type, name, default_amount, frequency, sort_order, is_active, created_at, updated_at)
       VALUES ($1::uuid, $2::uuid, $3::"fee_head_type", $4, $5::numeric, $6::"fee_frequency", 0, $7, now(), now())`,
      id,
      SCHOOL,
      type,
      name,
      amount,
      frequency,
      active,
    );
  }

  await admin.$executeRawUnsafe(
    `INSERT INTO students (id, school_id, gr_no, student_code, first_name, last_name, status, admitted_on, created_at, updated_at)
     VALUES ($1::uuid, $2::uuid, 'GR-5001', 'GR-5001', 'Aasia', 'Khan', 'ACTIVE', '2026-04-01'::date, now(), now())`,
    STUDENT,
    SCHOOL,
  );
  await admin.$executeRawUnsafe(
    `INSERT INTO enrollments (id, school_id, student_id, session_id, class_level_id, status, created_at, updated_at)
     VALUES (gen_random_uuid(), $1::uuid, $2::uuid, $3::uuid, $4::uuid, 'ENROLLED', now(), now())`,
    SCHOOL,
    STUDENT,
    SESSION,
    CLASS,
  );

  // The lab fee is agreed at 1,200 with a 200 concession, so an added line has
  // an agreed amount to find rather than falling back to the head default.
  await admin.$executeRawUnsafe(
    `INSERT INTO student_fees (id, school_id, student_id, fee_head_id, amount, discounted_amount, discount_reason, effective_from, created_at, updated_at)
     VALUES (gen_random_uuid(), $1::uuid, $2::uuid, $3::uuid, '1200.00'::numeric, '1000.00'::numeric, 'Sibling discount', '2026-04-01'::date, now(), now())`,
    SCHOOL,
    STUDENT,
    HEAD_LAB,
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
    payload: { identifier: 'head@edit-voucher-e2e.test', password: PASSWORD },
  });
  const raw = signIn.headers['set-cookie'];
  const cookies = Array.isArray(raw) ? raw : [String(raw)];
  jar = cookies
    .map((entry) => entry.split(';')[0] ?? '')
    .filter((pair) => !pair.endsWith('='))
    .join('; ');
}, 90_000);

beforeEach(async () => {
  voucherId = await freshVoucher();
});

afterAll(async () => {
  await app?.close();
  await wipe();
  await admin.$disconnect();
});

async function edit(
  body: Record<string, unknown>,
  id = voucherId,
): Promise<{ status: number; raw: string; data: VoucherDetail }> {
  const response = await app.inject({
    method: 'PATCH',
    url: ROUTES.vouchers.update(id),
    headers: { host: HOST, cookie: jar },
    payload: body,
  });
  return {
    status: response.statusCode,
    raw: response.body,
    data: response.json<{ data: VoucherDetail }>().data,
  };
}

async function detail(id = voucherId): Promise<VoucherDetail> {
  const response = await app.inject({
    method: 'GET',
    url: ROUTES.vouchers.detail(id),
    headers: { host: HOST, cookie: jar },
  });
  return response.json<{ data: VoucherDetail }>().data;
}

async function payPartially(amountMinor: number): Promise<void> {
  await app.inject({
    method: 'POST',
    url: ROUTES.vouchers.pay(voucherId),
    headers: { host: HOST, cookie: jar },
    payload: {
      amountMinor,
      method: 'CASH',
      paidOn: '2026-09-10',
      idempotencyKey: `edit-e2e-pay-${String(amountMinor)}-01`,
    },
  });
}

describe('moving the dates', () => {
  it('pushes the due date out, which is the whole point of the screen', async () => {
    const { status, data } = await edit({ dueDate: '2026-09-30', validTill: '2026-10-10' });

    expect(status).toBe(200);
    expect(data.dueDate).toBe('2026-09-30');
    expect(data.validTill).toBe('2026-10-10');
  });

  it('refuses dates that run backwards', async () => {
    const before = await edit({ dueDate: '2026-08-01' });
    expect(before.status).toBe(422);

    const expires = await edit({ validTill: '2026-09-02' });
    expect(expires.status).toBe(422);
  });

  it('leaves what is owed alone', async () => {
    const { data } = await edit({ dueDate: '2026-09-30', validTill: '2026-10-10' });

    expect(data.netPayableMinor).toBe(3_000_000);
    expect(data.lines).toHaveLength(2);
  });

  it('still moves dates after a part payment, because they owe nothing extra', async () => {
    await payPartially(100_000);
    const { status, data } = await edit({ dueDate: '2026-09-30', validTill: '2026-10-10' });

    expect(status).toBe(200);
    expect(data.dueDate).toBe('2026-09-30');
  });
});

describe('adding a fee that was left off', () => {
  it('adds the line at the amount the family agreed, keeping the concession', async () => {
    const { status, data } = await edit({ addHeads: [{ feeHeadId: HEAD_LAB }] });

    expect(status).toBe(200);
    const lab = data.lines.find((line) => line.feeHeadId === HEAD_LAB);
    // 1,200 agreed less a 200 sibling discount, not the head's 1,000 default.
    expect(lab?.amountMinor).toBe(120_000);
    expect(lab?.discountMinor).toBe(20_000);
    expect(lab?.label).toBe('Lab Fee - September 2026');
  });

  it('re-totals the voucher from its lines', async () => {
    const { data } = await edit({ addHeads: [{ feeHeadId: HEAD_LAB }] });

    // 30,000 + 1,200 gross, less the 200 concession.
    expect(data.grossMinor).toBe(3_120_000);
    expect(data.discountMinor).toBe(20_000);
    expect(data.netPayableMinor).toBe(3_100_000);
  });

  it('takes an explicit amount when one is given, without a second discount', async () => {
    const { data } = await edit({ addHeads: [{ feeHeadId: HEAD_LAB, amountMinor: 50_000 }] });
    const lab = data.lines.find((line) => line.feeHeadId === HEAD_LAB);

    expect(lab?.amountMinor).toBe(50_000);
    // The typed figure is what is charged. Discounting it again would bill 300
    // for a line the operator entered as 500, with nothing on screen to explain.
    expect(lab?.discountMinor).toBe(0);
    expect(data.netPayableMinor).toBe(3_050_000);
  });

  it('claims the period, so generation will not bill it a second time', async () => {
    await edit({ addHeads: [{ feeHeadId: HEAD_LAB }] });

    const claims = await admin.$queryRawUnsafe<{ period_key: string }[]>(
      `SELECT period_key FROM fee_voucher_periods
        WHERE student_id = $1::uuid AND fee_head_id = $2::uuid`,
      STUDENT,
      HEAD_LAB,
    );
    expect(claims.map((row) => row.period_key)).toEqual(['2026-09']);
  });

  it('refuses a head the voucher already carries', async () => {
    const { status, raw } = await edit({ addHeads: [{ feeHeadId: HEAD_TUITION }] });

    expect(status).toBe(409);
    expect(raw).toContain('FEES_ALREADY_BILLED');
    expect(raw).toContain('already on this voucher');
  });

  it('refuses a head already billed on a different voucher, and names it', async () => {
    // A second voucher claims the lab fee for September first.
    const other = await admin.$queryRawUnsafe<{ id: string }[]>(
      `INSERT INTO fee_vouchers
         (id, school_id, session_id, student_id, voucher_no, status, issue_date, due_date,
          valid_till, bill_months, gross_amount, net_payable, paid_amount, created_at, updated_at)
       VALUES (gen_random_uuid(), $1::uuid, $2::uuid, $3::uuid, 'EV-0002', 'UNPAID',
               '2026-09-01'::date, '2026-09-15'::date, '2026-09-25'::date,
               ARRAY['2026-09-01'::date], '1000.00'::numeric, '1000.00'::numeric, 0, now(), now())
       RETURNING id`,
      SCHOOL,
      SESSION,
      STUDENT,
    );
    await admin.$executeRawUnsafe(
      `INSERT INTO fee_voucher_periods
         (id, school_id, voucher_id, student_id, fee_head_id, period_key, created_at)
       VALUES (gen_random_uuid(), $1::uuid, $2::uuid, $3::uuid, $4::uuid, '2026-09', now())`,
      SCHOOL,
      other[0]?.id,
      STUDENT,
      HEAD_LAB,
    );

    const { status, raw } = await edit({ addHeads: [{ feeHeadId: HEAD_LAB }] });

    expect(status).toBe(409);
    expect(raw).toContain('EV-0002');
  });

  it('refuses a head that is no longer offered', async () => {
    const { status, raw } = await edit({ addHeads: [{ feeHeadId: HEAD_RETIRED }] });

    expect(status).toBe(422);
    expect(raw).toContain('no longer offered');
  });

  it('refuses a head that does not exist', async () => {
    const { status } = await edit({
      addHeads: [{ feeHeadId: '88888888-8888-4888-8888-888888880000' }],
    });

    expect(status).toBe(404);
  });

  it('writes nothing at all when one head in the batch is refused', async () => {
    const before = await detail();

    const { status } = await edit({
      addHeads: [{ feeHeadId: HEAD_LAB }, { feeHeadId: HEAD_TUITION }],
    });
    expect(status).toBe(409);

    // The lab fee must not have landed on the way past the tuition clash — a
    // half-applied edit leaves a voucher nobody can reason about.
    const after = await detail();
    expect(after.lines).toHaveLength(before.lines.length);
    expect(after.netPayableMinor).toBe(before.netPayableMinor);
  });
});

describe('taking a fee off', () => {
  it('removes the line and re-totals', async () => {
    const before = await detail();
    const admission = before.lines.find((line) => line.feeHeadId === HEAD_ADMISSION);

    const { status, data } = await edit({ removeLineIds: [admission?.id ?? ''] });

    expect(status).toBe(200);
    expect(data.lines).toHaveLength(1);
    expect(data.netPayableMinor).toBe(500_000);
  });

  it('releases the period, so the month can be billed again', async () => {
    const before = await detail();
    const tuition = before.lines.find((line) => line.feeHeadId === HEAD_TUITION);

    await edit({ removeLineIds: [tuition?.id ?? ''] });

    const claims = await admin.$queryRawUnsafe<{ n: bigint }[]>(
      `SELECT count(*) AS n FROM fee_voucher_periods
        WHERE student_id = $1::uuid AND fee_head_id = $2::uuid`,
      STUDENT,
      HEAD_TUITION,
    );
    expect(Number(claims[0]?.n)).toBe(0);
  });

  it('releases a one-time fee’s claim, not an annual one’s', async () => {
    // The regression this guards: a one-time head and an annual head both leave
    // `bill_month` null, so releasing the claim by looking at the line alone
    // frees `session:…` while `once` stays held — and the admission fee can
    // then never be charged to that child again, with nothing to explain it.
    const before = await detail();
    const admission = before.lines.find((line) => line.feeHeadId === HEAD_ADMISSION);

    await edit({ removeLineIds: [admission?.id ?? ''] });

    const claims = await admin.$queryRawUnsafe<{ n: bigint }[]>(
      `SELECT count(*) AS n FROM fee_voucher_periods
        WHERE student_id = $1::uuid AND fee_head_id = $2::uuid`,
      STUDENT,
      HEAD_ADMISSION,
    );
    expect(Number(claims[0]?.n)).toBe(0);

    // And it can go back on, which is the thing that was broken.
    const again = await edit({ addHeads: [{ feeHeadId: HEAD_ADMISSION }] });
    expect(again.status).toBe(200);
    expect(again.data.lines.some((line) => line.feeHeadId === HEAD_ADMISSION)).toBe(true);
  });

  it('labels a one-time fee without a month', async () => {
    const before = await detail();
    const admission = before.lines.find((line) => line.feeHeadId === HEAD_ADMISSION);
    await edit({ removeLineIds: [admission?.id ?? ''] });

    const { data } = await edit({ addHeads: [{ feeHeadId: HEAD_ADMISSION }] });
    const line = data.lines.find((entry) => entry.feeHeadId === HEAD_ADMISSION);

    // "Admission Fee", never "Admission Fee - September 2026": it is not a
    // monthly charge and labelling it as one invites a second next month.
    expect(line?.label).toBe('Admission Fee');
    expect(line?.billMonth).toBeNull();
  });

  it('refuses to leave a voucher with nothing on it', async () => {
    const before = await detail();

    const { status, raw } = await edit({
      removeLineIds: before.lines.map((line) => line.id),
    });

    expect(status).toBe(422);
    expect(raw).toContain('Cancel the voucher instead');
  });

  it('refuses a line that belongs to another voucher', async () => {
    const { status, raw } = await edit({
      removeLineIds: ['88888888-8888-4888-8888-888888889999'],
    });

    expect(status).toBe(422);
    expect(raw).toContain('no longer on this voucher');
  });

  it('will not remove an arrear, which belongs to the voucher it came from', async () => {
    await admin.$executeRawUnsafe(
      `INSERT INTO fee_voucher_lines
         (id, school_id, voucher_id, fee_head_id, kind, label, amount, discount, sort_order, created_at)
       VALUES (gen_random_uuid(), $1::uuid, $2::uuid, NULL, 'ARREAR', 'Arrears - August 2026', '2000.00'::numeric, 0, 900, now())`,
      SCHOOL,
      voucherId,
    );

    const lines = await detail();
    const arrear = lines.lines.find((line) => line.kind === 'ARREAR');

    const { status, raw } = await edit({ removeLineIds: [arrear?.id ?? ''] });

    expect(status).toBe(422);
    expect(raw).toContain('carried from an earlier voucher');
  });
});

describe('once money has arrived', () => {
  it('refuses to change the fees after a part payment', async () => {
    await payPartially(100_000);

    const { status, raw } = await edit({ addHeads: [{ feeHeadId: HEAD_LAB }] });

    expect(status).toBe(409);
    expect(raw).toContain('already been received');
  });

  it('refuses to remove a line after a part payment', async () => {
    const before = await detail();
    await payPartially(100_000);

    const { status } = await edit({
      removeLineIds: [before.lines[0]?.id ?? ''],
    });

    expect(status).toBe(409);
    // And the line is still there.
    expect((await detail()).lines).toHaveLength(2);
  });

  it('refuses everything once the voucher is paid in full', async () => {
    await payPartially(3_000_000);

    const dates = await edit({ dueDate: '2026-09-30' });
    expect(dates.status).toBe(409);
    expect(dates.raw).toContain('FEES_VOUCHER_ALREADY_PAID');
  });

  it('refuses to change the fees once part of it has been waived', async () => {
    await app.inject({
      method: 'POST',
      url: ROUTES.vouchers.waive(voucherId),
      headers: { host: HOST, cookie: jar },
      payload: { amountMinor: 100_000, reason: 'Hardship' },
    });

    const { status, raw } = await edit({ addHeads: [{ feeHeadId: HEAD_LAB }] });

    expect(status).toBe(422);
    expect(raw).toContain('waived');
  });

  it('refuses any edit to a cancelled voucher', async () => {
    await app.inject({
      method: 'DELETE',
      url: ROUTES.vouchers.detail(voucherId),
      headers: { host: HOST, cookie: jar },
      payload: { reason: 'Issued in error' },
    });

    const { status, raw } = await edit({ dueDate: '2026-09-30' });

    expect(status).toBe(409);
    expect(raw).toContain('FEES_VOUCHER_CANCELLED');
  });
});

describe('what the endpoint will not do at all', () => {
  it('has no status field, so a voucher cannot be marked paid without a payment', async () => {
    const { status } = await edit({ status: 'PAID' });

    // `.strict()` — an unknown key is rejected outright rather than ignored,
    // so a client that thinks it can set this finds out immediately.
    expect(status).toBe(400);
  });

  it('has no paid-amount or payment-date field either', async () => {
    expect((await edit({ paidAmount: 500_000 })).status).toBe(400);
    expect((await edit({ paidOn: '2026-09-13' })).status).toBe(400);
  });

  it('never reaches a voucher in another school', async () => {
    const { status } = await edit(
      { dueDate: '2026-09-30' },
      '99999999-9999-4999-8999-999999999999',
    );

    expect(status).toBe(404);
  });
});
