import { ROUTES, type StaffProfile } from '@ilm/contracts';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { Test } from '@nestjs/testing';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { AppModule } from '../app.module';
import { createAdminClient, type PrismaClient } from '../prisma';
import { PasswordService } from '../shared/auth/password.service';

/**
 * A teacher sees, and marks, only the classes they were assigned.
 *
 * Driven through the real endpoints, from the form's own request to the
 * teacher's own session, because the thing being proven is the chain: the
 * owner assigns classes while adding the teacher → they are stored → the
 * teacher's student list, student page, class cards, register and report all
 * narrow to them. A unit test of any one link would pass with another broken.
 *
 * Fixture: Grade 1 and Grade 2 in school A, one child in each, plus a Grade 3
 * in school B that nobody here may ever reach.
 */

const SCHOOL_A = '33333333-3333-4333-8333-3333333333c1';
const SCHOOL_B = '33333333-3333-4333-8333-3333333333c2';
const OWNER = '44444444-4444-4444-8444-4444444444c1';
const SESSION_A = '55555555-5555-4555-8555-5555555555c1';
const SESSION_B = '55555555-5555-4555-8555-5555555555c2';
const GRADE_1 = '66666666-6666-4666-8666-6666666666c1';
const GRADE_2 = '66666666-6666-4666-8666-6666666666c2';
const GRADE_3_OTHER_SCHOOL = '66666666-6666-4666-8666-6666666666c3';
const IN_GRADE_1 = '88888888-8888-4888-8888-8888888888c1';
const IN_GRADE_2 = '88888888-8888-4888-8888-8888888888c2';

const HOST_A = 'teacher-scope-e2e.localhost';
const PASSWORD = 'correct-horse-battery-staple';
const TEACHER_EMAIL = 'teacher@teacher-scope-e2e.test';
const A_WORKING_DAY = '2026-08-12';

let app: NestFastifyApplication;
let admin: PrismaClient;
let ownerJar = '';
let teacherJar = '';
let teacherStaffId = '';

async function wipe(): Promise<void> {
  for (const table of [
    'attendance_records',
    'staff_class_assignments',
    'invitations',
    'staff',
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
      SCHOOL_A,
      SCHOOL_B,
    );
  }
  await admin.$executeRaw`DELETE FROM schools WHERE id IN (${SCHOOL_A}::uuid, ${SCHOOL_B}::uuid)`;
}

async function signIn(identifier: string): Promise<string> {
  const response = await app.inject({
    method: 'POST',
    url: ROUTES.auth.login,
    headers: { host: HOST_A },
    payload: { identifier, password: PASSWORD },
  });
  const raw = response.headers['set-cookie'];
  const list = Array.isArray(raw) ? raw : [String(raw)];
  return list
    .map((entry) => entry.split(';')[0] ?? '')
    .filter((pair) => !pair.endsWith('='))
    .join('; ');
}

const call = (jar: string, method: 'GET' | 'POST' | 'PATCH', url: string, payload?: unknown) =>
  app.inject({
    method,
    url,
    headers: { host: HOST_A, cookie: jar },
    ...(payload === undefined ? {} : { payload: payload as Record<string, unknown> }),
  });

const asTeacher = (method: 'GET' | 'POST', url: string, payload?: unknown) =>
  call(teacherJar, method, url, payload);
const asOwner = (method: 'GET' | 'POST' | 'PATCH', url: string, payload?: unknown) =>
  call(ownerJar, method, url, payload);

const TEACHER_BODY = {
  name: 'Sadia Iqbal',
  email: TEACHER_EMAIL,
  phone: '+923001234567',
  cnic: '35202-1234567-1',
  role: 'TEACHER',
};

function ids(response: { json: <T>() => T }): string[] {
  return response.json<{ data: { id: string }[] }>().data.map((row) => row.id);
}

