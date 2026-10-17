import { ROUTES, type DashboardPayload, type StaffDashboard, type TeacherDashboard } from '@ilm/contracts';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { Test } from '@nestjs/testing';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { AppModule } from '../app.module';
import { createAdminClient, type PrismaClient } from '../prisma';
import { PasswordService } from '../shared/auth/password.service';

/**
 * The dashboard API, by role.
 *
 * What matters: the Admin gets revenue and the Principal and Office Staff do
 * not (it is never sent, not merely hidden); a teacher gets only their own
 * classes; and the figures are the school's own.
 */

const SCHOOL = '33333333-3333-4333-8333-3333333333c1';
const SESSION = '55555555-5555-4555-8555-5555555555c1';
const CLASS_A = '66666666-6666-4666-8666-6666666666c1';
const CLASS_B = '66666666-6666-4666-8666-6666666666c2';
const STAFF_TEACHER = '88888888-8888-4888-8888-8888888888c1';
const HOST = 'dashboard-e2e.localhost';
const PASSWORD = 'correct-horse-battery-staple';

const USERS = [
  { id: '44444444-4444-4444-8444-4444444444c1', email: 'owner@dash-e2e.test', role: 'OWNER' },
  { id: '44444444-4444-4444-8444-4444444444c2', email: 'principal@dash-e2e.test', role: 'PRINCIPAL' },
  { id: '44444444-4444-4444-8444-4444444444c3', email: 'office@dash-e2e.test', role: 'RECEPTION' },
  { id: '44444444-4444-4444-8444-4444444444c4', email: 'teacher@dash-e2e.test', role: 'TEACHER' },
] as const;

let app: NestFastifyApplication;
let admin: PrismaClient;
const jars = new Map<string, string>();

async function wipe(): Promise<void> {
  for (const table of [
    'attendance_records',
    'fee_payments',
    'fee_voucher_lines',
    'fee_vouchers',
    'enrollments',
    'students',
    'staff_class_assignments',
    'staff_salary_payments',
    'staff_salary_periods',
    'staff',
    'sections',
    'class_levels',
    'academic_sessions',
    'sessions',
    'audit_logs',
    'user_roles',
    'users',
  ]) {
    await admin.$executeRawUnsafe(`DELETE FROM ${table} WHERE school_id = $1::uuid`, SCHOOL);
  }
  await admin.$executeRawUnsafe(`DELETE FROM schools WHERE id = $1::uuid`, SCHOOL);
}

async function get(who: string): Promise<DashboardPayload> {
  const response = await app.inject({
    method: 'GET',
    url: ROUTES.dashboard.summary,
    headers: { host: HOST, cookie: jars.get(who) ?? '' },
  });
  expect(response.statusCode).toBe(200);
  return response.json<{ data: DashboardPayload }>().data;
}

