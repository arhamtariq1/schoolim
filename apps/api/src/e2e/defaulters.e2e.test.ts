import { ROUTES, type DefaulterList } from '@ilm/contracts';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { Test } from '@nestjs/testing';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { AppModule } from '../app.module';
import { createAdminClient, type PrismaClient } from '../prisma';
import { PasswordService } from '../shared/auth/password.service';

/**
 * The defaulter list: who is late, by how much, and who is not late at all.
 *
 * The fixture is built around the ways this screen can lie. Every voucher below
 * exists to be either included or excluded for one specific reason, so a wrong
 * predicate changes a count rather than hiding in a plausible-looking list:
 *
 * | Student | Voucher            | Expected                                  |
 * | ------- | ------------------ | ----------------------------------------- |
 * | Aasia   | May, overdue       | counted in full                           |
 * | Aasia   | June, overdue      | counted in full — two months behind       |
 * | Bilal   | May, part-paid     | counted for the remainder only            |
 * | Bilal   | September, not due | **excluded**: due date has not passed     |
 * | Chand   | May, paid          | **excluded**: nothing owed                |
 * | Chand   | June, waived       | **excluded**: the school already decided  |
 * | Chand   | July, cancelled    | **excluded**: likewise                    |
 * | Faraz   | May, overdue       | **excluded**: a different school entirely |
 *
 * So the list is Aasia and Bilal. Chand is the student who must never appear
 * despite having three vouchers, and Faraz is the tenancy check.
 */

const SCHOOL_A = '33333333-3333-4333-8333-3333333333d1';
const SCHOOL_B = '33333333-3333-4333-8333-3333333333d2';
const USER_A = '44444444-4444-4444-8444-4444444444d1';
const SESSION_A = '55555555-5555-4555-8555-5555555555d1';
const SESSION_B = '55555555-5555-4555-8555-5555555555d2';
const CLASS_A = '66666666-6666-4666-8666-6666666666d1';
const CLASS_B = '66666666-6666-4666-8666-6666666666d2';

const AASIA = '77777777-7777-4777-8777-7777777777d1';
const BILAL = '77777777-7777-4777-8777-7777777777d2';
const CHAND = '77777777-7777-4777-8777-7777777777d3';
const FARAZ = '77777777-7777-4777-8777-7777777777d4';

const HOST_A = 'defaulter-a-e2e.localhost';
const PASSWORD = 'correct-horse-battery-staple';

/** Aasia owes two whole months; Bilal owes 5,000 less the 2,000 he paid. */
const AASIA_OWED = 1_000_000;
const BILAL_OWED = 300_000;
const TOTAL_OWED = AASIA_OWED + BILAL_OWED;

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
    await admin.$executeRawUnsafe(
      `DELETE FROM ${table} WHERE school_id IN ($1::uuid, $2::uuid)`,
      ...ids,
    );
  }
  await admin.$executeRaw`DELETE FROM schools WHERE id IN (${SCHOOL_A}::uuid, ${SCHOOL_B}::uuid)`;
}

/**
 * A voucher, written directly.
 *
 * Generation is exercised by its own suite; here the point is to state the
 * *outcome* — a status, a due date, an amount paid — and check what the list
 * makes of it. Driving generation instead would make the fixture depend on how
 * billing rounds and schedules, which is not what is under test.
 */
async function voucher(row: {
  school: string;
  session: string;
  student: string;
  no: string;
  status: string;
  month: string;
  due: string;
  net: string;
  paid: string;
}): Promise<void> {
  await admin.$executeRawUnsafe(
    `INSERT INTO fee_vouchers
       (id, school_id, session_id, student_id, voucher_no, status, issue_date, due_date,
        valid_till, bill_months, gross_amount, net_payable, paid_amount, created_at, updated_at)
     VALUES (gen_random_uuid(), $1::uuid, $2::uuid, $3::uuid, $4, $5::"voucher_status",
             ($6 || '-01')::date, $7::date, $7::date + 10,
             ARRAY[($6 || '-01')::date], $8::numeric, $8::numeric, $9::numeric, now(), now())`,
    row.school,
    row.session,
    row.student,
    row.no,
    row.status,
    row.month,
    row.due,
    row.net,
    row.paid,
  );
}

