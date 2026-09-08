import { createHash } from 'node:crypto';

import { systemClock } from '@ilm/utils';
import { hash } from '@node-rs/argon2';

import { createAdminClient } from './client';
import { type PrismaClient } from './generated/client';
import { loadEnv } from './load-env';

// After the imports, not before: imports are hoisted, so a call placed above
// them would still run second.
loadEnv();

/**
 * Development seed.
 *
 * Creates **three schools**, not one. A single-tenant seed cannot show the
 * thing this product must get right: with three schools holding similar data,
 * a cross-tenant leak is visible rather than theoretical, and
 * `verify-isolation.mjs` can prove that signing in as one school returns none
 * of the others' students.
 *
 * Idempotent — re-running updates rather than duplicating. Runs on the admin
 * connection because there is no tenant context yet; the schools being created
 * are the thing that would provide it.
 */

if (process.env['NODE_ENV'] === 'production') {
  throw new Error('Refusing to seed demo data into a production environment.');
}

/**
 * A deliberately obvious development password, printed on seed. It is not a
 * secret, which is exactly why it must never reach a deployed environment —
 * hence the guard above.
 */
const PASSWORD = 'demo-password-1234';

/** The one platform-console account. Development only, same guard as above. */
const PLATFORM_EMAIL = 'platform@ilm.test';

interface SchoolSpec {
  readonly id: string;
  readonly slug: string;
  readonly name: string;
  readonly city: string;
  readonly ownerEmail: string;
  readonly ownerName: string;
  /** Distinct per school, so a leak is obvious on sight rather than subtle. */
  readonly families: readonly (readonly [string, readonly string[]])[];
}

const SCHOOLS: readonly SchoolSpec[] = [
  {
    id: '00000000-0000-4000-8000-000000000001',
    slug: 'demo',
    name: 'Demo Public School',
    city: 'Lahore',
    ownerEmail: 'owner@demo.test',
    ownerName: 'Demo Owner',
    families: [
      ['Khan', ['Ahmed', 'Sara', 'Bilal']],
      ['Malik', ['Fatima', 'Usman']],
      ['Iqbal', ['Zainab', 'Hamza', 'Ayesha']],
      ['Sheikh', ['Omar']],
      ['Butt', ['Hira', 'Talha']],
    ],
  },
  {
    id: '00000000-0000-4000-8000-000000000011',
    slug: 'beacon',
    name: 'Beacon Model School',
    city: 'Karachi',
    ownerEmail: 'owner@beacon.test',
    ownerName: 'Beacon Owner',
    families: [
      ['Qureshi', ['Bilquis', 'Danish']],
      ['Siddiqui', ['Nida', 'Farhan', 'Sana']],
      ['Ansari', ['Kashif']],
      ['Rizvi', ['Mehwish', 'Adnan']],
    ],
  },
  {
    id: '00000000-0000-4000-8000-000000000021',
    slug: 'city',
    name: 'City Grammar School',
    city: 'Islamabad',
    ownerEmail: 'owner@city.test',
    ownerName: 'City Owner',
    families: [
      ['Abbasi', ['Tehmina', 'Waleed']],
      ['Gilani', ['Rabia', 'Shahzad', 'Noor']],
      ['Kayani', ['Junaid']],
    ],
  },
];

const CLASS_LEVELS = [
  ['Nursery', 0],
  ['Prep', 1],
  ['Grade 1', 2],
  ['Grade 2', 3],
  ['Grade 3', 4],
  ['Grade 4', 5],
  ['Grade 5', 6],
] as const;

const SECTION_NAMES = ['A', 'B'] as const;

/** Deterministic, so re-seeding produces the same data and diffs stay readable. */
function pick<T>(items: readonly T[], index: number): T {
  const value = items[index % items.length];
  if (value === undefined) {
    throw new Error('pick from an empty list');
  }
  return value;
}

