import { ROUTES } from '@ilm/contracts';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { Test } from '@nestjs/testing';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { AppModule } from '../app.module';
import { createAdminClient, type PrismaClient } from '../prisma';
import { PasswordService } from '../shared/auth/password.service';

/**
 * Fee vouchers end to end — docs/modules/fees-and-finance §9.
 *
 * This is the module where a bug costs a customer permanently, so these tests
 * are about the failure paths rather than the happy one: double-billing, the
 * arrears that compound forever, cancelling something already paid, and a
 * retried request that charges twice.
 *
 * The fixture is built so that **two students in the same class owe different
 * amounts**. A generation bug that bills everyone the same figure passes any
 * test where they agreed the same fee, and this one exists to catch it.
 */

const SCHOOL_A = '33333333-3333-4333-8333-333333333381';
const SCHOOL_B = '33333333-3333-4333-8333-333333333382';
const USER_A = '44444444-4444-4444-8444-444444444481';
const SESSION_A = '55555555-5555-4555-8555-555555555581';
const SESSION_B = '55555555-5555-4555-8555-555555555582';
const CLASS_A = '66666666-6666-4666-8666-666666666681';
const CLASS_B = '66666666-6666-4666-8666-666666666682';

const HOST_A = 'voucher-a-e2e.localhost';
const PASSWORD = 'correct-horse-battery-staple';

/** Tuition monthly, Admission once ever, Annual once a session. */
const HEAD_TUITION = '77777777-7777-4777-8777-777777777781';
const HEAD_ADMISSION = '77777777-7777-4777-8777-777777777782';
const HEAD_ANNUAL = '77777777-7777-4777-8777-777777777783';

/** Same class, deliberately different agreed fees. */
const AASIA = '88888888-8888-4888-8888-888888888881';
const BILAL = '88888888-8888-4888-8888-888888888882';
/** In the other school, to prove nothing leaks. */
const OTHER = '88888888-8888-4888-8888-888888888883';

let app: NestFastifyApplication;
let admin: PrismaClient;
let jar = '';

async function wipe(): Promise<void> {
  const ids = [SCHOOL_A, SCHOOL_B];
  for (const table of [
    'fee_payment_allocations',
    'fee_payments',
    'fee_voucher_arrears',
    'fee_voucher_periods',
    'fee_voucher_lines',
    'fee_vouchers',
    'job_runs',
    'student_fees',
    'fee_heads',
    'enrollments',
    'students',
    'sections',
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
      ...ids,
    );
  }
  await admin.$executeRaw`DELETE FROM schools WHERE id IN (${SCHOOL_A}::uuid, ${SCHOOL_B}::uuid)`;
}

