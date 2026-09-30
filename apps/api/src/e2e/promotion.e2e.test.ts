import { ROUTES, type PromotionPreview, type PromotionResult } from '@ilm/contracts';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { Test } from '@nestjs/testing';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { AppModule } from '../app.module';
import { createAdminClient, type PrismaClient } from '../prisma';
import { PasswordService } from '../shared/auth/password.service';

/**
 * Carrying a school from one session into the next.
 *
 * The scenario that prompted this is the one every school hits in its first
 * year on the product: fifteen children enrolled in 2025-2026, two new
 * admissions taken straight into 2026-2027, and a fee run for the new session
 * that finds two students. The fifteen are not missing — they were never moved,
 * because moving them is a decision and not a side effect of a date passing.
 *
 * What is proved here is that the run which moves them is safe to press twice.
 * It touches every child in the school, so "what happens on a retry" is not an
 * edge case — it is the second thing anybody does when a request times out.
 */

const SCHOOL_A = '33333333-3333-4333-8333-3333333333da';
const SCHOOL_B = '33333333-3333-4333-8333-3333333333db';
const OWNER_A = '44444444-4444-4444-8444-4444444444da';
const OWNER_B = '44444444-4444-4444-8444-4444444444db';
const TEACHER_A = '44444444-4444-4444-8444-4444444444dc';

const OLD_SESSION = '55555555-5555-4555-8555-555555555501';
const NEW_SESSION = '55555555-5555-4555-8555-555555555502';
const B_SESSION = '55555555-5555-4555-8555-555555555503';

const GRADE_1 = '66666666-6666-4666-8666-666666666601';
const GRADE_2 = '66666666-6666-4666-8666-666666666602';
const GRADE_3 = '66666666-6666-4666-8666-666666666603';

const HOST_A = 'promo-a-e2e.localhost';
const HOST_B = 'promo-b-e2e.localhost';
const PASSWORD = 'correct-horse-battery-staple';

/** Deterministic ids, so a failure names the child rather than a uuid. */
function studentId(n: number): string {
  return `77777777-7777-4777-8777-7777777777${String(n).padStart(2, '0')}`;
}

let app: NestFastifyApplication;
let admin: PrismaClient;
let ownerA = '';
let ownerB = '';
let teacherA = '';

async function wipe(): Promise<void> {
  for (const school of [SCHOOL_A, SCHOOL_B]) {
    for (const table of [
      'enrollments',
      'students',
      'sections',
      'academic_sessions',
      'class_levels',
      'job_runs',
      'audit_logs',
      'sessions',
      'user_roles',
      'users',
    ]) {
      await admin.$executeRawUnsafe(`DELETE FROM ${table} WHERE school_id = $1::uuid`, school);
    }
  }
  await admin.$executeRaw`DELETE FROM schools WHERE id IN (${SCHOOL_A}::uuid, ${SCHOOL_B}::uuid)`;
}

