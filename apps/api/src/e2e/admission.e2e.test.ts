import { ROUTES, type ClassLevelWithSections, type CurrentSession } from '@ilm/contracts';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { Test } from '@nestjs/testing';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { AppModule } from '../app.module';
import { createAdminClient, type PrismaClient } from '../prisma';
import { PasswordService } from '../shared/auth/password.service';

/**
 * Admitting a student.
 *
 * The endpoint had no end-to-end coverage at all, which is how three separate
 * things about it stayed wrong long enough to be asked about:
 *
 *  * The year on a Student ID came from `getUTCFullYear()`, so a Karachi school
 *    admitting between midnight and 5am on 1 January stamped the previous year
 *    on the child, and a backdated record got this year rather than its own.
 *  * `/academics/setup` always returned the **current** session's sections, so
 *    a school admitting into next year was offered this year's places.
 *  * A guardian could be recorded with no address, which is the field a school
 *    needs on the day the phone is dead.
 *
 * Two schools throughout, because the session a child is placed into is an id
 * in a request body, and "another school's session" is the shape of a leak.
 */

const SCHOOL_A = '33333333-3333-4333-8333-3333333333ca';
const SCHOOL_B = '33333333-3333-4333-8333-3333333333cb';
const OWNER_A = '44444444-4444-4444-8444-4444444444ca';
const OWNER_B = '44444444-4444-4444-8444-4444444444cb';

const SESSION_A_CURRENT = '55555555-5555-4555-8555-5555555555ca';
const SESSION_A_PLANNED = '55555555-5555-4555-8555-5555555555cb';
const SESSION_A_CLOSED = '55555555-5555-4555-8555-5555555555cc';
const SESSION_B = '55555555-5555-4555-8555-5555555555cd';

const CLASS_A = '66666666-6666-4666-8666-6666666666ca';
const SECTION_CURRENT = '77777777-7777-4777-8777-7777777777ca';
const SECTION_PLANNED = '77777777-7777-4777-8777-7777777777cb';
const SECTION_CLOSED = '77777777-7777-4777-8777-7777777777cc';

const HOST_A = 'admit-a-e2e.localhost';
const HOST_B = 'admit-b-e2e.localhost';
const PASSWORD = 'correct-horse-battery-staple';

/** A complete admission. Individual tests override one part of it. */
const VALID = {
  firstName: 'Ayesha',
  lastName: 'Khan',
  gender: 'FEMALE',
  admittedOn: '2026-05-04',
  enrollment: { sessionId: SESSION_A_CURRENT, classLevelId: CLASS_A, sectionId: SECTION_CURRENT },
  guardian: {
    name: 'Imran Khan',
    relation: 'FATHER',
    phone: '+923001234567',
    address: 'House 12, Street 4, Gulberg III, Lahore',
  },
  // Explicitly nothing, so the test does not depend on a fee catalogue.
  fees: [],
} as const;

let app: NestFastifyApplication;
let admin: PrismaClient;
let ownerA = '';
let ownerB = '';

/**
 * Both schools, one table at a time — not one school at a time.
 *
 * The obvious loop (each school, all its tables) cannot clean up after the very
 * bug this suite exists to catch: an enrolment in school B pointing at a class
 * in school A. Clearing A's classes while B's stray enrolment still references
 * them hits the `RESTRICT` on the foreign key, `wipe` throws, and every test in
 * the file is skipped rather than failed — which looks like nothing is wrong.
 *
 * Emptying each table across both schools before moving to the table it depends
 * on is correct whether or not the rows are tangled.
 */
async function wipe(): Promise<void> {
  for (const table of [
    'student_fees',
    'enrollments',
    'student_guardians',
    'guardians',
    'students',
    'number_sequences',
    'sections',
    'class_levels',
    'academic_sessions',
    'sessions',
    'audit_logs',
    'user_roles',
    'users',
  ]) {
    await admin.$executeRawUnsafe(
      `DELETE FROM ${table} WHERE school_id = ANY($1::uuid[])`,
      [SCHOOL_A, SCHOOL_B],
    );
  }
  await admin.$executeRaw`DELETE FROM schools WHERE id IN (${SCHOOL_A}::uuid, ${SCHOOL_B}::uuid)`;
}

