import { ROUTES } from '@ilm/contracts';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { Test } from '@nestjs/testing';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { AppModule } from '../app.module';
import { createAdminClient, type PrismaClient } from '../prisma';
import { PasswordService } from '../shared/auth/password.service';

/**
 * Attendance end to end — docs/modules/attendance-and-exams.md §8.
 *
 * The fixture is built around the two things this module gets wrong in every
 * product that ships it carelessly:
 *
 * - **A child admitted mid-month.** Bilal joins on the 20th. He must not appear
 *   on the 7th's register, must not collect absences for days he had not
 *   started, and must not be shown a percentage divided by the whole month.
 * - **Days the school was closed.** A Sunday and a declared holiday, which are
 *   neither markable nor part of any denominator.
 */

const SCHOOL_A = '33333333-3333-4333-8333-333333333391';
const SCHOOL_B = '33333333-3333-4333-8333-333333333392';
const USER_A = '44444444-4444-4444-8444-444444444491';
const SESSION_A = '55555555-5555-4555-8555-555555555591';
const SESSION_B = '55555555-5555-4555-8555-555555555592';
const CLASS_A = '66666666-6666-4666-8666-666666666691';
const CLASS_B = '66666666-6666-4666-8666-666666666692';

const AASIA = '88888888-8888-4888-8888-888888888891';
const BILAL = '88888888-8888-4888-8888-888888888892';
const OTHER = '88888888-8888-4888-8888-888888888893';
const STAFF_A = '99999999-9999-4999-8999-999999999991';

const HOST_A = 'attend-a-e2e.localhost';
const PASSWORD = 'correct-horse-battery-staple';

/**
 * August 2026 — a month wholly in the past, so nothing here trips the "that day
 * has not happened" refusal as the calendar rolls forward under the suite.
 *
 * The 1st is a Saturday, so the Sundays are the 2nd, 9th, 16th, 23rd and 30th.
 * That is 26 working days on a Monday-to-Saturday week, 25 once the holiday on
 * the 14th is taken out.
 */
const MONTH = '2026-08';
const A_WEDNESDAY = '2026-08-12';
const A_SUNDAY = '2026-08-02';
const A_HOLIDAY = '2026-08-14';
/** After Bilal joins on the 20th. */
const A_LATER_DAY = '2026-08-25';

let app: NestFastifyApplication;
let admin: PrismaClient;
let jar = '';