beforeAll(async () => {
  admin = createAdminClient({ url: process.env['DATABASE_ADMIN_URL'] ?? '' });
  await wipe();

  await admin.$executeRaw`
    INSERT INTO schools (id, name, slug, currency, country, created_at, updated_at) VALUES
      (${SCHOOL_A}::uuid, 'Promo E2E A', 'promo-a-e2e', 'PKR', 'PK', now(), now()),
      (${SCHOOL_B}::uuid, 'Promo E2E B', 'promo-b-e2e', 'PKR', 'PK', now(), now())
  `;

  const hash = await new PasswordService().hash(PASSWORD);
  for (const [user, school, email, role] of [
    [OWNER_A, SCHOOL_A, 'head@promo-a.test', 'OWNER'],
    [OWNER_B, SCHOOL_B, 'head@promo-b.test', 'OWNER'],
    [TEACHER_A, SCHOOL_A, 'teacher@promo-a.test', 'TEACHER'],
  ] as const) {
    await admin.$executeRawUnsafe(
      `INSERT INTO users (id, school_id, email, name, password_hash, status, created_at, updated_at)
       VALUES ($1::uuid, $2::uuid, $3, 'Staff', $4, 'ACTIVE', now(), now())`,
      user,
      school,
      email,
      hash,
    );
    await admin.$executeRawUnsafe(
      `INSERT INTO user_roles (id, school_id, user_id, role, created_at)
       VALUES (gen_random_uuid(), $1::uuid, $2::uuid, $3::school_role, now())`,
      school,
      user,
      role,
    );
  }

  // Nursery is 0 and the grades are 10, 20, 30 — deliberately not consecutive,
  // because "the next class" is the next one that exists and not `order + 1`.
  await admin.$executeRaw`
    INSERT INTO class_levels (id, school_id, name, numeric_order, is_active, created_at, updated_at) VALUES
      (${GRADE_1}::uuid, ${SCHOOL_A}::uuid, 'Grade 1', 10, true, now(), now()),
      (${GRADE_2}::uuid, ${SCHOOL_A}::uuid, 'Grade 2', 20, true, now(), now()),
      (${GRADE_3}::uuid, ${SCHOOL_A}::uuid, 'Grade 3', 30, true, now(), now())
  `;

  await admin.$executeRaw`
    INSERT INTO academic_sessions (id, school_id, name, start_date, end_date, status, is_current, created_at, updated_at) VALUES
      (${OLD_SESSION}::uuid, ${SCHOOL_A}::uuid, '2025-2026', '2025-08-01', '2026-06-30', 'ACTIVE', true, now(), now()),
      (${NEW_SESSION}::uuid, ${SCHOOL_A}::uuid, '2026-2027', '2026-08-01', '2027-06-30', 'PLANNED', false, now(), now()),
      (${B_SESSION}::uuid, ${SCHOOL_B}::uuid, '2025-2026', '2025-08-01', '2026-06-30', 'ACTIVE', true, now(), now())
  `;

  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  app = moduleRef.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
  const { default: cookie } = await import('@fastify/cookie');
  await app.register(cookie);
  await app.init();
  await app.getHttpAdapter().getInstance().ready();

  ownerA = await signIn(HOST_A, 'head@promo-a.test');
  ownerB = await signIn(HOST_B, 'head@promo-b.test');
  teacherA = await signIn(HOST_A, 'teacher@promo-a.test');
}, 90_000);

async function signIn(host: string, identifier: string): Promise<string> {
  const response = await app.inject({
    method: 'POST',
    url: ROUTES.auth.login,
    headers: { host },
    payload: { identifier, password: PASSWORD },
  });
  const raw = response.headers['set-cookie'];
  const cookies = Array.isArray(raw) ? raw : [String(raw)];
  return cookies
    .map((entry) => entry.split(';')[0] ?? '')
    .filter((pair) => !pair.endsWith('='))
    .join('; ');
}

/**
 * The school the screenshots showed: fifteen in the old session, two admitted
 * straight into the new one.
 */
async function seedRoll(): Promise<void> {
  await admin.$executeRaw`DELETE FROM enrollments WHERE school_id = ${SCHOOL_A}::uuid`;
  await admin.$executeRaw`DELETE FROM students WHERE school_id = ${SCHOOL_A}::uuid`;
  await admin.$executeRaw`DELETE FROM job_runs WHERE school_id = ${SCHOOL_A}::uuid`;
  await admin.$executeRaw`DELETE FROM audit_logs WHERE school_id = ${SCHOOL_A}::uuid`;

  for (let n = 1; n <= 17; n += 1) {
    await admin.$executeRawUnsafe(
      `INSERT INTO students (id, school_id, gr_no, student_code, first_name, last_name, status, created_at, updated_at)
       VALUES ($1::uuid, $2::uuid, $3, $3, $4, 'Test', 'ACTIVE', now(), now())`,
      studentId(n),
      SCHOOL_A,
      String(1000 + n),
      `Child${String(n)}`,
    );
  }

  // Fifteen in the old session: ten in Grade 1, five in Grade 3 (the top).
  for (let n = 1; n <= 15; n += 1) {
    await admin.$executeRawUnsafe(
      `INSERT INTO enrollments (id, school_id, student_id, session_id, class_level_id, status, created_at, updated_at)
       VALUES (gen_random_uuid(), $1::uuid, $2::uuid, $3::uuid, $4::uuid, 'ENROLLED', now(), now())`,
      SCHOOL_A,
      studentId(n),
      OLD_SESSION,
      n <= 10 ? GRADE_1 : GRADE_3,
    );
  }

  // Two admitted directly into the new session.
  for (const n of [16, 17]) {
    await admin.$executeRawUnsafe(
      `INSERT INTO enrollments (id, school_id, student_id, session_id, class_level_id, status, created_at, updated_at)
       VALUES (gen_random_uuid(), $1::uuid, $2::uuid, $3::uuid, $4::uuid, 'ENROLLED', now(), now())`,
      SCHOOL_A,
      studentId(n),
      NEW_SESSION,
      GRADE_1,
    );
  }
}