beforeAll(async () => {
  admin = createAdminClient({ url: process.env['DATABASE_ADMIN_URL'] ?? '' });
  await wipe();

  await admin.$executeRaw`
    INSERT INTO schools (id, name, slug, timezone, working_days, attendance_backdate_days, created_at, updated_at) VALUES
      (${SCHOOL_A}::uuid, 'Teacher Scope A', 'teacher-scope-e2e', 'UTC', ARRAY[1,2,3,4,5,6]::smallint[], 365, now(), now()),
      (${SCHOOL_B}::uuid, 'Teacher Scope B', 'teacher-scope-b-e2e', 'UTC', ARRAY[1,2,3,4,5,6]::smallint[], 365, now(), now())
  `;

  const hash = await new PasswordService().hash(PASSWORD);
  await admin.$executeRaw`
    INSERT INTO users (id, school_id, email, name, password_hash, status, created_at, updated_at)
    VALUES (${OWNER}::uuid, ${SCHOOL_A}::uuid, 'head@teacher-scope-e2e.test', 'Head', ${hash}, 'ACTIVE', now(), now())
  `;
  await admin.$executeRaw`
    INSERT INTO user_roles (id, school_id, user_id, role, created_at)
    VALUES (gen_random_uuid(), ${SCHOOL_A}::uuid, ${OWNER}::uuid, 'OWNER', now())
  `;

  for (const [school, session] of [
    [SCHOOL_A, SESSION_A],
    [SCHOOL_B, SESSION_B],
  ] as const) {
    await admin.$executeRawUnsafe(
      `INSERT INTO academic_sessions (id, school_id, name, start_date, end_date, status, is_current, created_at, updated_at)
       VALUES ($1::uuid, $2::uuid, '2026-2027', '2026-04-01', '2027-03-31', 'ACTIVE', true, now(), now())`,
      session,
      school,
    );
  }

  for (const [id, school, name, order] of [
    [GRADE_1, SCHOOL_A, 'Grade 1', 1],
    [GRADE_2, SCHOOL_A, 'Grade 2', 2],
    [GRADE_3_OTHER_SCHOOL, SCHOOL_B, 'Grade 3', 3],
  ] as const) {
    await admin.$executeRawUnsafe(
      `INSERT INTO class_levels (id, school_id, name, numeric_order, created_at, updated_at)
       VALUES ($1::uuid, $2::uuid, $3, $4, now(), now())`,
      id,
      school,
      name,
      order,
    );
  }

  for (const [id, first, gr, classLevel] of [
    [IN_GRADE_1, 'Aasia', 'GR-9001', GRADE_1],
    [IN_GRADE_2, 'Bilal', 'GR-9002', GRADE_2],
  ] as const) {
    await admin.$executeRawUnsafe(
      `INSERT INTO students (id, school_id, gr_no, student_code, first_name, last_name, status, created_at, updated_at)
       VALUES ($1::uuid, $2::uuid, $3, $3, $4, 'Khan', 'ACTIVE', now(), now())`,
      id,
      SCHOOL_A,
      gr,
      first,
    );
    await admin.$executeRawUnsafe(
      `INSERT INTO enrollments (id, school_id, student_id, session_id, class_level_id, status, enrolled_on, created_at, updated_at)
       VALUES (gen_random_uuid(), $1::uuid, $2::uuid, $3::uuid, $4::uuid, 'ENROLLED', '2026-04-01', now(), now())`,
      SCHOOL_A,
      id,
      SESSION_A,
      classLevel,
    );
  }

  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  app = moduleRef.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
  const { default: cookie } = await import('@fastify/cookie');
  await app.register(cookie);
  await app.init();
  await app.getHttpAdapter().getInstance().ready();

  ownerJar = await signIn('head@teacher-scope-e2e.test');

  // The teacher is created the way the form creates them — with their classes
  // in the same request — and then given a password directly, standing in for
  // accepting the emailed invitation (which has its own suite).
  const created = await asOwner('POST', ROUTES.staff.create, {
    ...TEACHER_BODY,
    classLevelIds: [GRADE_1],
  });
  expect(created.statusCode).toBe(201);
  teacherStaffId = (created.json<{ data: { id: string } }>()).data.id;

  await admin.$executeRawUnsafe(
    `UPDATE users SET password_hash = $1, status = 'ACTIVE' WHERE school_id = $2::uuid AND email = $3`,
    hash,
    SCHOOL_A,
    TEACHER_EMAIL,
  );
  teacherJar = await signIn(TEACHER_EMAIL);
}, 120_000);

afterAll(async () => {
  await app?.close();
  await wipe();
  await admin.$disconnect();
});

