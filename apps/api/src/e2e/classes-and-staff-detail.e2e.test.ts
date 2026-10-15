import { ROUTES, type ClassLevel, type StaffProfile } from '@ilm/contracts';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { Test } from '@nestjs/testing';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { AppModule } from '../app.module';
import { createAdminClient, type PrismaClient } from '../prisma';
import { PasswordService } from '../shared/auth/password.service';

/**
 * The Classes table and the staff detail page.
 *
 * Built around what the screen got wrong: Class 9 and Nursery had children
 * enrolled and showed 0, because the count summed *sections* and these children
 * had no section; and the "Class teacher" column was a hard-coded dash.
 */

const SCHOOL = '33333333-3333-4333-8333-3333333333e1';
const SESSION = '55555555-5555-4555-8555-5555555555e1';
const NURSERY = '66666666-6666-4666-8666-6666666666e1';
const CLASS_9 = '66666666-6666-4666-8666-6666666666e2';
const CLASS_10 = '66666666-6666-4666-8666-6666666666e3';
const SECTION_10A = '77777777-7777-4777-8777-7777777777e1';
const OWNER = '44444444-4444-4444-8444-4444444444e1';
const PRINCIPAL = '44444444-4444-4444-8444-4444444444e2';

const HOST = 'classes-e2e.localhost';
const PASSWORD = 'correct-horse-battery-staple';

const students = {
  noSectionA: '88888888-8888-4888-8888-8888888888e1', // Class 9, no section
  noSectionB: '88888888-8888-4888-8888-8888888888e2', // Class 9, no section
  left: '88888888-8888-4888-8888-8888888888e3', // Class 9, LEFT — must not count
  nursery: '88888888-8888-4888-8888-8888888888e4', // Nursery, no section
  sectioned: '88888888-8888-4888-8888-8888888888e5', // Class 10, section A
} as const;

let app: NestFastifyApplication;
let admin: PrismaClient;
const jars: Record<string, string> = {};
let ahmedId = '';
let sadiaId = '';

