import { ROUTES } from '@ilm/contracts';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { Test } from '@nestjs/testing';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { AppModule } from '../app.module';
import { createAdminClient, type PrismaClient } from '../prisma';
import { PasswordService } from '../shared/auth/password.service';

/**
 * The expense list: filters, paging, totals, and the isolation underneath.
 *
 * Driven through Fastify's `inject`, so the real pipeline runs — tenancy from
 * CLS, the Prisma extension, RLS underneath, zod at the boundary.
 *
 * Two schools with **the same expenses in both** is the point of the fixture.
 * A tenancy bug that returns everybody's rows is invisible when the other
 * school's data looks different from yours; identical rows mean a leak shows up
 * as a count that is exactly twice what it should be.
 */

const SCHOOL_A = '33333333-3333-4333-8333-333333333371';
const SCHOOL_B = '33333333-3333-4333-8333-333333333372';
const USER_A = '44444444-4444-4444-8444-444444444471';
const SESSION_A = '55555555-5555-4555-8555-555555555571';
const SESSION_B = '55555555-5555-4555-8555-555555555572';

const HOST_A = 'expense-a-e2e.localhost';
const PASSWORD = 'correct-horse-battery-staple';

let app: NestFastifyApplication;
let admin: PrismaClient;
let jar = '';

/** Same shape in both schools, so a leak reads as a doubled count. */
const FIXTURE = [
  {
    cat: 'Utilities',
    desc: 'Electricity bill',
    payee: 'LESCO',
    amt: '1000.00',
    method: 'BANK_TRANSFER',
    day: '2026-07-05',
  },
  {
    cat: 'Utilities',
    desc: 'Sui gas bill',
    payee: 'SNGPL',
    amt: '200.00',
    method: 'BANK_TRANSFER',
    day: '2026-08-05',
  },
  {
    cat: 'Transport',
    desc: 'Diesel for vans',
    payee: 'Shell',
    amt: '3000.00',
    method: 'CASH',
    day: '2026-08-20',
  },
  {
    cat: 'Transport',
    desc: 'Tyre replacement',
    payee: 'Sardar Tyres',
    amt: '500.00',
    method: 'CASH',
    day: '2026-09-01',
  },
  {
    cat: 'Events',
    desc: 'Sports day',
    payee: null,
    amt: '250.00',
    method: 'CHEQUE',
    day: '2026-09-02',
  },
];

/** 1000 + 200 + 3000 + 500 + 250 rupees, in paisa. */
const TOTAL_MINOR = 495_000;