describe('saving a teacher with classes', () => {
  it('stores the assignment and returns it on the profile', async () => {
    const response = await asOwner('GET', ROUTES.staff.detail(teacherStaffId));
    expect(response.statusCode).toBe(200);
    expect((response.json<{ data: StaffProfile }>()).data.classLevelIds).toEqual([GRADE_1]);

    const rows = await admin.$queryRawUnsafe<{ n: bigint }[]>(
      `SELECT count(*) AS n FROM staff_class_assignments WHERE staff_id = $1::uuid`,
      teacherStaffId,
    );
    expect(Number(rows[0]?.n)).toBe(1);
  });

  it('audits the assignment', async () => {
    const rows = await admin.$queryRawUnsafe<{ n: bigint }[]>(
      `SELECT count(*) AS n FROM audit_logs WHERE entity_id = $1 AND action = 'staff.classes.assign'`,
      teacherStaffId,
    );
    expect(Number(rows[0]?.n)).toBeGreaterThanOrEqual(1);
  });

  it('refuses classes for anybody who is not a teacher', async () => {
    const response = await asOwner('POST', ROUTES.staff.create, {
      ...TEACHER_BODY,
      email: 'clerk@teacher-scope-e2e.test',
      role: 'OFFICE_STAFF',
      classLevelIds: [GRADE_1],
    });
    expect(response.statusCode).toBe(400);
  });

  it("refuses another school's class, which a foreign key alone would accept", async () => {
    const response = await asOwner('POST', ROUTES.staff.create, {
      ...TEACHER_BODY,
      name: 'Rogue Assignment',
      email: 'rogue@teacher-scope-e2e.test',
      cnic: '35202-7654321-9',
      classLevelIds: [GRADE_3_OTHER_SCHOOL],
    });
    expect(response.statusCode).toBeGreaterThanOrEqual(400);
    expect(response.statusCode).toBeLessThan(500);

    const rows = await admin.$queryRawUnsafe<{ n: bigint }[]>(
      `SELECT count(*) AS n FROM staff_class_assignments WHERE class_level_id = $1::uuid`,
      GRADE_3_OTHER_SCHOOL,
    );
    expect(Number(rows[0]?.n)).toBe(0);
  });
});

describe('what a teacher sees', () => {
  it('lists only the students of their classes, with matching totals', async () => {
    const response = await asTeacher('GET', ROUTES.students.list);
    expect(response.statusCode).toBe(200);
    const body = response.json<{ data: { id: string }[]; meta: { page: { total: number }; aggregates: { totalActive: number } } }>();
    expect(body.data.map((row) => row.id)).toEqual([IN_GRADE_1]);
    expect(body.meta.page.total).toBe(1);
    // The head-count must not tell a teacher how big the rest of the school is.
    expect(body.meta.aggregates.totalActive).toBe(1);
  });

  it('cannot filter their way into another class', async () => {
    const response = await asTeacher('GET', `${ROUTES.students.list}?classLevelId=${GRADE_2}`);
    expect((response.json<{ data: unknown[] }>()).data).toHaveLength(0);
  });

  it('opens their own student, and gets "not found" for anyone else', async () => {
    expect((await asTeacher('GET', ROUTES.students.detail(IN_GRADE_1))).statusCode).toBe(200);
    expect((await asTeacher('GET', ROUTES.students.profile(IN_GRADE_1))).statusCode).toBe(200);

    expect((await asTeacher('GET', ROUTES.students.detail(IN_GRADE_2))).statusCode).toBe(404);
    expect((await asTeacher('GET', ROUTES.students.profile(IN_GRADE_2))).statusCode).toBe(404);
  });

  it('is offered only their classes as a filter', async () => {
    const response = await asTeacher('GET', ROUTES.students.classOptions);
    expect(ids(response)).toEqual([GRADE_1]);
  });

  it('is shown only their classes on the attendance cards', async () => {
    const response = await asTeacher('GET', ROUTES.attendance.classes);
    expect(response.statusCode).toBe(200);
    const classes = (response.json<{ data: { classes: { classLevelId: string }[] } }>()).data
      .classes;
    expect(classes.map((entry) => entry.classLevelId)).toEqual([GRADE_1]);
  });

  it('cannot reach the guardian directory, which has no class to narrow by', async () => {
    expect((await asTeacher('GET', `${ROUTES.students.guardianSearch}?q=a`)).statusCode).toBe(403);
  });
});

