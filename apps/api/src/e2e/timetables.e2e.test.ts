import { randomUUID } from 'node:crypto';

import {
  ROUTES,
  type NotificationList,
  type TimetableCalendarEvent,
  type TimetableDetail,
  type TimetableListItem,
  type TimetableOptions,
} from '@ilm/contracts';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { Test } from '@nestjs/testing';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { AppModule } from '../app.module';
import { createAdminClient, type PrismaClient } from '../prisma';
import { PasswordService } from '../shared/auth/password.service';

/**
 * Timetables, end to end (ADR-0017).
 *
 * Real roles, real cookies, a real database with row-level security. Pinned:
 * who may make one (the office) and who may read which (published, and only
 * what concerns them), that a class, a teacher and a room can each be in only
 * one place, that the calendar is a read of the same rows — edit and delete
 * show up, nothing duplicates — and who is told when one is published or moves.
 */

const SCHOOL = '33333333-3333-4333-8333-3333333333e1';
const OTHER_SCHOOL = '33333333-3333-4333-8333-3333333333e2';
const SESSION = '55555555-5555-4555-8555-5555555555e1';
const CLASS_A = '66666666-6666-4666-8666-6666666666e1';
const CLASS_B = '66666666-6666-4666-8666-6666666666e2';
const SECTION_A1 = '99999999-9999-4999-8999-9999999999e1';
const SECTION_A2 = '99999999-9999-4999-8999-9999999999e2';
const SUBJECT_MATHS = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaae1';
const SUBJECT_ENGLISH = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaae2';
const STAFF_ONE = '88888888-8888-4888-8888-8888888888e1';
const STAFF_TWO = '88888888-8888-4888-8888-8888888888e2';
const STAFF_CLERK = '88888888-8888-4888-8888-8888888888e3';
const CHILD_A1 = '77777777-7777-4777-8777-77777777770e';
const CHILD_A2 = '77777777-7777-4777-8777-77777777771e';
const HOST = 'timetables-e2e.localhost';
const PASSWORD = 'correct-horse-battery-staple';

const USERS = {
  OWNER: { id: '44444444-4444-4444-8444-4444444444e1', role: 'OWNER', name: 'Olivia Owner' },
  PRINCIPAL: { id: '44444444-4444-4444-8444-4444444444e2', role: 'PRINCIPAL', name: 'Paul Principal' },
  OFFICE: { id: '44444444-4444-4444-8444-4444444444e3', role: 'RECEPTION', name: 'Rita Office' },
  TEACHER_ONE: { id: '44444444-4444-4444-8444-4444444444e4', role: 'TEACHER', name: 'Tariq Teacher' },
  TEACHER_TWO: { id: '44444444-4444-4444-8444-4444444444e5', role: 'TEACHER', name: 'Tania Teacher' },
  PARENT_A1: { id: '44444444-4444-4444-8444-4444444444e6', role: 'PARENT', name: 'Amna Parent' },
  PARENT_A2: { id: '44444444-4444-4444-8444-4444444444e7', role: 'PARENT', name: 'Bilal Parent' },
  ACCOUNTANT: { id: '44444444-4444-4444-8444-4444444444e8', role: 'ACCOUNTANT', name: 'Asma Accounts' },
} as const;

type Who = keyof typeof USERS;

let app: NestFastifyApplication;
let admin: PrismaClient;
const jars = new Map<Who, string>();
let assessmentTypes: Record<string, string> = {};

const TABLES = [
  'notifications',
  'timetable_entries',
  'timetables',
  'student_guardians',
  'guardians',
  'enrollments',
  'students',
  'staff_class_assignments',
  'staff',
  'class_subjects',
  'subjects',
  'assessment_types',
  'sections',
  'class_levels',
  'academic_sessions',
  'sessions',
  'audit_logs',
  'user_roles',
  'users',
] as const;

async function wipe(): Promise<void> {
  for (const school of [SCHOOL, OTHER_SCHOOL]) {
    for (const table of TABLES) {
      await admin.$executeRawUnsafe(`DELETE FROM ${table} WHERE school_id = $1::uuid`, school);
    }
    await admin.$executeRawUnsafe(`DELETE FROM schools WHERE id = $1::uuid`, school);
  }
}

async function resetTimetables(): Promise<void> {
  for (const table of ['notifications', 'timetable_entries', 'timetables']) {
    await admin.$executeRawUnsafe(`DELETE FROM ${table} WHERE school_id = ANY($1::uuid[])`, [SCHOOL, OTHER_SCHOOL]);
  }
  await admin.$executeRawUnsafe(`DELETE FROM audit_logs WHERE school_id = $1::uuid`, SCHOOL);
}

async function call(who: Who, method: 'GET' | 'POST' | 'PUT' | 'DELETE', url: string, payload?: unknown) {
  return app.inject({
    method,
    url,
    headers: { host: HOST, cookie: jars.get(who) ?? '' },
    ...(payload === undefined ? {} : { payload: payload as Record<string, unknown> }),
  });
}

interface EntryOver {
  subjectId?: string | null;
  teacherId?: string | null;
  room?: string | null;
  dayOfWeek?: number | null;
  onDate?: string | null;
  startTime?: string;
  endTime?: string;
  notes?: string | null;
}

function entry(over: EntryOver = {}) {
  return {
    subjectId: SUBJECT_MATHS,
    teacherId: null,
    room: null,
    dayOfWeek: 1,
    onDate: null,
    startTime: '09:00',
    endTime: '09:40',
    notes: null,
    ...over,
  };
}

/** A weekly class timetable, by default Monday 09:00–09:40 for Class A. */
function weekly(over: Record<string, unknown> = {}, entries = [entry()]) {
  return {
    sessionId: SESSION,
    classLevelId: CLASS_A,
    sectionId: null,
    kind: 'CLASS',
    assessmentTypeId: null,
    title: 'Class A weekly timetable',
    description: null,
    startsOn: null,
    endsOn: null,
    entries,
    publish: false,
    ...over,
  };
}

function paper(over: EntryOver = {}) {
  return entry({ dayOfWeek: null, onDate: '2026-11-10', ...over });
}