async function wipe(): Promise<void> {
  for (const table of [
    'attendance_records',
    'staff_attendance_records',
    'holidays',
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

beforeAll(async () => {
  admin = createAdminClient({ url: process.env['DATABASE_ADMIN_URL'] ?? '' });
  await wipe();

  // UTC, so the fixed dates in this file mean what they say regardless of where
  // the test runs. The Karachi behaviour is covered by the calendar unit tests.
  await admin.$executeRaw`
    INSERT INTO schools (id, name, slug, timezone, working_days, attendance_backdate_days, created_at, updated_at) VALUES
      (${SCHOOL_A}::uuid, 'Attendance E2E A', 'attend-a-e2e', 'UTC', ARRAY[1,2,3,4,5,6]::smallint[], 365, now(), now()),
      (${SCHOOL_B}::uuid, 'Attendance E2E B', 'attend-b-e2e', 'UTC', ARRAY[1,2,3,4,5,6]::smallint[], 365, now(), now())
  `;

  const hash = await new PasswordService().hash(PASSWORD);
  await admin.$executeRaw`
    INSERT INTO users (id, school_id, email, name, password_hash, status, created_at, updated_at)
    VALUES (${USER_A}::uuid, ${SCHOOL_A}::uuid, 'head@attend-a-e2e.test', 'Head A', ${hash}, 'ACTIVE', now(), now())
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

  await admin.$executeRawUnsafe(
    `INSERT INTO holidays (id, school_id, session_id, name, type, applies_to, start_date, end_date, created_at, updated_at)
     VALUES (gen_random_uuid(), $1::uuid, $2::uuid, 'Eid Milad-un-Nabi', 'HOLIDAY', 'ALL', $3::date, $3::date, now(), now())`,
    SCHOOL_A,
    SESSION_A,
    A_HOLIDAY,
  );

  // Aasia has been here all year. Bilal joins on the 20th — the case that
  // breaks a naive percentage.
  for (const [id, first, gr, school, session, classLevel, joined] of [
    [AASIA, 'Aasia', 'GR-8001', SCHOOL_A, SESSION_A, CLASS_A, '2026-04-01'],
    [BILAL, 'Bilal', 'GR-8002', SCHOOL_A, SESSION_A, CLASS_A, '2026-08-20'],
    [OTHER, 'Faraz', 'GR-8003', SCHOOL_B, SESSION_B, CLASS_B, '2026-04-01'],
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
      `INSERT INTO enrollments (id, school_id, student_id, session_id, class_level_id, status, enrolled_on, created_at, updated_at)
       VALUES (gen_random_uuid(), $1::uuid, $2::uuid, $3::uuid, $4::uuid, 'ENROLLED', $5::date, now(), now())`,
      school,
      id,
      session,
      classLevel,
      joined,
    );
  }

  await admin.$executeRawUnsafe(
    `INSERT INTO staff (id, school_id, employee_no, name, role, status, joined_on, created_at, updated_at)
     VALUES ($1::uuid, $2::uuid, 'EMP-001', 'Sadia Iqbal', 'TEACHER', 'ACTIVE', '2026-04-01', now(), now())`,
    STAFF_A,
    SCHOOL_A,
  );

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
    payload: { identifier: 'head@attend-a-e2e.test', password: PASSWORD },
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

beforeEach(async () => {
  await admin.$executeRawUnsafe(
    `DELETE FROM attendance_records WHERE school_id IN ($1::uuid, $2::uuid)`,
    SCHOOL_A,
    SCHOOL_B,
  );
  await admin.$executeRawUnsafe(
    `DELETE FROM staff_attendance_records WHERE school_id = $1::uuid`,
    SCHOOL_A,
  );
});

async function get(url: string) {
  return app.inject({ method: 'GET', url, headers: { host: HOST_A, cookie: jar } });
}

async function post(url: string, payload: Record<string, unknown>) {
  return app.inject({ method: 'POST', url, headers: { host: HOST_A, cookie: jar }, payload });
}

async function markBoth(date: string, statuses: [string, string]) {
  return post(ROUTES.attendance.mark, {
    classLevelId: CLASS_A,
    date,
    entries: [
      { studentId: AASIA, status: statuses[0] },
      { studentId: BILAL, status: statuses[1] },
    ],
  });
}

interface RosterBody {
  data: {
    className: string;
    isEditable: boolean;
    day: { isWorkingDay: boolean; reason: string | null; holidayName: string | null };
    students: { studentId: string; name: string; status: string | null }[];
  };
}

interface ReportBody {
  data: {
    workingDays: number;
    days: { date: string; isWorkingDay: boolean }[];
    rows: {
      subjectId: string;
      name: string;
      days: Record<string, string>;
      present: number;
      absent: number;
      expectedDays: number;
      percentBasisPoints: number;
    }[];
  };
}

describe('the roster is the class as it stood on that date', () => {
  it('leaves out a child who had not joined yet', async () => {
    const response = await get(`${ROUTES.attendance.roster(CLASS_A)}?date=${A_WEDNESDAY}`);
    const body = response.json<RosterBody>();

    expect(response.statusCode).toBe(200);
    // Bilal joins on the 20th. He is not on the 9th's register at all, which is
    // what makes it impossible for him to be marked absent for it.
    expect(body.data.students.map((student) => student.studentId)).toEqual([AASIA]);
  });

  it('includes them once they have joined', async () => {
    const body = (
      await get(`${ROUTES.attendance.roster(CLASS_A)}?date=${A_LATER_DAY}`)
    ).json<RosterBody>();
    expect(body.data.students).toHaveLength(2);
  });

  it('hands back nothing marked, so the screen can default everyone present', async () => {
    const body = (
      await get(`${ROUTES.attendance.roster(CLASS_A)}?date=${A_WEDNESDAY}`)
    ).json<RosterBody>();
    expect(body.data.students.every((student) => student.status === null)).toBe(true);
  });

  it('names the holiday rather than only closing the day', async () => {
    const body = (
      await get(`${ROUTES.attendance.roster(CLASS_A)}?date=${A_HOLIDAY}`)
    ).json<RosterBody>();

    expect(body.data.day.isWorkingDay).toBe(false);
    expect(body.data.day.holidayName).toBe('Eid Milad-un-Nabi');
    expect(body.data.isEditable).toBe(false);
  });
});

describe('marking', () => {
  it('saves a register', async () => {
    const response = await markBoth(A_LATER_DAY, ['PRESENT', 'ABSENT']);
    expect(response.statusCode).toBe(201);
    expect(response.json<{ data: { saved: number } }>().data.saved).toBe(2);
  });

  it('creates one row when the same register is submitted twice', async () => {
    await markBoth(A_LATER_DAY, ['PRESENT', 'ABSENT']);
    await markBoth(A_LATER_DAY, ['PRESENT', 'ABSENT']);

    const rows = await admin.$queryRawUnsafe<{ n: number }[]>(
      `SELECT count(*)::int AS n FROM attendance_records WHERE school_id = $1::uuid AND date = $2::date`,
      SCHOOL_A,
      A_LATER_DAY,
    );
    // docs §8 lists this as a release gate: duplicate submission, no duplicates.
    expect(rows[0]?.n).toBe(2);
  });

  it('updates rather than duplicating when a mark is corrected', async () => {
    await markBoth(A_LATER_DAY, ['PRESENT', 'ABSENT']);
    await markBoth(A_LATER_DAY, ['ABSENT', 'PRESENT']);

    const body = (
      await get(`${ROUTES.attendance.roster(CLASS_A)}?date=${A_LATER_DAY}`)
    ).json<RosterBody>();
    const aasia = body.data.students.find((student) => student.studentId === AASIA);
    expect(aasia?.status).toBe('ABSENT');
  });

  it('refuses a day the school does not run', async () => {
    const response = await markBoth(A_SUNDAY, ['PRESENT', 'PRESENT']);
    expect(response.statusCode).toBeGreaterThanOrEqual(400);
    expect(response.body).toContain('does not run');
  });

  it('refuses a holiday, and names it', async () => {
    const response = await markBoth(A_HOLIDAY, ['PRESENT', 'PRESENT']);
    expect(response.statusCode).toBeGreaterThanOrEqual(400);
    expect(response.body).toContain('Eid Milad-un-Nabi');
  });

  it('refuses a day that has not happened', async () => {
    const response = await markBoth('2099-01-05', ['PRESENT', 'PRESENT']);
    expect(response.statusCode).toBeGreaterThanOrEqual(400);
    expect(response.body).toContain('not happened');
  });

  it('silently skips somebody who was not enrolled on that date', async () => {
    const response = await post(ROUTES.attendance.mark, {
      classLevelId: CLASS_A,
      date: A_WEDNESDAY,
      entries: [
        { studentId: AASIA, status: 'PRESENT' },
        // Bilal joins on the 20th; a stale tab is the usual reason this happens.
        { studentId: BILAL, status: 'ABSENT' },
      ],
    });

    const result = response.json<{ data: { saved: number; skipped: number } }>().data;
    expect(result.saved).toBe(1);
    expect(result.skipped).toBe(1);
  });

  it('never writes a mark for another school’s child', async () => {
    const response = await post(ROUTES.attendance.mark, {
      classLevelId: CLASS_A,
      date: A_WEDNESDAY,
      entries: [{ studentId: OTHER, status: 'PRESENT' }],
    });

    expect(response.json<{ data: { saved: number } }>().data.saved).toBe(0);
    const rows = await admin.$queryRawUnsafe<{ n: number }[]>(
      `SELECT count(*)::int AS n FROM attendance_records WHERE student_id = $1::uuid`,
      OTHER,
    );
    expect(rows[0]?.n).toBe(0);
  });
});

describe('the class overview', () => {
  it('shows a class as unmarked before anybody marks it', async () => {
    const body = (await get(`${ROUTES.attendance.classes}?date=${A_WEDNESDAY}`)).json<{
      data: { classes: { classLevelId: string; markedAt: string | null; strength: number }[] };
    }>();

    const nursery = body.data.classes.find((entry) => entry.classLevelId === CLASS_A);
    expect(nursery?.markedAt).toBeNull();
    // Strength is the class roll for the session, not for one date.
    expect(nursery?.strength).toBe(2);
  });

  it('carries the day’s counts once it has been marked', async () => {
    await markBoth(A_LATER_DAY, ['PRESENT', 'ABSENT']);

    const body = (await get(`${ROUTES.attendance.classes}?date=${A_LATER_DAY}`)).json<{
      data: {
        classes: {
          classLevelId: string;
          present: number;
          absent: number;
          markedAt: string | null;
        }[];
      };
    }>();

    const nursery = body.data.classes.find((entry) => entry.classLevelId === CLASS_A);
    expect(nursery?.present).toBe(1);
    expect(nursery?.absent).toBe(1);
    expect(nursery?.markedAt).not.toBeNull();
  });
});

describe('the monthly report', () => {
  it('excludes closed days from the working total', async () => {
    const body = (
      await get(`${ROUTES.attendance.studentReport(CLASS_A)}?month=${MONTH}`)
    ).json<ReportBody>();

    // August 2026: 31 days, five Sundays, one holiday — so 25 working days.
    expect(body.data.days).toHaveLength(31);
    expect(body.data.workingDays).toBe(31 - 5 - 1);
  });

  it('divides by the days a child could have attended, not by the month', async () => {
    await markBoth(A_LATER_DAY, ['PRESENT', 'PRESENT']);
    const body = (
      await get(`${ROUTES.attendance.studentReport(CLASS_A)}?month=${MONTH}`)
    ).json<ReportBody>();

    const aasia = body.data.rows.find((row) => row.subjectId === AASIA);
    const bilal = body.data.rows.find((row) => row.subjectId === BILAL);

    // Aasia was here all month: 25 working days.
    expect(aasia?.expectedDays).toBe(25);
    // Bilal joined on the 20th — 10 working days, not 25. Counting the whole
    // month would put a child who never missed a day on 40%.
    expect(bilal?.expectedDays).toBe(10);
  });

  it('reports a child who never missed a day at 100%, whenever they joined', async () => {
    // Every working day Bilal was actually here for.
    // The 20th to the 31st, less the Sundays on the 23rd and 30th.
    const bilalWorkingDays = [
      '2026-08-20',
      '2026-08-21',
      '2026-08-22',
      '2026-08-24',
      A_LATER_DAY,
      '2026-08-26',
      '2026-08-27',
      '2026-08-28',
      '2026-08-29',
      '2026-08-31',
    ];
    for (const date of bilalWorkingDays) {
      await post(ROUTES.attendance.mark, {
        classLevelId: CLASS_A,
        date,
        entries: [{ studentId: BILAL, status: 'PRESENT' }],
      });
    }

    const body = (
      await get(`${ROUTES.attendance.studentReport(CLASS_A)}?month=${MONTH}`)
    ).json<ReportBody>();
    const bilal = body.data.rows.find((row) => row.subjectId === BILAL);

    expect(bilal?.present).toBe(10);
    expect(bilal?.expectedDays).toBe(10);
    // The headline number this whole module exists to get right.
    expect(bilal?.percentBasisPoints).toBe(10_000);
  });

  it('leaves an unmarked day empty rather than calling it an absence', async () => {
    await markBoth(A_LATER_DAY, ['PRESENT', 'PRESENT']);
    const body = (
      await get(`${ROUTES.attendance.studentReport(CLASS_A)}?month=${MONTH}`)
    ).json<ReportBody>();

    const aasia = body.data.rows.find((row) => row.subjectId === AASIA);
    // Exactly one day recorded, not thirty days of "A" — which is what the
    // screen this replaces printed, and why it reported 0.00% for everybody.
    expect(Object.keys(aasia?.days ?? {})).toEqual(['25']);
    expect(aasia?.absent).toBe(0);
  });

  it('shows no other school’s children', async () => {
    const body = (
      await get(`${ROUTES.attendance.studentReport(CLASS_A)}?month=${MONTH}`)
    ).json<ReportBody>();
    expect(body.data.rows.map((row) => row.subjectId)).not.toContain(OTHER);
  });
});

describe('staff attendance', () => {
  it('lists who was employed on that date', async () => {
    const body = (await get(`${ROUTES.attendance.staffRoster}?date=${A_LATER_DAY}`)).json<{
      data: { staff: { staffId: string; name: string; status: string | null }[] };
    }>();

    expect(body.data.staff.map((member) => member.staffId)).toEqual([STAFF_A]);
    expect(body.data.staff[0]?.status).toBeNull();
  });

  it('records sick leave, and keeps it distinct from absence', async () => {
    const response = await post(ROUTES.attendance.markStaff, {
      date: A_LATER_DAY,
      entries: [{ staffId: STAFF_A, status: 'SICK_LEAVE' }],
    });
    expect(response.statusCode).toBe(201);

    const body = (await get(`${ROUTES.attendance.staffReport}?month=${MONTH}`)).json<ReportBody>();
    const row = body.data.rows.find((entry) => entry.subjectId === STAFF_A);

    expect(row?.days['25']).toBe('SICK_LEAVE');
    // Leave is not absence: it must not count against the percentage as one.
    expect(row?.absent).toBe(0);
  });

  it('creates one row when submitted twice', async () => {
    const payload = {
      date: A_LATER_DAY,
      entries: [{ staffId: STAFF_A, status: 'PRESENT' as const }],
    };
    await post(ROUTES.attendance.markStaff, payload);
    await post(ROUTES.attendance.markStaff, payload);

    const rows = await admin.$queryRawUnsafe<{ n: number }[]>(
      `SELECT count(*)::int AS n FROM staff_attendance_records WHERE school_id = $1::uuid`,
      SCHOOL_A,
    );
    expect(rows[0]?.n).toBe(1);
  });
});

describe('the guard chain still applies', () => {
  it('refuses the roster without a session', async () => {
    const response = await app.inject({
      method: 'GET',
      url: ROUTES.attendance.classes,
      headers: { host: HOST_A },
    });
    expect(response.statusCode).toBe(401);
  });

  it('rejects an unknown query parameter rather than ignoring it', async () => {
    const response = await get(`${ROUTES.attendance.classes}?dat=2026-09-22`);
    expect(response.statusCode).toBe(400);
  });
});