beforeEach(async () => {
  await seedRoll();
});

afterAll(async () => {
  await app?.close();
  await wipe();
  await admin.$disconnect();
});

async function preview(from = OLD_SESSION, to = NEW_SESSION, jar = ownerA, host = HOST_A) {
  const response = await app.inject({
    method: 'GET',
    url: `${ROUTES.academics.promotionPreview}?fromSessionId=${from}&toSessionId=${to}`,
    headers: { host, cookie: jar },
  });
  return {
    status: response.statusCode,
    data:
      response.statusCode === 200 ? response.json<{ data: PromotionPreview }>().data : undefined,
  };
}

async function promote(body: Record<string, unknown>, jar = ownerA, host = HOST_A) {
  const response = await app.inject({
    method: 'POST',
    url: ROUTES.academics.promotions,
    headers: { host, cookie: jar },
    payload: body,
  });
  return {
    status: response.statusCode,
    data: response.statusCode < 300 ? response.json<{ data: PromotionResult }>().data : undefined,
  };
}

/** Everyone enrolled in a session, by class. */
async function rollOf(sessionId: string): Promise<{ student_id: string; class_level_id: string }[]> {
  return admin.$queryRawUnsafe(
    `SELECT student_id, class_level_id FROM enrollments
      WHERE session_id = $1::uuid AND status = 'ENROLLED' ORDER BY student_id`,
    sessionId,
  );
}

/**
 * The ordinary rollover: everyone up one, and the top form passes out.
 *
 * Grade 3 is the top class here, which is the whole of what makes it the
 * graduating one. The same shape covers O3 at an O-Level school, Grade 10 at a
 * matriculation one, and Grade 5 at a primary — the product never learns which
 * system it is looking at.
 */
const ORDINARY_ROLLOVER = [
  { fromClassLevelId: GRADE_1, action: 'MOVE' as const, toClassLevelId: GRADE_2 },
  { fromClassLevelId: GRADE_3, action: 'GRADUATE' as const },
];

describe('the preview', () => {
  it('counts who would move and who is already there', async () => {
    const { status, data } = await preview();

    expect(status).toBe(200);
    expect(data?.from.name).toBe('2025-2026');
    expect(data?.to.name).toBe('2026-2027');

    const grade1 = data?.classes.find((row) => row.classLevelId === GRADE_1);
    expect(grade1?.toMove).toBe(10);
    // The two admitted straight into next year. This is the number that makes
    // "15 students but the run says 13" answerable.
    expect(grade1?.alreadyThere).toBe(2);
  });

  it('suggests the next class that exists, not the next number', async () => {
    // Grade 1 is 10 and Grade 2 is 20. `order + 1` would find nothing.
    const { data } = await preview();

    const grade1 = data?.classes.find((row) => row.classLevelId === GRADE_1);
    expect(grade1?.suggestedToClassName).toBe('Grade 2');
  });

  it('suggests nothing above the top class', async () => {
    const { data } = await preview();

    const grade3 = data?.classes.find((row) => row.classLevelId === GRADE_3);
    expect(grade3?.suggestedToClassLevelId).toBeNull();
    expect(grade3?.toMove).toBe(5);
  });

  it('leaves out classes neither session uses', async () => {
    const { data } = await preview();
    expect(data?.classes.map((row) => row.className)).not.toContain('Grade 2');
  });

  it('refuses a session belonging to another school', async () => {
    // RLS hides B's session from A, so this is a 404 rather than a leak.
    expect((await preview(OLD_SESSION, B_SESSION)).status).toBe(404);
  });
});