function exam(over: Record<string, unknown> = {}, entries = [paper()]) {
  return {
    sessionId: SESSION,
    classLevelId: CLASS_A,
    sectionId: null,
    kind: 'ASSESSMENT',
    assessmentTypeId: assessmentTypes['Midterm exam'] ?? '',
    title: 'Midterm exam sheet',
    description: null,
    startsOn: null,
    endsOn: null,
    entries,
    publish: false,
    ...over,
  };
}

async function make(who: Who, payload: unknown): Promise<TimetableDetail> {
  const response = await call(who, 'POST', ROUTES.timetables.list, payload);
  expect(response.statusCode, response.body).toBe(201);
  return response.json<{ data: TimetableDetail }>().data;
}

async function list(who: Who, query = ''): Promise<{ data: TimetableListItem[]; total: number }> {
  const response = await call(who, 'GET', `${ROUTES.timetables.list}${query}`);
  expect(response.statusCode, response.body).toBe(200);
  const body = response.json<{ data: TimetableListItem[]; meta: { page: { total: number } } }>();
  return { data: body.data, total: body.meta.page.total };
}

async function events(who: Who, query: string): Promise<TimetableCalendarEvent[]> {
  const response = await call(who, 'GET', `${ROUTES.timetables.calendar}?${query}`);
  expect(response.statusCode, response.body).toBe(200);
  return response.json<{ data: TimetableCalendarEvent[] }>().data;
}

async function bell(who: Who): Promise<NotificationList> {
  const response = await call(who, 'GET', ROUTES.notifications.list);
  return response.json<{ data: NotificationList }>().data;
}

