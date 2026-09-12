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
    expect(result.data.warnings.join(' ')).toContain('no agreed amount');
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

  it('bills the month again once the voucher is cancelled', async () => {
    await generate();
    const { data } = await listVouchers();
    const target = data[0];

    const cancelled = await app.inject({
      method: 'DELETE',
      url: ROUTES.vouchers.detail(target?.id ?? ''),
      headers: { host: HOST_A, cookie: jar },
      payload: { reason: 'Issued with the wrong due date' },
    });
    expect(cancelled.statusCode).toBe(200);

    // Cancelling releases the claim on September, which is the whole reason
    // the claim rows are deleted rather than kept.
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
  it('refuses to cancel a voucher with a payment against it', async () => {
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
