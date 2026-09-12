import { ROUTES, type FeeHistory, type FeeIncrementList, type FeeIncrementResult } from '@ilm/contracts';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { Test } from '@nestjs/testing';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { AppModule } from '../app.module';
import { createAdminClient, type PrismaClient } from '../prisma';
import { PasswordService } from '../shared/auth/password.service';

/**
 * Raising and lowering fees.
 *
 * The fixture is three children in one class on three different arrangements,
 * because "one class, one fee" is the assumption that quietly destroys a fee
 * book:
 *
 * - **Aasia** pays the full 5,000.
 * - **Bilal** agreed 5,000 with a 1,500 sibling discount, so he pays 3,500.
 * - **Chand** has no tuition agreed at all.
 *
 * A flat "+500 for the class" must move Aasia to 5,500 and Bilal to 4,000 —
 * keeping his discount at 1,500, not recalculating it, and not flattening the
 * two of them onto one figure — while refusing Chand outright rather than
 * inventing 500 out of nothing.
 */

const SCHOOL_A = '33333333-3333-4333-8333-3333333333f1';
const SCHOOL_B = '33333333-3333-4333-8333-3333333333f2';
const USER_A = '44444444-4444-4444-8444-4444444444f1';
const SESSION_A = '55555555-5555-4555-8555-5555555555f1';
const SESSION_B = '55555555-5555-4555-8555-5555555555f2';
const CLASS_A = '66666666-6666-4666-8666-6666666666f1';
const CLASS_B = '66666666-6666-4666-8666-6666666666f2';
const HEAD_TUITION = '88888888-8888-4888-8888-8888888888f1';
const HEAD_TRANSPORT = '88888888-8888-4888-8888-8888888888f2';

const AASIA = '77777777-7777-4777-8777-7777777777f1';
const BILAL = '77777777-7777-4777-8777-7777777777f2';
const CHAND = '77777777-7777-4777-8777-7777777777f3';
const FARAZ = '77777777-7777-4777-8777-7777777777f4';

const HOST_A = 'increment-a-e2e.localhost';
const PASSWORD = 'correct-horse-battery-staple';

/** Everyone is admitted on the session start, so "before admission" is testable. */
const ADMITTED = '2026-04-01';
const AGREED_FROM = '2026-04-01';

let app: NestFastifyApplication;
let admin: PrismaClient;
let jar = '';