beforeAll(async () => {
  admin = createAdminClient({ url: process.env['DATABASE_ADMIN_URL'] ?? '' });
  await wipe();
  const hash = await new PasswordService().hash(PASSWORD);

  for (const [id, name, slug] of [
    [SCHOOL, 'Timetables E2E', 'timetables-e2e'],
    [OTHER_SCHOOL, 'Timetables Other E2E', 'timetables-other-e2e'],
  ] as const) {
    await admin.$executeRawUnsafe(
      `INSERT INTO schools (id, name, slug, created_at, updated_at) VALUES ($1::uuid, $2, $3, now(), now())`,
      id,
      name,
      slug,
    );
  }

  for (const [who, user] of Object.entries(USERS)) {
    await admin.$executeRawUnsafe(
      `INSERT INTO users (id, school_id, email, name, password_hash, status, created_at, updated_at)
       VALUES ($1::uuid, $2::uuid, $3, $4, $5, 'ACTIVE', now(), now())`,
      user.id,
      SCHOOL,
      `${who.toLowerCase().replace('_', '-')}@timetables-e2e.test`,
      user.name,
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

  await admin.$executeRawUnsafe(
    `INSERT INTO academic_sessions (id, school_id, name, start_date, end_date, status, is_current, created_at, updated_at)
     VALUES ($1::uuid, $2::uuid, '2026-2027', '2026-04-01', '2027-03-31', 'ACTIVE', true, now(), now())`,
    SESSION,
    SCHOOL,
  );
  for (const [id, name, order] of [
    [CLASS_A, 'Class A', 1],
    [CLASS_B, 'Class B', 2],
  ] as const) {
    await admin.$executeRawUnsafe(
      `INSERT INTO class_levels (id, school_id, name, numeric_order, is_active, created_at, updated_at)
       VALUES ($1::uuid, $2::uuid, $3, $4, true, now(), now())`,
      id,
      SCHOOL,
      name,
      order,
    );
  }
  for (const [id, name] of [
    [SECTION_A1, 'A1'],
    [SECTION_A2, 'A2'],
  ] as const) {
    await admin.$executeRawUnsafe(
      `INSERT INTO sections (id, school_id, session_id, class_level_id, name, created_at, updated_at)
       VALUES ($1::uuid, $2::uuid, $3::uuid, $4::uuid, $5, now(), now())`,
      id,
      SCHOOL,
      SESSION,
      CLASS_A,
      name,
    );
  }

  // Class A has Maths configured and English not, so "only its own subjects" is testable.
  for (const [id, name] of [
    [SUBJECT_MATHS, 'Maths'],
    [SUBJECT_ENGLISH, 'English'],
  ] as const) {
    await admin.$executeRawUnsafe(
      `INSERT INTO subjects (id, school_id, name, created_at) VALUES ($1::uuid, $2::uuid, $3, now())`,
      id,
      SCHOOL,
      name,
    );
  }
  await admin.$executeRawUnsafe(
    `INSERT INTO class_subjects (id, school_id, class_level_id, subject_id, created_at)
     VALUES (gen_random_uuid(), $1::uuid, $2::uuid, $3::uuid, now())`,
    SCHOOL,
    CLASS_A,
    SUBJECT_MATHS,
  );

  // One child in A1, one in A2.
  for (const [id, first, section, gr, parent] of [
    [CHILD_A1, 'Zara', SECTION_A1, 'TT-1', USERS.PARENT_A1],
    [CHILD_A2, 'Yusuf', SECTION_A2, 'TT-2', USERS.PARENT_A2],
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
      `INSERT INTO enrollments (id, school_id, student_id, session_id, class_level_id, section_id, status, created_at, updated_at)
       VALUES (gen_random_uuid(), $1::uuid, $2::uuid, $3::uuid, $4::uuid, $5::uuid, 'ENROLLED', now(), now())`,
      SCHOOL,
      id,
      SESSION,
      CLASS_A,
      section,
    );
    const guardianId = randomUUID();
    await admin.$executeRawUnsafe(
      `INSERT INTO guardians (id, school_id, name, relation, user_id, created_at, updated_at)
       VALUES ($1::uuid, $2::uuid, $3, 'FATHER', $4::uuid, now(), now())`,
      guardianId,
      SCHOOL,
      parent.name,
      parent.id,
    );
    await admin.$executeRawUnsafe(
      `INSERT INTO student_guardians (id, school_id, student_id, guardian_id, is_primary, created_at)
       VALUES (gen_random_uuid(), $1::uuid, $2::uuid, $3::uuid, true, now())`,
      SCHOOL,
      id,
      guardianId,
    );
  }

  // Teacher one takes class A; teacher two takes class B. A clerk is not a teacher.
  for (const [id, userId, name, role, empNo] of [
    [STAFF_ONE, USERS.TEACHER_ONE.id, 'Tariq Teacher', 'TEACHER', 'T-1'],
    [STAFF_TWO, USERS.TEACHER_TWO.id, 'Tania Teacher', 'TEACHER', 'T-2'],
    [STAFF_CLERK, null, 'Clark Clerk', 'OFFICE_STAFF', 'C-1'],
  ] as const) {
    await admin.$executeRawUnsafe(
      `INSERT INTO staff (id, school_id, employee_no, user_id, name, email, phone, role, status, basic_salary, created_at, updated_at)
       VALUES ($1::uuid, $2::uuid, $3, $4::uuid, $5, $6, '+923001234567', $7::staff_role, 'ACTIVE', 40000, now(), now())`,
      id,
      SCHOOL,
      empNo,
      userId,
      name,
      `${empNo.toLowerCase()}@timetables-e2e.test`,
      role,
    );
  }
  for (const [staff, classId] of [
    [STAFF_ONE, CLASS_A],
    [STAFF_TWO, CLASS_B],
  ] as const) {
    await admin.$executeRawUnsafe(
      `INSERT INTO staff_class_assignments (id, school_id, staff_id, class_level_id, created_at)
       VALUES (gen_random_uuid(), $1::uuid, $2::uuid, $3::uuid, now())`,
      SCHOOL,
      staff,
      classId,
    );
  }

  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  app = moduleRef.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
  const { default: cookie } = await import('@fastify/cookie');
  await app.register(cookie);
  await app.init();
  await app.getHttpAdapter().getInstance().ready();

  for (const [who, user] of Object.entries(USERS)) {
    const response = await app.inject({
      method: 'POST',
      url: ROUTES.auth.login,
      headers: { host: HOST },
      payload: {
        identifier: `${who.toLowerCase().replace('_', '-')}@timetables-e2e.test`,
        password: PASSWORD,
      },
    });
    expect(response.statusCode, `${user.name} could not sign in`).toBeLessThan(300);
    const raw = response.headers['set-cookie'];
    const cookies = Array.isArray(raw) ? raw : [String(raw)];
    jars.set(
      who as Who,
      cookies
        .map((item) => item.split(';')[0] ?? '')
        .filter((pair) => !pair.endsWith('='))
        .join('; '),
    );
  }

  // The same starting list the marks screens use: the form seeds it on first read.
  const options = await call('OWNER', 'GET', ROUTES.timetables.options);
  expect(options.statusCode).toBe(200);
  assessmentTypes = Object.fromEntries(
    options.json<{ data: TimetableOptions }>().data.assessmentTypes.map((type) => [type.name, type.id]),
  );
}, 180_000);

beforeEach(resetTimetables);

afterAll(async () => {
  await app?.close();
  await wipe();
  await admin.$disconnect();
});

describe('who makes timetables', () => {
  it('lets the Admin, Principal and Office Staff make one', async () => {
    for (const who of ['OWNER', 'PRINCIPAL', 'OFFICE'] as const) {
      await resetTimetables();
      const made = await make(who, weekly());
      expect(made.status).toBe('DRAFT');
    }
  });

  it('refuses a teacher, a parent and an accountant', async () => {
    for (const who of ['TEACHER_ONE', 'PARENT_A1', 'ACCOUNTANT'] as const) {
      expect((await call(who, 'POST', ROUTES.timetables.list, weekly())).statusCode, who).toBe(403);
    }
  });

  it('refuses them the form’s options, and editing, publishing and deleting', async () => {
    const made = await make('OWNER', weekly());
    for (const who of ['TEACHER_ONE', 'PARENT_A1'] as const) {
      expect((await call(who, 'GET', ROUTES.timetables.options)).statusCode, who).toBe(403);
      expect((await call(who, 'PUT', ROUTES.timetables.detail(made.id), weekly())).statusCode, who).toBe(403);
      expect((await call(who, 'POST', ROUTES.timetables.publish(made.id))).statusCode, who).toBe(403);
      expect((await call(who, 'DELETE', ROUTES.timetables.detail(made.id))).statusCode, who).toBe(403);
    }
  });

  it('starts a school with the five assessment types, shared with the marks screens', () => {
    expect(Object.keys(assessmentTypes)).toEqual(
      expect.arrayContaining(['Class test', 'Monthly test', 'Surprise test', 'Midterm exam', 'Final exam']),
    );
  });
});

describe('draft and published', () => {
  it('hides a draft from everyone but the office', async () => {
    const made = await make('OWNER', weekly());

    for (const who of ['OWNER', 'PRINCIPAL', 'OFFICE'] as const) {
      expect((await list(who)).total, who).toBe(1);
    }
    for (const who of ['TEACHER_ONE', 'PARENT_A1'] as const) {
      expect((await list(who)).total, who).toBe(0);
      expect((await call(who, 'GET', ROUTES.timetables.detail(made.id))).statusCode, who).toBe(404);
    }
  });

  it('shows a published one to its class and to every teacher, and nobody else', async () => {
    const made = await make('OWNER', weekly({ publish: true }));
    expect(made.status).toBe('PUBLISHED');
    expect(made.publishedAt).not.toBeNull();

    expect((await list('PARENT_A1')).total).toBe(1);
    expect((await list('TEACHER_ONE')).total).toBe(1);
    // Every teacher sees it, whichever class they teach; a non-reader does not.
    expect((await list('TEACHER_TWO')).total).toBe(1);
    expect((await call('TEACHER_TWO', 'GET', ROUTES.timetables.detail(made.id))).statusCode).toBe(200);
    expect((await call('ACCOUNTANT', 'GET', ROUTES.timetables.list)).statusCode).toBe(403);
  });

  it('shows a section’s timetable only to the section', async () => {
    await make('OWNER', weekly({ sectionId: SECTION_A1, publish: true }));

    expect((await list('PARENT_A1')).total).toBe(1);
    expect((await list('PARENT_A2')).total).toBe(0);
    // A whole-class timetable reaches both.
    await make('OWNER', weekly({ title: 'Whole class', publish: true }, [entry({ dayOfWeek: 2 })]));
    expect((await list('PARENT_A2')).total).toBe(1);
  });

  it('shows a teacher a timetable they teach in, even for a class that is not theirs', async () => {
    await make(
      'OWNER',
      weekly({ classLevelId: CLASS_B, title: 'Class B', publish: true }, [entry({ subjectId: null, teacherId: STAFF_ONE })]),
    );
    expect((await list('TEACHER_ONE')).total).toBe(1);
  });

  it('publishes and takes back, idempotently', async () => {
    const made = await make('OWNER', weekly());

    const first = await call('OFFICE', 'POST', ROUTES.timetables.publish(made.id));
    expect(first.json<{ data: TimetableDetail }>().data.status).toBe('PUBLISHED');
    expect((await call('OFFICE', 'POST', ROUTES.timetables.publish(made.id))).statusCode).toBe(201);
    expect((await list('PARENT_A1')).total).toBe(1);

    const back = await call('OFFICE', 'POST', ROUTES.timetables.unpublish(made.id));
    expect(back.json<{ data: TimetableDetail }>().data).toMatchObject({ status: 'DRAFT', publishedAt: null });
    expect((await list('PARENT_A1')).total).toBe(0);
  });

  it('never reaches another school’s timetables', async () => {
    const foreignSession = randomUUID();
    const foreignClass = randomUUID();
    await admin.$executeRawUnsafe(
      `INSERT INTO academic_sessions (id, school_id, name, start_date, end_date, status, is_current, created_at, updated_at)
       VALUES ($1::uuid, $2::uuid, '2026', '2026-04-01', '2027-03-31', 'ACTIVE', true, now(), now())`,
      foreignSession,
      OTHER_SCHOOL,
    );
    await admin.$executeRawUnsafe(
      `INSERT INTO class_levels (id, school_id, name, numeric_order, is_active, created_at, updated_at)
       VALUES ($1::uuid, $2::uuid, 'Elsewhere', 1, true, now(), now())`,
      foreignClass,
      OTHER_SCHOOL,
    );
    const foreign = randomUUID();
    await admin.$executeRawUnsafe(
      `INSERT INTO timetables (id, school_id, session_id, class_level_id, kind, title, status, published_at, updated_at)
       VALUES ($1::uuid, $2::uuid, $3::uuid, $4::uuid, 'CLASS', 'Another school', 'PUBLISHED', now(), now())`,
      foreign,
      OTHER_SCHOOL,
      foreignSession,
      foreignClass,
    );

    expect((await list('OWNER')).total).toBe(0);
    expect((await call('OWNER', 'GET', ROUTES.timetables.detail(foreign))).statusCode).toBe(404);
    expect((await call('OWNER', 'DELETE', ROUTES.timetables.detail(foreign))).statusCode).toBe(404);
    expect((await call('OWNER', 'POST', ROUTES.timetables.publish(foreign))).statusCode).toBe(404);
  });

  it('needs a session', async () => {
    const response = await app.inject({ method: 'GET', url: ROUTES.timetables.list, headers: { host: HOST } });
    expect(response.statusCode).toBe(401);
  });
});

describe('assessment timetables', () => {
  it('lists several subjects on several dates, and works out its own span', async () => {
    const made = await make(
      'OWNER',
      exam({}, [
        paper({ subjectId: SUBJECT_MATHS, onDate: '2026-11-12' }),
        paper({ subjectId: null, onDate: '2026-11-10', startTime: '10:00', endTime: '12:00' }),
        paper({ subjectId: null, onDate: '2026-11-14', notes: 'Bring a calculator.' }),
      ]),
    );

    expect(made.kind).toBe('ASSESSMENT');
    expect(made.assessmentType?.name).toBe('Midterm exam');
    expect(made.entries).toHaveLength(3);
    expect([made.startsOn, made.endsOn]).toEqual(['2026-11-10', '2026-11-14']);
    expect(made.entries.at(-1)?.notes).toBe('Bring a calculator.');
  });

  it('wants its type, and a class timetable has none', async () => {
    const noType = await call('OWNER', 'POST', ROUTES.timetables.list, exam({ assessmentTypeId: null }));
    const classWithType = await call(
      'OWNER',
      'POST',
      ROUTES.timetables.list,
      weekly({ assessmentTypeId: assessmentTypes['Class test'] ?? '' }),
    );
    expect(noType.statusCode).toBe(400);
    expect(classWithType.statusCode).toBe(400);
  });

  it('uses dates for papers and weekdays for periods, never the wrong one', async () => {
    expect((await call('OWNER', 'POST', ROUTES.timetables.list, exam({}, [entry()]))).statusCode).toBe(400);
    expect((await call('OWNER', 'POST', ROUTES.timetables.list, weekly({}, [paper()]))).statusCode).toBe(400);
  });
});

describe('what a timetable must satisfy', () => {
  it('refuses an end before a start, and a malformed time', async () => {
    const backwards = await call('OWNER', 'POST', ROUTES.timetables.list, weekly({}, [entry({ startTime: '10:00', endTime: '09:00' })]));
    const malformed = await call('OWNER', 'POST', ROUTES.timetables.list, weekly({}, [entry({ startTime: '9am' })]));
    expect(backwards.statusCode).toBe(400);
    expect(malformed.statusCode).toBe(400);
  });

  it('refuses nothing to schedule', async () => {
    expect((await call('OWNER', 'POST', ROUTES.timetables.list, weekly({}, []))).statusCode).toBe(400);
  });

  it('keeps papers inside the session', async () => {
    const outside = await call('OWNER', 'POST', ROUTES.timetables.list, exam({}, [paper({ onDate: '2025-01-05' })]));
    expect(outside.statusCode).toBe(400);
    expect(outside.json<{ detail: string }>().detail).toContain('outside the session');
  });

  it('keeps a class to its own subjects once it has any', async () => {
    const response = await call('OWNER', 'POST', ROUTES.timetables.list, weekly({}, [entry({ subjectId: SUBJECT_ENGLISH })]));
    expect(response.statusCode).toBe(400);
    expect(response.json<{ detail: string }>().detail).toContain('English');
    // Class B has no subjects set up, so it has not said, and is not stopped.
    const classB = await call(
      'OWNER',
      'POST',
      ROUTES.timetables.list,
      weekly({ classLevelId: CLASS_B, title: 'Class B' }, [entry({ subjectId: SUBJECT_ENGLISH })]),
    );
    expect(classB.statusCode).toBe(201);
  });

  it('only gives a period to an active teacher', async () => {
    const clerk = await call('OWNER', 'POST', ROUTES.timetables.list, weekly({}, [entry({ teacherId: STAFF_CLERK })]));
    expect(clerk.statusCode).toBe(400);
    const stranger = await call('OWNER', 'POST', ROUTES.timetables.list, weekly({}, [entry({ teacherId: randomUUID() })]));
    expect(stranger.statusCode).toBe(400);
  });

  it('refuses a section that is not in the class', async () => {
    const response = await call('OWNER', 'POST', ROUTES.timetables.list, weekly({ classLevelId: CLASS_B, sectionId: SECTION_A1 }));
    expect(response.statusCode).toBe(400);
  });
});

describe('conflicts', () => {
  it('will not put a teacher in two classes at once, and names them', async () => {
    await make('OWNER', weekly({}, [entry({ teacherId: STAFF_ONE })]));

    const response = await call(
      'OWNER',
      'POST',
      ROUTES.timetables.list,
      weekly({ classLevelId: CLASS_B, title: 'Class B' }, [entry({ teacherId: STAFF_ONE, startTime: '09:20', endTime: '10:00' })]),
    );

    expect(response.statusCode).toBe(409);
    const detail = response.json<{ detail: string; code: string }>();
    expect(detail.code).toBe('TIMETABLE_CONFLICT');
    expect(detail.detail).toContain('Tariq Teacher');
    expect(detail.detail).toContain('Monday');
    expect(detail.detail).toContain('9:00 AM');
  });

  it('will not use a room twice, whatever the capitals', async () => {
    await make('OWNER', weekly({}, [entry({ room: 'Lab 1' })]));

    const response = await call(
      'OWNER',
      'POST',
      ROUTES.timetables.list,
      weekly({ classLevelId: CLASS_B, title: 'Class B' }, [entry({ room: 'LAB 1' })]),
    );
    expect(response.statusCode).toBe(409);
    expect(response.json<{ detail: string }>().detail).toContain('Room Lab 1');
  });

  it('will not give a class two timetables at the same hour, but sections apart are fine', async () => {
    await make('OWNER', weekly({ sectionId: SECTION_A1 }));

    const wholeClass = await call('OWNER', 'POST', ROUTES.timetables.list, weekly({ title: 'Whole class' }));
    expect(wholeClass.statusCode).toBe(409);
    expect(wholeClass.json<{ detail: string }>().detail).toContain('This class already has');

    const otherSection = await call('OWNER', 'POST', ROUTES.timetables.list, weekly({ sectionId: SECTION_A2, title: 'Section A2' }));
    expect(otherSection.statusCode, otherSection.body).toBe(201);
  });

  it('allows one period to start as the last ends', async () => {
    await make('OWNER', weekly({}, [entry({ teacherId: STAFF_ONE })]));
    const next = await call(
      'OWNER',
      'POST',
      ROUTES.timetables.list,
      weekly({ classLevelId: CLASS_B, title: 'Class B' }, [entry({ teacherId: STAFF_ONE, startTime: '09:40', endTime: '10:20' })]),
    );
    expect(next.statusCode).toBe(201);
  });

  it('allows the same hour on another day', async () => {
    await make('OWNER', weekly({}, [entry({ teacherId: STAFF_ONE })]));
    const tuesday = await call(
      'OWNER',
      'POST',
      ROUTES.timetables.list,
      weekly({ classLevelId: CLASS_B, title: 'Class B' }, [entry({ teacherId: STAFF_ONE, dayOfWeek: 2 })]),
    );
    expect(tuesday.statusCode).toBe(201);
  });

  it('lets two terms use the same hour when their dates do not meet', async () => {
    await make('OWNER', weekly({ startsOn: '2026-04-01', endsOn: '2026-09-30' }));
    const later = await call('OWNER', 'POST', ROUTES.timetables.list, weekly({ title: 'Term two', startsOn: '2026-10-01', endsOn: '2027-03-31' }));
    expect(later.statusCode).toBe(201);

    const overlapping = await call('OWNER', 'POST', ROUTES.timetables.list, weekly({ title: 'Clash', startsOn: '2026-09-01', endsOn: '2026-10-15' }));
    expect(overlapping.statusCode).toBe(409);
  });

  it('will not let two papers for a class overlap on a date, or one teacher invigilate two', async () => {
    const overlapping = await call(
      'OWNER',
      'POST',
      ROUTES.timetables.list,
      exam({}, [paper(), paper({ startTime: '09:30', endTime: '10:30' })]),
    );
    expect(overlapping.statusCode).toBe(409);

    await make('OWNER', exam({}, [paper({ teacherId: STAFF_ONE })]));
    const invigilating = await call(
      'OWNER',
      'POST',
      ROUTES.timetables.list,
      exam({ classLevelId: CLASS_B, title: 'Class B exam' }, [paper({ teacherId: STAFF_ONE })]),
    );
    expect(invigilating.statusCode).toBe(409);
  });

  it('does not clash a timetable with itself when it is edited', async () => {
    const made = await make('OWNER', weekly({}, [entry({ teacherId: STAFF_ONE, room: 'Lab 1' })]));

    const edited = await call(
      'OWNER',
      'PUT',
      ROUTES.timetables.detail(made.id),
      weekly({ title: 'Renamed' }, [entry({ teacherId: STAFF_ONE, room: 'Lab 1' })]),
    );
    expect(edited.statusCode, edited.body).toBe(200);
    expect(edited.json<{ data: TimetableDetail }>().data.title).toBe('Renamed');
  });

  it('saves nothing when it refuses', async () => {
    await make('OWNER', weekly({}, [entry({ teacherId: STAFF_ONE })]));
    await call(
      'OWNER',
      'POST',
      ROUTES.timetables.list,
      weekly({ classLevelId: CLASS_B, title: 'Class B' }, [entry({ teacherId: STAFF_ONE })]),
    );
    expect((await list('OWNER')).total).toBe(1);
  });
});

describe('editing', () => {
  it('replaces the periods wholesale', async () => {
    const made = await make('OWNER', weekly({}, [entry(), entry({ dayOfWeek: 2 }), entry({ dayOfWeek: 3 })]));
    expect(made.entries).toHaveLength(3);

    const edited = await call('OWNER', 'PUT', ROUTES.timetables.detail(made.id), weekly({}, [entry({ dayOfWeek: 4 })]));
    const detail = edited.json<{ data: TimetableDetail }>().data;
    expect(detail.entries).toHaveLength(1);
    expect(detail.entries[0]?.dayOfWeek).toBe(4);
    expect(await count(`SELECT count(*) AS n FROM timetable_entries WHERE timetable_id = $1::uuid`, made.id)).toBe(1);
  });

  it('keeps a published timetable published', async () => {
    const made = await make('OWNER', weekly({ publish: true }));
    const edited = await call('OWNER', 'PUT', ROUTES.timetables.detail(made.id), weekly({ title: 'Edited' }));
    expect(edited.json<{ data: TimetableDetail }>().data.status).toBe('PUBLISHED');
  });

  it('publishes a draft from the edit when asked', async () => {
    const made = await make('OWNER', weekly());
    const edited = await call('OWNER', 'PUT', ROUTES.timetables.detail(made.id), weekly({ publish: true }));
    expect(edited.json<{ data: TimetableDetail }>().data.status).toBe('PUBLISHED');
  });

  it('deletes with its periods', async () => {
    const made = await make('OWNER', weekly({}, [entry(), entry({ dayOfWeek: 2 })]));
    expect((await call('OWNER', 'DELETE', ROUTES.timetables.detail(made.id))).statusCode).toBe(200);

    expect((await list('OWNER')).total).toBe(0);
    expect(await count(`SELECT count(*) AS n FROM timetable_entries WHERE timetable_id = $1::uuid`, made.id)).toBe(0);
    expect((await call('OWNER', 'DELETE', ROUTES.timetables.detail(made.id))).statusCode).toBe(404);
  });

  it('audits what the office did', async () => {
    const made = await make('OWNER', weekly());
    await call('OWNER', 'POST', ROUTES.timetables.publish(made.id));
    await call('OWNER', 'DELETE', ROUTES.timetables.detail(made.id));

    const actions = await admin.$queryRawUnsafe<{ action: string }[]>(
      `SELECT action FROM audit_logs WHERE school_id = $1::uuid AND entity_id = $2 AND action LIKE 'timetables.%' ORDER BY at`,
      SCHOOL,
      made.id,
    );
    expect(actions.map((row) => row.action)).toEqual(['timetables.create', 'timetables.publish', 'timetables.delete']);
  });
});

describe('the list', () => {
  it('filters by class, kind, status and search', async () => {
    await make('OWNER', weekly({ title: 'Alpha weekly' }));
    await make('OWNER', exam({ title: 'Beta sheet', publish: true }));
    await make('OWNER', weekly({ classLevelId: CLASS_B, title: 'Gamma weekly' }, [entry({ dayOfWeek: 5 })]));

    expect((await list('OWNER', `?classLevelId=${CLASS_B}`)).data.map((t) => t.title)).toEqual(['Gamma weekly']);
    expect((await list('OWNER', '?kind=ASSESSMENT')).data.map((t) => t.title)).toEqual(['Beta sheet']);
    expect((await list('OWNER', '?status=DRAFT')).total).toBe(2);
    expect((await list('OWNER', '?q=alpha')).data.map((t) => t.title)).toEqual(['Alpha weekly']);
    expect((await list('OWNER', `?assessmentTypeId=${assessmentTypes['Midterm exam'] ?? ''}`)).total).toBe(1);
  });

  it('pages by twenty', async () => {
    for (let index = 0; index < 22; index += 1) {
      await make('OWNER', weekly({ title: `Timetable ${String(index + 1)}`, classLevelId: CLASS_B }, [entry({ dayOfWeek: (index % 7) + 1, startTime: `${String(8 + Math.floor(index / 7)).padStart(2, '0')}:00`, endTime: `${String(8 + Math.floor(index / 7)).padStart(2, '0')}:30` })]));
    }
    expect((await list('OWNER')).data).toHaveLength(20);
    expect((await list('OWNER', '?offset=20')).data).toHaveLength(2);
  });

  it('rejects a misspelt filter instead of returning everything', async () => {
    expect((await call('OWNER', 'GET', `${ROUTES.timetables.list}?statuss=DRAFT`)).statusCode).toBe(400);
  });
});

describe('the calendar', () => {
  const NOVEMBER = 'from=2026-11-01&to=2026-11-30';

  it('shows dated papers on their dates, to the office across the school', async () => {
    await make('OWNER', exam({ publish: true }, [paper({ onDate: '2026-11-10' }), paper({ onDate: '2026-11-12', startTime: '10:00', endTime: '11:00' })]));

    const seen = await events('OFFICE', NOVEMBER);
    expect(seen.map((event) => event.date)).toEqual(['2026-11-10', '2026-11-12']);
    expect(seen[0]).toMatchObject({ kind: 'EXAM', classLevel: 'Class A', subject: 'Maths', title: 'Midterm exam sheet' });
  });

  it('colours a test and an exam differently', async () => {
    await make('OWNER', exam({ title: 'Quiz', assessmentTypeId: assessmentTypes['Class test'] ?? '', publish: true }, [paper({ onDate: '2026-11-03' })]));
    await make('OWNER', exam({ title: 'Exam', publish: true }, [paper({ onDate: '2026-11-04' })]));
    expect((await events('OWNER', NOVEMBER)).map((event) => event.kind)).toEqual(['TEST', 'EXAM']);
  });

  it('expands weekly periods onto the dates they fall on', async () => {
    await make('OWNER', weekly({ publish: true }, [entry({ dayOfWeek: 1 }), entry({ dayOfWeek: 3, startTime: '10:00', endTime: '10:40' })]));

    const parent = await events('PARENT_A1', NOVEMBER);
    // Mondays 2, 9, 16, 23, 30 and Wednesdays 4, 11, 18, 25.
    expect(parent.filter((event) => event.startTime === '09:00').map((event) => event.date)).toEqual([
      '2026-11-02',
      '2026-11-09',
      '2026-11-16',
      '2026-11-23',
      '2026-11-30',
    ]);
    expect(parent.filter((event) => event.startTime === '10:00')).toHaveLength(4);
    expect(new Set(parent.map((event) => event.key)).size).toBe(parent.length);
  });

  it('keeps weekly periods inside the timetable’s effective dates', async () => {
    await make('OWNER', weekly({ publish: true, startsOn: '2026-11-10', endsOn: '2026-11-20' }));
    expect((await events('PARENT_A1', NOVEMBER)).map((event) => event.date)).toEqual(['2026-11-16']);
  });

  it('does not bury the office in every period of every class — it picks a class', async () => {
    await make('OWNER', weekly({ publish: true }));

    expect(await events('OWNER', NOVEMBER)).toHaveLength(0);
    expect((await events('OWNER', `${NOVEMBER}&classLevelId=${CLASS_A}`)).length).toBe(5);
    expect(await events('OWNER', `${NOVEMBER}&classLevelId=${CLASS_B}`)).toHaveLength(0);
  });

  it('never shows a draft to a parent or a teacher, and shows it to the office with its status', async () => {
    await make('OWNER', exam({}, [paper({ onDate: '2026-11-10' })]));

    expect(await events('PARENT_A1', NOVEMBER)).toHaveLength(0);
    expect(await events('TEACHER_ONE', NOVEMBER)).toHaveLength(0);
    expect((await events('OWNER', NOVEMBER)).map((event) => event.status)).toEqual(['DRAFT']);
  });

  it('shows each person only what concerns them', async () => {
    await make('OWNER', exam({ publish: true, sectionId: SECTION_A1 }, [paper()]));
    await make('OWNER', exam({ publish: true, classLevelId: CLASS_B, title: 'Class B exam' }, [paper({ startTime: '13:00', endTime: '14:00' })]));

    expect((await events('PARENT_A1', NOVEMBER)).map((event) => event.title)).toEqual(['Midterm exam sheet']);
    expect(await events('PARENT_A2', NOVEMBER)).toHaveLength(0);
    expect((await events('TEACHER_TWO', NOVEMBER)).map((event) => event.title)).toEqual(['Midterm exam sheet', 'Class B exam']);
  });

  it('follows an edit and a deletion, with no copy to go stale', async () => {
    const made = await make('OWNER', exam({ publish: true }, [paper({ onDate: '2026-11-10' })]));
    expect((await events('PARENT_A1', NOVEMBER)).map((event) => event.date)).toEqual(['2026-11-10']);

    await call('OWNER', 'PUT', ROUTES.timetables.detail(made.id), exam({}, [paper({ onDate: '2026-11-17' })]));
    const moved = await events('PARENT_A1', NOVEMBER);
    expect(moved.map((event) => event.date)).toEqual(['2026-11-17']);

    await call('OWNER', 'DELETE', ROUTES.timetables.detail(made.id));
    expect(await events('PARENT_A1', NOVEMBER)).toHaveLength(0);
    expect(await events('OWNER', NOVEMBER)).toHaveLength(0);
  });

  it('refuses a span too long to expand, and a backwards one', async () => {
    expect((await call('OWNER', 'GET', `${ROUTES.timetables.calendar}?from=2026-01-01&to=2028-01-01`)).statusCode).toBe(400);
    expect((await call('OWNER', 'GET', `${ROUTES.timetables.calendar}?from=2026-11-10&to=2026-11-01`)).statusCode).toBe(400);
  });
});

describe('who is told', () => {
  it('tells the teachers and the families of the class when it is published — not the person who published it', async () => {
    await make('OWNER', weekly({ title: 'Class A weekly', publish: true }, [entry({ teacherId: STAFF_ONE })]));

    for (const who of ['TEACHER_ONE', 'PARENT_A1', 'PARENT_A2'] as const) {
      const heard = await bell(who);
      expect(heard.items[0], who).toMatchObject({ kind: 'timetable.published', entityType: 'timetable' });
      expect(heard.items[0]?.title).toContain('Class A weekly');
    }
    for (const who of ['TEACHER_TWO', 'OWNER', 'ACCOUNTANT'] as const) {
      expect((await bell(who)).unreadCount, who).toBe(0);
    }
  });

  it('tells only the section’s families when it is for a section', async () => {
    await make('OWNER', weekly({ sectionId: SECTION_A1, publish: true }));
    expect((await bell('PARENT_A1')).unreadCount).toBe(1);
    expect((await bell('PARENT_A2')).unreadCount).toBe(0);
  });

  it('tells nobody about a draft', async () => {
    await make('OWNER', weekly());
    expect((await bell('PARENT_A1')).unreadCount).toBe(0);
    expect((await bell('TEACHER_ONE')).unreadCount).toBe(0);
  });

  it('tells them when a draft is published, once however often it is asked', async () => {
    const made = await make('OWNER', weekly());
    await call('OFFICE', 'POST', ROUTES.timetables.publish(made.id));
    await call('OFFICE', 'POST', ROUTES.timetables.publish(made.id));
    expect((await bell('PARENT_A1')).items.filter((item) => item.kind === 'timetable.published')).toHaveLength(1);
  });

  it('tells them when a published timetable moves, and not for a changed description', async () => {
    const made = await make('OWNER', weekly({ publish: true }));
    await call('PARENT_A1', 'POST', ROUTES.notifications.read, {});

    await call('OWNER', 'PUT', ROUTES.timetables.detail(made.id), weekly({ description: 'Just a note.' }));
    expect((await bell('PARENT_A1')).unreadCount).toBe(0);

    await call('OWNER', 'PUT', ROUTES.timetables.detail(made.id), weekly({}, [entry({ startTime: '10:00', endTime: '10:40' })]));
    const heard = await bell('PARENT_A1');
    expect(heard.unreadCount).toBe(1);
    expect(heard.items[0]).toMatchObject({ kind: 'timetable.updated' });
  });

  it('tells nobody when a draft is edited or a timetable is taken back', async () => {
    const made = await make('OWNER', weekly());
    await call('OWNER', 'PUT', ROUTES.timetables.detail(made.id), weekly({}, [entry({ dayOfWeek: 4 })]));
    await call('OWNER', 'POST', ROUTES.timetables.publish(made.id));
    await call('PARENT_A1', 'POST', ROUTES.notifications.read, {});
    await call('OWNER', 'POST', ROUTES.timetables.unpublish(made.id));
    expect((await bell('PARENT_A1')).unreadCount).toBe(0);
  });

  it('writes the change and the notification together, or neither', async () => {
    // A refused edit must not leave "timetable updated" behind.
    const made = await make('OWNER', weekly({ publish: true }, [entry({ teacherId: STAFF_ONE })]));
    await make('OWNER', weekly({ classLevelId: CLASS_B, title: 'Class B' }, [entry({ teacherId: STAFF_TWO, dayOfWeek: 2 })]));
    await call('PARENT_A1', 'POST', ROUTES.notifications.read, {});

    const refused = await call(
      'OWNER',
      'PUT',
      ROUTES.timetables.detail(made.id),
      weekly({}, [entry({ teacherId: STAFF_TWO, dayOfWeek: 2 })]),
    );
    expect(refused.statusCode).toBe(409);
    expect((await bell('PARENT_A1')).unreadCount).toBe(0);
    expect((await call('OWNER', 'GET', ROUTES.timetables.detail(made.id))).json<{ data: TimetableDetail }>().data.entries[0]?.dayOfWeek).toBe(1);
  });
});

describe('what the database itself guarantees', () => {
  async function insertEntry(extra: string, ...values: unknown[]) {
    await resetTimetables();
    const timetable = await make('OWNER', weekly());
    return admin.$executeRawUnsafe(
      `INSERT INTO timetable_entries (id, school_id, timetable_id, start_time, end_time, ${extra})
       VALUES (gen_random_uuid(), $1::uuid, $2::uuid, ${values.map((_, index) => `$${String(index + 3)}`).join(', ')})`,
      SCHOOL,
      timetable.id,
      ...values,
    );
  }

  it('will not store a period with both a weekday and a date, or neither', async () => {
    await expect(insertEntry('day_of_week, on_date', '09:00', '09:30', 1, '2026-11-10')).rejects.toThrow(/weekday_or_date/);
    await expect(insertEntry('room', '09:00', '09:30', 'Lab')).rejects.toThrow(/weekday_or_date/);
  });

  it('will not store an end before a start, or a time that is not a time', async () => {
    await expect(insertEntry('day_of_week', '10:00', '09:00', 1)).rejects.toThrow(/time_order/);
    await expect(insertEntry('day_of_week', '9am', '10:00', 1)).rejects.toThrow(/time_format/);
  });

  it('will not store an assessment timetable with no type, or a published one with no publication time', async () => {
    await expect(
      admin.$executeRawUnsafe(
        `INSERT INTO timetables (id, school_id, session_id, class_level_id, kind, title, updated_at)
         VALUES (gen_random_uuid(), $1::uuid, $2::uuid, $3::uuid, 'ASSESSMENT', 'No type', now())`,
        SCHOOL,
        SESSION,
        CLASS_A,
      ),
    ).rejects.toThrow(/assessment_type_matches_kind/);
    await expect(
      admin.$executeRawUnsafe(
        `INSERT INTO timetables (id, school_id, session_id, class_level_id, kind, title, status, updated_at)
         VALUES (gen_random_uuid(), $1::uuid, $2::uuid, $3::uuid, 'CLASS', 'No time', 'PUBLISHED', now())`,
        SCHOOL,
        SESSION,
        CLASS_A,
      ),
    ).rejects.toThrow(/published_at_matches_status/);
  });

  it('leaves a period unassigned, not deleted, when its teacher goes', async () => {
    const made = await make('OWNER', weekly({}, [entry({ teacherId: STAFF_TWO })]));
    await admin.$executeRawUnsafe(`DELETE FROM staff_class_assignments WHERE staff_id = $1::uuid`, STAFF_TWO);
    await admin.$executeRawUnsafe(`UPDATE users SET status = 'ACTIVE' WHERE id = $1::uuid`, USERS.TEACHER_TWO.id);
    await admin.$executeRawUnsafe(`DELETE FROM staff WHERE id = $1::uuid`, STAFF_TWO);

    const detail = (await call('OWNER', 'GET', ROUTES.timetables.detail(made.id))).json<{ data: TimetableDetail }>().data;
    expect(detail.entries).toHaveLength(1);
    expect(detail.entries[0]?.teacher).toBeNull();
  });
});

async function count(sql: string, ...params: unknown[]): Promise<number> {
  const rows = await admin.$queryRawUnsafe<{ n: bigint }[]>(sql, ...params);
  return Number(rows[0]?.n ?? 0);
}

describe('breaks', () => {
  const lunch = (over: EntryOver = {}) =>
    ({ ...entry({ subjectId: null, startTime: '09:40', endTime: '10:00', notes: 'Lunch', ...over }), isBreak: true });

  it('keeps a break in the week, named, with no subject or teacher', async () => {
    const made = await make('OWNER', weekly({ publish: true }, [entry(), lunch() as never]));
    const detail = (await call('PARENT_A1', 'GET', ROUTES.timetables.detail(made.id))).json<{ data: TimetableDetail }>().data;
    expect(detail.entries.map((item) => [item.isBreak, item.notes])).toEqual([
      [false, null],
      [true, 'Lunch'],
    ]);
  });

  it('refuses a break that has a subject, and one that overlaps a period', async () => {
    const withSubject = await call('OWNER', 'POST', ROUTES.timetables.list, weekly({}, [lunch({ subjectId: SUBJECT_MATHS }) as never]));
    expect(withSubject.statusCode).toBe(400);
    const overlapping = await call('OWNER', 'POST', ROUTES.timetables.list, weekly({}, [entry(), lunch({ startTime: '09:30' }) as never]));
    expect(overlapping.statusCode).toBe(409);
  });

  it('does not clash with another timetable, and is not a calendar event', async () => {
    await make('OWNER', weekly({ title: 'Section A one', publish: true }, [entry(), lunch() as never]));
    const second = await call('OWNER', 'POST', ROUTES.timetables.list, weekly({ title: 'Section A two' }, [lunch() as never]));
    expect(second.statusCode).toBe(201);

    const response = await call('PARENT_A1', 'GET', `${ROUTES.timetables.calendar}?from=2026-11-01&to=2026-11-30`);
    const titles = response.json<{ data: { subject: string | null }[] }>().data;
    expect(titles.every((event) => event.subject !== null)).toBe(true);
  });
});