describe('running it', () => {
  it('moves the fifteen and leaves the two alone', async () => {
    const { status, data } = await promote({
      idempotencyKey: '11111111-1111-4111-8111-111111111101',
      fromSessionId: OLD_SESSION,
      toSessionId: NEW_SESSION,
      moves: ORDINARY_ROLLOVER,
    });

    // 201: a promotion run creates a job run, and Nest answers POST that way.
    expect(status).toBe(201);
    expect(data?.promoted).toBe(10);
    // Grade 3 is the top form, so its five pass out rather than being skipped.
    expect(data?.graduated).toBe(5);
    expect(data?.skipped).toBe(0);

    const roll = await rollOf(NEW_SESSION);
    // Ten promoted into Grade 2, plus the two already admitted.
    expect(roll).toHaveLength(12);
    expect(roll.filter((row) => row.class_level_id === GRADE_2)).toHaveLength(10);
  });

  it('marks the old enrolment PROMOTED rather than deleting it', async () => {
    // The old year has to stay readable: last year's register, last year's
    // attendance and last year's vouchers all point at it.
    await promote({
      idempotencyKey: '11111111-1111-4111-8111-111111111102',
      fromSessionId: OLD_SESSION,
      toSessionId: NEW_SESSION,
      moves: ORDINARY_ROLLOVER,
    });

    const statuses = await admin.$queryRawUnsafe<{ status: string; n: bigint }[]>(
      `SELECT status, count(*) AS n FROM enrollments
        WHERE session_id = $1::uuid GROUP BY status ORDER BY status`,
      OLD_SESSION,
    );

    expect(Object.fromEntries(statuses.map((row) => [row.status, Number(row.n)]))).toEqual({
      // Ten moved up and five passed out. Graduating *promotes* an enrolment
      // out of its class — the enrolment's own vocabulary, not the student's,
      // and the same one `StudentsService.setStatus` already uses.
      PROMOTED: 15,
    });
  });

  it('never marks anybody as having left', async () => {
    // A child who was not carried forward is not a child who left. Leaving is
    // recorded on the student by somebody who meant it.
    await promote({
      idempotencyKey: '11111111-1111-4111-8111-111111111103',
      fromSessionId: OLD_SESSION,
      toSessionId: NEW_SESSION,
      moves: [{ fromClassLevelId: GRADE_1, action: 'MOVE', toClassLevelId: GRADE_2 }],
    });

    const left = await admin.$queryRawUnsafe<{ n: bigint }[]>(
      `SELECT count(*) AS n FROM enrollments WHERE school_id = $1::uuid AND status = 'LEFT'`,
      SCHOOL_A,
    );
    expect(Number(left[0]?.n)).toBe(0);
  });

  it('holds a repeating student in the same class and says so', async () => {
    await promote({
      idempotencyKey: '11111111-1111-4111-8111-111111111104',
      fromSessionId: OLD_SESSION,
      toSessionId: NEW_SESSION,
      moves: ORDINARY_ROLLOVER,
      repeat: [studentId(1)],
    });

    const roll = await rollOf(NEW_SESSION);
    const repeater = roll.find((row) => row.student_id === studentId(1));
    expect(repeater?.class_level_id).toBe(GRADE_1);

    const old = await admin.$queryRawUnsafe<{ status: string }[]>(
      `SELECT status FROM enrollments WHERE session_id = $1::uuid AND student_id = $2::uuid`,
      OLD_SESSION,
      studentId(1),
    );
    // A register that cannot tell promoted from held back cannot answer "how
    // many did we hold back".
    expect(old[0]?.status).toBe('REPEATED');
  });

  it('leaves an excluded student entirely alone', async () => {
    await promote({
      idempotencyKey: '11111111-1111-4111-8111-111111111105',
      fromSessionId: OLD_SESSION,
      toSessionId: NEW_SESSION,
      moves: ORDINARY_ROLLOVER,
      exclude: [studentId(2)],
    });

    const roll = await rollOf(NEW_SESSION);
    expect(roll.map((row) => row.student_id)).not.toContain(studentId(2));

    const old = await admin.$queryRawUnsafe<{ status: string }[]>(
      `SELECT status FROM enrollments WHERE session_id = $1::uuid AND student_id = $2::uuid`,
      OLD_SESSION,
      studentId(2),
    );
    expect(old[0]?.status).toBe('ENROLLED');
  });

  it('moves only the classes it was asked to', async () => {
    const { data } = await promote({
      idempotencyKey: '11111111-1111-4111-8111-111111111106',
      fromSessionId: OLD_SESSION,
      toSessionId: NEW_SESSION,
      moves: [{ fromClassLevelId: GRADE_3, action: 'MOVE', toClassLevelId: GRADE_1 }],
    });

    // Grade 1 was left out of `moves`, so its ten stay where they are.
    expect(data?.promoted).toBe(5);
    expect(data?.skipped).toBe(10);
  });

  it('writes one audit row for the run, not one per child', async () => {
    await promote({
      idempotencyKey: '11111111-1111-4111-8111-111111111107',
      fromSessionId: OLD_SESSION,
      toSessionId: NEW_SESSION,
      moves: ORDINARY_ROLLOVER,
    });

    const entries = await admin.$queryRawUnsafe<{ after: unknown }[]>(
      `SELECT after FROM audit_logs
        WHERE school_id = $1::uuid AND action = 'academics.promotion.run'`,
      SCHOOL_A,
    );

    expect(entries).toHaveLength(1);
    expect((entries[0]?.after as { promoted: number }).promoted).toBe(10);
  });
});