async function wipe(): Promise<void> {
  const ids = [SCHOOL_A, SCHOOL_B];
  for (const table of [
    'expenses',
    'expense_categories',
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

beforeAll(async () => {
  admin = createAdminClient({ url: process.env['DATABASE_ADMIN_URL'] ?? '' });
  await wipe();

  await admin.$executeRaw`
    INSERT INTO schools (id, name, slug, created_at, updated_at) VALUES
      (${SCHOOL_A}::uuid, 'Expense E2E A', 'expense-a-e2e', now(), now()),
      (${SCHOOL_B}::uuid, 'Expense E2E B', 'expense-b-e2e', now(), now())
  `;

  const hash = await new PasswordService().hash(PASSWORD);
  await admin.$executeRaw`
    INSERT INTO users (id, school_id, email, name, password_hash, status, created_at, updated_at)
    VALUES (${USER_A}::uuid, ${SCHOOL_A}::uuid, 'head@expense-a-e2e.test', 'Head A', ${hash}, 'ACTIVE', now(), now())
  `;
  await admin.$executeRaw`
    INSERT INTO user_roles (id, school_id, user_id, role, created_at)
    VALUES (gen_random_uuid(), ${SCHOOL_A}::uuid, ${USER_A}::uuid, 'OWNER', now())
  `;

  for (const [schoolId, sessionId] of [
    [SCHOOL_A, SESSION_A],
    [SCHOOL_B, SESSION_B],
  ] as const) {
    await admin.$executeRaw`
      INSERT INTO academic_sessions (id, school_id, name, start_date, end_date, status, is_current, created_at, updated_at)
      VALUES (${sessionId}::uuid, ${schoolId}::uuid, '2026-2027', '2026-04-01', '2027-03-31', 'ACTIVE', true, now(), now())
    `;

    for (const [index, row] of FIXTURE.entries()) {
      const categoryId = await categoryFor(schoolId, row.cat);
      await admin.$executeRawUnsafe(
        `INSERT INTO expenses (id, school_id, session_id, category_id, voucher_no, description, payee, amount, method, paid_on, created_at, updated_at)
         VALUES (gen_random_uuid(), $1::uuid, $2::uuid, $3::uuid, $4, $5, $6, $7::numeric, $8::"payment_method", $9::date, now(), now())`,
        schoolId,
        sessionId,
        categoryId,
        `EXP-${String(index + 1).padStart(5, '0')}`,
        row.desc,
        row.payee,
        row.amt,
        row.method,
        row.day,
      );
    }
  }

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
    payload: { identifier: 'head@expense-a-e2e.test', password: PASSWORD },
  });
  const raw = signIn.headers['set-cookie'];
  const list = Array.isArray(raw) ? raw : [String(raw)];
  jar = list
    .map((entry) => entry.split(';')[0] ?? '')
    .filter((pair) => !pair.endsWith('='))
    .join('; ');
}, 90_000);

afterAll(async () => {
  await app?.close();
  await wipe();
  await admin.$disconnect();
});

const categoryIds = new Map<string, string>();

async function categoryFor(schoolId: string, name: string): Promise<string> {
  const key = `${schoolId}:${name}`;
  const known = categoryIds.get(key);
  if (known !== undefined) {
    return known;
  }
  const rows = await admin.$queryRawUnsafe<{ id: string }[]>(
    `INSERT INTO expense_categories (id, school_id, name, is_active, sort_order, created_at, updated_at)
     VALUES (gen_random_uuid(), $1::uuid, $2, true, 0, now(), now())
     RETURNING id`,
    schoolId,
    name,
  );
  const id = rows[0]?.id ?? '';
  categoryIds.set(key, id);
  return id;
}

interface ListBody {
  data: {
    voucherNo: string;
    amountMinor: number;
    method: string;
    paidOn: string;
    description: string;
  }[];
  meta: {
    page: { total: number; limit: number; offset: number };
    totals: { totalMinor: number; count: number };
  };
}

async function list(query = ''): Promise<{ status: number; body: ListBody }> {
  const response = await app.inject({
    method: 'GET',
    url: `${ROUTES.expenses.list}${query}`,
    headers: { host: HOST_A, cookie: jar },
  });
  return { status: response.statusCode, body: response.json<ListBody>() };
}

describe('the expense list', () => {
  it('returns this school’s expenses and nobody else’s', async () => {
    const { status, body } = await list();

    expect(status).toBe(200);
    // Five, not ten. The other school holds an identical five.
    expect(body.data).toHaveLength(FIXTURE.length);
    expect(body.meta.page.total).toBe(FIXTURE.length);
  });

  it('sums the filtered set in paisa, never a float', async () => {
    const { body } = await list();

    expect(body.meta.totals.totalMinor).toBe(TOTAL_MINOR);
    expect(Number.isInteger(body.meta.totals.totalMinor)).toBe(true);
  });

  it('keeps the total over the whole filter when a page is asked for', async () => {
    const { body } = await list('?limit=2&offset=2');

    expect(body.data).toHaveLength(2);
    expect(body.meta.page.limit).toBe(2);
    expect(body.meta.page.offset).toBe(2);
    // The number people read next to a paged list has to mean the filter, or
    // it changes when they turn the page.
    expect(body.meta.totals.totalMinor).toBe(TOTAL_MINOR);
  });

  it('pages without repeating or dropping a row', async () => {
    const seen: string[] = [];
    for (let offset = 0; offset < FIXTURE.length; offset += 2) {
      const { body } = await list(`?limit=2&offset=${String(offset)}&sort=voucherNo&order=asc`);
      seen.push(...body.data.map((row) => row.voucherNo));
    }

    expect(seen).toHaveLength(FIXTURE.length);
    expect(new Set(seen).size).toBe(FIXTURE.length);
  });

  it('filters by payment method', async () => {
    const { body } = await list('?method=CASH');

    expect(body.data).toHaveLength(2);
    expect(body.data.every((row) => row.method === 'CASH')).toBe(true);
    expect(body.meta.totals.totalMinor).toBe(350_000);
  });

  it('treats a date range as inclusive at both ends', async () => {
    // 5th August and 1st September are the boundaries themselves — the day a
    // half-open range would silently drop.
    const { body } = await list('?from=2026-08-05&to=2026-09-01');

    expect(body.data.map((row) => row.paidOn).sort()).toEqual([
      '2026-08-05',
      '2026-08-20',
      '2026-09-01',
    ]);
  });

  it('searches description, payee and voucher number', async () => {
    const byDescription = await list('?q=diesel');
    expect(byDescription.body.data).toHaveLength(1);

    const byPayee = await list('?q=SNGPL');
    expect(byPayee.body.data).toHaveLength(1);

    const byVoucher = await list('?q=EXP-00003');
    expect(byVoucher.body.data).toHaveLength(1);
  });

  it('sorts by amount', async () => {
    const { body } = await list('?sort=amount&order=desc');
    const amounts = body.data.map((row) => row.amountMinor);

    expect(amounts).toEqual([...amounts].sort((a, b) => b - a));
    expect(amounts[0]).toBe(300_000);
  });

  it('refuses a sort field outside the allow-list', async () => {
    // Otherwise the query string chooses which column the database orders by,
    // which is an index-scan denial of service at best.
    const response = await app.inject({
      method: 'GET',
      url: `${ROUTES.expenses.list}?sort=school_id`,
      headers: { host: HOST_A, cookie: jar },
    });

    expect(response.statusCode).toBe(400);
  });

  it('refuses a limit large enough to be a denial of service', async () => {
    const response = await app.inject({
      method: 'GET',
      url: `${ROUTES.expenses.list}?limit=100000`,
      headers: { host: HOST_A, cookie: jar },
    });

    expect(response.statusCode).toBe(400);
  });

  it('refuses an unknown filter rather than ignoring it', async () => {
    // A typo that is silently dropped shows a total for the wrong set of rows
    // and looks like it worked.
    const response = await app.inject({
      method: 'GET',
      url: `${ROUTES.expenses.list}?catgeoryId=whatever`,
      headers: { host: HOST_A, cookie: jar },
    });

    expect(response.statusCode).toBe(400);
  });

  it('rejects the whole list without a session', async () => {
    const response = await app.inject({
      method: 'GET',
      url: ROUTES.expenses.list,
      headers: { host: HOST_A },
    });

    expect(response.statusCode).toBe(401);
  });
});