beforeAll(async () => {
  admin = createAdminClient({ url: process.env['DATABASE_ADMIN_URL'] ?? '' });
  await wipe();

  await admin.$executeRaw`
    INSERT INTO schools (id, name, slug, timezone, created_at, updated_at) VALUES
      (${SCHOOL_A}::uuid, 'Admit E2E A', 'admit-a-e2e', 'Asia/Karachi', now(), now()),
      (${SCHOOL_B}::uuid, 'Admit E2E B', 'admit-b-e2e', 'Asia/Karachi', now(), now())
  `;

  const hash = await new PasswordService().hash(PASSWORD);
  for (const [user, school, email] of [
    [OWNER_A, SCHOOL_A, 'head@admit-a.test'],
    [OWNER_B, SCHOOL_B, 'head@admit-b.test'],
  ] as const) {
    await admin.$executeRawUnsafe(
      `INSERT INTO users (id, school_id, email, name, password_hash, status, created_at, updated_at)
       VALUES ($1::uuid, $2::uuid, $3, 'Head', $4, 'ACTIVE', now(), now())`,
      user,
      school,
      email,
      hash,
    );
    await admin.$executeRawUnsafe(
      `INSERT INTO user_roles (id, school_id, user_id, role, created_at)
       VALUES (gen_random_uuid(), $1::uuid, $2::uuid, 'OWNER', now())`,
      school,
      user,
    );
  }

  // Three sessions for A — the current one, one planned for next year, one
  // already closed — and one for B, to aim a cross-tenant id at.
  await admin.$executeRaw`
    INSERT INTO academic_sessions
      (id, school_id, name, start_date, end_date, status, is_current, created_at, updated_at)
    VALUES
      (${SESSION_A_CURRENT}::uuid, ${SCHOOL_A}::uuid, '2026-2027',
       '2026-04-01', '2027-03-31', 'ACTIVE', true, now(), now()),
      (${SESSION_A_PLANNED}::uuid, ${SCHOOL_A}::uuid, '2027-2028',
       '2027-04-01', '2028-03-31', 'PLANNED', false, now(), now()),
      (${SESSION_A_CLOSED}::uuid, ${SCHOOL_A}::uuid, '2025-2026',
       '2025-04-01', '2026-03-31', 'CLOSED', false, now(), now()),
      (${SESSION_B}::uuid, ${SCHOOL_B}::uuid, '2026-2027',
       '2026-04-01', '2027-03-31', 'ACTIVE', true, now(), now())
  `;

  await admin.$executeRaw`
    INSERT INTO class_levels (id, school_id, name, numeric_order, created_at, updated_at)
    VALUES (${CLASS_A}::uuid, ${SCHOOL_A}::uuid, 'Grade 1', 2, now(), now())
  `;

  // One section per session, all called "A" — which is the point: three rows
  // with the same name, and only the one belonging to the chosen session is a
  // place a child may actually be put.
  await admin.$executeRaw`
    INSERT INTO sections
      (id, school_id, session_id, class_level_id, name, capacity, created_at, updated_at)
    VALUES
      (${SECTION_CURRENT}::uuid, ${SCHOOL_A}::uuid, ${SESSION_A_CURRENT}::uuid,
       ${CLASS_A}::uuid, 'A', 30, now(), now()),
      (${SECTION_PLANNED}::uuid, ${SCHOOL_A}::uuid, ${SESSION_A_PLANNED}::uuid,
       ${CLASS_A}::uuid, 'A', 30, now(), now()),
      (${SECTION_CLOSED}::uuid, ${SCHOOL_A}::uuid, ${SESSION_A_CLOSED}::uuid,
       ${CLASS_A}::uuid, 'A', 30, now(), now())
  `;

  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  app = moduleRef.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
  const { default: cookie } = await import('@fastify/cookie');
  await app.register(cookie);
  await app.init();
  await app.getHttpAdapter().getInstance().ready();

  ownerA = await signIn(HOST_A, 'head@admit-a.test');
  ownerB = await signIn(HOST_B, 'head@admit-b.test');
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

beforeEach(async () => {
  // Students and their counters both, so every test starts at GR 0001 and can
  // assert an exact number rather than "something bigger than last time".
  for (const table of ['student_fees', 'enrollments', 'student_guardians', 'guardians']) {
    await admin.$executeRawUnsafe(`DELETE FROM ${table} WHERE school_id = $1::uuid`, SCHOOL_A);
  }
  await admin.$executeRaw`DELETE FROM students WHERE school_id = ${SCHOOL_A}::uuid`;
  await admin.$executeRaw`DELETE FROM number_sequences WHERE school_id = ${SCHOOL_A}::uuid`;
});

afterAll(async () => {
  await app?.close();
  await wipe();
  await admin.$disconnect();
});

async function admit(body: Record<string, unknown>, jar = ownerA, host = HOST_A) {
  const response = await app.inject({
    method: 'POST',
    url: ROUTES.students.create,
    headers: { host, cookie: jar },
    payload: body,
  });
  return {
    status: response.statusCode,
    body: response.body,
    json<T>(): T {
      return response.json<T>();
    },
  };
}

async function setup(sessionId?: string, jar = ownerA, host = HOST_A) {
  const response = await app.inject({
    method: 'GET',
    url:
      sessionId === undefined
        ? ROUTES.academics.setup
        : `${ROUTES.academics.setup}?sessionId=${sessionId}`,
    headers: { host, cookie: jar },
  });
  return {
    status: response.statusCode,
    data: response.json<{
      data: { session: CurrentSession | null; classes: ClassLevelWithSections[] };
    }>().data,
  };
}

function problem(body: string): { detail?: string } {
  return JSON.parse(body) as { detail?: string };
}

async function renumber(sectionId: string) {
  return app.inject({
    method: 'POST',
    url: ROUTES.academics.renumberSection(sectionId),
    headers: { host: HOST_A, cookie: ownerA },
  });
}

/** Roll numbers in a section, ascending. */
async function rolls(sectionId: string): Promise<number[]> {
  const rows = await admin.$queryRawUnsafe<{ roll_no: number }[]>(
    `SELECT roll_no FROM enrollments WHERE section_id = $1::uuid ORDER BY roll_no`,
    sectionId,
  );
  return rows.map((row) => row.roll_no);
}

/** `[surname, roll]` in roll order — what the register actually reads like. */
async function rollsByName(sectionId: string): Promise<[string, number][]> {
  const rows = await admin.$queryRawUnsafe<{ last_name: string; roll_no: number }[]>(
    `SELECT s.last_name, e.roll_no
       FROM enrollments e JOIN students s ON s.id = e.student_id
      WHERE e.section_id = $1::uuid ORDER BY e.roll_no`,
    sectionId,
  );
  return rows.map((row) => [row.last_name, row.roll_no]);
}

/** The row as stored, read past the API entirely. */
async function studentRow(grNo: string): Promise<Record<string, unknown>> {
  const rows = await admin.$queryRawUnsafe<Record<string, unknown>[]>(
    `SELECT gr_no, student_code, b_form_no, religion FROM students
      WHERE school_id = $1::uuid AND gr_no = $2`,
    SCHOOL_A,
    grNo,
  );
  return rows[0] ?? {};
}

describe('the numbers a child is given', () => {
  it('issues GR and Student ID from separate counters, starting at one', async () => {
    const first = await admit(VALID);
    expect(first.status).toBe(201);

    const { grNo, studentCode } = first.json<{
      data: { grNo: string; studentCode: string };
    }>().data;

    expect(grNo).toBe('0001');
    expect(studentCode).toBe('2026-0001');
  });

  it('never repeats a number, and never reuses one', async () => {
    await admit(VALID);
    await admit({ ...VALID, firstName: 'Bilal' });
    const third = await admit({ ...VALID, firstName: 'Sara' });

    expect(third.json<{ data: { grNo: string } }>().data.grNo).toBe('0003');
  });

  it('takes the Student ID year from the admission date, not from the clock', async () => {
    // A school entering an old record. The prefix claims to say which year the
    // child was admitted, so it must say 2019 — reading the server's clock here
    // makes it say this year, which is the only thing it is not.
    const result = await admit({ ...VALID, admittedOn: '2019-08-14' });

    expect(result.status).toBe(201);
    expect(result.json<{ data: { studentCode: string } }>().data.studentCode).toBe('2019-0001');
  });

  it('keeps both numbers when the admission fails, rather than burning them', async () => {
    // A class that does not exist: the insert fails after the counters have
    // been read. Both are rolled back with it, so the next real admission is
    // still 0001 and the register has no gap where no child ever was.
    const bad = await admit({
      ...VALID,
      enrollment: { ...VALID.enrollment, classLevelId: '66666666-6666-4666-8666-66666666dead' },
    });
    expect(bad.status).toBeGreaterThanOrEqual(400);

    const good = await admit(VALID);
    expect(good.json<{ data: { grNo: string } }>().data.grNo).toBe('0001');
  });
});

describe('the roll number', () => {
  it('starts at one and counts up within a section', async () => {
    await admit(VALID);
    await admit({ ...VALID, firstName: 'Bilal' });

    expect(await rolls(SECTION_CURRENT)).toEqual([1, 2]);
  });

  it('counts separately in each section — a roll is a place on one register', async () => {
    await admit(VALID);
    await admit({
      ...VALID,
      firstName: 'Sara',
      enrollment: {
        sessionId: SESSION_A_PLANNED,
        classLevelId: CLASS_A,
        sectionId: SECTION_PLANNED,
      },
    });

    // Both are roll 1. They are on different registers, so they must be.
    expect(await rolls(SECTION_CURRENT)).toEqual([1]);
    expect(await rolls(SECTION_PLANNED)).toEqual([1]);
  });

  it('gives no roll to a child placed in no section', async () => {
    const { sectionId: _sectionId, ...noSection } = VALID.enrollment;

    const result = await admit({ ...VALID, enrollment: noSection });
    expect(result.status).toBe(201);

    const rows = await admin.$queryRawUnsafe<{ roll_no: number | null }[]>(
      `SELECT roll_no FROM enrollments WHERE school_id = $1::uuid`,
      SCHOOL_A,
    );
    // Not zero, and not one. A roll is a position on a register, and this child
    // is not on one — a number here would mean nothing until it changed.
    expect(rows[0]?.roll_no).toBeNull();
  });

  it('refuses a roll number supplied by the caller', async () => {
    // Server-allocated, like GR and Student ID. A client-supplied roll is how
    // two children end up sharing a place on the register a teacher reads from.
    const result = await admit({
      ...VALID,
      enrollment: { ...VALID.enrollment, rollNo: 99 },
    });

    expect(result.status).toBe(400);
  });

  it('cannot be duplicated, even past the service', async () => {
    await admit(VALID);

    // Straight at the database, as a second code path written next year would.
    // The partial unique index is what makes the lock in the service a
    // guarantee rather than a convention.
    await expect(
      admin.$executeRawUnsafe(
        `INSERT INTO enrollments
           (id, school_id, student_id, session_id, class_level_id, section_id, roll_no,
            status, created_at, updated_at)
         SELECT gen_random_uuid(), school_id, student_id, session_id, class_level_id,
                section_id, roll_no, 'ENROLLED', now(), now()
           FROM enrollments WHERE school_id = $1::uuid LIMIT 1`,
        SCHOOL_A,
      ),
    ).rejects.toThrow();
  });
});

describe('renumbering a register', () => {
  /** Admit three children whose names sort differently from their arrival. */
  async function admitThreeOutOfOrder(): Promise<void> {
    await admit({ ...VALID, firstName: 'Zara', lastName: 'Zafar' });
    await admit({ ...VALID, firstName: 'Ahmed', lastName: 'Ahmed' });
    await admit({ ...VALID, firstName: 'Maryam', lastName: 'Malik' });
  }

  it('puts the register into name order, one to n', async () => {
    await admitThreeOutOfOrder();

    // Admission order: Zafar 1, Ahmed 2, Malik 3.
    expect(await rollsByName(SECTION_CURRENT)).toEqual([
      ['Zafar', 1],
      ['Ahmed', 2],
      ['Malik', 3],
    ]);

    const response = await app.inject({
      method: 'POST',
      url: ROUTES.academics.renumberSection(SECTION_CURRENT),
      headers: { host: HOST_A, cookie: ownerA },
    });

    expect(response.statusCode).toBe(201);
    expect(response.json<{ data: { renumbered: number } }>().data.renumbered).toBe(3);

    expect(await rollsByName(SECTION_CURRENT)).toEqual([
      ['Ahmed', 1],
      ['Malik', 2],
      ['Zafar', 3],
    ]);
  });

  it('survives being run twice', async () => {
    await admitThreeOutOfOrder();
    await renumber(SECTION_CURRENT);
    await renumber(SECTION_CURRENT);

    expect(await rolls(SECTION_CURRENT)).toEqual([1, 2, 3]);
  });

  it('keeps admitting correctly afterwards — the next child gets n + 1', async () => {
    await admitThreeOutOfOrder();
    await renumber(SECTION_CURRENT);
    await admit({ ...VALID, firstName: 'Bilal', lastName: 'Butt' });

    expect(await rolls(SECTION_CURRENT)).toEqual([1, 2, 3, 4]);
  });

  it('reports nothing to do for an empty section', async () => {
    const response = await renumber(SECTION_PLANNED);

    expect(response.statusCode).toBe(201);
    expect(response.json<{ data: { renumbered: number } }>().data.renumbered).toBe(0);
  });

  it('refuses another school’s section', async () => {
    const response = await app.inject({
      method: 'POST',
      url: ROUTES.academics.renumberSection(SECTION_CURRENT),
      headers: { host: HOST_B, cookie: ownerB },
    });

    expect(response.statusCode).toBe(404);
  });
});

describe('the guardian', () => {
  it('refuses an admission with no home address', async () => {
    const { address: _address, ...withoutAddress } = VALID.guardian;

    const result = await admit({ ...VALID, guardian: withoutAddress });

    expect(result.status).toBe(400);
  });

  it('refuses a blank one rather than storing whitespace', async () => {
    const result = await admit({
      ...VALID,
      guardian: { ...VALID.guardian, address: '   ' },
    });

    expect(result.status).toBe(400);
  });

  it('stores the address and the occupation', async () => {
    await admit({
      ...VALID,
      guardian: { ...VALID.guardian, occupation: 'Shopkeeper' },
    });

    const rows = await admin.$queryRawUnsafe<{ address: string; occupation: string }[]>(
      `SELECT address, occupation FROM guardians WHERE school_id = $1::uuid`,
      SCHOOL_A,
    );

    expect(rows[0]?.address).toBe(VALID.guardian.address);
    expect(rows[0]?.occupation).toBe('Shopkeeper');
  });
});

describe('the child’s own record', () => {
  it('stores the B-form number and religion when they are given', async () => {
    await admit({ ...VALID, bFormNo: '35202-1234567-1', religion: 'Islam' });

    const row = await studentRow('0001');
    expect(row['b_form_no']).toBe('35202-1234567-1');
    expect(row['religion']).toBe('Islam');
  });

  it('admits without them — neither is something a school always has on day one', async () => {
    expect((await admit(VALID)).status).toBe(201);

    const row = await studentRow('0001');
    expect(row['b_form_no']).toBeNull();
    expect(row['religion']).toBeNull();
  });
});

describe('which session a child is placed into', () => {
  it('defaults to the current session and its sections', async () => {
    const { data } = await setup();

    expect(data.session?.id).toBe(SESSION_A_CURRENT);
    expect(data.classes[0]?.sections.map((section) => section.id)).toEqual([SECTION_CURRENT]);
  });

  it('returns a planned session with *its* sections, not this year’s', async () => {
    const { data } = await setup(SESSION_A_PLANNED);

    expect(data.session?.id).toBe(SESSION_A_PLANNED);
    // Same class, same section name, different row. Handing back the current
    // session's section here is how a child admitted for next year lands on
    // this year's register instead.
    expect(data.classes[0]?.sections.map((section) => section.id)).toEqual([SECTION_PLANNED]);
  });

  it('offers nothing for a closed session', async () => {
    const { data } = await setup(SESSION_A_CLOSED);

    expect(data.session).toBeNull();
    expect(data.classes).toEqual([]);
  });

  it('offers nothing for another school’s session, exactly as for a closed one', async () => {
    const { data } = await setup(SESSION_B);

    expect(data.session).toBeNull();
    expect(data.classes).toEqual([]);
  });

  it('rejects a session id that is not an id, rather than failing at the database', async () => {
    const response = await app.inject({
      method: 'GET',
      url: `${ROUTES.academics.setup}?sessionId=not-a-uuid`,
      headers: { host: HOST_A, cookie: ownerA },
    });

    expect(response.statusCode).toBe(400);
  });

  it('treats an empty sessionId as "the current one"', async () => {
    // A query string carries `''` for an absent value about as often as it
    // carries nothing, and an admission form must not 400 on opening.
    const { status, data } = await setup('');

    expect(status).toBe(200);
    expect(data.session?.id).toBe(SESSION_A_CURRENT);
  });

  it('admits into a planned session', async () => {
    const result = await admit({
      ...VALID,
      enrollment: {
        sessionId: SESSION_A_PLANNED,
        classLevelId: CLASS_A,
        sectionId: SECTION_PLANNED,
      },
    });

    expect(result.status).toBe(201);

    const rows = await admin.$queryRawUnsafe<{ session_id: string }[]>(
      `SELECT session_id FROM enrollments WHERE school_id = $1::uuid`,
      SCHOOL_A,
    );
    expect(rows[0]?.session_id).toBe(SESSION_A_PLANNED);
  });

  it('refuses a section that belongs to a different session', async () => {
    // Right school, right class, wrong year. Nothing about the row is foreign,
    // so only an explicit check catches it — and without one the child sits on
    // a register their own class list never shows.
    const result = await admit({
      ...VALID,
      enrollment: {
        sessionId: SESSION_A_CURRENT,
        classLevelId: CLASS_A,
        sectionId: SECTION_PLANNED,
      },
    });

    expect(result.status).toBe(404);
  });
});

/**
 * A foreign key is not a tenant boundary.
 *
 * PostgreSQL checks `session_id` and `class_level_id` with the referential
 * integrity trigger, and that trigger does not apply row-level security. So
 * every id in an admission body has to be looked up on the tenant client
 * before it is written, or a school can point its own rows at another school's
 * rows — which the FK is perfectly happy to allow.
 */
describe('tenant isolation', () => {
  it('refuses to enrol into another school’s session', async () => {
    const result = await admit({
      ...VALID,
      enrollment: { sessionId: SESSION_B, classLevelId: CLASS_A },
    });

    expect(result.status).toBe(404);

    const rows = await admin.$queryRawUnsafe<{ n: bigint }[]>(
      `SELECT count(*) AS n FROM enrollments WHERE session_id = $1::uuid`,
      SESSION_B,
    );
    expect(Number(rows[0]?.n ?? 0)).toBe(0);
  });

  it('refuses to enrol into another school’s class', async () => {
    const result = await admit({
      ...VALID,
      enrollment: { sessionId: SESSION_A_CURRENT, classLevelId: CLASS_A },
      // B's owner, on B's host, naming A's class and A's session.
    }, ownerB, HOST_B);

    expect(result.status).toBe(404);

    const rows = await admin.$queryRawUnsafe<{ n: bigint }[]>(
      `SELECT count(*) AS n FROM students WHERE school_id = $1::uuid`,
      SCHOOL_B,
    );
    expect(Number(rows[0]?.n ?? 0)).toBe(0);
  });

  it('says the same thing for a foreign id as for one that never existed', async () => {
    // Otherwise the difference between the two answers is a way to ask whether
    // a given id is real in some other school.
    const foreign = await admit({
      ...VALID,
      enrollment: { sessionId: SESSION_B, classLevelId: CLASS_A },
    });
    const invented = await admit({
      ...VALID,
      enrollment: {
        sessionId: '55555555-5555-4555-8555-5555555555ff',
        classLevelId: CLASS_A,
      },
    });

    expect(foreign.status).toBe(invented.status);
    expect(problem(foreign.body).detail).toBe(problem(invented.body).detail);
  });
});