async function seedSchool(
  db: PrismaClient,
  spec: SchoolSpec,
  passwordHash: string,
): Promise<number> {
  const now = systemClock.now();

  const school = await db.school.upsert({
    where: { id: spec.id },
    update: { name: spec.name, slug: spec.slug, city: spec.city },
    create: {
      id: spec.id,
      name: spec.name,
      slug: spec.slug,
      legalName: `${spec.name} (Pvt) Ltd`,
      city: spec.city,
      status: 'ACTIVE',
      onboardedAt: now,
    },
  });

  const owner = await db.user.upsert({
    where: { schoolId_email: { schoolId: school.id, email: spec.ownerEmail } },
    update: { passwordHash, status: 'ACTIVE' },
    create: {
      schoolId: school.id,
      email: spec.ownerEmail,
      name: spec.ownerName,
      passwordHash,
      status: 'ACTIVE',
    },
  });

  await db.userRole.upsert({
    where: { schoolId_userId_role: { schoolId: school.id, userId: owner.id, role: 'OWNER' } },
    update: {},
    create: { schoolId: school.id, userId: owner.id, role: 'OWNER' },
  });

  const session = await db.academicSession.upsert({
    where: { schoolId_name: { schoolId: school.id, name: '2026-2027' } },
    update: { status: 'ACTIVE', isCurrent: true },
    create: {
      schoolId: school.id,
      name: '2026-2027',
      startDate: new Date('2026-04-01'),
      endDate: new Date('2027-03-31'),
      status: 'ACTIVE',
      isCurrent: true,
    },
  });

  const levels = [];
  for (const [name, order] of CLASS_LEVELS) {
    levels.push(
      await db.classLevel.upsert({
        where: { schoolId_name: { schoolId: school.id, name } },
        update: { numericOrder: order },
        create: { schoolId: school.id, name, numericOrder: order },
      }),
    );
  }

  const sections = [];
  for (const level of levels) {
    for (const sectionName of SECTION_NAMES) {
      sections.push(
        await db.section.upsert({
          where: {
            schoolId_sessionId_classLevelId_name: {
              schoolId: school.id,
              sessionId: session.id,
              classLevelId: level.id,
              name: sectionName,
            },
          },
          update: { capacity: 30 },
          create: {
            schoolId: school.id,
            sessionId: session.id,
            classLevelId: level.id,
            name: sectionName,
            capacity: 30,
          },
        }),
      );
    }
  }

  // --- Students, one family at a time, so siblings share a guardian --------
  //
  // Student IDs are allocated from the SAME counter the API uses, rather
  // than from a loop index. A loop index collides with anything already admitted
  // through the product — UNIQUE(school_id, student_code) then fails the seed,
  // and in the other direction would fail a real admission after a receptionist
  // had typed the whole form.
  const [studentCodeSequence, grSequence] = await Promise.all([
    db.numberSequence.findUnique({
      where: { schoolId_kind: { schoolId: school.id, kind: 'student' } },
      select: { nextValue: true },
    }),
    db.numberSequence.findUnique({
      where: { schoolId_kind: { schoolId: school.id, kind: 'gr' } },
      select: { nextValue: true },
    }),
  ]);
  const admittedIds: string[] = [];
  let nextStudentCode = studentCodeSequence?.nextValue ?? 1;
  // The GR counter is read separately rather than assumed equal to the
  // admission one. They start in step and drift the moment a school issues a GR
  // number to a child who never completed admission.
  let nextGr = grSequence?.nextValue ?? 1;

  let created = 0;
  let rollCounter = 0;

  for (const [surname, firstNames] of spec.families) {
    const guardian = await db.guardian.upsert({
      where: {
        // No natural key, so a deterministic id keeps the seed idempotent.
        id: deterministicId(spec.id, `guardian:${surname}`),
      },
      update: { name: `${pick(['Muhammad', 'Ali', 'Imran'], surname.length)} ${surname}` },
      create: {
        id: deterministicId(spec.id, `guardian:${surname}`),
        schoolId: school.id,
        name: `${pick(['Muhammad', 'Ali', 'Imran'], surname.length)} ${surname}`,
        relation: 'FATHER',
        phone: `+9230012${String(3400 + surname.length * 7).padStart(5, '0')}`,
        occupation: pick(['Businessman', 'Doctor', 'Engineer', 'Teacher'], surname.length),
      },
    });

    for (const firstName of firstNames) {
      rollCounter += 1;

      const studentId = deterministicId(spec.id, `student:${surname}:${firstName}`);
      const section = pick(sections, rollCounter);

      // Only a NEW student consumes an Student ID. Re-running the seed
      // must not burn numbers, or the register grows holes on every run.
      const already = await db.student.findUnique({
        where: { id: studentId },
        select: { id: true },
      });
      const studentCode = `2026-${String(nextStudentCode).padStart(4, '0')}`;
      const grNo = String(nextGr).padStart(4, '0');
      if (already === null) {
        nextStudentCode += 1;
        nextGr += 1;
        created += 1;
      }

      // Deferred until after the loop: every student gets the same catalogue,
      // and doing it per student inside the loop is N round trips for a value
      // that does not change.
      admittedIds.push(studentId);

      const student = await db.student.upsert({
        where: { id: studentId },
        update: { firstName, lastName: surname, status: 'ACTIVE' },
        create: {
          id: studentId,
          schoolId: school.id,
          grNo,
          studentCode,
          firstName,
          lastName: surname,
          gender: pick(['MALE', 'FEMALE'] as const, firstName.length),
          dateOfBirth: new Date(
            `${String(2014 + (rollCounter % 6))}-0${String((rollCounter % 9) + 1)}-1${String(rollCounter % 9)}`,
          ),
          city: spec.city,
          status: 'ACTIVE',
          admittedOn: new Date('2026-04-01'),
        },
      });

      await db.studentGuardian.upsert({
        where: {
          schoolId_studentId_guardianId: {
            schoolId: school.id,
            studentId: student.id,
            guardianId: guardian.id,
          },
        },
        update: {},
        create: {
          schoolId: school.id,
          studentId: student.id,
          guardianId: guardian.id,
          isPrimary: true,
          isFeePayer: true,
        },
      });

      await db.enrollment.upsert({
        where: {
          schoolId_sessionId_studentId: {
            schoolId: school.id,
            sessionId: session.id,
            studentId: student.id,
          },
        },
        update: { sectionId: section.id, classLevelId: section.classLevelId },
        create: {
          schoolId: school.id,
          studentId: student.id,
          sessionId: session.id,
          classLevelId: section.classLevelId,
          sectionId: section.id,
          rollNo: rollCounter,
          status: 'ENROLLED',
          enrolledOn: new Date('2026-04-01'),
        },
      });
    }
  }

  /**
   * Advance the admission counter past everything seeded.
   *
   * Without this the next real admission would be handed `2026-0001`, collide
   * with a seeded student on UNIQUE(school_id, student_code), and fail — after
   * the receptionist had already typed the whole form.
   */
  await db.numberSequence.upsert({
    where: { schoolId_kind: { schoolId: school.id, kind: 'student' } },
    update: { nextValue: nextStudentCode },
    create: { schoolId: school.id, kind: 'student', nextValue: nextStudentCode },
  });

  await db.numberSequence.upsert({
    where: { schoolId_kind: { schoolId: school.id, kind: 'gr' } },
    update: { nextValue: nextGr },
    create: { schoolId: school.id, kind: 'gr', nextValue: nextGr },
  });

  await seedFees(db, school.id, admittedIds);
  await seedExpenses(db, school.id, session.id);

  return created;
}

