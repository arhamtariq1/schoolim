import { ROUTES, type StaffProfile } from '@ilm/contracts';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { Test } from '@nestjs/testing';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { AppModule } from '../app.module';
import { createAdminClient, type PrismaClient } from '../prisma';
import { PasswordService } from '../shared/auth/password.service';

/**
 * Marks, end to end — entry by a teacher, reading by everyone else.
 *
 * The cases that matter are the refusals: a teacher reaching a class that is
 * not theirs, a second copy of the same test, a mark above the total, a mark
 * against a child who is not in the class, and a parent reading anybody but
 * their own child.
 */

const SCHOOL = '33333333-3333-4333-8333-3333333333d1';
const SESSION = '55555555-5555-4555-8555-5555555555d1';
const GRADE_1 = '66666666-6666-4666-8666-6666666666d1';
const GRADE_2 = '66666666-6666-4666-8666-6666666666d2';
const AASIA = '88888888-8888-4888-8888-8888888888d1'; // Grade 1
const BILAL = '88888888-8888-4888-8888-8888888888d2'; // Grade 1
const FARAZ = '88888888-8888-4888-8888-8888888888d3'; // Grade 2
const GUARDIAN = '77777777-7777-4777-8777-7777777777d1';

const HOST = 'marks-e2e.localhost';
const PASSWORD = 'correct-horse-battery-staple';
const DAY = '2026-08-12';

const USERS = {
  owner: { id: '44444444-4444-4444-8444-4444444444d1', email: 'owner@marks-e2e.test', role: 'OWNER' },
  principal: { id: '44444444-4444-4444-8444-4444444444d2', email: 'head@marks-e2e.test', role: 'PRINCIPAL' },
  office: { id: '44444444-4444-4444-8444-4444444444d3', email: 'desk@marks-e2e.test', role: 'RECEPTION' },
  parent: { id: '44444444-4444-4444-8444-4444444444d4', email: 'parent@marks-e2e.test', role: 'PARENT' },
} as const;

let app: NestFastifyApplication;
let admin: PrismaClient;
const jars: Record<string, string> = {};
let teacherStaffId = '';
let subjectId = '';
let monthlyTypeId = '';
let examTypeId = '';