/**
 * The top of the school.
 *
 * Whatever a school calls its last class — O3, Grade 10, Grade 5 at a primary —
 * it is the one with no class above it, and that single rule is the whole of
 * the product's knowledge of school structures. Nothing here knows what
 * "O-Level" or "matriculation" means, and nothing needs to.
 */
describe('passing out', () => {
  const KEY = '11111111-1111-4111-8111-111111111501';

  it('marks the student GRADUATED and ends their enrolment', async () => {
    await promote({
      idempotencyKey: KEY,
      fromSessionId: OLD_SESSION,
      toSessionId: NEW_SESSION,
      moves: ORDINARY_ROLLOVER,
    });

    const leaver = await admin.$queryRawUnsafe<{ status: string; left_on: Date | null }[]>(
      `SELECT status, left_on FROM students WHERE id = $1::uuid`,
      studentId(11),
    );

    expect(leaver[0]?.status).toBe('GRADUATED');
    // The outgoing year's last day, not today: a rollover run in August must
    // not record thirty children as having left in August.
    expect(leaver[0]?.left_on?.toISOString().slice(0, 10)).toBe('2026-06-30');

    const enrolment = await admin.$queryRawUnsafe<{ status: string; ended_on: Date | null }[]>(
      `SELECT status, ended_on FROM enrollments WHERE session_id = $1::uuid AND student_id = $2::uuid`,
      OLD_SESSION,
      studentId(11),
    );
    expect(enrolment[0]?.status).toBe('PROMOTED');
    expect(enrolment[0]?.ended_on?.toISOString().slice(0, 10)).toBe('2026-06-30');
  });

  it('does not enrol a leaver in the new session', async () => {
    await promote({
      idempotencyKey: '11111111-1111-4111-8111-111111111502',
      fromSessionId: OLD_SESSION,
      toSessionId: NEW_SESSION,
      moves: ORDINARY_ROLLOVER,
    });

    const roll = await rollOf(NEW_SESSION);
    expect(roll.map((row) => row.student_id)).not.toContain(studentId(11));
  });

  it('holds back a repeating student rather than passing them out with their year', async () => {
    // The case that would be a quiet disaster: a child kept down in the top
    // form, marked as having finished the school alongside the classmates they
    // were held back from.
    await promote({
      idempotencyKey: '11111111-1111-4111-8111-111111111503',
      fromSessionId: OLD_SESSION,
      toSessionId: NEW_SESSION,
      moves: ORDINARY_ROLLOVER,
      repeat: [studentId(11)],
    });

    const student = await admin.$queryRawUnsafe<{ status: string }[]>(
      `SELECT status FROM students WHERE id = $1::uuid`,
      studentId(11),
    );
    expect(student[0]?.status).toBe('ACTIVE');

    const roll = await rollOf(NEW_SESSION);
    expect(roll.find((row) => row.student_id === studentId(11))?.class_level_id).toBe(GRADE_3);
  });

  it('leaves an excluded top-form student entirely alone', async () => {
    await promote({
      idempotencyKey: '11111111-1111-4111-8111-111111111504',
      fromSessionId: OLD_SESSION,
      toSessionId: NEW_SESSION,
      moves: ORDINARY_ROLLOVER,
      exclude: [studentId(12)],
    });

    const student = await admin.$queryRawUnsafe<{ status: string }[]>(
      `SELECT status FROM students WHERE id = $1::uuid`,
      studentId(12),
    );
    expect(student[0]?.status).toBe('ACTIVE');
  });

  it('does not pass out a class that was only left undecided', async () => {
    // An absent class means "do not touch these children". A year group nobody
    // has decided about is not a year group that has finished.
    await promote({
      idempotencyKey: '11111111-1111-4111-8111-111111111505',
      fromSessionId: OLD_SESSION,
      toSessionId: NEW_SESSION,
      moves: [{ fromClassLevelId: GRADE_1, action: 'MOVE', toClassLevelId: GRADE_2 }],
    });

    const graduated = await admin.$queryRawUnsafe<{ n: bigint }[]>(
      `SELECT count(*) AS n FROM students WHERE school_id = $1::uuid AND status = 'GRADUATED'`,
      SCHOOL_A,
    );
    expect(Number(graduated[0]?.n)).toBe(0);
  });

  it('cannot pass the same child out twice', async () => {
    await promote({
      idempotencyKey: '11111111-1111-4111-8111-111111111506',
      fromSessionId: OLD_SESSION,
      toSessionId: NEW_SESSION,
      moves: ORDINARY_ROLLOVER,
    });

    // A fresh key over an already-rolled school. Their enrolment is no longer
    // ENROLLED, so the batch query cannot see them at all.
    const again = await promote({
      idempotencyKey: '11111111-1111-4111-8111-111111111507',
      fromSessionId: OLD_SESSION,
      toSessionId: NEW_SESSION,
      moves: ORDINARY_ROLLOVER,
    });

    expect(again.data?.graduated).toBe(0);
  });

  it('keeps a leaver out of every later fee run', async () => {
    // The reason this matters at all: a passed-out child who stays ACTIVE is a
    // child whose family keeps receiving vouchers.
    await promote({
      idempotencyKey: '11111111-1111-4111-8111-111111111508',
      fromSessionId: OLD_SESSION,
      toSessionId: NEW_SESSION,
      moves: ORDINARY_ROLLOVER,
    });

    const active = await admin.$queryRawUnsafe<{ n: bigint }[]>(
      `SELECT count(*) AS n FROM students WHERE school_id = $1::uuid AND status = 'ACTIVE'`,
      SCHOOL_A,
    );
    // Seventeen on the roll, five passed out.
    expect(Number(active[0]?.n)).toBe(12);
  });
});