/**
 * A fee catalogue, and a structure for every seeded child.
 *
 * The amounts are the ones a Lahore private school actually charges, because a
 * demo where tuition is 100 teaches nobody anything about whether the totals
 * column is readable at real widths.
 *
 * Two children per school get a discount, so the discounted-price rendering and
 * the gross/payable split are visible without anyone having to create one by
 * hand before they can see it work.
 */
async function seedFees(
  db: PrismaClient,
  schoolId: string,
  studentIds: readonly string[],
): Promise<void> {
  const catalogue = [
    { type: 'ADMISSION' as const, name: 'Admission Fee', amount: '25000.00', sortOrder: 0 },
    { type: 'TUITION' as const, name: 'Tuition Fee', amount: '6000.00', sortOrder: 1 },
    { type: 'ANNUAL' as const, name: 'Annual Charges', amount: '6000.00', sortOrder: 2 },
    { type: 'STATIONERY' as const, name: 'Stationery Charges', amount: '1500.00', sortOrder: 3 },
    { type: 'LAB' as const, name: 'Lab Fee', amount: '1000.00', sortOrder: 4 },
    { type: 'SECURITY' as const, name: 'Security Deposit', amount: '15000.00', sortOrder: 5 },
  ];

  const heads = [];
  for (const entry of catalogue) {
    const id = deterministicId(schoolId, `fee-head:${entry.name}`);
    heads.push(
      await db.feeHead.upsert({
        where: { id },
        update: { defaultAmount: entry.amount, sortOrder: entry.sortOrder },
        create: {
          id,
          schoolId,
          type: entry.type,
          name: entry.name,
          defaultAmount: entry.amount,
          sortOrder: entry.sortOrder,
        },
      }),
    );
  }

  for (const [index, studentId] of studentIds.entries()) {
    for (const head of heads) {
      // Every third child pays a little less tuition, and every seventh gets a
      // reduced admission fee — enough variation that the list is not a column
      // of identical numbers.
      const discounted =
        head.type === 'TUITION' && index % 3 === 0
          ? '4500.00'
          : head.type === 'ADMISSION' && index % 7 === 0
            ? '10000.00'
            : null;

      await db.studentFee.upsert({
        where: {
          schoolId_studentId_feeHeadId: { schoolId, studentId, feeHeadId: head.id },
        },
        update: {},
        create: {
          schoolId,
          studentId,
          feeHeadId: head.id,
          amount: head.defaultAmount,
          ...(discounted === null
            ? {}
            : { discountedAmount: discounted, discountReason: 'Sibling discount' }),
        },
      });
    }
  }
}