async function wipe(): Promise<void> {
  for (const table of [
    'mark_entries',
    'assessments',
    'class_subjects',
    'class_assessment_types',
    'subjects',
    'assessment_types',
    'staff_attendance_records',
    'staff_class_assignments',
    'student_guardians',
    'guardians',
    'invitations',
    'staff',
    'enrollments',
    'students',
    'class_levels',
    'number_sequences',
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

async function signIn(identifier: string): Promise<string> {
  const response = await app.inject({
    method: 'POST',
    url: ROUTES.auth.login,
    headers: { host: HOST },
    payload: { identifier, password: PASSWORD },
  });
  const raw = response.headers['set-cookie'];
  const list = Array.isArray(raw) ? raw : [String(raw)];
  return list
    .map((entry) => entry.split(';')[0] ?? '')
    .filter((pair) => !pair.endsWith('='))
    .join('; ');
}

type Who = 'owner' | 'principal' | 'office' | 'parent' | 'teacher';

const as = (who: Who, method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE', url: string, payload?: unknown) =>
  app.inject({
    method,
    url,
    headers: { host: HOST, cookie: jars[who] ?? '' },
    ...(payload === undefined ? {} : { payload: payload as Record<string, unknown> }),
  });

const assessment = (overrides: Record<string, unknown> = {}) => ({
  classLevelId: GRADE_1,
  subjectId,
  assessmentTypeId: monthlyTypeId,
  heldOn: DAY,
  totalMarks: 50,
  entries: [
    { studentId: AASIA, obtained: 42.5 },
    { studentId: BILAL, obtained: null },
  ],
  ...overrides,
});

beforeAll(async () => {
  admin = createAdminClient({ url: process.env['DATABASE_ADMIN_URL'] ?? '' });
  await wipe();

  await admin.$executeRaw`
    INSERT INTO schools (id, name, slug, timezone, working_days, attendance_backdate_days, created_at, updated_at)
    VALUES (${SCHOOL}::uuid, 'Marks E2E', 'marks-e2e', 'UTC', ARRAY[1,2,3,4,5,6]::smallint[], 365, now(), now())
  `;
  await admin.$executeRawUnsafe(
    `INSERT INTO academic_sessions (id, school_id, name, start_date, end_date, status, is_current, created_at, updated_at)
     VALUES ($1::uuid, $2::uuid, '2026-2027', '2026-04-01', '2027-03-31', 'ACTIVE', true, now(), now())`,
    SESSION,
    SCHOOL,
  );
  for (const [id, name, order] of [
    [GRADE_1, 'Grade 1', 1],
    [GRADE_2, 'Grade 2', 2],
  ] as const) {
    await admin.$executeRawUnsafe(
      `INSERT INTO class_levels (id, school_id, name, numeric_order, created_at, updated_at)
       VALUES ($1::uuid, $2::uuid, $3, $4, now(), now())`,
      id,
      SCHOOL,
      name,
      order,
    );
  }
  for (const [id, first, gr, classLevel] of [
    [AASIA, 'Aasia', 'GR-7001', GRADE_1],
    [BILAL, 'Bilal', 'GR-7002', GRADE_1],
    [FARAZ, 'Faraz', 'GR-7003', GRADE_2],
  ] as const) {
    await admin.$executeRawUnsafe(
      `INSERT INTO students (id, school_id, gr_no, student_code, first_name, last_name, status, created_at, updated_at)
       VALUES ($1::uuid, $2::uuid, $3, $3, $4, 'Khan', 'ACTIVE', now(), now())`,
      id,
      SCHOOL,
      gr,
      first,
    );
    await admin.$executeRawUnsafe(
      `INSERT INTO enrollments (id, school_id, student_id, session_id, class_level_id, status, enrolled_on, created_at, updated_at)
       VALUES (gen_random_uuid(), $1::uuid, $2::uuid, $3::uuid, $4::uuid, 'ENROLLED', '2026-04-01', now(), now())`,
      SCHOOL,
      id,
      SESSION,
      classLevel,
    );
  }

  const hash = await new PasswordService().hash(PASSWORD);
  for (const user of Object.values(USERS)) {
    await admin.$executeRawUnsafe(
      `INSERT INTO users (id, school_id, email, name, password_hash, status, created_at, updated_at)
       VALUES ($1::uuid, $2::uuid, $3, $4, $5, 'ACTIVE', now(), now())`,
      user.id,
      SCHOOL,
      user.email,
      user.role,
      hash,
    );
    await admin.$executeRawUnsafe(
      `INSERT INTO user_roles (id, school_id, user_id, role, created_at)
       VALUES (gen_random_uuid(), $1::uuid, $2::uuid, $3::school_role, now())`,
      SCHOOL,
      user.id,
      user.role,
    );
  }

  // The parent's guardian record, linked to Aasia only.
  await admin.$executeRawUnsafe(
    `INSERT INTO guardians (id, school_id, name, relation, user_id, created_at, updated_at)
     VALUES ($1::uuid, $2::uuid, 'Fahim Khan', 'FATHER', $3::uuid, now(), now())`,
    GUARDIAN,
    SCHOOL,
    USERS.parent.id,
  );
  await admin.$executeRawUnsafe(
    `INSERT INTO student_guardians (id, school_id, student_id, guardian_id, is_primary, created_at)
     VALUES (gen_random_uuid(), $1::uuid, $2::uuid, $3::uuid, true, now())`,
    SCHOOL,
    AASIA,
    GUARDIAN,
  );

  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  app = moduleRef.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
  const { default: cookie } = await import('@fastify/cookie');
  await app.register(cookie);
  await app.init();
  await app.getHttpAdapter().getInstance().ready();

  for (const [who, user] of Object.entries(USERS)) {
    jars[who] = await signIn(user.email);
  }

  // The teacher, created the way the staff form creates one: Grade 1 only.
  const created = await as('owner', 'POST', ROUTES.staff.create, {
    name: 'Sadia Iqbal',
    email: 'teacher@marks-e2e.test',
    phone: '+923001234567',
    cnic: '35202-1234567-1',
    role: 'TEACHER',
    classLevelIds: [GRADE_1],
  });
  expect(created.statusCode).toBe(201);
  teacherStaffId = created.json<{ data: StaffProfile }>().data.id;
  await admin.$executeRawUnsafe(
    `UPDATE users SET password_hash = $1, status = 'ACTIVE' WHERE school_id = $2::uuid AND email = 'teacher@marks-e2e.test'`,
    hash,
    SCHOOL,
  );
  jars['teacher'] = await signIn('teacher@marks-e2e.test');

  const subjects = await as('teacher', 'GET', ROUTES.marks.subjects);
  subjectId = subjects.json<{ data: { id: string; name: string }[] }>().data[0]?.id ?? '';

  const types = (
    await as('teacher', 'GET', ROUTES.marks.assessmentTypes)
  ).json<{ data: { id: string; name: string }[] }>().data;
  monthlyTypeId = types.find((entry) => entry.name === 'Monthly test')?.id ?? '';
  examTypeId = types.find((entry) => entry.name === 'Midterm exam')?.id ?? '';

  for (const classLevelId of [GRADE_1, GRADE_2]) {
    await as('owner', 'POST', ROUTES.marks.classSubjects(classLevelId), { itemId: subjectId });
    for (const typeId of [monthlyTypeId, examTypeId]) {
      await as('owner', 'POST', ROUTES.marks.classAssessmentTypes(classLevelId), { itemId: typeId });
    }
  }
}, 120_000);

afterAll(async () => {
  await app?.close();
  await wipe();
  await admin.$disconnect();
});

describe('subjects', () => {
  it('starts a school with a usable list', async () => {
    const response = await as('teacher', 'GET', ROUTES.marks.subjects);
    expect(response.statusCode).toBe(200);
    expect(response.json<{ data: unknown[] }>().data.length).toBeGreaterThan(3);
  });

  it('starts with generic assessment types too', async () => {
    const response = await as('teacher', 'GET', ROUTES.marks.assessmentTypes);
    expect(response.statusCode).toBe(200);
    const names = response.json<{ data: { name: string }[] }>().data.map((entry) => entry.name);
    expect(names).toEqual(expect.arrayContaining(['Class test', 'Monthly test', 'Surprise test', 'Midterm exam', 'Final exam']));
  });
});

describe('configuring subjects and assessment types', () => {
  it.each(['owner', 'principal', 'office'] as const)('lets %s add one of each', async (who) => {
    const subject = await as(who, 'POST', ROUTES.marks.subjects, { name: `Subject by ${who}` });
    expect(subject.statusCode).toBe(201);
    const type = await as(who, 'POST', ROUTES.marks.assessmentTypes, { name: `Type by ${who}` });
    expect(type.statusCode).toBe(201);
  });

  it('refuses a teacher every change to the lists, though they can still read them', async () => {
    expect((await as('teacher', 'POST', ROUTES.marks.subjects, { name: 'Drama' })).statusCode).toBe(403);
    expect((await as('teacher', 'POST', ROUTES.marks.assessmentTypes, { name: 'Drama test' })).statusCode).toBe(403);
    expect((await as('teacher', 'PATCH', ROUTES.marks.subject(subjectId), { name: 'Renamed' })).statusCode).toBe(403);
    expect((await as('teacher', 'DELETE', ROUTES.marks.subject(subjectId))).statusCode).toBe(403);
    expect((await as('teacher', 'DELETE', ROUTES.marks.assessmentType(monthlyTypeId))).statusCode).toBe(403);
    expect((await as('teacher', 'GET', ROUTES.marks.subjects)).statusCode).toBe(200);
  });

  it('refuses a parent every setup change, and reading the staff lists', async () => {
    expect((await as('parent', 'POST', ROUTES.marks.subjects, { name: 'Nope' })).statusCode).toBe(403);
    expect((await as('parent', 'POST', ROUTES.marks.assessmentTypes, { name: 'Nope' })).statusCode).toBe(403);
    expect((await as('parent', 'GET', ROUTES.marks.subjects)).statusCode).toBe(403);
    expect((await as('parent', 'GET', ROUTES.marks.assessmentTypes)).statusCode).toBe(403);
  });

  it('refuses a duplicate name', async () => {
    expect((await as('owner', 'POST', ROUTES.marks.subjects, { name: 'Subject by owner' })).statusCode).toBe(409);
    expect((await as('owner', 'POST', ROUTES.marks.assessmentTypes, { name: 'Type by owner' })).statusCode).toBe(409);
  });

  it('renames, and refuses a rename onto an existing name', async () => {
    const created = await as('owner', 'POST', ROUTES.marks.assessmentTypes, { name: 'Pre-board' });
    const id = created.json<{ data: { id: string } }>().data.id;

    const renamed = await as('principal', 'PATCH', ROUTES.marks.assessmentType(id), { name: 'Pre-board exam' });
    expect(renamed.statusCode).toBe(200);
    expect(renamed.json<{ data: { name: string } }>().data.name).toBe('Pre-board exam');

    expect((await as('owner', 'PATCH', ROUTES.marks.assessmentType(id), { name: 'Midterm exam' })).statusCode).toBe(409);
  });

  it('deletes an unused one, and refuses one that real results depend on', async () => {
    const created = await as('owner', 'POST', ROUTES.marks.subjects, { name: 'Disposable' });
    const id = created.json<{ data: { id: string } }>().data.id;
    expect((await as('office', 'DELETE', ROUTES.marks.subject(id))).statusCode).toBe(200);

    // The subject and type used by assessments created later in this file.
    await as('teacher', 'POST', ROUTES.marks.assessments, assessment({ heldOn: '2026-08-30' }));
    expect((await as('owner', 'DELETE', ROUTES.marks.subject(subjectId))).statusCode).toBe(409);
    expect((await as('owner', 'DELETE', ROUTES.marks.assessmentType(monthlyTypeId))).statusCode).toBe(409);
  });
});

describe('a teacher entering marks', () => {
  it('starts from the class list and only for their own class', async () => {
    const own = await as('teacher', 'GET', `${ROUTES.marks.roster}?classLevelId=${GRADE_1}`);
    expect(own.statusCode).toBe(200);
    expect(own.json<{ data: { students: unknown[] } }>().data.students).toHaveLength(2);

    expect((await as('teacher', 'GET', `${ROUTES.marks.roster}?classLevelId=${GRADE_2}`)).statusCode).toBe(404);
  });

  it('saves an assessment with a mark, a fraction and an absence', async () => {
    const response = await as('teacher', 'POST', ROUTES.marks.assessments, assessment());
    expect(response.statusCode).toBe(201);
    const body = response.json<{
      data: { totalMarks: number; entryCount: number; entries: { studentId: string; obtained: number | null }[] };
    }>().data;
    expect(body.totalMarks).toBe(50);
    expect(body.entryCount).toBe(2);
    expect(body.entries.find((entry) => entry.studentId === AASIA)?.obtained).toBe(42.5);
    expect(body.entries.find((entry) => entry.studentId === BILAL)?.obtained).toBeNull();
  });

  it('refuses the same test twice — class, subject, type and day', async () => {
    const again = await as('teacher', 'POST', ROUTES.marks.assessments, assessment());
    expect(again.statusCode).toBe(409);

    // A different day, type or subject is a different test.
    expect(
      (await as('teacher', 'POST', ROUTES.marks.assessments, assessment({ heldOn: '2026-08-13' }))).statusCode,
    ).toBe(201);
    expect(
      (await as('teacher', 'POST', ROUTES.marks.assessments, assessment({ assessmentTypeId: examTypeId }))).statusCode,
    ).toBe(201);

    const rows = await admin.$queryRawUnsafe<{ n: bigint }[]>(
      `SELECT count(*) AS n FROM assessments WHERE school_id = $1::uuid AND held_on = $2::date AND assessment_type_id = $3::uuid`,
      SCHOOL,
      DAY,
      monthlyTypeId,
    );
    expect(Number(rows[0]?.n)).toBe(1);
  });

  it('refuses invalid marks', async () => {
    const above = await as(
      'teacher',
      'POST',
      ROUTES.marks.assessments,
      assessment({ heldOn: '2026-08-14', entries: [{ studentId: AASIA, obtained: 51 }] }),
    );
    expect(above.statusCode).toBe(400);

    const negative = await as(
      'teacher',
      'POST',
      ROUTES.marks.assessments,
      assessment({ heldOn: '2026-08-14', entries: [{ studentId: AASIA, obtained: -1 }] }),
    );
    expect(negative.statusCode).toBe(400);

    const zeroTotal = await as('teacher', 'POST', ROUTES.marks.assessments, assessment({ heldOn: '2026-08-14', totalMarks: 0 }));
    expect(zeroTotal.statusCode).toBe(400);

    const fractional = await as(
      'teacher',
      'POST',
      ROUTES.marks.assessments,
      assessment({ heldOn: '2026-08-14', entries: [{ studentId: AASIA, obtained: 10.123 }] }),
    );
    expect(fractional.statusCode).toBe(400);

    const twice = await as(
      'teacher',
      'POST',
      ROUTES.marks.assessments,
      assessment({
        heldOn: '2026-08-14',
        entries: [
          { studentId: AASIA, obtained: 1 },
          { studentId: AASIA, obtained: 2 },
        ],
      }),
    );
    expect(twice.statusCode).toBe(400);
  });

  it('refuses a mark against a child who is not in the class', async () => {
    const response = await as(
      'teacher',
      'POST',
      ROUTES.marks.assessments,
      assessment({ heldOn: '2026-08-14', entries: [{ studentId: FARAZ, obtained: 10 }] }),
    );
    expect(response.statusCode).toBe(422);
  });

  it('cannot enter marks for a class that is not theirs', async () => {
    const response = await as('teacher', 'POST', ROUTES.marks.assessments, assessment({ classLevelId: GRADE_2, entries: [{ studentId: FARAZ, obtained: 10 }] }));
    expect(response.statusCode).toBe(404);
  });
});

describe('editing', () => {
  it('changes marks and the total, and keeps one record', async () => {
    const list = await as('teacher', 'GET', `${ROUTES.marks.assessments}?assessmentTypeId=${monthlyTypeId}`);
    const id = list.json<{ data: { id: string }[] }>().data[0]?.id ?? '';

    const updated = await as('teacher', 'PUT', ROUTES.marks.assessment(id), {
      totalMarks: 60,
      entries: [
        { studentId: AASIA, obtained: 55 },
        { studentId: BILAL, obtained: 30 },
      ],
    });
    expect(updated.statusCode).toBe(200);
    const body = updated.json<{ data: { totalMarks: number; entries: { studentId: string; obtained: number | null }[] } }>().data;
    expect(body.totalMarks).toBe(60);
    expect(body.entries.find((entry) => entry.studentId === BILAL)?.obtained).toBe(30);

    // Lowering the total below an existing mark is refused, not silently clipped.
    const tooLow = await as('teacher', 'PUT', ROUTES.marks.assessment(id), {
      totalMarks: 40,
      entries: [{ studentId: AASIA, obtained: 55 }],
    });
    expect(tooLow.statusCode).toBe(400);

    const rows = await admin.$queryRawUnsafe<{ n: bigint }[]>(
      `SELECT count(*) AS n FROM mark_entries WHERE assessment_id = $1::uuid`,
      id,
    );
    expect(Number(rows[0]?.n)).toBe(2);
  });
});

describe('who can see marks', () => {
  let grade2Id = '';

  it('lets the owner enter a Grade 2 test, which no teacher of Grade 1 may see', async () => {
    const response = await as('owner', 'POST', ROUTES.marks.assessments, {
      ...assessment({ classLevelId: GRADE_2, entries: [{ studentId: FARAZ, obtained: 20 }] }),
    });
    expect(response.statusCode).toBe(201);
    grade2Id = response.json<{ data: { id: string } }>().data.id;
  });

  it('shows a teacher only their class, and answers "not found" for another', async () => {
    const list = await as('teacher', 'GET', ROUTES.marks.assessments);
    const classes = new Set(list.json<{ data: { classLevelId: string }[] }>().data.map((row) => row.classLevelId));
    expect([...classes]).toEqual([GRADE_1]);

    expect((await as('teacher', 'GET', ROUTES.marks.assessment(grade2Id))).statusCode).toBe(404);
    expect(
      (await as('teacher', 'PUT', ROUTES.marks.assessment(grade2Id), { totalMarks: 50, entries: [{ studentId: FARAZ, obtained: 1 }] }))
        .statusCode,
    ).toBe(404);
    expect((await as('teacher', 'GET', ROUTES.marks.student(FARAZ))).statusCode).toBe(404);

    const filtered = await as('teacher', 'GET', `${ROUTES.marks.assessments}?classLevelId=${GRADE_2}`);
    expect(filtered.json<{ data: unknown[] }>().data).toHaveLength(0);
  });

  it.each(['owner', 'principal', 'office'] as const)('lets %s read every class', async (who) => {
    const list = await as(who, 'GET', ROUTES.marks.assessments);
    expect(list.statusCode).toBe(200);
    const classes = new Set(list.json<{ data: { classLevelId: string }[] }>().data.map((row) => row.classLevelId));
    expect(classes.has(GRADE_1)).toBe(true);
    expect(classes.has(GRADE_2)).toBe(true);
    expect((await as(who, 'GET', ROUTES.marks.assessment(grade2Id))).statusCode).toBe(200);
  });

  it('keeps principal and office staff read-only', async () => {
    for (const who of ['principal', 'office'] as const) {
      expect((await as(who, 'POST', ROUTES.marks.assessments, assessment({ heldOn: '2026-08-20' }))).statusCode).toBe(403);
    }
  });

  it('shows a parent their own child, and nobody else’s', async () => {
    const own = await as('parent', 'GET', ROUTES.parent.marks(AASIA));
    expect(own.statusCode).toBe(200);
    const results = own.json<{ data: { obtained: number | null; subjectName: string }[] }>().data;
    expect(results.length).toBeGreaterThanOrEqual(1);

    // Same class, different family — and a different class altogether.
    expect((await as('parent', 'GET', ROUTES.parent.marks(BILAL))).statusCode).toBe(404);
    expect((await as('parent', 'GET', ROUTES.parent.marks(FARAZ))).statusCode).toBe(404);
  });

  it('keeps a parent out of the staff endpoints', async () => {
    expect((await as('parent', 'GET', ROUTES.marks.assessments)).statusCode).toBe(403);
    expect((await as('parent', 'POST', ROUTES.marks.assessments, assessment())).statusCode).toBe(403);
  });
});

describe('money stays hidden from a teacher', () => {
  it('blanks the tuition and the fee structure on a student they can open', async () => {
    const detail = await as('teacher', 'GET', ROUTES.students.detail(AASIA));
    expect(detail.statusCode).toBe(200);
    expect(detail.json<{ data: { tuitionFeeMinor: number | null } }>().data.tuitionFeeMinor).toBeNull();

    const profile = await as('teacher', 'GET', ROUTES.students.profile(AASIA));
    expect(profile.statusCode).toBe(200);
    const body = profile.json<{ data: { fees: unknown[]; feeTotals: { payableMinor: number } } }>().data;
    expect(body.fees).toHaveLength(0);
    expect(body.feeTotals.payableMinor).toBe(0);
  });

  it('refuses the fee endpoints outright', async () => {
    expect((await as('teacher', 'GET', ROUTES.students.feePayments(AASIA))).statusCode).toBe(403);
    expect((await as('teacher', 'GET', ROUTES.fees.heads)).statusCode).toBe(403);
  });
});

describe('a teacher’s own attendance', () => {
  it('shows their own month and nobody else’s', async () => {
    await admin.$executeRawUnsafe(
      `INSERT INTO staff_attendance_records (id, school_id, staff_id, date, status, marked_at, created_at, updated_at)
       VALUES (gen_random_uuid(), $1::uuid, $2::uuid, '2026-08-12', 'PRESENT', now(), now(), now())`,
      SCHOOL,
      teacherStaffId,
    );

    const mine = await as('teacher', 'GET', `${ROUTES.attendance.myReport}?month=2026-08`);
    expect(mine.statusCode).toBe(200);
    const rows = mine.json<{ data: { rows: { subjectId: string; present: number }[] } }>().data.rows;
    expect(rows).toHaveLength(1);
    expect(rows[0]?.subjectId).toBe(teacherStaffId);
    expect(rows[0]?.present).toBe(1);
  });

  it('is not an open door to the whole staff register', async () => {
    expect((await as('teacher', 'GET', ROUTES.attendance.staffRoster)).statusCode).toBe(403);
    expect((await as('parent', 'GET', `${ROUTES.attendance.myReport}?month=2026-08`)).statusCode).toBe(403);
    // The school owner tracks the staff's attendance, not their own.
    expect((await as('owner', 'GET', `${ROUTES.attendance.myReport}?month=2026-08`)).statusCode).toBe(403);
    // Office staff and principals keep it; with no staff row in this fixture that is a 404, not a 403.
    expect((await as('office', 'GET', `${ROUTES.attendance.myReport}?month=2026-08`)).statusCode).toBe(404);
    expect((await as('principal', 'GET', `${ROUTES.attendance.myReport}?month=2026-08`)).statusCode).toBe(404);
  });
});

describe('a class’s page', () => {
  interface Usage {
    id: string;
    testCount: number;
    lastHeldOn: string | null;
    averagePercent: number | null;
  }
  interface Summary {
    data: {
      subjects: Usage[];
      assessmentTypes: Usage[];
      availableSubjects: { id: string; name: string }[];
      testCount: number;
      averagePercent: number | null;
    };
  }

  it('lists the teachers assigned to a class, with what the page shows of them', async () => {
    const response = await as('owner', 'GET', ROUTES.academics.classTeachers(GRADE_1));
    expect(response.statusCode).toBe(200);
    const teachers = response.json<{ data: { id: string; name: string; employeeNo: string; email: string | null }[] }>().data;
    expect(teachers.map((entry) => entry.name)).toEqual(['Sadia Iqbal']);
    expect(teachers[0]?.id).toBe(teacherStaffId);
    expect(teachers[0]?.email).toBe('teacher@marks-e2e.test');
    expect(teachers[0]?.employeeNo).toMatch(/^\d{4}$/);
  });

  it('answers an empty list for a class nobody takes, and 404 for one that does not exist', async () => {
    const empty = await as('owner', 'GET', ROUTES.academics.classTeachers(GRADE_2));
    expect(empty.json<{ data: unknown[] }>().data).toHaveLength(0);
    const missing = await as('owner', 'GET', ROUTES.academics.classTeachers('66666666-6666-4666-8666-666666666fff'));
    expect(missing.statusCode).toBe(404);
  });

  it('shows the class’s own subjects and types, with what has happened in each', async () => {
    // Give Grade 1 one more subject, which nobody has been tested in yet.
    const all = (await as('owner', 'GET', ROUTES.marks.subjects)).json<{ data: { id: string; name: string }[] }>().data;
    const spare = all.find((entry) => entry.id !== subjectId);
    await as('owner', 'POST', ROUTES.marks.classSubjects(GRADE_1), { itemId: spare?.id });

    const response = await as('owner', 'GET', ROUTES.marks.classSummary(GRADE_1));
    expect(response.statusCode).toBe(200);
    const { subjects, assessmentTypes, availableSubjects, testCount, averagePercent } = response.json<Summary>().data;

    const used = subjects.find((entry) => entry.id === subjectId);
    expect(used?.testCount).toBeGreaterThanOrEqual(1);
    expect(used?.lastHeldOn).not.toBeNull();
    expect(used?.averagePercent).not.toBeNull();

    const unused = subjects.find((entry) => entry.id === spare?.id);
    expect(unused).toMatchObject({ testCount: 0, lastHeldOn: null, averagePercent: null });

    // Only what the class has is listed; the rest is on offer, not shown as its own.
    expect(subjects).toHaveLength(2);
    expect(availableSubjects.map((entry) => entry.id)).not.toContain(subjectId);
    expect(availableSubjects.length).toBeGreaterThan(0);

    expect(subjects.reduce((sum, entry) => sum + entry.testCount, 0)).toBe(testCount);
    expect(assessmentTypes.reduce((sum, entry) => sum + entry.testCount, 0)).toBe(testCount);
    expect(averagePercent).not.toBeNull();
    expect(assessmentTypes.find((entry) => entry.id === monthlyTypeId)?.testCount).toBeGreaterThanOrEqual(1);
  });

  it('keeps one class’s tests out of another’s numbers', async () => {
    const response = await as('owner', 'GET', ROUTES.marks.classSummary(GRADE_2));
    const body = response.json<Summary>().data;
    // Faraz scored 20 of 50 in the one Grade 2 test.
    expect(body.testCount).toBe(1);
    expect(body.averagePercent).toBe(40);
  });

  it('follows the teacher’s class scope, and refuses a parent', async () => {
    expect((await as('teacher', 'GET', ROUTES.marks.classSummary(GRADE_1))).statusCode).toBe(200);
    expect((await as('teacher', 'GET', ROUTES.marks.classSummary(GRADE_2))).statusCode).toBe(404);
    expect((await as('parent', 'GET', ROUTES.marks.classSummary(GRADE_1))).statusCode).toBe(403);
  });

  it('shows a teacher their own class’s teachers, a stranger’s class as not found, and a parent nothing', async () => {
    expect((await as('teacher', 'GET', ROUTES.academics.classTeachers(GRADE_1))).statusCode).toBe(200);
    expect((await as('teacher', 'GET', ROUTES.academics.classTeachers(GRADE_2))).statusCode).toBe(404);
    expect((await as('parent', 'GET', ROUTES.academics.classTeachers(GRADE_1))).statusCode).toBe(403);
    expect((await as('principal', 'GET', ROUTES.academics.classTeachers(GRADE_1))).statusCode).toBe(200);
  });
});

describe('configuring a class', () => {
  interface Config {
    data: {
      subjects: { id: string; name: string; testCount: number }[];
      assessmentTypes: { id: string; name: string }[];
      availableSubjects: { id: string; name: string }[];
      availableAssessmentTypes: { id: string; name: string }[];
    };
  }

  it('adds a new subject to the school and the class in one step', async () => {
    const added = await as('principal', 'POST', ROUTES.marks.classSubjects(GRADE_1), { name: 'Physical Education' });
    expect(added.statusCode).toBe(201);
    expect(added.json<Config>().data.subjects.map((entry) => entry.name)).toContain('Physical Education');

    // …and it is now one of the school's subjects, offered to other classes.
    const other = await as('owner', 'GET', ROUTES.marks.classSummary(GRADE_2));
    expect(other.json<Config>().data.availableSubjects.map((entry) => entry.name)).toContain('Physical Education');
    expect(other.json<Config>().data.subjects.map((entry) => entry.name)).not.toContain('Physical Education');
  });

  it('reuses an existing subject typed again, instead of failing or duplicating it', async () => {
    const before = (await as('owner', 'GET', ROUTES.marks.subjects)).json<{ data: unknown[] }>().data.length;
    const again = await as('office', 'POST', ROUTES.marks.classSubjects(GRADE_2), { name: 'physical education' });
    expect(again.statusCode).toBe(201);
    const after = (await as('owner', 'GET', ROUTES.marks.subjects)).json<{ data: unknown[] }>().data.length;
    expect(after).toBe(before);
  });

  it('refuses a subject the class already has', async () => {
    const response = await as('owner', 'POST', ROUTES.marks.classSubjects(GRADE_1), { itemId: subjectId });
    expect(response.statusCode).toBe(409);
  });

  it('refuses a request that gives both an id and a name, or neither', async () => {
    expect((await as('owner', 'POST', ROUTES.marks.classSubjects(GRADE_1), { itemId: subjectId, name: 'x' })).statusCode).toBe(400);
    expect((await as('owner', 'POST', ROUTES.marks.classSubjects(GRADE_1), {})).statusCode).toBe(400);
  });

  it('adds and removes an assessment type the same way', async () => {
    const added = await as('owner', 'POST', ROUTES.marks.classAssessmentTypes(GRADE_1), { name: 'Midterm' });
    expect(added.statusCode).toBe(201);
    const midterm = added.json<Config>().data.assessmentTypes.find((entry) => entry.name === 'Midterm');
    expect(midterm).toBeDefined();

    const removed = await as('owner', 'DELETE', ROUTES.marks.classAssessmentType(GRADE_1, midterm?.id ?? ''));
    expect(removed.statusCode).toBe(200);
    expect(removed.json<Config>().data.assessmentTypes.map((entry) => entry.name)).not.toContain('Midterm');
  });

  it('will not remove a subject or type the class has tests in', async () => {
    expect((await as('owner', 'DELETE', ROUTES.marks.classSubject(GRADE_1, subjectId))).statusCode).toBe(409);
    expect((await as('owner', 'DELETE', ROUTES.marks.classAssessmentType(GRADE_1, monthlyTypeId))).statusCode).toBe(409);
  });

  it('removes one that is not in use', async () => {
    const created = await as('owner', 'POST', ROUTES.marks.classSubjects(GRADE_2), { name: 'Calligraphy' });
    const id = created.json<Config>().data.subjects.find((entry) => entry.name === 'Calligraphy')?.id ?? '';
    expect((await as('owner', 'DELETE', ROUTES.marks.classSubject(GRADE_2, id))).statusCode).toBe(200);
    expect((await as('owner', 'DELETE', ROUTES.marks.classSubject(GRADE_2, id))).statusCode).toBe(404);
  });

  it('keeps teachers and parents from changing a class’s lists, whatever the class', async () => {
    for (const who of ['teacher', 'parent'] as const) {
      expect((await as(who, 'POST', ROUTES.marks.classSubjects(GRADE_1), { name: 'Sneaky' })).statusCode).toBe(403);
      expect((await as(who, 'POST', ROUTES.marks.classAssessmentTypes(GRADE_1), { name: 'Sneaky' })).statusCode).toBe(403);
      expect((await as(who, 'DELETE', ROUTES.marks.classSubject(GRADE_1, subjectId))).statusCode).toBe(403);
    }
  });

  it('offers a teacher only their own class’s subjects and types', async () => {
    const own = await as('teacher', 'GET', ROUTES.marks.classSummary(GRADE_1));
    expect(own.statusCode).toBe(200);
    const names = own.json<Config>().data.subjects.map((entry) => entry.name);
    expect(names).toContain('Physical Education');
    expect(names).not.toContain('Calligraphy');
    // Another teacher's class is simply not there for them.
    expect((await as('teacher', 'GET', ROUTES.marks.classSummary(GRADE_2))).statusCode).toBe(404);
  });
});

describe('entering marks against a class’s own configuration', () => {
  it('refuses a subject the class does not have — the dropdown is not the only guard', async () => {
    const created = await as('owner', 'POST', ROUTES.marks.subjects, { name: 'Astronomy' });
    const astronomyId = created.json<{ data: { id: string } }>().data.id;

    const response = await as(
      'teacher',
      'POST',
      ROUTES.marks.assessments,
      assessment({ subjectId: astronomyId, heldOn: '2026-08-21' }),
    );
    expect(response.statusCode).toBe(422);
    expect(response.json<{ detail: string }>().detail).toMatch(/not set up for this class/);
  });

  it('refuses an assessment type the class does not have', async () => {
    const created = await as('owner', 'POST', ROUTES.marks.assessmentTypes, { name: 'Viva' });
    const vivaId = created.json<{ data: { id: string } }>().data.id;

    const response = await as(
      'teacher',
      'POST',
      ROUTES.marks.assessments,
      assessment({ assessmentTypeId: vivaId, heldOn: '2026-08-22' }),
    );
    expect(response.statusCode).toBe(422);
  });

  it('accepts one the class has, once the office adds it', async () => {
    const created = await as('owner', 'POST', ROUTES.marks.classSubjects(GRADE_1), { name: 'Astronomy' });
    const id = created.json<{ data: { subjects: { id: string; name: string }[] } }>().data.subjects.find((entry) => entry.name === 'Astronomy')?.id;

    const response = await as(
      'teacher',
      'POST',
      ROUTES.marks.assessments,
      assessment({ subjectId: id, heldOn: '2026-08-21' }),
    );
    expect(response.statusCode).toBe(201);
  });
});

describe('who teaches a subject in a class', () => {
  const teacherRoute = (classLevelId: string): string => ROUTES.marks.classSubjectTeacher(classLevelId, subjectId);
  type Summary = { data: { subjects: { id: string; teacher: { id: string } | null }[]; teachers: { id: string }[] } };

  it('lets the office choose a teacher, for many classes and subjects at once', async () => {
    for (const classLevelId of [GRADE_1, GRADE_2]) {
      const response = await as('owner', 'PUT', teacherRoute(classLevelId), { teacherId: teacherStaffId });
      expect(response.statusCode).toBe(200);
      const row = response.json<Summary>().data.subjects.find((item) => item.id === subjectId);
      expect(row?.teacher?.id).toBe(teacherStaffId);
      expect(response.json<Summary>().data.teachers.map((teacher) => teacher.id)).toContain(teacherStaffId);
    }
  });

  it('shows the choice to a teacher reading the class, and the timetable form', async () => {
    const summary = await as('teacher', 'GET', ROUTES.marks.classSummary(GRADE_1));
    const row = summary.json<Summary>().data.subjects.find((item) => item.id === subjectId);
    expect(row?.teacher?.id).toBe(teacherStaffId);
  });

  it('takes the teacher off again', async () => {
    const response = await as('owner', 'PUT', teacherRoute(GRADE_2), { teacherId: null });
    expect(response.statusCode).toBe(200);
    expect(response.json<Summary>().data.subjects.find((item) => item.id === subjectId)?.teacher).toBeNull();
  });

  it('refuses someone who is not an active teacher, and a subject the class does not have', async () => {
    expect((await as('owner', 'PUT', teacherRoute(GRADE_1), { teacherId: AASIA })).statusCode).toBe(400);
    expect(
      (await as('owner', 'PUT', ROUTES.marks.classSubject(GRADE_1, AASIA) + '/teacher', { teacherId: null })).statusCode,
    ).toBe(404);
  });

  it('is the office’s to change, not a teacher’s or a parent’s', async () => {
    for (const who of ['teacher', 'parent'] as const) {
      expect((await as(who, 'PUT', teacherRoute(GRADE_1), { teacherId: null })).statusCode).toBe(403);
    }
  });
});