describe('the top class, whatever a school calls it', () => {
  it('suggests passing out from the highest class the school created', async () => {
    const { data } = await preview();

    // Grade 3 here. At an O-Level school it is O3; at a matriculation school
    // Grade 10; at a primary school that stops at Grade 5, Grade 5. The rule
    // is the same one in every case.
    const top = data?.classes.find((row) => row.classLevelId === GRADE_3);
    expect(top?.suggestedAction).toBe('GRADUATE');
    expect(top?.suggestedToClassLevelId).toBeNull();

    const middle = data?.classes.find((row) => row.classLevelId === GRADE_1);
    expect(middle?.suggestedAction).toBe('MOVE');
  });

  it('counts the leavers separately from the movers', async () => {
    const { data } = await preview();

    expect(data?.totalToMove).toBe(10);
    expect(data?.totalToGraduate).toBe(5);
  });
});

describe('pressing it twice', () => {
  const KEY = '11111111-1111-4111-8111-111111111201';

  it('replays the same key instead of running again', async () => {
    const body = {
      idempotencyKey: KEY,
      fromSessionId: OLD_SESSION,
      toSessionId: NEW_SESSION,
      moves: ORDINARY_ROLLOVER,
    };

    const first = await promote(body);
    const second = await promote(body);

    expect(first.data?.replayed).toBe(false);
    expect(second.data?.replayed).toBe(true);
    expect(second.data?.promoted).toBe(first.data?.promoted);
    expect(second.data?.jobRunId).toBe(first.data?.jobRunId);

    // And nothing was written a second time.
    expect(await rollOf(NEW_SESSION)).toHaveLength(12);
  });

  it('is safe under a *new* key over an already-moved school', async () => {
    // The case a replay does not cover: somebody runs it again next week with a
    // fresh key. Every child is already in the new session, so every one is
    // skipped rather than colliding with the unique constraint.
    await promote({
      idempotencyKey: '11111111-1111-4111-8111-111111111202',
      fromSessionId: OLD_SESSION,
      toSessionId: NEW_SESSION,
      moves: ORDINARY_ROLLOVER,
    });

    const again = await promote({
      idempotencyKey: '11111111-1111-4111-8111-111111111203',
      fromSessionId: OLD_SESSION,
      toSessionId: NEW_SESSION,
      moves: ORDINARY_ROLLOVER,
    });

    expect(again.status).toBe(201);
    expect(again.data?.promoted).toBe(0);
    expect(await rollOf(NEW_SESSION)).toHaveLength(12);
  });
});