/**
 * A stable UUID derived from the school and a natural key, so re-running the
 * seed updates the same rows instead of duplicating them.
 *
 * SHA-1 rather than a 32-bit rolling hash: with a few hundred keys a weak hash
 * is a birthday collision waiting to happen, and a collision here silently
 * merges two students into one.
 */
/**
 * Spending, so the expense screens open with something in them.
 *
 * Categories a Pakistani private school actually keeps, and entries spread back
 * across three months rather than all dated today — a date filter that cannot
 * be seen working is a date filter nobody trusts.
 *
 * The voucher sequence is advanced to match. Seeding rows without moving it
 * would leave the next expense somebody records colliding on
 * `(school_id, voucher_no)`, which is the sort of thing that looks like a bug
 * in the feature rather than in the seed.
 */
async function seedExpenses(db: PrismaClient, schoolId: string, sessionId: string): Promise<void> {
  const categories = [
    { name: 'Utilities', glCode: '5100', sortOrder: 0 },
    { name: 'Salaries', glCode: '5200', sortOrder: 1 },
    { name: 'Maintenance', glCode: '5300', sortOrder: 2 },
    { name: 'Transport', glCode: '5400', sortOrder: 3 },
    { name: 'Stationery & Printing', glCode: '5500', sortOrder: 4 },
    { name: 'Events', glCode: '5600', sortOrder: 5 },
  ];

  const byName = new Map<string, string>();
  for (const entry of categories) {
    const id = deterministicId(schoolId, `expense-category:${entry.name}`);
    const row = await db.expenseCategory.upsert({
      where: { id },
      update: { glCode: entry.glCode, sortOrder: entry.sortOrder, isActive: true },
      create: { id, schoolId, ...entry },
    });
    byName.set(entry.name, row.id);
  }

  const entries = [
    {
      category: 'Utilities',
      description: 'Electricity bill',
      payee: 'LESCO',
      amount: '184500.00',
      method: 'BANK_TRANSFER' as const,
      daysAgo: 4,
    },
    {
      category: 'Utilities',
      description: 'Sui gas bill',
      payee: 'SNGPL',
      amount: '22750.00',
      method: 'BANK_TRANSFER' as const,
      daysAgo: 11,
    },
    {
      category: 'Utilities',
      description: 'Internet and phone',
      payee: 'PTCL',
      amount: '14000.00',
      method: 'BANK_TRANSFER' as const,
      daysAgo: 19,
    },
    {
      category: 'Salaries',
      description: 'Teaching staff salaries',
      payee: null,
      amount: '1450000.00',
      method: 'BANK_TRANSFER' as const,
      daysAgo: 6,
    },
    {
      category: 'Salaries',
      description: 'Support staff salaries',
      payee: null,
      amount: '312000.00',
      method: 'CASH' as const,
      daysAgo: 6,
    },
    {
      category: 'Maintenance',
      description: 'Generator servicing',
      payee: 'Al-Noor Engineering',
      amount: '38500.00',
      method: 'CHEQUE' as const,
      daysAgo: 23,
    },
    {
      category: 'Maintenance',
      description: 'Classroom fans and wiring',
      payee: 'Rehman Electric Store',
      amount: '61200.00',
      method: 'CASH' as const,
      daysAgo: 41,
    },
    {
      category: 'Maintenance',
      description: 'Water tank cleaning',
      payee: 'Clean Care Services',
      amount: '9500.00',
      method: 'CASH' as const,
      daysAgo: 57,
    },
    {
      category: 'Transport',
      description: 'Diesel for school vans',
      payee: 'Shell Ferozepur Road',
      amount: '96800.00',
      method: 'CARD' as const,
      daysAgo: 9,
    },
    {
      category: 'Transport',
      description: 'Van tyre replacement',
      payee: 'Sardar Tyre House',
      amount: '74000.00',
      method: 'CASH' as const,
      daysAgo: 34,
    },
    {
      category: 'Stationery & Printing',
      description: 'Exam paper printing',
      payee: 'Kitab Ghar Printers',
      amount: '43600.00',
      method: 'CASH' as const,
      daysAgo: 15,
    },
    {
      category: 'Stationery & Printing',
      description: 'Registers and attendance books',
      payee: 'Kitab Ghar Printers',
      amount: '18900.00',
      method: 'CASH' as const,
      daysAgo: 62,
    },
    {
      category: 'Events',
      description: 'Annual sports day arrangements',
      payee: 'Falcon Events',
      amount: '128000.00',
      method: 'CHEQUE' as const,
      daysAgo: 48,
    },
    {
      category: 'Events',
      description: 'Independence Day decorations',
      payee: null,
      amount: '16400.00',
      method: 'CASH' as const,
      daysAgo: 78,
    },
  ];

  // UTC midnight, `daysAgo` back. `@db.Date` has no time component, so anything
  // else would be silently truncated — and truncated in the *server's* zone,
  // which in Asia/Karachi is five hours off and lands on the previous day.
  const midnight = (daysAgo: number) => {
    const date = new Date(systemClock.now());
    date.setUTCHours(0, 0, 0, 0);
    date.setUTCDate(date.getUTCDate() - daysAgo);
    return date;
  };

  for (const [index, entry] of entries.entries()) {
    const categoryId = byName.get(entry.category);
    if (categoryId === undefined) {
      continue;
    }
    const voucherNo = `EXP-${String(index + 1).padStart(5, '0')}`;
    const id = deterministicId(schoolId, `expense:${voucherNo}`);
    await db.expense.upsert({
      where: { id },
      update: { amount: entry.amount, paidOn: midnight(entry.daysAgo) },
      create: {
        id,
        schoolId,
        sessionId,
        categoryId,
        voucherNo,
        description: entry.description,
        payee: entry.payee,
        amount: entry.amount,
        method: entry.method,
        paidOn: midnight(entry.daysAgo),
      },
    });
  }

  // Where the app picks up. `nextVoucherNo` returns `next_value - 1`, so this
  // must be one past the last seeded voucher for the next one to be unused.
  await db.numberSequence.upsert({
    where: { schoolId_kind: { schoolId, kind: 'expense' } },
    update: { nextValue: entries.length + 1 },
    create: { schoolId, kind: 'expense', nextValue: entries.length + 1 },
  });
}