beforeAll(async () => {
  admin = createAdminClient({ url: process.env['DATABASE_ADMIN_URL'] ?? '' });
  await wipe();

  await admin.$executeRaw`
    INSERT INTO schools (id, name, slug, created_at, updated_at) VALUES
      (${SCHOOL_A}::uuid, 'Defaulter E2E A', 'defaulter-a-e2e', now(), now()),
      (${SCHOOL_B}::uuid, 'Defaulter E2E B', 'defaulter-b-e2e', now(), now())
  `;

  const hash = await new PasswordService().hash(PASSWORD);
  await admin.$executeRaw`
    INSERT INTO users (id, school_id, email, name, password_hash, status, created_at, updated_at)
    VALUES (${USER_A}::uuid, ${SCHOOL_A}::uuid, 'head@defaulter-a-e2e.test', 'Head A', ${hash}, 'ACTIVE', now(), now())
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
    [AASIA, 'Aasia', 'GR-8001', SCHOOL_A, SESSION_A, CLASS_A],
    [BILAL, 'Bilal', 'GR-8002', SCHOOL_A, SESSION_A, CLASS_A],
    [CHAND, 'Chand', 'GR-8003', SCHOOL_A, SESSION_A, CLASS_A],
    [FARAZ, 'Faraz', 'GR-8004', SCHOOL_B, SESSION_B, CLASS_B],
  ] as const) {
    await admin.$executeRawUnsafe(
      `INSERT INTO students (id, school_id, gr_no, student_code, first_name, last_name, status, gender, created_at, updated_at)
       VALUES ($1::uuid, $2::uuid, $3, $3, $4, 'Khan', 'ACTIVE', 'FEMALE', now(), now())`,
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

  // Aasia: two overdue months, nothing paid.
  await voucher({ school: SCHOOL_A, session: SESSION_A, student: AASIA, no: 'DV-0001', status: 'UNPAID', month: '2026-05', due: '2026-05-10', net: '5000.00', paid: '0.00' });
  await voucher({ school: SCHOOL_A, session: SESSION_A, student: AASIA, no: 'DV-0002', status: 'UNPAID', month: '2026-06', due: '2026-06-10', net: '5000.00', paid: '0.00' });

  // Bilal: one overdue month, part paid; and one that is not due yet.
  await voucher({ school: SCHOOL_A, session: SESSION_A, student: BILAL, no: 'DV-0003', status: 'PARTIALLY_PAID', month: '2026-05', due: '2026-05-10', net: '5000.00', paid: '2000.00' });
  await voucher({ school: SCHOOL_A, session: SESSION_A, student: BILAL, no: 'DV-0004', status: 'UNPAID', month: '2026-09', due: '2099-01-01', net: '5000.00', paid: '0.00' });

  // Chand: settled three different ways, and so not a defaulter at all.
  await voucher({ school: SCHOOL_A, session: SESSION_A, student: CHAND, no: 'DV-0005', status: 'PAID', month: '2026-05', due: '2026-05-10', net: '5000.00', paid: '5000.00' });
  await voucher({ school: SCHOOL_A, session: SESSION_A, student: CHAND, no: 'DV-0006', status: 'WAIVED', month: '2026-06', due: '2026-06-10', net: '5000.00', paid: '0.00' });
  await voucher({ school: SCHOOL_A, session: SESSION_A, student: CHAND, no: 'DV-0007', status: 'CANCELLED', month: '2026-07', due: '2026-07-10', net: '5000.00', paid: '0.00' });

  // The other school's defaulter, identical in shape to Aasia's first voucher.
  await voucher({ school: SCHOOL_B, session: SESSION_B, student: FARAZ, no: 'DV-0008', status: 'UNPAID', month: '2026-05', due: '2026-05-10', net: '5000.00', paid: '0.00' });

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
    payload: { identifier: 'head@defaulter-a-e2e.test', password: PASSWORD },
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

async function list(query = ''): Promise<{ status: number; body: { data: DefaulterList } }> {
  const response = await app.inject({
    method: 'GET',
    url: `${ROUTES.defaulters.list}${query}`,
    headers: { host: HOST_A, cookie: jar },
  });
  return { status: response.statusCode, body: response.json<{ data: DefaulterList }>() };
}

describe('who counts as a defaulter', () => {
  it('lists the students who are actually late, and nobody else', async () => {
    const { status, body } = await list();

    expect(status).toBe(200);
    expect(body.data.rows.map((row) => row.name).sort()).toEqual(['Aasia Khan', 'Bilal Khan']);
    expect(body.data.total).toBe(2);
  });

  it('leaves out a voucher whose due date has not passed', async () => {
    const { body } = await list();
    const bilal = body.data.rows.find((row) => row.name === 'Bilal Khan');

    // DV-0004 is due in 2099. Bilal is late for May and nothing else.
    expect(bilal?.vouchers.map((voucher) => voucher.voucherNo)).toEqual(['DV-0003']);
    expect(bilal?.monthsOwed).toBe(1);
  });

  it('leaves out what was paid, waived or cancelled', async () => {
    const { body } = await list();

    // Chand has three vouchers and owes nothing on any of them.
    expect(body.data.rows.map((row) => row.name)).not.toContain('Chand Khan');
  });

  it('counts a part payment as the remainder, not the whole voucher', async () => {
    const { body } = await list();
    const bilal = body.data.rows.find((row) => row.name === 'Bilal Khan');

    expect(bilal?.totalOwedMinor).toBe(BILAL_OWED);
    expect(bilal?.vouchers[0]?.netPayableMinor).toBe(500_000);
    expect(bilal?.vouchers[0]?.paidMinor).toBe(200_000);
    expect(bilal?.vouchers[0]?.balanceMinor).toBe(BILAL_OWED);
  });

  it('never shows another school’s defaulters', async () => {
    const { body } = await list();

    expect(body.data.rows.map((row) => row.grNo)).not.toContain('GR-8004');
    // Faraz's voucher is identical in shape to Aasia's, so a leak would read as
    // a third row rather than as something obviously foreign.
    expect(body.data.total).toBe(2);
  });

  it('states the day the list was drawn, so a screenshot can be reproduced', async () => {
    const { body } = await list();

    expect(body.data.asOf).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe('the arithmetic on the screen', () => {
  it('gives each row a total equal to the vouchers it expands to', async () => {
    const { body } = await list();

    for (const row of body.data.rows) {
      const sum = row.vouchers.reduce((total, voucher) => total + voucher.balanceMinor, 0);
      expect(row.totalOwedMinor).toBe(sum);
    }
  });

  it('totals the whole filter rather than the page', async () => {
    const { body } = await list('?limit=1&offset=0');

    // One row of two, but the figure at the top still covers both.
    expect(body.data.rows).toHaveLength(1);
    expect(body.data.total).toBe(2);
    expect(body.data.totalOwedMinor).toBe(TOTAL_OWED);
  });

  it('counts distinct months, so two vouchers for one month are one month late', async () => {
    // A second May voucher for Aasia — the shape arrears produce, where the
    // same month appears on more than one voucher.
    await voucher({
      school: SCHOOL_A,
      session: SESSION_A,
      student: AASIA,
      no: 'DV-0009',
      status: 'UNPAID',
      month: '2026-05',
      due: '2026-05-10',
      net: '1000.00',
      paid: '0.00',
    });

    const { body } = await list();
    const aasia = body.data.rows.find((row) => row.name === 'Aasia Khan');

    expect(aasia?.vouchers).toHaveLength(3);
    // Three vouchers, two months: May twice and June once.
    expect(aasia?.months).toEqual(['2026-05', '2026-06']);
    expect(aasia?.monthsOwed).toBe(2);
    expect(aasia?.totalOwedMinor).toBe(AASIA_OWED + 100_000);

    await admin.$executeRaw`DELETE FROM fee_vouchers WHERE voucher_no = 'DV-0009'`;
  });
});

describe('narrowing the list', () => {
  it('shows only families at least the given number of months behind', async () => {
    const two = await list('?months=2');
    expect(two.body.data.rows.map((row) => row.name)).toEqual(['Aasia Khan']);
    expect(two.body.data.totalOwedMinor).toBe(AASIA_OWED);

    const three = await list('?months=3');
    expect(three.body.data.rows).toHaveLength(0);
    expect(three.body.data.totalOwedMinor).toBe(0);
  });

  it('bounds due dates, not issue dates', async () => {
    // June only. Aasia's June voucher qualifies; every May one is outside it.
    const { body } = await list('?from=2026-06-01&to=2026-06-30');

    expect(body.data.rows.map((row) => row.name)).toEqual(['Aasia Khan']);
    expect(body.data.rows[0]?.vouchers.map((voucher) => voucher.voucherNo)).toEqual(['DV-0002']);
    expect(body.data.totalOwedMinor).toBe(500_000);
  });

  it('finds a student by name or GR number', async () => {
    const byName = await list('?q=Bilal');
    expect(byName.body.data.rows.map((row) => row.grNo)).toEqual(['GR-8002']);

    const byGr = await list('?q=GR-8001');
    expect(byGr.body.data.rows.map((row) => row.name)).toEqual(['Aasia Khan']);
  });

  it('sorts by what is owed', async () => {
    const { body } = await list('?sort=amount&order=desc');

    expect(body.data.rows.map((row) => row.totalOwedMinor)).toEqual([AASIA_OWED, BILAL_OWED]);
  });

  it('returns an empty list rather than an error when nobody is late', async () => {
    // Every due date in the fixture is well before this.
    const { status, body } = await list('?from=2090-01-01');

    expect(status).toBe(200);
    expect(body.data.rows).toHaveLength(0);
    expect(body.data.total).toBe(0);
    expect(body.data.totalOwedMinor).toBe(0);
  });
});