describe('attendance for a teacher', () => {
  const entry = (studentId: string) => ({ studentId, status: 'ABSENT' });

  it('reads and marks the register of their own class', async () => {
    const roster = await asTeacher(
      'GET',
      `${ROUTES.attendance.roster(GRADE_1)}?date=${A_WORKING_DAY}`,
    );
    expect(roster.statusCode).toBe(200);

    const marked = await asTeacher('POST', ROUTES.attendance.mark, {
      classLevelId: GRADE_1,
      date: A_WORKING_DAY,
      entries: [entry(IN_GRADE_1)],
    });
    expect(marked.statusCode).toBeLessThan(300);
    expect((marked.json<{ data: { saved: number } }>()).data.saved).toBe(1);

    const report = await asTeacher(
      'GET',
      `${ROUTES.attendance.studentReport(GRADE_1)}?month=2026-08`,
    );
    expect(report.statusCode).toBe(200);
  });

  it('gets "not found" reading, marking or reporting on another class', async () => {
    expect(
      (await asTeacher('GET', `${ROUTES.attendance.roster(GRADE_2)}?date=${A_WORKING_DAY}`))
        .statusCode,
    ).toBe(404);

    const marked = await asTeacher('POST', ROUTES.attendance.mark, {
      classLevelId: GRADE_2,
      date: A_WORKING_DAY,
      entries: [entry(IN_GRADE_2)],
    });
    expect(marked.statusCode).toBe(404);

    expect(
      (await asTeacher('GET', `${ROUTES.attendance.studentReport(GRADE_2)}?month=2026-08`))
        .statusCode,
    ).toBe(404);

    // And nothing was written for the other class.
    const rows = await admin.$queryRawUnsafe<{ n: bigint }[]>(
      `SELECT count(*) AS n FROM attendance_records WHERE student_id = $1::uuid`,
      IN_GRADE_2,
    );
    expect(Number(rows[0]?.n)).toBe(0);
  });

  it("cannot read or mark the staff's own register", async () => {
    expect((await asTeacher('GET', ROUTES.attendance.staffRoster)).statusCode).toBe(403);
    expect(
      (
        await asTeacher('POST', ROUTES.attendance.markStaff, {
          date: A_WORKING_DAY,
          entries: [{ staffId: teacherStaffId, status: 'PRESENT' }],
        })
      ).statusCode,
    ).toBe(403);
    expect(
      (await asTeacher('GET', `${ROUTES.attendance.staffReport}?month=2026-08`)).statusCode,
    ).toBe(403);
  });
});

describe('changing a teacher’s classes', () => {
  it('takes effect on the very next request, with no new sign-in', async () => {
    const updated = await asOwner('PATCH', ROUTES.staff.update(teacherStaffId), {
      classLevelIds: [GRADE_2],
    });
    expect(updated.statusCode).toBe(200);

    expect(ids(await asTeacher('GET', ROUTES.students.list))).toEqual([IN_GRADE_2]);
    expect((await asTeacher('GET', ROUTES.students.detail(IN_GRADE_1))).statusCode).toBe(404);
  });

  it('keeps classes when a PATCH says nothing about them', async () => {
    await asOwner('PATCH', ROUTES.staff.update(teacherStaffId), { casualLeaves: 3 });
    expect(ids(await asTeacher('GET', ROUTES.students.list))).toEqual([IN_GRADE_2]);
  });

  it('supports several classes at once', async () => {
    await asOwner('PATCH', ROUTES.staff.update(teacherStaffId), {
      classLevelIds: [GRADE_1, GRADE_2],
    });
    expect((await asTeacher('GET', ROUTES.students.list)).json<object>()).toMatchObject({
      meta: { page: { total: 2 } },
    });
  });

  it('shows nothing — not everything — when a teacher has no classes', async () => {
    await asOwner('PATCH', ROUTES.staff.update(teacherStaffId), { classLevelIds: [] });

    const students = await asTeacher('GET', ROUTES.students.list);
    expect((students.json<{ data: unknown[] }>()).data).toHaveLength(0);

    const cards = await asTeacher('GET', ROUTES.attendance.classes);
    expect((cards.json<{ data: { classes: unknown[] } }>()).data.classes).toHaveLength(0);
  });

  it('never shows the owner anything less than everything', async () => {
    const students = await asOwner('GET', ROUTES.students.list);
    expect(ids(students).sort()).toEqual([IN_GRADE_1, IN_GRADE_2].sort());
    expect(ids(await asOwner('GET', ROUTES.students.classOptions))).toEqual([GRADE_1, GRADE_2]);
  });

  it('drops the classes when the person stops being a teacher', async () => {
    await asOwner('PATCH', ROUTES.staff.update(teacherStaffId), { classLevelIds: [GRADE_1] });
    const demoted = await asOwner('PATCH', ROUTES.staff.update(teacherStaffId), {
      role: 'OFFICE_STAFF',
    });
    expect(demoted.statusCode).toBe(200);

    const rows = await admin.$queryRawUnsafe<{ n: bigint }[]>(
      `SELECT count(*) AS n FROM staff_class_assignments WHERE staff_id = $1::uuid`,
      teacherStaffId,
    );
    expect(Number(rows[0]?.n)).toBe(0);

    const stillAssigning = await asOwner('PATCH', ROUTES.staff.update(teacherStaffId), {
      classLevelIds: [GRADE_1],
    });
    expect(stillAssigning.statusCode).toBe(422);
  });
});