async function wipe(): Promise<void> {
  const ids = [SCHOOL_A, SCHOOL_B];
  for (const table of [
    'student_fees',
    'enrollments',
    'students',
    'fee_heads',
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

/** The agreed amounts, as the fixture wants them. Re-applied between tests. */
async function resetFees(): Promise<void> {
  await admin.$executeRaw`
    DELETE FROM student_fees WHERE school_id IN (${SCHOOL_A}::uuid, ${SCHOOL_B}::uuid)
  `;
  await admin.$executeRaw`DELETE FROM job_runs WHERE school_id = ${SCHOOL_A}::uuid`;

  await admin.$executeRawUnsafe(
    `INSERT INTO student_fees (id, school_id, student_id, fee_head_id, amount, effective_from, created_at, updated_at)
     VALUES (gen_random_uuid(), $1::uuid, $2::uuid, $3::uuid, '5000.00'::numeric, $4::date, now(), now())`,
    SCHOOL_A,
    AASIA,
    HEAD_TUITION,
    AGREED_FROM,
  );
  await admin.$executeRawUnsafe(
    `INSERT INTO student_fees (id, school_id, student_id, fee_head_id, amount, discounted_amount, discount_reason, effective_from, created_at, updated_at)
     VALUES (gen_random_uuid(), $1::uuid, $2::uuid, $3::uuid, '5000.00'::numeric, '3500.00'::numeric, 'Sibling discount', $4::date, now(), now())`,
    SCHOOL_A,
    BILAL,
    HEAD_TUITION,
    AGREED_FROM,
  );
  // Aasia also takes the van, so a second head exists to prove an increment
  // touches only the one it was asked about.
  await admin.$executeRawUnsafe(
    `INSERT INTO student_fees (id, school_id, student_id, fee_head_id, amount, effective_from, created_at, updated_at)
     VALUES (gen_random_uuid(), $1::uuid, $2::uuid, $3::uuid, '2000.00'::numeric, $4::date, now(), now())`,
    SCHOOL_A,
    AASIA,
    HEAD_TRANSPORT,
    AGREED_FROM,
  );
  await admin.$executeRawUnsafe(
    `INSERT INTO student_fees (id, school_id, student_id, fee_head_id, amount, effective_from, created_at, updated_at)
     VALUES (gen_random_uuid(), $1::uuid, $2::uuid, $3::uuid, '5000.00'::numeric, $4::date, now(), now())`,
    SCHOOL_B,
    FARAZ,
    HEAD_TUITION,
    AGREED_FROM,
  );
}

beforeAll(async () => {
  admin = createAdminClient({ url: process.env['DATABASE_ADMIN_URL'] ?? '' });
  await wipe();

  await admin.$executeRaw`
    INSERT INTO schools (id, name, slug, created_at, updated_at) VALUES
      (${SCHOOL_A}::uuid, 'Increment E2E A', 'increment-a-e2e', now(), now()),
      (${SCHOOL_B}::uuid, 'Increment E2E B', 'increment-b-e2e', now(), now())
  `;

  const hash = await new PasswordService().hash(PASSWORD);
  await admin.$executeRaw`
    INSERT INTO users (id, school_id, email, name, password_hash, status, created_at, updated_at)
    VALUES (${USER_A}::uuid, ${SCHOOL_A}::uuid, 'head@increment-a-e2e.test', 'Head A', ${hash}, 'ACTIVE', now(), now())
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

  for (const [id, name, type, amount] of [
    [HEAD_TUITION, 'Tuition Fee', 'TUITION', '5000.00'],
    [HEAD_TRANSPORT, 'Transport Fee', 'TRANSPORT', '2000.00'],
  ] as const) {
    await admin.$executeRawUnsafe(
      `INSERT INTO fee_heads (id, school_id, type, name, default_amount, frequency, sort_order, created_at, updated_at)
       VALUES ($1::uuid, $2::uuid, $3::"fee_head_type", $4, $5::numeric, 'MONTHLY'::"fee_frequency", 0, now(), now())`,
      id,
      SCHOOL_A,
      type,
      name,
      amount,
    );
  }

  for (const [id, first, gr, school, session, classLevel] of [
    [AASIA, 'Aasia', 'GR-6001', SCHOOL_A, SESSION_A, CLASS_A],
    [BILAL, 'Bilal', 'GR-6002', SCHOOL_A, SESSION_A, CLASS_A],
    [CHAND, 'Chand', 'GR-6003', SCHOOL_A, SESSION_A, CLASS_A],
    [FARAZ, 'Faraz', 'GR-6004', SCHOOL_B, SESSION_B, CLASS_B],
  ] as const) {
    await admin.$executeRawUnsafe(
      `INSERT INTO students (id, school_id, gr_no, student_code, first_name, last_name, status, admitted_on, created_at, updated_at)
       VALUES ($1::uuid, $2::uuid, $3, $3, $4, 'Khan', 'ACTIVE', $5::date, now(), now())`,
      id,
      school,
      gr,
      first,
      ADMITTED,
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
    payload: { identifier: 'head@increment-a-e2e.test', password: PASSWORD },
  });
  const raw = signIn.headers['set-cookie'];
  const cookies = Array.isArray(raw) ? raw : [String(raw)];
  jar = cookies
    .map((entry) => entry.split(';')[0] ?? '')
    .filter((pair) => !pair.endsWith('='))
    .join('; ');
}, 90_000);

beforeEach(async () => {
  await resetFees();
});

afterAll(async () => {
  await app?.close();
  await wipe();
  await admin.$disconnect();
});

async function list(query = ''): Promise<{ status: number; data: FeeIncrementList }> {
  const response = await app.inject({
    method: 'GET',
    url: `${ROUTES.feeIncrements.list}${query}`,
    headers: { host: HOST_A, cookie: jar },
  });
  return { status: response.statusCode, data: response.json<{ data: FeeIncrementList }>().data };
}

let keySeq = 0;

async function apply(
  body: Partial<Record<string, unknown>>,
): Promise<{ status: number; raw: string; data: FeeIncrementResult }> {
  keySeq += 1;
  const response = await app.inject({
    method: 'POST',
    url: ROUTES.feeIncrements.apply,
    headers: { host: HOST_A, cookie: jar },
    payload: {
      feeHeadId: HEAD_TUITION,
      direction: 'INCREASE',
      amountMinor: 50_000,
      effectiveFrom: '2026-10-01',
      idempotencyKey: `increment-e2e-key-${String(keySeq).padStart(4, '0')}`,
      ...body,
    },
  });
  return {
    status: response.statusCode,
    raw: response.body,
    data: response.json<{ data: FeeIncrementResult }>().data,
  };
}

async function history(studentId: string): Promise<FeeHistory> {
  const response = await app.inject({
    method: 'GET',
    url: ROUTES.feeIncrements.history(studentId),
    headers: { host: HOST_A, cookie: jar },
  });
  return response.json<{ data: FeeHistory }>().data;
}

function rowFor(data: FeeIncrementList, grNo: string) {
  return data.rows.find((row) => row.grNo === grNo);
}

describe('what the list shows', () => {
  it('names the head whose amounts are on screen', async () => {
    const { status, data } = await list();

    expect(status).toBe(200);
    expect(data.feeHead.name).toBe('Tuition Fee');
  });

  it('shows each child their own agreed amount', async () => {
    const { data } = await list();

    expect(rowFor(data, 'GR-6001')?.currentFeeMinor).toBe(500_000);
    expect(rowFor(data, 'GR-6002')?.currentFeeMinor).toBe(500_000);
    // Chand has no tuition agreed at all, which is not the same as zero.
    expect(rowFor(data, 'GR-6003')?.currentFeeMinor).toBeNull();
  });

  it('shows what a discounted family is actually billed, and why', async () => {
    const { data } = await list();
    const bilal = rowFor(data, 'GR-6002');

    expect(bilal?.currentFeeMinor).toBe(500_000);
    expect(bilal?.currentPayableMinor).toBe(350_000);
    expect(bilal?.discountReason).toBe('Sibling discount');
  });

  it('never shows another school’s students', async () => {
    const { data } = await list();

    expect(data.rows.map((row) => row.grNo)).not.toContain('GR-6004');
  });

  it('narrows to a GR range, compared as numbers rather than text', async () => {
    const { data } = await list('?grFrom=GR-6001&grTo=GR-6002');

    expect(data.rows.map((row) => row.grNo)).toEqual(['GR-6001', 'GR-6002']);
  });
});

describe('applying a change', () => {
  it('moves every child by the same amount, from their own fee', async () => {
    const applied = await apply({ studentIds: [AASIA, BILAL] });
    expect(applied.data.applied).toBe(2);

    const { data } = await list();

    // Aasia: 5,000 → 5,500. Bilal: 5,000 → 5,500 gross, still less 1,500.
    expect(rowFor(data, 'GR-6001')?.pendingFeeMinor).toBe(550_000);
    expect(rowFor(data, 'GR-6002')?.pendingFeeMinor).toBe(550_000);
    expect(rowFor(data, 'GR-6002')?.pendingPayableMinor).toBe(400_000);
  });

  it('carries a discount forward as the same concession, not the same total', async () => {
    await apply({ studentIds: [BILAL] });
    const { data } = await list();
    const bilal = rowFor(data, 'GR-6002');

    // The discount stays 1,500. Carrying the *discounted amount* unchanged
    // would shrink it to 1,000 and quietly bill the family 500 more.
    expect((bilal?.pendingFeeMinor ?? 0) - (bilal?.pendingPayableMinor ?? 0)).toBe(150_000);
  });

  it('leaves today’s fee alone when the change starts in the future', async () => {
    await apply({ studentIds: [AASIA], effectiveFrom: '2027-01-01' });
    const { data } = await list();
    const aasia = rowFor(data, 'GR-6001');

    expect(aasia?.currentFeeMinor).toBe(500_000);
    expect(aasia?.pendingFrom).toBe('2027-01-01');
    expect(aasia?.pendingFeeMinor).toBe(550_000);
  });

  it('touches only the head it was asked about', async () => {
    await apply({ studentIds: [AASIA] });

    const timeline = await history(AASIA);
    const transport = timeline.entries.filter((entry) => entry.feeHeadId === HEAD_TRANSPORT);

    expect(transport).toHaveLength(1);
    expect(transport[0]?.amountMinor).toBe(200_000);
  });

  it('decreases as readily as it increases', async () => {
    await apply({ studentIds: [AASIA], direction: 'DECREASE', amountMinor: 100_000 });
    const { data } = await list();

    expect(rowFor(data, 'GR-6001')?.pendingFeeMinor).toBe(400_000);
  });

  it('builds on a rise already scheduled before it', async () => {
    await apply({ studentIds: [AASIA], effectiveFrom: '2026-10-01' });
    await apply({ studentIds: [AASIA], effectiveFrom: '2026-11-01' });

    const timeline = await history(AASIA);
    const tuition = timeline.entries
      .filter((entry) => entry.feeHeadId === HEAD_TUITION)
      .map((entry) => [entry.effectiveFrom, entry.amountMinor]);

    // 5,000 → 5,500 in October → 6,000 in November. The second increment prices
    // against October, not against today.
    expect(tuition).toEqual([
      ['2026-11-01', 600_000],
      ['2026-10-01', 550_000],
      [AGREED_FROM, 500_000],
    ]);
  });
});

describe('who gets skipped, and why', () => {
  it('refuses a child with no agreed amount rather than inventing one', async () => {
    const { data } = await apply({ studentIds: [CHAND] });

    expect(data.applied).toBe(0);
    expect(data.skips).toEqual([
      expect.objectContaining({ grNo: 'GR-6003', reason: 'NO_AGREED_AMOUNT' }),
    ]);
  });

  it('refuses a decrease that would take a fee below zero', async () => {
    const { data } = await apply({
      studentIds: [AASIA],
      direction: 'DECREASE',
      amountMinor: 900_000,
    });

    expect(data.applied).toBe(0);
    expect(data.skips[0]?.reason).toBe('WOULD_GO_NEGATIVE');
  });

  it('refuses a date before the child was admitted', async () => {
    const { data } = await apply({ studentIds: [AASIA], effectiveFrom: '2026-01-01' });

    expect(data.applied).toBe(0);
    expect(data.skips[0]?.reason).toBe('BEFORE_ADMISSION');
  });

  it('refuses a second change dated the same day', async () => {
    await apply({ studentIds: [AASIA], effectiveFrom: '2026-10-01' });
    const second = await apply({ studentIds: [AASIA], effectiveFrom: '2026-10-01' });

    expect(second.data.applied).toBe(0);
    expect(second.data.skips[0]?.reason).toBe('ALREADY_APPLIED');
  });

  it('refuses a student who is not in this school', async () => {
    const { data } = await apply({ studentIds: [FARAZ] });

    expect(data.applied).toBe(0);
    expect(data.skips[0]?.reason).toBe('NOT_FOUND');
  });

  it('applies the rest of a batch around a student it cannot change', async () => {
    const { data } = await apply({ studentIds: [AASIA, CHAND, BILAL] });

    // Two raised, one reported — never all-or-nothing on a business skip, and
    // never silently two out of three.
    expect(data.applied).toBe(2);
    expect(data.skipped).toBe(1);
    expect(data.skips[0]?.grNo).toBe('GR-6003');
  });

  it('rejects a zero or negative amount at the boundary', async () => {
    for (const amountMinor of [0, -50_000]) {
      const { status } = await apply({ studentIds: [AASIA], amountMinor });
      expect(status).toBe(400);
    }
  });

  it('refuses more students than a person could have meant', async () => {
    const { status } = await apply({ studentIds: Array.from({ length: 501 }, () => AASIA) });

    expect(status).toBe(400);
  });
});

describe('pressing Submit twice', () => {
  it('returns the first answer instead of raising fees again', async () => {
    const key = 'increment-e2e-replay-0001';
    const first = await apply({ studentIds: [AASIA, BILAL], idempotencyKey: key });
    const second = await apply({ studentIds: [AASIA, BILAL], idempotencyKey: key });

    expect(first.data.replayed).toBe(false);
    expect(second.data.replayed).toBe(true);
    expect(second.data.applied).toBe(first.data.applied);

    // And the timeline has one new row, not two.
    const timeline = await history(AASIA);
    expect(timeline.entries.filter((entry) => entry.feeHeadId === HEAD_TUITION)).toHaveLength(2);
  });
});

describe('the fee history dialog', () => {
  it('lists the timeline newest first, marking what is current and what is scheduled', async () => {
    await apply({ studentIds: [AASIA], effectiveFrom: '2027-01-01' });
    const timeline = await history(AASIA);
    const tuition = timeline.entries.filter((entry) => entry.feeHeadId === HEAD_TUITION);

    expect(tuition[0]?.effectiveFrom).toBe('2027-01-01');
    expect(tuition[0]?.isScheduled).toBe(true);
    expect(tuition[0]?.isCurrent).toBe(false);

    expect(tuition[1]?.effectiveFrom).toBe(AGREED_FROM);
    expect(tuition[1]?.isCurrent).toBe(true);
  });

  it('names the head and its type, for the tag beside each row', async () => {
    const timeline = await history(AASIA);

    expect(timeline.entries.map((entry) => entry.feeHeadName).sort()).toEqual([
      'Transport Fee',
      'Tuition Fee',
    ]);
    // Lower case: it is a tag in the UI, not the database enum.
    expect(timeline.entries.find((entry) => entry.feeHeadId === HEAD_TUITION)?.feeHeadType).toBe(
      'tuition',
    );
  });

  it('removes a mistaken increment', async () => {
    await apply({ studentIds: [AASIA], effectiveFrom: '2027-01-01' });
    const before = await history(AASIA);
    const scheduled = before.entries.find((entry) => entry.isScheduled);

    const removed = await app.inject({
      method: 'DELETE',
      url: ROUTES.feeIncrements.historyEntry(scheduled?.id ?? ''),
      headers: { host: HOST_A, cookie: jar },
    });
    expect(removed.statusCode).toBe(200);

    const after = await history(AASIA);
    expect(after.entries).toHaveLength(before.entries.length - 1);
    // And the fee is back to what it was.
    const { data } = await list();
    expect(rowFor(data, 'GR-6001')?.pendingFrom).toBeNull();
    expect(rowFor(data, 'GR-6001')?.currentFeeMinor).toBe(500_000);
  });

  it('refuses to remove the only amount a head has', async () => {
    const timeline = await history(AASIA);
    const only = timeline.entries.find((entry) => entry.feeHeadId === HEAD_TRANSPORT);

    const removed = await app.inject({
      method: 'DELETE',
      url: ROUTES.feeIncrements.historyEntry(only?.id ?? ''),
      headers: { host: HOST_A, cookie: jar },
    });

    // Leaving a head with no amount at all would make it unbillable in a way
    // nothing on the screen would explain.
    expect(removed.statusCode).toBe(422);
    expect(removed.body).toContain('FEES_LAST_AMOUNT');
  });

  it('never reaches into another school’s timeline', async () => {
    const response = await app.inject({
      method: 'GET',
      url: ROUTES.feeIncrements.history(FARAZ),
      headers: { host: HOST_A, cookie: jar },
    });

    expect(response.statusCode).toBe(404);
  });
});