beforeAll(async () => {
  admin = createAdminClient({ url: process.env['DATABASE_ADMIN_URL'] ?? '' });
  await wipe();
  const hash = await new PasswordService().hash(PASSWORD);

  await admin.$executeRawUnsafe(
    `INSERT INTO schools (id, name, slug, created_at, updated_at) VALUES ($1::uuid, 'Dashboard E2E', 'dashboard-e2e', now(), now())`,
    SCHOOL,
  );
  for (const user of USERS) {
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
  await admin.$executeRawUnsafe(
    `INSERT INTO academic_sessions (id, school_id, name, start_date, end_date, status, is_current, created_at, updated_at)
     VALUES ($1::uuid, $2::uuid, '2026-2027', '2026-04-01', '2999-03-31', 'ACTIVE', true, now(), now())`,
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
  // Three students in A, two in B.
  for (const [index, classId] of [CLASS_A, CLASS_A, CLASS_A, CLASS_B, CLASS_B].entries()) {
    const studentId = `77777777-7777-4777-8777-77777777770${String(index)}`;
    await admin.$executeRawUnsafe(
      `INSERT INTO students (id, school_id, gr_no, student_code, first_name, last_name, status, created_at, updated_at)
       VALUES ($1::uuid, $2::uuid, $3, $3, 'Child', $4, 'ACTIVE', now(), now())`,
      studentId,
      SCHOOL,
      `DASH-${String(index)}`,
      String(index),
    );
    await admin.$executeRawUnsafe(
      `INSERT INTO enrollments (id, school_id, student_id, session_id, class_level_id, status, created_at, updated_at)
       VALUES (gen_random_uuid(), $1::uuid, $2::uuid, $3::uuid, $4::uuid, 'ENROLLED', now(), now())`,
      SCHOOL,
      studentId,
      SESSION,
      classId,
    );
  }
  // The teacher takes class A only.
  await admin.$executeRawUnsafe(
    `INSERT INTO staff (id, school_id, employee_no, user_id, name, email, phone, role, status, basic_salary, created_at, updated_at)
     VALUES ($1::uuid, $2::uuid, 'D-1', $3::uuid, 'Teacher', 'teacher@dash-e2e.test', '+923001234567', 'TEACHER', 'ACTIVE', 40000, now(), now())`,
    STAFF_TEACHER,
    SCHOOL,
    USERS[3].id,
  );
  await admin.$executeRawUnsafe(
    `INSERT INTO staff_class_assignments (id, school_id, staff_id, class_level_id, created_at)
     VALUES (gen_random_uuid(), $1::uuid, $2::uuid, $3::uuid, now())`,
    SCHOOL,
    STAFF_TEACHER,
    CLASS_A,
  );

  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  app = moduleRef.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
  const { default: cookie } = await import('@fastify/cookie');
  await app.register(cookie);
  await app.init();
  await app.getHttpAdapter().getInstance().ready();

  for (const user of USERS) {
    const response = await app.inject({
      method: 'POST',
      url: ROUTES.auth.login,
      headers: { host: HOST },
      payload: { identifier: user.email, password: PASSWORD },
    });
    const raw = response.headers['set-cookie'];
    const cookies = Array.isArray(raw) ? raw : [String(raw)];
    jars.set(
      user.role,
      cookies
        .map((entry) => entry.split(';')[0] ?? '')
        .filter((pair) => !pair.endsWith('='))
        .join('; '),
    );
  }
}, 120_000);

afterAll(async () => {
  await app?.close();
  await wipe();
  await admin.$disconnect();
});

describe('the staff dashboard', () => {
  it('counts the school’s own students, classes and staff', async () => {
    const data = (await get('OWNER')) as StaffDashboard;
    expect(data.kind).toBe('staff');
    expect(data.students).toEqual({ total: 5, active: 5 });
    expect(data.classCount).toBe(2);
    expect(data.staff?.teachers).toBe(1);
    expect(data.currentSessionLabel).toBe('2026-2027');
    expect(data.attendance?.classesWithStudents).toBe(2);
    expect(data.attendance?.unmarkedClasses).toBe(2);
    expect(data.weeklyAttendance).toHaveLength(7);
  });

  it('sends revenue to the Admin and to nobody else', async () => {
    const owner = (await get('OWNER')) as StaffDashboard;
    expect(owner.revenueTrend).toHaveLength(6);
    expect(owner.monthlyExpenses).toHaveLength(6);

    for (const who of ['PRINCIPAL', 'RECEPTION']) {
      const other = (await get(who)) as StaffDashboard;
      expect(other.kind).toBe('staff');
      expect(other.revenueTrend).toEqual([]);
      expect(other.statTrends.revenue).toBeUndefined();
      // Everything else is the same for them.
      expect(other.students).toEqual({ total: 5, active: 5 });
      expect(other.monthlyExpenses).toHaveLength(6);
    }
  });

  it('counts salaries paid this month as money spent', async () => {
    const before = (await get('OWNER')) as StaffDashboard;
    const spentBefore = before.monthlyExpenses.at(-1)?.amountMinor ?? 0;
    const netBefore = before.revenueTrend.at(-1)?.netRevenueMinor ?? 0;

    // Salaries live on their own ledger, not as expense rows — which is how
    // they were left out of the chart in the first place.
    const period = '99999999-9999-4999-8999-9999999999c1';
    const month = `${before.todayDate.slice(0, 7)}-01`;
    await admin.$executeRawUnsafe(
      `INSERT INTO staff_salary_periods (id, school_id, staff_id, month, base_salary, created_at)
       VALUES ($1::uuid, $2::uuid, $3::uuid, $4::date, 25000.00, now())`,
      period,
      SCHOOL,
      STAFF_TEACHER,
      month,
    );
    await admin.$executeRawUnsafe(
      `INSERT INTO staff_salary_payments (id, school_id, staff_id, period_id, month, amount, paid_on, created_at)
       VALUES (gen_random_uuid(), $1::uuid, $2::uuid, $3::uuid, $4::date, 25000.00, $5::date, now())`,
      SCHOOL,
      STAFF_TEACHER,
      period,
      month,
      before.todayDate,
    );

    const after = (await get('OWNER')) as StaffDashboard;
    expect(after.monthlyExpenses.at(-1)?.amountMinor).toBe(spentBefore + 2_500_000);
    expect(after.revenueTrend.at(-1)?.netRevenueMinor).toBe(netBefore - 2_500_000);
    expect(after.expenseBreakdown).toContainEqual({ label: 'Staff salaries', amountMinor: 2_500_000 });
  });
});

describe('the teacher dashboard', () => {
  it('shows only the teacher’s own class, and no school-wide money', async () => {
    const data = (await get('TEACHER')) as TeacherDashboard;
    expect(data.kind).toBe('teacher');
    expect(data.classes.map((entry) => entry.name)).toEqual(['Class A']);
    expect(data.studentCount).toBe(3);
    expect(data.classes[0]?.markedToday).toBe(false);
    expect(data.monthlySalaryMinor).toBe(4_000_000);
    expect(JSON.stringify(data)).not.toMatch(/revenue|outstanding|voucher/i);
  });
});