describe('the Classes page for a teacher', () => {
  const classIds = async (url: string): Promise<string[]> => {
    const response = await asTeacher('GET', url);
    expect(response.statusCode).toBe(200);
    const body = response.json<{ data: { id: string }[] | { classes: { id: string }[] } }>().data;
    return (Array.isArray(body) ? body : body.classes).map((entry) => entry.id);
  };

  it('lists the classes they take and none of the others', async () => {
    // The suite above ends by demoting this person, so make them a teacher again,
    // on Grade 1 only, and sign in fresh so the new role is the one in the session.
    const restored = await asOwner('PATCH', ROUTES.staff.update(teacherStaffId), {
      role: 'TEACHER',
      classLevelIds: [GRADE_1],
    });
    expect(restored.statusCode).toBe(200);
    teacherJar = await signIn(TEACHER_EMAIL);

    expect(await classIds(ROUTES.academics.classes)).toEqual([GRADE_1]);
    // The class tree that pickers use is narrowed the same way.
    expect(await classIds(ROUTES.academics.setup)).toEqual([GRADE_1]);
  });

  it('follows a change of assignment on the very next request', async () => {
    await asOwner('PATCH', ROUTES.staff.update(teacherStaffId), { classLevelIds: [GRADE_2] });
    expect(await classIds(ROUTES.academics.classes)).toEqual([GRADE_2]);

    await asOwner('PATCH', ROUTES.staff.update(teacherStaffId), { classLevelIds: [] });
    expect(await classIds(ROUTES.academics.classes)).toEqual([]);
  });

  it('gives the office every class, unchanged', async () => {
    const response = await asOwner('GET', ROUTES.academics.classes);
    const ids = response.json<{ data: { id: string }[] }>().data.map((entry) => entry.id);
    expect(ids).toEqual(expect.arrayContaining([GRADE_1, GRADE_2]));
  });

  it('is read-only: a teacher cannot create, rename or delete a class', async () => {
    await asOwner('PATCH', ROUTES.staff.update(teacherStaffId), { classLevelIds: [GRADE_1] });
    const created = await app.inject({
      method: 'POST',
      url: ROUTES.academics.classes,
      headers: { host: HOST_A, cookie: teacherJar },
      payload: { name: 'Sneaky', numericOrder: 99 },
    });
    expect(created.statusCode).toBe(403);

    const renamed = await app.inject({
      method: 'PATCH',
      url: `/api/v1/academics/classes/${GRADE_1}`,
      headers: { host: HOST_A, cookie: teacherJar },
      payload: { name: 'Renamed' },
    });
    expect(renamed.statusCode).toBe(403);
  });

  it('keeps school-wide screens out: the promotion preview is the office’s', async () => {
    const response = await asTeacher('GET', `${ROUTES.academics.promotionPreview}`);
    expect(response.statusCode).toBe(403);
  });
});