function deterministicId(schoolId: string, key: string): string {
  const digest = createHash('sha1').update(`${schoolId}:${key}`).digest('hex');
  // Formatted as a version-4 variant-8 UUID so PostgreSQL accepts it.
  return [
    digest.slice(0, 8),
    digest.slice(8, 12),
    `4${digest.slice(13, 16)}`,
    `8${digest.slice(17, 20)}`,
    digest.slice(20, 32),
  ].join('-');
}

async function main(): Promise<void> {
  const db = createAdminClient({ url: process.env['DATABASE_ADMIN_URL'] ?? '' });
  const passwordHash = await hash(PASSWORD, { memoryCost: 19_456, timeCost: 2, parallelism: 1 });

  // The platform console needs one account or there is no way into it. Guarded
  // by the same production check as everything else in this file.
  await db.platformUser.upsert({
    where: { email: PLATFORM_EMAIL },
    update: { passwordHash, isActive: true, role: 'SUPER_ADMIN' },
    create: {
      email: PLATFORM_EMAIL,
      name: 'Platform Owner',
      passwordHash,
      role: 'SUPER_ADMIN',
      isActive: true,
    },
  });

  const lines: string[] = [];
  for (const spec of SCHOOLS) {
    const count = await seedSchool(db, spec, passwordHash);
    lines.push(
      `  ${spec.slug.padEnd(8)} ${String(count).padStart(2)} students   ${spec.ownerEmail}`,
    );
  }

  await db.$disconnect();

  const port = process.env['PORTAL_PORT'] ?? '3000';
  console.warn(`
Seeded ${String(SCHOOLS.length)} schools.

${lines.join('\n')}

  Password for all: ${PASSWORD}

Platform console: http://localhost:3001/login
  ${PLATFORM_EMAIL}  (SUPER_ADMIN)

Sign in at http://<slug>.localhost:${port}/login — the school comes from the
subdomain, so http://demo.localhost:${port}/login, not http://localhost:${port}.

Three schools exist so tenant isolation is provable with real data rather than
asserted: run \`node tooling/scripts/verify-isolation.mjs\`.
`);
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