async function seed(): Promise<void> {
  await admin.$executeRaw`
    INSERT INTO schools (id, name, slug, late_fee_percent, created_at, updated_at) VALUES
      (${SCHOOL_A}::uuid, 'Voucher E2E A', 'voucher-a-e2e', 5, now(), now()),
      (${SCHOOL_B}::uuid, 'Voucher E2E B', 'voucher-b-e2e', 0, now(), now())
  `;

  const hash = await new PasswordService().hash(PASSWORD);
  await admin.$executeRaw`
    INSERT INTO users (id, school_id, email, name, password_hash, status, created_at, updated_at)
    VALUES (${USER_A}::uuid, ${SCHOOL_A}::uuid, 'head@voucher-a-e2e.test', 'Head A', ${hash}, 'ACTIVE', now(), now())
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

  // Frequencies are the point of this fixture: three months of billing must
  // produce three tuition lines and exactly one of each of the others.
  for (const [id, name, type, frequency, amount] of [
    [HEAD_TUITION, 'Tuition Fee', 'TUITION', 'MONTHLY', '5000.00'],
    [HEAD_ADMISSION, 'Admission Fee', 'ADMISSION', 'ONE_TIME', '25000.00'],
    [HEAD_ANNUAL, 'Annual Charges', 'ANNUAL', 'ANNUAL', '6000.00'],
  ] as const) {
    await admin.$executeRawUnsafe(
      `INSERT INTO fee_heads (id, school_id, type, name, default_amount, frequency, sort_order, created_at, updated_at)
       VALUES ($1::uuid, $2::uuid, $3::"fee_head_type", $4, $5::numeric, $6::"fee_frequency", 0, now(), now())`,
      id,
      SCHOOL_A,
      type,
      name,
      amount,
      frequency,
    );
  }

  for (const [id, first, gr, school, session, classLevel] of [
    [AASIA, 'Aasia', 'GR-9001', SCHOOL_A, SESSION_A, CLASS_A],
    [BILAL, 'Bilal', 'GR-9002', SCHOOL_A, SESSION_A, CLASS_A],
    [OTHER, 'Faraz', 'GR-9003', SCHOOL_B, SESSION_B, CLASS_B],
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

  // Aasia pays the full 5,000. Bilal agreed 5,000 with a 1,500 discount, so he
  // owes 3,500. Same class, same head, different money.
  await admin.$executeRawUnsafe(
    `INSERT INTO student_fees (id, school_id, student_id, fee_head_id, amount, effective_from, created_at, updated_at)
     VALUES (gen_random_uuid(), $1::uuid, $2::uuid, $3::uuid, '5000.00'::numeric, '2026-01-01'::date, now(), now())`,
    SCHOOL_A,
    AASIA,
    HEAD_TUITION,
  );
  await admin.$executeRawUnsafe(
    `INSERT INTO student_fees (id, school_id, student_id, fee_head_id, amount, discounted_amount, discount_reason, effective_from, created_at, updated_at)
     VALUES (gen_random_uuid(), $1::uuid, $2::uuid, $3::uuid, '5000.00'::numeric, '3500.00'::numeric, 'Sibling', '2026-01-01'::date, now(), now())`,
    SCHOOL_A,
    BILAL,
    HEAD_TUITION,
  );
  // Only Aasia has an annual charge agreed, so Bilal is the "no agreed amount"
  // case when Annual is billed on its own.
  await admin.$executeRawUnsafe(
    `INSERT INTO student_fees (id, school_id, student_id, fee_head_id, amount, effective_from, created_at, updated_at)
     VALUES (gen_random_uuid(), $1::uuid, $2::uuid, $3::uuid, '6000.00'::numeric, '2026-01-01'::date, now(), now())`,
    SCHOOL_A,
    AASIA,
    HEAD_ANNUAL,
  );
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

  const signIn = await app.inject({
    method: 'POST',
    url: ROUTES.auth.login,
    headers: { host: HOST_A },
    payload: { identifier: 'head@voucher-a-e2e.test', password: PASSWORD },
  });
  const raw = signIn.headers['set-cookie'];
  const list = Array.isArray(raw) ? raw : [String(raw)];
  jar = list
    .map((entry) => entry.split(';')[0] ?? '')
    .filter((pair) => !pair.endsWith('='))
    .join('; ');
}, 120_000);

afterAll(async () => {
  await app?.close();
  await wipe();
  await admin.$disconnect();
});

/** Clear only the vouchers, so each test starts from the same fixture. */
beforeEach(async () => {
  for (const table of [
    'fee_payment_allocations',
    'fee_payments',
    'fee_voucher_arrears',
    'fee_voucher_periods',
    'fee_voucher_lines',
    'fee_vouchers',
    'job_runs',
  ]) {
    await admin.$executeRawUnsafe(
      `DELETE FROM ${table} WHERE school_id IN ($1::uuid, $2::uuid)`,
      SCHOOL_A,
      SCHOOL_B,
    );
  }
});

let keyCounter = 0;
function freshKey(): string {
  keyCounter += 1;
  return `e2e-voucher-key-${String(Date.now())}-${String(keyCounter)}`;
}

interface Body extends Record<string, unknown> {
  sessionId: string;
  scope: Record<string, unknown>;
  heads: { feeHeadId: string; amountMinor?: number }[];
  billMonths: string[];
  issueDate: string;
  dueDate: string;
  validTill: string;
  includeArrears?: boolean;
  applyLateFee?: boolean;
}

function body(over: Partial<Body> = {}): Body {
  return {
    sessionId: SESSION_A,
    scope: { kind: 'CLASS', classLevelId: CLASS_A },
    heads: [{ feeHeadId: HEAD_TUITION }],
    billMonths: ['2026-09'],
    issueDate: '2026-09-01',
    dueDate: '2026-09-15',
    validTill: '2026-09-25',
    includeArrears: true,
    applyLateFee: true,
    ...over,
  };
}

async function post(url: string, payload: Record<string, unknown>) {
  return app.inject({ method: 'POST', url, headers: { host: HOST_A, cookie: jar }, payload });
}

async function get(url: string) {
  return app.inject({ method: 'GET', url, headers: { host: HOST_A, cookie: jar } });
}

async function generate(over: Partial<Body> = {}) {
  const response = await post(ROUTES.vouchers.generate, {
    ...body(over),
    idempotencyKey: freshKey(),
  });
  return response;
}

interface ListBody {
  data: {
    id: string;
    voucherNo: string;
    studentName: string;
    grNo: string | null;
    status: string;
    netPayableMinor: number;
    totalPayableMinor: number;
    arrearsMinor: number;
    discountMinor: number;
    grossMinor: number;
    balanceMinor: number;
    lateFeeMinor: number;
    billMonths: string[];
  }[];
  meta: { page: { total: number }; totals: { outstandingMinor: number; netPayableMinor: number } };
}

async function listVouchers(query = ''): Promise<ListBody> {
  const response = await get(`${ROUTES.vouchers.list}${query}`);
  expect(response.statusCode).toBe(200);
  return response.json<ListBody>();
}

describe('every student is billed their own agreed amount', () => {
  it('bills two children in one class differently', async () => {
    const response = await generate();
    expect(response.statusCode).toBe(201);

    const { data } = await listVouchers('?sort=studentName&order=asc');
    expect(data).toHaveLength(2);

    const aasia = data.find((row) => row.studentName.startsWith('Aasia'));
    const bilal = data.find((row) => row.studentName.startsWith('Bilal'));

    // The whole point of the module: same class, same head, different money.
    expect(aasia?.netPayableMinor).toBe(500_000);
    expect(bilal?.netPayableMinor).toBe(350_000);
    // And the discount is shown rather than folded away, so a parent can see it.
    expect(bilal?.grossMinor).toBe(500_000);
    expect(bilal?.discountMinor).toBe(150_000);
  });

  it('leaves out a student who has no agreed amount, and says so', async () => {
    // Only Aasia has an annual charge on her record.
    const preview = await post(
      ROUTES.vouchers.preview,
      body({ heads: [{ feeHeadId: HEAD_ANNUAL }] }),
    );
    const result = preview.json<{
      data: {
        willCreate: number;
        willSkip: number;
        skipsByReason: { reason: string }[];
        warnings: string[];
      };
    }>();

    expect(result.data.willCreate).toBe(1);
    expect(result.data.willSkip).toBe(1);
    expect(result.data.skipsByReason[0]?.reason).toBe('NO_FEE_AGREED');
    expect(result.data.warnings.join(' ')).toContain('never been given an amount');
  });

  it('honours an explicit amount typed on the screen for everyone in scope', async () => {
    await generate({ heads: [{ feeHeadId: HEAD_TUITION, amountMinor: 200_000 }] });

    const { data } = await listVouchers();
    expect(data.map((row) => row.netPayableMinor)).toEqual([200_000, 200_000]);
  });
});

describe('frequency decides how often a head repeats', () => {
  it('bills three months of tuition but only one admission fee', async () => {
    await admin.$executeRawUnsafe(
      `INSERT INTO student_fees (id, school_id, student_id, fee_head_id, amount, effective_from, created_at, updated_at)
       VALUES (gen_random_uuid(), $1::uuid, $2::uuid, $3::uuid, '25000.00'::numeric, '2026-01-01'::date, now(), now())`,
      SCHOOL_A,
      AASIA,
      HEAD_ADMISSION,
    );

    await generate({
      scope: { kind: 'STUDENT', studentId: AASIA },
      heads: [{ feeHeadId: HEAD_TUITION }, { feeHeadId: HEAD_ADMISSION }],
      billMonths: ['2026-09', '2026-10', '2026-11'],
    });

    const { data } = await listVouchers();
    const detail = await get(ROUTES.vouchers.detail(data[0]?.id ?? ''));
    const lines = detail.json<{ data: { lines: { label: string }[] } }>().data.lines;

    const tuition = lines.filter((line) => line.label.startsWith('Tuition'));
    const admission = lines.filter((line) => line.label.startsWith('Admission'));

    expect(tuition).toHaveLength(3);
    // The bug this guards: three months must not mean three admission fees.
    expect(admission).toHaveLength(1);
    expect(tuition.map((line) => line.label)).toEqual([
      'Tuition Fee - September 2026',
      'Tuition Fee - October 2026',
      'Tuition Fee - November 2026',
    ]);

    // 3 × 5,000 + 25,000
    expect(data[0]?.netPayableMinor).toBe(4_000_000);

    await admin.$executeRawUnsafe(
      `DELETE FROM student_fees WHERE school_id = $1::uuid AND fee_head_id = $2::uuid`,
      SCHOOL_A,
      HEAD_ADMISSION,
    );
  });
});

describe('the same month is never billed twice', () => {
  it('creates nothing on a second run for the same month', async () => {
    const first = await generate();
    expect(first.json<{ data: { created: number } }>().data.created).toBe(2);

    // A different key, so this is not the idempotency path — it is the
    // database refusing to charge September twice.
    const second = await generate();
    const result = second.json<{ data: { created: number; skipped: number } }>().data;

    expect(result.created).toBe(0);
    expect(result.skipped).toBe(2);
    expect((await listVouchers()).meta.page.total).toBe(2);
  });

  it('reports the reason in a preview rather than silently doing nothing', async () => {
    await generate();

    const preview = await post(ROUTES.vouchers.preview, body());
    const result = preview.json<{
      data: { willCreate: number; skipsByReason: { reason: string }[]; warnings: string[] };
    }>();

    expect(result.data.willCreate).toBe(0);
    expect(result.data.skipsByReason[0]?.reason).toBe('ALREADY_BILLED');
    expect(result.data.warnings.join(' ')).toContain('already billed');
  });

  it('replays a repeated idempotency key instead of generating again', async () => {
    const key = freshKey();
    const payload = { ...body(), idempotencyKey: key };

    const first = await post(ROUTES.vouchers.generate, payload);
    const second = await post(ROUTES.vouchers.generate, payload);

    const a = first.json<{ data: { created: number; replayed: boolean } }>().data;
    const b = second.json<{ data: { created: number; replayed: boolean } }>().data;

    expect(a.created).toBe(2);
    expect(a.replayed).toBe(false);
    // The retry reports what the first run did, and wrote nothing.
    expect(b.created).toBe(2);
    expect(b.replayed).toBe(true);
    expect((await listVouchers()).meta.page.total).toBe(2);
  });

  it('bills the month again once the voucher is deleted', async () => {
    await generate();
    const { data } = await listVouchers();
    const target = data[0];

    const deleted = await app.inject({
      method: 'DELETE',
      url: ROUTES.vouchers.detail(target?.id ?? ''),
      headers: { host: HOST_A, cookie: jar },
      payload: { reason: 'Issued with the wrong due date' },
    });
    expect(deleted.statusCode).toBe(200);

    // Hard delete releases the claim on September, which is the whole reason
    // the claim rows are deleted rather than kept.
    const listed = await listVouchers();
    expect(listed.data.find((row) => row.id === target?.id)).toBeUndefined();
    expect(listed.meta.page.total).toBe(1);

    const again = await generate();
    expect(again.json<{ data: { created: number } }>().data.created).toBe(1);
  });
});

describe('arrears are carried once, explained, and settled by paying', () => {
  async function billSeptemberThenOctober() {
    await generate({ scope: { kind: 'STUDENT', studentId: AASIA } });
    await generate({
      scope: { kind: 'STUDENT', studentId: AASIA },
      billMonths: ['2026-10'],
      issueDate: '2026-10-01',
      dueDate: '2026-10-15',
      validTill: '2026-10-25',
    });
    const { data } = await listVouchers('?sort=issueDate&order=asc');
    return { september: data[0], october: data[1] };
  }

  it('rolls an unpaid month into the next voucher', async () => {
    const { september, october } = await billSeptemberThenOctober();

    expect(september?.arrearsMinor).toBe(0);
    expect(october?.arrearsMinor).toBe(500_000);
    // Its own charge stays 5,000 — September's 5,000 is carried alongside and
    // printed, never folded in, or the same debt appears on two rows.
    expect(october?.netPayableMinor).toBe(500_000);
    // What the challan actually asks for.
    expect(october?.totalPayableMinor).toBe(1_000_000);
  });

  it('names the voucher an arrear came from, so the figure can be explained', async () => {
    const { september, october } = await billSeptemberThenOctober();

    const detail = await get(ROUTES.vouchers.detail(october?.id ?? ''));
    const arrears = detail.json<{
      data: { arrears: { sourceVoucherNo: string; amountMinor: number }[] };
    }>().data.arrears;

    expect(arrears).toHaveLength(1);
    expect(arrears[0]?.sourceVoucherNo).toBe(september?.voucherNo);
    expect(arrears[0]?.amountMinor).toBe(500_000);
  });

  it('does not carry the same debt twice into a third month', async () => {
    const { october } = await billSeptemberThenOctober();

    await generate({
      scope: { kind: 'STUDENT', studentId: AASIA },
      billMonths: ['2026-11'],
      issueDate: '2026-11-01',
      dueDate: '2026-11-15',
      validTill: '2026-11-25',
    });

    const { data } = await listVouchers('?sort=issueDate&order=asc');
    const november = data[2];

    // November carries October's 10,000 — which already contains September's
    // 5,000. Carrying September again as well would make the arrears figure
    // grow every month while the parent owes the same money.
    expect(october?.totalPayableMinor).toBe(1_000_000);
    expect(november?.arrearsMinor).toBe(1_000_000);
    expect(november?.totalPayableMinor).toBe(1_500_000);
  });

  it('closes the older voucher when the newer one is paid', async () => {
    const { september, october } = await billSeptemberThenOctober();

    const paid = await post(ROUTES.vouchers.pay(october?.id ?? ''), {
      method: 'CASH',
      paidOn: '2026-10-10',
      idempotencyKey: freshKey(),
    });
    expect(paid.statusCode).toBe(201);

    const { data } = await listVouchers('?sort=issueDate&order=asc');

    // Both, not just the one that was paid. Otherwise September stays open and
    // reappears as an arrear next month, forever.
    expect(data[0]?.status).toBe('PAID');
    expect(data[1]?.status).toBe('PAID');
    expect(data[0]?.balanceMinor).toBe(0);
    void september;
  });
});

describe('money that has arrived cannot be quietly undone', () => {
  it('refuses to delete a voucher with a payment against it', async () => {
    await generate({ scope: { kind: 'STUDENT', studentId: AASIA } });
    const { data } = await listVouchers();
    const id = data[0]?.id ?? '';

    await post(ROUTES.vouchers.pay(id), {
      amountMinor: 100_000,
      method: 'CASH',
      paidOn: '2026-09-10',
      idempotencyKey: freshKey(),
    });

    const cancelled = await app.inject({
      method: 'DELETE',
      url: ROUTES.vouchers.detail(id),
      headers: { host: HOST_A, cookie: jar },
      payload: { reason: 'Changed my mind' },
    });

    expect(cancelled.statusCode).toBe(409);
    expect(cancelled.body).toContain('Reverse the payment first');
  });

  it('refuses a payment larger than the balance', async () => {
    await generate({ scope: { kind: 'STUDENT', studentId: AASIA } });
    const { data } = await listVouchers();

    const over = await post(ROUTES.vouchers.pay(data[0]?.id ?? ''), {
      amountMinor: 900_000,
      method: 'CASH',
      paidOn: '2026-09-10',
      idempotencyKey: freshKey(),
    });

    expect(over.statusCode).toBe(422);
  });

  it('records a double-submitted payment once', async () => {
    await generate({ scope: { kind: 'STUDENT', studentId: AASIA } });
    const { data } = await listVouchers();
    const id = data[0]?.id ?? '';
    const payload = {
      amountMinor: 100_000,
      method: 'CASH' as const,
      paidOn: '2026-09-10',
      idempotencyKey: freshKey(),
    };

    await post(ROUTES.vouchers.pay(id), payload);
    await post(ROUTES.vouchers.pay(id), payload);

    const after = await listVouchers();
    expect(after.data[0]?.balanceMinor).toBe(400_000);
  });

  it('tracks a part payment rather than rounding it to paid', async () => {
    await generate({ scope: { kind: 'STUDENT', studentId: AASIA } });
    const { data } = await listVouchers();

    await post(ROUTES.vouchers.pay(data[0]?.id ?? ''), {
      amountMinor: 200_000,
      method: 'CASH',
      paidOn: '2026-09-10',
      idempotencyKey: freshKey(),
    });

    const after = await listVouchers();
    expect(after.data[0]?.status).toBe('PARTIALLY_PAID');
    expect(after.data[0]?.balanceMinor).toBe(300_000);
  });

  it('waives the rest as a recorded line, never as an edit of the amount', async () => {
    await generate({ scope: { kind: 'STUDENT', studentId: AASIA } });
    const { data } = await listVouchers();
    const id = data[0]?.id ?? '';

    const waived = await post(ROUTES.vouchers.waive(id), {
      reason: 'Bus did not run in September',
    });
    expect(waived.statusCode).toBe(201);

    const detail = await get(ROUTES.vouchers.detail(id));
    const result = detail.json<{
      data: {
        grossMinor: number;
        waiverMinor: number;
        netPayableMinor: number;
        lines: { kind: string; label: string }[];
      };
    }>().data;

    // What was charged is untouched. The giving is its own number, and its own
    // line, so the year's waivers can be added up and explained.
    expect(result.grossMinor).toBe(500_000);
    expect(result.waiverMinor).toBe(500_000);
    expect(result.netPayableMinor).toBe(0);
    expect(result.lines.some((line) => line.kind === 'WAIVER')).toBe(true);
  });
});

describe('the late fee is the school’s own rule', () => {
  it('prints a surcharge outside the payable amount, not inside it', async () => {
    await generate({ scope: { kind: 'STUDENT', studentId: AASIA } });
    const { data } = await listVouchers();

    // School A is configured at 5%.
    expect(data[0]?.netPayableMinor).toBe(500_000);
    expect(data[0]?.lateFeeMinor).toBe(25_000);
  });

  it('charges it only when the money actually arrives late', async () => {
    await generate({ scope: { kind: 'STUDENT', studentId: AASIA } });
    const before = await listVouchers();
    const id = before.data[0]?.id ?? '';

    // Paid on the 10th, due on the 15th. The full balance settles it.
    const onTime = await post(ROUTES.vouchers.pay(id), {
      method: 'CASH',
      paidOn: '2026-09-10',
      idempotencyKey: freshKey(),
    });
    expect(onTime.statusCode).toBe(201);

    const after = await listVouchers();
    expect(after.data[0]?.status).toBe('PAID');
    // 5,000, not 5,250 — paying on time must never attract the surcharge.
    expect(after.data[0]?.netPayableMinor).toBe(500_000);
  });
});

describe('the list', () => {
  it('holds the total over the filter, not the page', async () => {
    await generate();
    const all = await listVouchers();
    const paged = await listVouchers('?limit=1');

    expect(paged.data).toHaveLength(1);
    expect(paged.meta.page.total).toBe(2);
    expect(paged.meta.totals.outstandingMinor).toBe(all.meta.totals.outstandingMinor);
    expect(paged.meta.totals.outstandingMinor).toBe(850_000);
  });

  it('finds a child by GR number', async () => {
    await generate();
    const found = await listVouchers('?grNo=GR-9002');

    expect(found.data).toHaveLength(1);
    expect(found.data[0]?.studentName).toContain('Bilal');
  });

  it('refuses a sort field outside the allow-list', async () => {
    const response = await get(`${ROUTES.vouchers.list}?sort=school_id`);
    expect(response.statusCode).toBe(400);
  });

  it('refuses an unknown filter rather than ignoring it', async () => {
    const response = await get(`${ROUTES.vouchers.list}?statuz=UNPAID`);
    expect(response.statusCode).toBe(400);
  });

  it('needs a session', async () => {
    const response = await app.inject({
      method: 'GET',
      url: ROUTES.vouchers.list,
      headers: { host: HOST_A },
    });
    expect(response.statusCode).toBe(401);
  });
});

describe('nothing crosses a school boundary', () => {
  it('never bills, or shows, another school’s child', async () => {
    await generate({ scope: { kind: 'ALL' } });
    const { data } = await listVouchers();

    // Two, not three. Faraz is in the other school with the same fixture shape.
    expect(data).toHaveLength(2);
    expect(data.every((row) => row.grNo !== 'GR-9003')).toBe(true);
  });

  it('refuses to generate for a student in another school', async () => {
    const response = await post(ROUTES.vouchers.generate, {
      ...body({ scope: { kind: 'STUDENT', studentId: OTHER } }),
      idempotencyKey: freshKey(),
    });

    // The scope resolves to nobody rather than reaching across the boundary.
    expect(response.json<{ data: { created: number } }>().data.created).toBe(0);
  });
});

/**
 * A child who joins part-way through a month.
 *
 * The rule used to be "what was agreed on the **first** of the billing month",
 * full stop — so a child admitted on the 25th had nothing in force on the 1st,
 * was reported as having "no agreed amount", and was silently left out of their
 * own joining month. Every mid-month admission, every month, in every school.
 *
 * The preview said something untrue while it did it: the child has an agreed
 * amount. It starts on the 25th.
 */
describe('a fee that starts part-way through the month', () => {
  const LATE_JOINER = '88888888-8888-4888-8888-88888888888a';

  async function admitMidMonth(effectiveFrom: string): Promise<void> {
    await admin.$executeRawUnsafe(
      `INSERT INTO students (id, school_id, gr_no, student_code, first_name, last_name,
                             status, admitted_on, created_at, updated_at)
       VALUES ($1::uuid, $2::uuid, 'GR-9009', '2026-9009', 'Nida', 'Late',
               'ACTIVE', $3::date, now(), now())`,
      LATE_JOINER,
      SCHOOL_A,
      effectiveFrom,
    );
    await admin.$executeRawUnsafe(
      `INSERT INTO enrollments (id, school_id, student_id, session_id, class_level_id,
                                status, enrolled_on, created_at, updated_at)
       VALUES (gen_random_uuid(), $1::uuid, $2::uuid, $3::uuid, $4::uuid,
               'ENROLLED', $5::date, now(), now())`,
      SCHOOL_A,
      LATE_JOINER,
      SESSION_A,
      CLASS_A,
      effectiveFrom,
    );
    await admin.$executeRawUnsafe(
      `INSERT INTO student_fees (id, school_id, student_id, fee_head_id, amount,
                                 effective_from, created_at, updated_at)
       VALUES (gen_random_uuid(), $1::uuid, $2::uuid, $3::uuid, '5000.00'::numeric,
               $4::date, now(), now())`,
      SCHOOL_A,
      LATE_JOINER,
      HEAD_TUITION,
      effectiveFrom,
    );
  }

  async function cleanUp(): Promise<void> {
    // Lines hang off the voucher, not the student, so they go first and by
    // voucher. Getting this wrong left the row behind and the *next* test
    // failed on a primary key, several assertions away from the cause.
    await admin.$executeRawUnsafe(
      `DELETE FROM fee_voucher_lines
        WHERE voucher_id IN (SELECT id FROM fee_vouchers WHERE student_id = $1::uuid)`,
      LATE_JOINER,
    );
    for (const table of ['fee_voucher_periods', 'fee_vouchers']) {
      await admin.$executeRawUnsafe(
        `DELETE FROM ${table} WHERE student_id = $1::uuid`,
        LATE_JOINER,
      );
    }
    await admin.$executeRawUnsafe(`DELETE FROM student_fees WHERE student_id = $1::uuid`, LATE_JOINER);
    await admin.$executeRawUnsafe(`DELETE FROM enrollments WHERE student_id = $1::uuid`, LATE_JOINER);
    await admin.$executeRawUnsafe(`DELETE FROM students WHERE id = $1::uuid`, LATE_JOINER);
  }

  it('bills a child admitted on the 25th for the month they joined', async () => {
    await admitMidMonth('2026-09-25');
    try {
      expect((await generate()).statusCode).toBe(201);

      const { data } = await listVouchers('?sort=studentName&order=asc');
      const nida = data.find((entry) => entry.grNo === 'GR-9009');

      // Billed, at the amount she agreed on the day she joined. Before this she
      // was silently absent from her own joining month, and the school lost it.
      expect(nida).toBeDefined();
      expect(nida?.netPayableMinor).toBe(500_000);
    } finally {
      await cleanUp();
    }
  });

  it('does not re-rate a month for somebody who was already there', async () => {
    // The other half of the same rule, and why it cannot simply take the newest
    // row: Aasia agreed 5,000 from January. A raise dated the 20th must not
    // change the September challan that was printed on the 1st.
    await admin.$executeRawUnsafe(
      `INSERT INTO student_fees (id, school_id, student_id, fee_head_id, amount,
                                 effective_from, created_at, updated_at)
       VALUES (gen_random_uuid(), $1::uuid, $2::uuid, $3::uuid, '9000.00'::numeric,
               '2026-09-20'::date, now(), now())`,
      SCHOOL_A,
      AASIA,
      HEAD_TUITION,
    );

    try {
      expect((await generate()).statusCode).toBe(201);

      const { data } = await listVouchers('?sort=studentName&order=asc');
      const aasia = data.find((entry) => entry.grNo === 'GR-9001');

      expect(aasia?.netPayableMinor).toBe(500_000);
    } finally {
      await admin.$executeRawUnsafe(
        `DELETE FROM student_fees WHERE student_id = $1::uuid AND effective_from = '2026-09-20'`,
        AASIA,
      );
    }
  });

  it('still leaves out somebody who joins after the month, and says why', async () => {
    await admitMidMonth('2026-11-01');
    try {
      const response = await post(ROUTES.vouchers.preview, body());
      const result = response.json<{
        data: { skipsByReason: { reason: string }[]; warnings: string[] };
      }>();

      expect(result.data.skipsByReason.map((entry) => entry.reason)).toContain('FEE_STARTS_LATER');

      // And it must not be reported as a missing amount — that sends a school
      // hunting for a gap in a record that is perfectly complete.
      const warnings = result.data.warnings.join(' ');
      expect(warnings).toContain('after these months, so there is nothing to bill');
      expect(warnings).not.toContain('never been given an amount');
    } finally {
      await cleanUp();
    }
  });
});

/**
 * A child on the roll who belongs to no session at all.
 *
 * `NOT_ENROLLED` was declared in the contract, labelled in the UI, and produced
 * by nothing: the scope filtered these students out before a single count was
 * taken. So a school totting up nineteen students against "fourteen billed,
 * three skipped" was left to work out on their own where the rest had gone —
 * and the answer, that one of them is enrolled in nothing and can never be
 * billed by any run in any month, was written down nowhere.
 */
describe('a student enrolled in no session', () => {
  const ORPHAN = '88888888-8888-4888-8888-88888888888b';

  async function addOrphan(): Promise<void> {
    await admin.$executeRawUnsafe(
      `INSERT INTO students (id, school_id, gr_no, student_code, first_name, last_name,
                             status, admitted_on, created_at, updated_at)
       VALUES ($1::uuid, $2::uuid, 'GR-9010', '2026-9010', 'Unplaced', 'Child',
               'ACTIVE', '2026-01-01'::date, now(), now())`,
      ORPHAN,
      SCHOOL_A,
    );
    await admin.$executeRawUnsafe(
      `INSERT INTO student_fees (id, school_id, student_id, fee_head_id, amount,
                                 effective_from, created_at, updated_at)
       VALUES (gen_random_uuid(), $1::uuid, $2::uuid, $3::uuid, '5000.00'::numeric,
               '2026-01-01'::date, now(), now())`,
      SCHOOL_A,
      ORPHAN,
      HEAD_TUITION,
    );
  }

  async function removeOrphan(): Promise<void> {
    await admin.$executeRawUnsafe(`DELETE FROM student_fees WHERE student_id = $1::uuid`, ORPHAN);
    await admin.$executeRawUnsafe(`DELETE FROM students WHERE id = $1::uuid`, ORPHAN);
  }

  it('is counted and named, instead of vanishing from the arithmetic', async () => {
    await addOrphan();
    try {
      const response = await post(ROUTES.vouchers.preview, body({ scope: { kind: 'ALL' } }));
      const result = response.json<{
        data: { willSkip: number; skipsByReason: { reason: string; count: number }[]; warnings: string[] };
      }>();

      expect(result.data.skipsByReason).toContainEqual({ reason: 'NOT_ENROLLED', count: 1 });
      expect(result.data.warnings.join(' ')).toContain('not enrolled in any session');
    } finally {
      await removeOrphan();
    }
  });

  it('is never billed, however loudly it is reported', async () => {
    await addOrphan();
    try {
      expect((await generate({ scope: { kind: 'ALL' } })).statusCode).toBe(201);

      const rows = await admin.$queryRawUnsafe<{ n: bigint }[]>(
        `SELECT count(*) AS n FROM fee_vouchers WHERE student_id = $1::uuid`,
        ORPHAN,
      );
      expect(Number(rows[0]?.n ?? 0)).toBe(0);
    } finally {
      await removeOrphan();
    }
  });

  it('does not clutter a class run — they are in no class either', async () => {
    await addOrphan();
    try {
      const response = await post(ROUTES.vouchers.preview, body());
      const result = response.json<{ data: { skipsByReason: { reason: string }[] } }>();

      expect(result.data.skipsByReason.map((entry) => entry.reason)).not.toContain('NOT_ENROLLED');
    } finally {
      await removeOrphan();
    }
  });

  it('says so when that one child is the one you picked', async () => {
    await addOrphan();
    try {
      const response = await post(
        ROUTES.vouchers.preview,
        body({ scope: { kind: 'STUDENT', studentId: ORPHAN } }),
      );
      const result = response.json<{ data: { skipsByReason: { reason: string }[] } }>();

      // Naming a child and being shown an empty screen is the worst version of
      // this: it reads as the page being broken.
      expect(result.data.skipsByReason.map((entry) => entry.reason)).toContain('NOT_ENROLLED');
    } finally {
      await removeOrphan();
    }
  });
});

/**
 * Deleting and printing a selection.
 *
 * Schools do neither of these one at a time — a month is generated for
 * everybody and a month is printed for everybody — so the interesting cases
 * are all about a selection that is not uniform: one voucher in two hundred
 * that was paid an hour ago, one that collected a deposit, one that another
 * challan is carrying as arrears.
 *
 * The rule throughout is that a mixed selection does the work it can and
 * reports what it could not, because failing the whole run means the operator
 * has to find the offending voucher by hand among two hundred.
 */
describe('deleting a selection', () => {
  async function bulkDelete(ids: string[], reason = 'Generated for the wrong month') {
    const response = await post(ROUTES.vouchers.bulkDelete, { ids, reason });
    return {
      status: response.statusCode,
      body: response.body,
      data: () => response.json<{ data: BulkDeleteResultBody }>().data,
    };
  }

  it('removes every voucher in the selection', async () => {
    await generate();
    const { data } = await listVouchers();
    expect(data.length).toBeGreaterThan(1);

    const result = await bulkDelete(data.map((voucher) => voucher.id));

    expect(result.status).toBe(201);
    expect(result.data().deleted).toBe(data.length);
    expect((await listVouchers()).data).toHaveLength(0);
  });

  it('frees the months, so they can be billed again', async () => {
    await generate();
    const first = await listVouchers();
    await bulkDelete(first.data.map((voucher) => voucher.id));

    // The period claims are the thing that would otherwise report every
    // student as already billed for September, for ever.
    expect((await generate()).statusCode).toBe(201);
    expect((await listVouchers()).data).toHaveLength(first.data.length);
  });

  it('leaves a paid voucher alone and does the rest', async () => {
    await generate();
    const { data } = await listVouchers('?sort=studentName&order=asc');
    const paid = data[0];
    const rest = data.slice(1);
    expect(paid).toBeDefined();
    expect(rest.length).toBeGreaterThan(0);

    await post(ROUTES.vouchers.pay(paid?.id ?? ''), {
      amountMinor: 100_000,
      method: 'CASH',
      paidOn: '2026-09-10',
      idempotencyKey: freshKey(),
    });

    const result = await bulkDelete(data.map((voucher) => voucher.id));
    const body = result.data();

    expect(body.deleted).toBe(rest.length);
    expect(body.skipped).toHaveLength(1);
    expect(body.skipped[0]?.reason).toBe('ALREADY_PAID');
    // Named, not just counted: "one could not be deleted" sends somebody
    // hunting through two hundred rows for it.
    expect(body.skipped[0]?.voucherNo).toBe(paid?.voucherNo);

    const left = await listVouchers();
    expect(left.data).toHaveLength(1);
    expect(left.data[0]?.id).toBe(paid?.id);
  });

  it('reports an id that resolves to nothing rather than failing the run', async () => {
    await generate();
    const { data } = await listVouchers();
    const invented = '99999999-9999-4999-8999-999999999999';

    const result = await bulkDelete([...data.map((voucher) => voucher.id), invented]);
    const body = result.data();

    expect(body.deleted).toBe(data.length);
    expect(body.skipped).toEqual([{ id: invented, voucherNo: null, reason: 'NOT_FOUND' }]);
  });

  it('cannot reach another school’s vouchers, and says the same thing as for a typo', async () => {
    await generate();
    const mine = (await listVouchers()).data.map((voucher) => voucher.id);

    // Written directly, because the other school's data is never reachable
    // through the API — which is the point being tested.
    const theirs = await foreignVoucher();

    const result = await bulkDelete([...mine, theirs]);
    const body = result.data();

    expect(body.deleted).toBe(mine.length);
    // "Not found", exactly as for an invented id. Anything else would confirm
    // that the id is real somewhere.
    expect(body.skipped).toEqual([{ id: theirs, voucherNo: null, reason: 'NOT_FOUND' }]);

    const survivors = await admin.$queryRawUnsafe<{ n: bigint }[]>(
      `SELECT count(*) AS n FROM fee_vouchers WHERE id = $1::uuid`,
      theirs,
    );
    expect(Number(survivors[0]?.n ?? 0)).toBe(1);
  });

  it('ignores a repeated id instead of counting it twice', async () => {
    await generate();
    const { data } = await listVouchers();
    const id = data[0]?.id ?? '';

    const result = await bulkDelete([id, id, id]);

    expect(result.data().deleted).toBe(1);
    expect(result.data().skipped).toHaveLength(0);
  });

  it('is safe to repeat — the second run finds nothing left to do', async () => {
    await generate();
    const ids = (await listVouchers()).data.map((voucher) => voucher.id);

    expect((await bulkDelete(ids)).data().deleted).toBe(ids.length);

    // A retried request, a double-clicked button, a timeout that was actually
    // a success. None of them may report an error.
    const again = await bulkDelete(ids);
    expect(again.status).toBe(201);
    expect(again.data().deleted).toBe(0);
    expect(again.data().skipped).toHaveLength(ids.length);
  });

  it('refuses more than the cap rather than truncating the selection', async () => {
    const tooMany = Array.from(
      { length: 501 },
      (_, index) => `99999999-9999-4999-8999-${String(index).padStart(12, '0')}`,
    );

    // Silently deleting the first five hundred of five hundred and one is the
    // worst available answer.
    expect((await bulkDelete(tooMany)).status).toBe(400);
  });

  it('demands a reason', async () => {
    await generate();
    const ids = (await listVouchers()).data.map((voucher) => voucher.id);

    expect((await bulkDelete(ids, '')).status).toBe(400);
    expect((await listVouchers()).data.length).toBe(ids.length);
  });
});

describe('the challans behind a selection', () => {
  async function challans(ids: string[]) {
    const response = await post(ROUTES.vouchers.challans, { ids });
    return {
      status: response.statusCode,
      data: () => response.json<{ data: ChallanBody[] }>().data,
    };
  }

  it('returns one per voucher, with the lines a challan prints', async () => {
    await generate();
    const { data } = await listVouchers();

    const result = await challans(data.map((voucher) => voucher.id));

    expect(result.status).toBe(201);
    expect(result.data()).toHaveLength(data.length);
    for (const challan of result.data()) {
      expect(challan.lines.length).toBeGreaterThan(0);
      expect(challan.voucherNo).toBeTruthy();
    }
  });

  it('comes back in class order, so a stack is handed out in register order', async () => {
    await generate();
    const { data } = await listVouchers();

    // Deliberately reversed on the way in: the order the ids arrive is
    // whatever order somebody ticked boxes, which is no order at all on paper.
    const result = await challans([...data.map((voucher) => voucher.id)].reverse());
    const printed = result.data();

    const keys = printed.map(
      (challan) => `${challan.className ?? ''}|${challan.sectionName ?? ''}|${challan.studentName}`,
    );
    expect(keys).toEqual([...keys].sort());
  });

  it('never returns another school’s challan', async () => {
    await generate();
    const mine = (await listVouchers()).data.map((voucher) => voucher.id);
    const theirs = await foreignVoucher();

    const result = await challans([...mine, theirs]);

    // Not an error — simply absent, the same as any id that does not resolve.
    expect(result.data()).toHaveLength(mine.length);
  });

  it('refuses more than the cap', async () => {
    const tooMany = Array.from(
      { length: 501 },
      (_, index) => `99999999-9999-4999-8999-${String(index).padStart(12, '0')}`,
    );
    expect((await challans(tooMany)).status).toBe(400);
  });
});

/**
 * One voucher belonging to the other school, written past the API.
 *
 * It has to be planted rather than generated, because there is no route by
 * which this school could make one — which is exactly the property under test.
 */
async function foreignVoucher(): Promise<string> {
  const id = '77777777-7777-4777-8777-7777777779ff';
  await admin.$executeRawUnsafe(
    `INSERT INTO fee_vouchers (id, school_id, session_id, student_id, voucher_no,
                               issue_date, due_date, valid_till, created_at, updated_at)
     VALUES ($1::uuid, $2::uuid, $3::uuid, $4::uuid, 'OTHER-0001',
             '2026-09-01'::date, '2026-09-15'::date, '2026-09-25'::date, now(), now())
     ON CONFLICT (id) DO NOTHING`,
    id,
    SCHOOL_B,
    SESSION_B,
    OTHER,
  );
  return id;
}

interface BulkDeleteResultBody {
  deleted: number;
  skipped: { id: string; voucherNo: string | null; reason: string }[];
}

interface ChallanBody {
  voucherNo: string;
  studentName: string;
  className: string | null;
  sectionName: string | null;
  lines: { id: string }[];
}