async function wipe(): Promise<void> {
  for (const table of [
    'staff_attendance_records',
    'staff_salary_payments',
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

const as = (who: 'owner' | 'principal' | 'teacher', method: 'GET' | 'POST' | 'PATCH' | 'DELETE', url: string, payload?: unknown) =>
  app.inject({
    method,
    url,
    headers: { host: HOST, cookie: jars[who] ?? '' },
    ...(payload === undefined ? {} : { payload: payload as Record<string, unknown> }),
  });

async function classes(): Promise<Map<string, ClassLevel>> {
  const response = await as('owner', 'GET', ROUTES.academics.classes);
  expect(response.statusCode).toBe(200);
  return new Map(response.json<{ data: ClassLevel[] }>().data.map((entry) => [entry.id, entry]));
}

const teacherBody = (name: string, email: string, cnic: string) => ({
  name,
  email,
  phone: '+923001234567',
  cnic,
  role: 'TEACHER',
});

beforeAll(async () => {
  admin = createAdminClient({ url: process.env['DATABASE_ADMIN_URL'] ?? '' });
  await wipe();

  await admin.$executeRaw`
    INSERT INTO schools (id, name, slug, timezone, created_at, updated_at)
    VALUES (${SCHOOL}::uuid, 'Classes E2E', 'classes-e2e', 'UTC', now(), now())
  `;
  await admin.$executeRawUnsafe(
    `INSERT INTO academic_sessions (id, school_id, name, start_date, end_date, status, is_current, created_at, updated_at)
     VALUES ($1::uuid, $2::uuid, '2026-2027', '2026-04-01', '2027-03-31', 'ACTIVE', true, now(), now())`,
    SESSION,
    SCHOOL,
  );
  for (const [id, name, order] of [
    [NURSERY, 'Nursery', 0],
    [CLASS_9, 'Class 9', 30],
    [CLASS_10, 'Class 10', 31],
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
  await admin.$executeRawUnsafe(
    `INSERT INTO sections (id, school_id, session_id, class_level_id, name, created_at, updated_at)
     VALUES ($1::uuid, $2::uuid, $3::uuid, $4::uuid, 'A', now(), now())`,
    SECTION_10A,
    SCHOOL,
    SESSION,
    CLASS_10,
  );

  const placements: [string, string, string, 'ENROLLED' | 'LEFT', string | null][] = [
    [students.noSectionA, 'Fatima', CLASS_9, 'ENROLLED', null],
    [students.noSectionB, 'Hamza', CLASS_9, 'ENROLLED', null],
    [students.left, 'Ibrahim', CLASS_9, 'LEFT', null],
    [students.nursery, 'Noor', NURSERY, 'ENROLLED', null],
    [students.sectioned, 'Sana', CLASS_10, 'ENROLLED', SECTION_10A],
  ];
  for (const [id, first, classLevel, status, section] of placements) {
    await admin.$executeRawUnsafe(
      `INSERT INTO students (id, school_id, gr_no, student_code, first_name, last_name, status, created_at, updated_at)
       VALUES ($1::uuid, $2::uuid, $3, $3, $4, 'Khan', 'ACTIVE', now(), now())`,
      id,
      SCHOOL,
      `GR-${first}`,
      first,
    );
    await admin.$executeRawUnsafe(
      `INSERT INTO enrollments (id, school_id, student_id, session_id, class_level_id, section_id, status, enrolled_on, created_at, updated_at)
       VALUES (gen_random_uuid(), $1::uuid, $2::uuid, $3::uuid, $4::uuid, $5::uuid, $6::enrollment_status, '2026-04-01', now(), now())`,
      SCHOOL,
      id,
      SESSION,
      classLevel,
      section,
      status,
    );
  }

  const hash = await new PasswordService().hash(PASSWORD);
  for (const [id, email, role] of [
    [OWNER, 'owner@classes-e2e.test', 'OWNER'],
    [PRINCIPAL, 'head@classes-e2e.test', 'PRINCIPAL'],
  ] as const) {
    await admin.$executeRawUnsafe(
      `INSERT INTO users (id, school_id, email, name, password_hash, status, created_at, updated_at)
       VALUES ($1::uuid, $2::uuid, $3, $4, $5, 'ACTIVE', now(), now())`,
      id,
      SCHOOL,
      email,
      role,
      hash,
    );
    await admin.$executeRawUnsafe(
      `INSERT INTO user_roles (id, school_id, user_id, role, created_at)
       VALUES (gen_random_uuid(), $1::uuid, $2::uuid, $3::school_role, now())`,
      SCHOOL,
      id,
      role,
    );
  }

  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  app = moduleRef.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
  const { default: cookie } = await import('@fastify/cookie');
  await app.register(cookie);
  await app.init();
  await app.getHttpAdapter().getInstance().ready();

  jars['owner'] = await signIn('owner@classes-e2e.test');
  jars['principal'] = await signIn('head@classes-e2e.test');

  // The teacher is added the way the form adds one: with Class 9 chosen.
  const created = await as('owner', 'POST', ROUTES.staff.create, {
    ...teacherBody('Ahmed', 'ahmed@classes-e2e.test', '35202-1234567-1'),
    classLevelIds: [CLASS_9],
    basicSalaryMinor: 3_000_000,
    joinedOn: '2026-08-15',
  });
  expect(created.statusCode).toBe(201);
  ahmedId = created.json<{ data: StaffProfile }>().data.id;

  const second = await as('owner', 'POST', ROUTES.staff.create, {
    ...teacherBody('Sadia', 'sadia@classes-e2e.test', '35202-7654321-9'),
    classLevelIds: [CLASS_9, NURSERY],
  });
  sadiaId = second.json<{ data: StaffProfile }>().data.id;
}, 120_000);

afterAll(async () => {
  await app?.close();
  await wipe();
  await admin.$disconnect();
});

describe('student counts on the Classes table', () => {
  it('counts children who are enrolled but not yet in a section', async () => {
    const all = await classes();
    // The bug: both read 0, because the count summed sections.
    expect(all.get(CLASS_9)?.sessionStudentCount).toBe(2);
    expect(all.get(NURSERY)?.sessionStudentCount).toBe(1);
    expect(all.get(CLASS_9)?.sections).toHaveLength(0);
  });

  it('does not count a child who has left', async () => {
    const all = await classes();
    // Three rows exist for Class 9; one is LEFT.
    expect(all.get(CLASS_9)?.sessionStudentCount).toBe(2);
  });

  it('counts sectioned children in both the class and the section', async () => {
    const all = await classes();
    const ten = all.get(CLASS_10);
    expect(ten?.sessionStudentCount).toBe(1);
    expect(ten?.sections[0]?.studentCount).toBe(1);
  });

  it('follows an enrolment change straight away', async () => {
    await admin.$executeRawUnsafe(
      `UPDATE enrollments SET status = 'LEFT' WHERE student_id = $1::uuid`,
      students.nursery,
    );
    expect((await classes()).get(NURSERY)?.sessionStudentCount).toBe(0);
    await admin.$executeRawUnsafe(
      `UPDATE enrollments SET status = 'ENROLLED' WHERE student_id = $1::uuid`,
      students.nursery,
    );
    expect((await classes()).get(NURSERY)?.sessionStudentCount).toBe(1);
  });
});

describe('class teachers on the Classes table', () => {
  it('shows a teacher the moment they are assigned in the staff form', async () => {
    const all = await classes();
    expect(all.get(CLASS_9)?.teachers.map((entry) => entry.name)).toEqual(['Ahmed', 'Sadia']);
    expect(all.get(NURSERY)?.teachers.map((entry) => entry.name)).toEqual(['Sadia']);
    expect(all.get(CLASS_10)?.teachers).toHaveLength(0);
  });

  it('follows an edit: assign another class, remove one', async () => {
    const edited = await as('owner', 'PATCH', ROUTES.staff.update(ahmedId), {
      classLevelIds: [CLASS_10],
    });
    expect(edited.statusCode).toBe(200);

    const all = await classes();
    expect(all.get(CLASS_10)?.teachers.map((entry) => entry.name)).toEqual(['Ahmed']);
    expect(all.get(CLASS_9)?.teachers.map((entry) => entry.name)).toEqual(['Sadia']);
  });

  it('drops a teacher who is removed from the staff list', async () => {
    const removed = await as('owner', 'DELETE', ROUTES.staff.remove(sadiaId), { reason: 'Left the school' });
    expect(removed.statusCode).toBe(200);

    const all = await classes();
    expect(all.get(CLASS_9)?.teachers).toHaveLength(0);
    expect(all.get(NURSERY)?.teachers).toHaveLength(0);
  });
});

describe('the class page reads the same students', () => {
  it('lists exactly the enrolled children of one class', async () => {
    const response = await as('owner', 'GET', `${ROUTES.students.list}?classLevelId=${CLASS_9}&limit=100`);
    expect(response.statusCode).toBe(200);
    const body = response.json<{ data: { id: string }[]; meta: { page: { total: number } } }>();
    expect(body.data.map((row) => row.id).sort()).toEqual([students.noSectionA, students.noSectionB].sort());
    expect(body.meta.page.total).toBe(2);
  });
});

describe('a member of staff’s attendance on their page', () => {
  it('returns one person, not the whole register', async () => {
    for (const staffId of [ahmedId, sadiaId]) {
      await admin.$executeRawUnsafe(
        `INSERT INTO staff_attendance_records (id, school_id, staff_id, date, status, marked_at, created_at, updated_at)
         VALUES (gen_random_uuid(), $1::uuid, $2::uuid, '2026-08-17', 'PRESENT', now(), now(), now())`,
        SCHOOL,
        staffId,
      );
    }
    const response = await as('owner', 'GET', `${ROUTES.attendance.staffReport}?month=2026-08&staffId=${ahmedId}`);
    expect(response.statusCode).toBe(200);
    const rows = response.json<{ data: { rows: { subjectId: string; present: number }[] } }>().data.rows;
    expect(rows).toHaveLength(1);
    expect(rows[0]?.subjectId).toBe(ahmedId);
    expect(rows[0]?.present).toBe(1);
  });
});

describe('salary history', () => {
  it('lists every month since joining, due at the basic salary until paid', async () => {
    const response = await as('owner', 'GET', ROUTES.staff.salary(ahmedId));
    expect(response.statusCode).toBe(200);
    const body = response.json<{
      data: { basicSalaryMinor: number; rows: { month: string; status: string; amountMinor: number; paidOn: string | null }[] };
    }>().data;

    expect(body.basicSalaryMinor).toBe(3_000_000);
    expect(body.rows.at(-1)?.month).toBe('2026-08'); // the month they joined, oldest last
    expect(body.rows.every((row) => row.status === 'DUE')).toBe(true);
    expect(body.rows.every((row) => row.amountMinor === 3_000_000 && row.paidOn === null)).toBe(true);
  });

  it('records a payment once, with its date', async () => {
    const paid = await as('owner', 'POST', ROUTES.staff.salaryPayments(ahmedId), {
      month: '2026-08',
      paidOn: '2026-09-01',
    });
    expect(paid.statusCode).toBe(201);
    const row = paid
      .json<{ data: { rows: { month: string; status: string; amountMinor: number; paidOn: string | null }[] } }>()
      .data.rows.find((entry) => entry.month === '2026-08');
    expect(row).toMatchObject({ status: 'PAID', amountMinor: 3_000_000, paidOn: '2026-09-01' });

    const again = await as('owner', 'POST', ROUTES.staff.salaryPayments(ahmedId), {
      month: '2026-08',
      paidOn: '2026-09-02',
    });
    expect(again.statusCode).toBe(409);
  });

  it('refuses a month that has not started, and a person with no salary to default to', async () => {
    const future = await as('owner', 'POST', ROUTES.staff.salaryPayments(ahmedId), {
      month: '2099-01',
      paidOn: '2026-09-02',
    });
    expect(future.statusCode).toBe(422);

    const noSalary = await as('owner', 'POST', ROUTES.staff.salaryPayments(sadiaId), {
      month: '2026-08',
      paidOn: '2026-09-02',
    });
    expect([404, 422]).toContain(noSalary.statusCode);
  });

  it('lets the principal read it but not record a payment', async () => {
    expect((await as('principal', 'GET', ROUTES.staff.salary(ahmedId))).statusCode).toBe(200);
    expect(
      (await as('principal', 'POST', ROUTES.staff.salaryPayments(ahmedId), { month: '2026-09', paidOn: '2026-09-30' }))
        .statusCode,
    ).toBe(403);
  });

  it('is append-only in the database itself: the app role cannot update or delete', async () => {
    const grants = await admin.$queryRawUnsafe<{ privilege_type: string }[]>(
      `SELECT privilege_type FROM information_schema.role_table_grants
        WHERE table_name = 'staff_salary_payments' AND grantee = 'ilm_app'`,
    );
    expect(grants.map((row) => row.privilege_type).sort()).toEqual(['INSERT', 'SELECT']);
  });
});