describe('what it refuses', () => {
  it('refuses the same session twice', async () => {
    const { status } = await promote({
      idempotencyKey: '11111111-1111-4111-8111-111111111301',
      fromSessionId: OLD_SESSION,
      toSessionId: OLD_SESSION,
      moves: [],
    });
    expect(status).toBe(400);
  });

  it('refuses a student who both repeats and is excluded', async () => {
    const { status } = await promote({
      idempotencyKey: '11111111-1111-4111-8111-111111111302',
      fromSessionId: OLD_SESSION,
      toSessionId: NEW_SESSION,
      moves: ORDINARY_ROLLOVER,
      repeat: [studentId(1)],
      exclude: [studentId(1)],
    });
    expect(status).toBe(400);
  });

  it('refuses a teacher, and moves nobody', async () => {
    const { status } = await promote(
      {
        idempotencyKey: '11111111-1111-4111-8111-111111111303',
        fromSessionId: OLD_SESSION,
        toSessionId: NEW_SESSION,
        moves: ORDINARY_ROLLOVER,
      },
      teacherA,
    );

    expect(status).toBe(403);
    expect(await rollOf(NEW_SESSION)).toHaveLength(2);
  });

  it('refuses an unknown field rather than ignoring it', async () => {
    const { status } = await promote({
      idempotencyKey: '11111111-1111-4111-8111-111111111304',
      fromSessionId: OLD_SESSION,
      toSessionId: NEW_SESSION,
      moves: ORDINARY_ROLLOVER,
      alsoBillThem: true,
    });
    expect(status).toBe(400);
  });
});

describe('tenant isolation', () => {
  it('will not promote into another school’s session', async () => {
    const { status } = await promote({
      idempotencyKey: '11111111-1111-4111-8111-111111111401',
      fromSessionId: OLD_SESSION,
      toSessionId: B_SESSION,
      moves: ORDINARY_ROLLOVER,
    });

    // A foreign key check does not apply RLS, so this has to be refused by
    // reading both sessions through the tenant client first.
    expect(status).toBe(404);

    const bRoll = await rollOf(B_SESSION);
    expect(bRoll).toHaveLength(0);
  });

  it('leaves another school’s roll untouched', async () => {
    await promote({
      idempotencyKey: '11111111-1111-4111-8111-111111111402',
      fromSessionId: OLD_SESSION,
      toSessionId: NEW_SESSION,
      moves: ORDINARY_ROLLOVER,
    });

    expect((await preview(OLD_SESSION, NEW_SESSION, ownerB, HOST_B)).status).toBe(404);
  });
});
