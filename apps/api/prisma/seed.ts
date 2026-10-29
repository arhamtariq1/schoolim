import { createHash } from 'node:crypto';

import { systemClock } from '@ilm/utils';
import { hash } from '@node-rs/argon2';

import { createAdminClient } from '../src/prisma/client';
import { type PrismaClient } from '../src/prisma/generated/client';
import { loadEnv } from '../src/prisma/load-env';

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

/**
 * When the seeded school year begins.
 *
 * The session, every admission and every agreed fee all start here. Three
 * literals that must agree is three chances for them to stop agreeing, and a
 * student admitted before their own fee starts is a voucher run that finds no
 * amount to bill.
 */
const SESSION_START = new Date('2026-04-01');

/** The one platform-console account. Development only, same guard as above. */
const PLATFORM_EMAIL = 'platform@platform.test';

/**
 * The demo school's roll: enough children that paging, sorting, filters and the
 * finance totals are exercised with a real-sized school rather than eleven rows.
 *
 * Generated rather than typed out, and deterministic (no randomness), so every
 * run produces the same students and diffs between seeds stay readable.
 */
const DEMO_STUDENT_TARGET = 330;

/**
 * Surnames the demo school must never use.
 *
 * Beacon and City keep their own small, hand-written families, and
 * `verify-browser.mjs` fails if any of those surnames shows up on the demo
 * school's students page — that is how a cross-tenant leak is made visible.
 */
const OTHER_SCHOOLS_SURNAMES: ReadonlySet<string> = new Set([
  'Qureshi',
  'Siddiqui',
  'Ansari',
  'Rizvi',
  'Abbasi',
  'Gilani',
  'Kayani',
]);

const SURNAMES: readonly string[] = [
  'Khan', 'Malik', 'Iqbal', 'Sheikh', 'Butt', 'Chaudhry', 'Raza', 'Hussain', 'Shah', 'Mirza',
  'Baig', 'Bhatti', 'Cheema', 'Gill', 'Virk', 'Warraich', 'Randhawa', 'Tarar', 'Gondal', 'Sandhu',
  'Dar', 'Lone', 'Mir', 'Wani', 'Bhutto', 'Jatoi', 'Soomro', 'Memon', 'Siyal', 'Abro',
  'Chandio', 'Leghari', 'Mazari', 'Gabol', 'Talpur', 'Magsi', 'Rind', 'Marri', 'Bugti', 'Durrani',
  'Yousafzai', 'Afridi', 'Orakzai', 'Mohmand', 'Wazir', 'Mehsud', 'Bangash', 'Khattak', 'Niazi',
  'Lodhi', 'Kakar', 'Tareen', 'Achakzai', 'Popalzai', 'Bizenjo', 'Mengal', 'Jamali', 'Kalhoro',
  'Farooqi', 'Usmani', 'Hashmi', 'Zaidi', 'Naqvi', 'Jafri', 'Bukhari', 'Gardezi', 'Kazmi',
  'Rehmani', 'Hanif', 'Javed', 'Akram', 'Nawaz', 'Sharif', 'Anwar', 'Aslam', 'Bashir', 'Dogar',
  'Ghauri', 'Hayat', 'Ilyas', 'Jamil', 'Kamal', 'Latif', 'Mahmood', 'Nadeem', 'Pasha', 'Qadir',
  'Rashid', 'Saeed', 'Tariq', 'Waheed', 'Yaqoob', 'Zafar', 'Zahid', 'Zubair', 'Ashraf', 'Bajwa',
  'Dilawar', 'Ejaz', 'Fazal', 'Ghani', 'Haider', 'Imtiaz', 'Junejo', 'Kiani', 'Lashari', 'Minhas',
  'Nazir', 'Paracha', 'Qazi', 'Rajput', 'Sial', 'Toor', 'Uppal', 'Vohra', 'Wattoo', 'Yasin',
  'Zia', 'Alvi', 'Burki', 'Chishti', 'Dehlvi', 'Ghumman', 'Janjua', 'Khokhar', 'Mughal', 'Noon',
  'Pirzada', 'Rana', 'Sethi', 'Tiwana', 'Ujjan', 'Yazdani', 'Zardari', 'Arain', 'Bokhari', 'Dhillon',
  'Gujjar', 'Kharal', 'Mayo', 'Nagra', 'Ranjha', 'Syed', 'Thaheem', 'Tahir', 'Alam', 'Babar',
  'Cheema', 'Dawood', 'Elahi', 'Farid', 'Gul', 'Habib', 'Idrees', 'Jahangir', 'Kaleem', 'Liaqat',
  'Munir', 'Najam', 'Obaid', 'Parvez', 'Rafiq', 'Shafiq', 'Tufail', 'Ubaid', 'Wasim', 'Younas',
];

const BOY_NAMES: readonly string[] = [
  'Ahmed', 'Bilal', 'Usman', 'Hamza', 'Omar', 'Talha', 'Ali', 'Hassan', 'Hussain', 'Zain',
  'Ayaan', 'Rayyan', 'Saad', 'Faizan', 'Haris', 'Ibrahim', 'Ismail', 'Yusuf', 'Zakariya', 'Abdullah',
  'Abubakar', 'Umar', 'Salman', 'Shayan', 'Arham', 'Rehan', 'Daniyal', 'Fahad', 'Murtaza', 'Moiz',
  'Mustafa', 'Nabeel', 'Owais', 'Qasim', 'Rafay', 'Sami', 'Taimoor', 'Uzair', 'Waqas', 'Yasir',
  'Zeeshan', 'Affan', 'Arslan', 'Azan', 'Basit', 'Fawad', 'Hashir', 'Huzaifa', 'Ibad', 'Jawad',
  'Kabir', 'Laith', 'Noman', 'Raheel', 'Sarmad', 'Tayyab', 'Wahab', 'Zohaib', 'Anas', 'Areeb',
  'Dawood', 'Furqan', 'Ghazi', 'Ilyas', 'Jibran', 'Kamran', 'Luqman', 'Maaz', 'Naveed', 'Osama',
];

const GIRL_NAMES: readonly string[] = [
  'Sara', 'Fatima', 'Zainab', 'Ayesha', 'Hira', 'Maryam', 'Hafsa', 'Khadija', 'Amna', 'Anaya',
  'Areeba', 'Bushra', 'Dua', 'Eman', 'Fiza', 'Ghazal', 'Hania', 'Iqra', 'Jannat', 'Kinza',
  'Laiba', 'Mahnoor', 'Minahil', 'Nimra', 'Omaima', 'Rida', 'Rumaisa', 'Sadia', 'Samina', 'Shiza',
  'Tooba', 'Urooj', 'Warda', 'Yumna', 'Zara', 'Zoya', 'Alina', 'Amal', 'Aleena', 'Anum',
  'Arisha', 'Asma', 'Aiza', 'Beenish', 'Dania', 'Esha', 'Farah', 'Hoorain', 'Inaya', 'Javeria',
  'Komal', 'Lubna', 'Mehak', 'Palwasha', 'Saba', 'Sidra', 'Tehreem', 'Umaima', 'Wajiha', 'Zunaira',
];

/** Every first name that is a girl's, across all three schools' families. */
const FEMALE_NAMES: ReadonlySet<string> = new Set([
  ...GIRL_NAMES,
  'Bilquis', 'Nida', 'Sana', 'Mehwish', 'Tehmina', 'Rabia', 'Noor',
]);

/** Brothers and sisters per family, cycled: one in five is an only child. */
const FAMILY_SIZES = [2, 3, 2, 1, 3, 2, 2, 1, 3, 2] as const;

/**
 * Families for a school of roughly `target` children.
 *
 * Each family has a distinct surname (the guardian and student ids are derived
 * from it) and distinct first names, boys and girls mixed.
 */
function generateFamilies(target: number): readonly (readonly [string, readonly string[]])[] {
  const surnames = [...new Set(SURNAMES)].filter((name) => !OTHER_SCHOOLS_SURNAMES.has(name));
  const families: (readonly [string, readonly string[]])[] = [];
  let children = 0;
  let boy = 0;
  let girl = 0;

  for (let index = 0; children < target; index += 1) {
    const surname = surnames[index];
    if (surname === undefined) {
      throw new Error(`Add more surnames: ${String(index)} cover only ${String(children)} children.`);
    }
    const size = FAMILY_SIZES[index % FAMILY_SIZES.length] ?? 1;
    const names: string[] = [];
    for (let child = 0; child < size; child += 1) {
      // Alternate by the running count, so classes end up near half and half.
      const useGirl = (index + child) % 2 === 1;
      names.push(
        useGirl ? pick(GIRL_NAMES, girl++ + index) : pick(BOY_NAMES, boy++ + index * 3),
      );
    }
    families.push([surname, [...new Set(names)]]);
    children += names.length;
  }
  return families;
}

interface SchoolSpec {
  readonly id: string;
  readonly slug: string;
  readonly name: string;
  readonly city: string;
  /**
   * The rest of the letterhead.
   *
   * Seeded rather than left null because Settings › School now edits these and
   * a form that opens with four empty fields cannot show whether it *reads*
   * correctly — only whether it writes. Distinct per school for the same reason
   * the family names are: a leak is then obvious on sight.
   */
  readonly address: string;
  readonly phone: string;
  readonly email: string;
  readonly ownerEmail: string;
  readonly ownerName: string;
  readonly ownerPhone: string;
  readonly ownerDesignation: string;
  /** Distinct per school, so a leak is obvious on sight rather than subtle. */
  readonly families: readonly (readonly [string, readonly string[]])[];
}

const SCHOOLS: readonly SchoolSpec[] = [
  {
    id: '00000000-0000-4000-8000-000000000001',
    slug: 'demo',
    name: 'Demo Public School',
    city: 'Lahore',
    address: '14-A Gulberg III, Main Boulevard',
    phone: '+924235771400',
    email: 'office@demopublic.edu.pk',
    ownerEmail: 'owner@demo.test',
    ownerName: 'Demo Owner',
    ownerPhone: '+923001234567',
    ownerDesignation: 'Principal',
    // Hundreds of children, so every list, filter and total is tried at the size
    // a real school actually is. Beacon and City stay small on purpose: they
    // exist to prove isolation, and they are easy to read at a glance.
    families: generateFamilies(DEMO_STUDENT_TARGET),
  },
  {
    id: '00000000-0000-4000-8000-000000000011',
    slug: 'beacon',
    name: 'Beacon Model School',
    city: 'Karachi',
    address: 'Plot 22, Block 6, PECHS, Shahrah-e-Faisal',
    phone: '+922134528800',
    email: 'office@beaconmodel.edu.pk',
    ownerEmail: 'owner@beacon.test',
    ownerName: 'Beacon Owner',
    ownerPhone: '+923212345678',
    ownerDesignation: 'Director',
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
    address: 'Street 9, Sector F-8/3',
    phone: '+925122831900',
    email: 'office@citygrammar.edu.pk',
    ownerEmail: 'owner@city.test',
    ownerName: 'City Owner',
    ownerPhone: '+923335556677',
    ownerDesignation: 'Head of School',
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

  // The whole letterhead on both branches. `update` used to carry three fields
  // while `create` carried five, so re-seeding an existing database left the
  // newer columns at whatever they happened to hold — which is the one thing a
  // seed exists to rule out.
  const details = {
    name: spec.name,
    slug: spec.slug,
    legalName: `${spec.name} (Pvt) Ltd`,
    address: spec.address,
    city: spec.city,
    phone: spec.phone,
    email: spec.email,
    timezone: 'Asia/Karachi',
    locale: 'en',
  };

  const school = await db.school.upsert({
    where: { id: spec.id },
    update: details,
    create: { id: spec.id, ...details, status: 'ACTIVE', onboardedAt: now },
  });

  // `emailVerifiedAt` and `profileCompletedAt` are stamped deliberately.
  // Without them a freshly seeded owner signs in, is bounced to
  // `/profile/create` before they can reach a single seeded screen, and is then
  // refused there because the school is already onboarded — a dead end that
  // only a database edit gets out of.
  const ownerDetails = {
    name: spec.ownerName,
    phone: spec.ownerPhone,
    designation: spec.ownerDesignation,
    passwordHash,
    status: 'ACTIVE',
    emailVerifiedAt: now,
    profileCompletedAt: now,
  } as const;

  const owner = await db.user.upsert({
    where: { schoolId_email: { schoolId: school.id, email: spec.ownerEmail } },
    update: ownerDetails,
    create: { schoolId: school.id, email: spec.ownerEmail, ...ownerDetails },
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
      startDate: SESSION_START,
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
  const admitted: { id: string; isSibling: boolean }[] = [];
  const levelOrderOf = new Map(levels.map((level) => [level.id, level.numericOrder]));
  let nextStudentCode = studentCodeSequence?.nextValue ?? 1;
  // The GR counter is read separately rather than assumed equal to the
  // admission one. They start in step and drift the moment a school issues a GR
  // number to a child who never completed admission.
  let nextGr = grSequence?.nextValue ?? 1;

  let created = 0;
  /** Walks the sections so every class gets students. Not a roll number. */
  let placed = 0;
  /**
   * One counter per section, because that is what a roll number is: a position
   * on *that* section’s register, starting at 1. A single running counter
   * across the school produced "Grade 4 — A, roll 10" beside "Grade 4 — B,
   * roll 11", which is not a register anybody keeps.
   */
  const rollBySection = new Map<string, number>();

  // Clear the register before rewriting it. Rolls are unique per section, so
  // moving a school-wide numbering to a per-section one can collide halfway
  // through — student X already holds the number student Y is about to be
  // given. Emptying first makes the assignment below unconditional.
  await db.enrollment.updateMany({
    where: { schoolId: school.id, sessionId: session.id },
    data: { rollNo: null },
  });

  for (const [familyIndex, [surname, firstNames]] of spec.families.entries()) {
    const guardian = await db.guardian.upsert({
      where: {
        // No natural key, so a deterministic id keeps the seed idempotent.
        id: deterministicId(spec.id, `guardian:${surname}`),
      },
      update: { name: `${pick(FATHER_FIRST_NAMES, familyIndex)} ${surname}` },
      create: {
        id: deterministicId(spec.id, `guardian:${surname}`),
        schoolId: school.id,
        name: `${pick(FATHER_FIRST_NAMES, familyIndex)} ${surname}`,
        relation: 'FATHER',
        // One number per family, distinct across the school: two families on
        // one phone would make the guardian search ambiguous in a way real
        // data never is.
        phone: `+9230${String(10_000_000 + familyIndex * 7919).padStart(8, '0')}`,
        occupation: pick(OCCUPATIONS, familyIndex),
      },
    });

    for (const [childIndex, firstName] of firstNames.entries()) {
      placed += 1;

      const studentId = deterministicId(spec.id, `student:${surname}:${firstName}`);
      const section = pick(sections, placed);
      const rollNo = (rollBySection.get(section.id) ?? 0) + 1;
      rollBySection.set(section.id, rollNo);

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
      // From the second child of a family on: the sibling concession.
      admitted.push({ id: studentId, isSibling: childIndex > 0 });

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
          gender: FEMALE_NAMES.has(firstName) ? 'FEMALE' : 'MALE',
          dateOfBirth: dateOfBirthFor(levelOrderOf.get(section.classLevelId) ?? 0, placed),
          city: spec.city,
          status: 'ACTIVE',
          admittedOn: SESSION_START,
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
        // `rollNo` on both branches. It used to be on `create` only, so a
        // re-seed left whatever numbering the rows already had — which is how a
        // school-wide counter survived the change to per-section rolls.
        update: { sectionId: section.id, classLevelId: section.classLevelId, rollNo },
        create: {
          schoolId: school.id,
          studentId: student.id,
          sessionId: session.id,
          classLevelId: section.classLevelId,
          sectionId: section.id,
          rollNo,
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

  await seedFees(db, school.id, admitted);
  await seedVoucherNumbering(db, school.id);
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
/** Fathers' first names, cycled across families. */
const FATHER_FIRST_NAMES = [
  'Muhammad', 'Ali', 'Imran', 'Tariq', 'Nadeem', 'Kamran', 'Asif', 'Naveed', 'Shahid', 'Rashid',
  'Farooq', 'Khalid', 'Waseem', 'Adeel', 'Rizwan', 'Sajid',
] as const;

const OCCUPATIONS = [
  'Businessman', 'Doctor', 'Engineer', 'Teacher', 'Shopkeeper', 'Accountant', 'Banker', 'Lawyer',
  'Government servant', 'Farmer', 'Contractor', 'Pharmacist',
] as const;

/**
 * A birth date that fits the class: Nursery children are three, each class
 * above is a year older. Day is capped at 28 so every month has it, and both
 * month and day are derived from `placed` so the same child always gets the
 * same date.
 */
function dateOfBirthFor(levelOrder: number, placed: number): Date {
  const year = 2026 - (3 + levelOrder);
  const month = 1 + ((placed * 5) % 12);
  const day = 1 + ((placed * 7) % 28);
  return new Date(`${String(year)}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`);
}

/**
 * Voucher numbering, which generation refuses to run without.
 *
 * `FV-` and six digits is what every existing school's counter already prints.
 * Created only if absent, so a school that has configured its own keeps it.
 */
async function seedVoucherNumbering(db: PrismaClient, schoolId: string): Promise<void> {
  await db.numberSequence.upsert({
    where: { schoolId_kind: { schoolId, kind: 'voucher' } },
    update: {},
    create: { schoolId, kind: 'voucher', nextValue: 1, prefix: 'FV-', pad: 6 },
  });
}

async function seedFees(
  db: PrismaClient,
  schoolId: string,
  students: readonly { id: string; isSibling: boolean }[],
): Promise<void> {
  // Frequency is stated on every head, never left to the column default.
  //
  // It is the field that stops three months of billing charging three admission
  // fees, so a catalogue that leaves it out seeds a school where the rule
  // appears not to work — an admission fee labelled "September 2026", and a
  // second one in October.
  const catalogue = [
    {
      type: 'ADMISSION' as const,
      name: 'Admission Fee',
      amount: '25000.00',
      // Once in a child's life, whatever is ticked on the generate screen.
      frequency: 'ONE_TIME' as const,
      sortOrder: 0,
    },
    {
      type: 'TUITION' as const,
      name: 'Tuition Fee',
      amount: '6000.00',
      frequency: 'MONTHLY' as const,
      sortOrder: 1,
    },
    {
      type: 'ANNUAL' as const,
      name: 'Annual Charges',
      amount: '6000.00',
      frequency: 'ANNUAL' as const,
      sortOrder: 2,
    },
    {
      type: 'STATIONERY' as const,
      name: 'Stationery Charges',
      amount: '1500.00',
      frequency: 'ANNUAL' as const,
      sortOrder: 3,
    },
    {
      type: 'LAB' as const,
      name: 'Lab Fee',
      amount: '1000.00',
      frequency: 'MONTHLY' as const,
      sortOrder: 4,
    },
    {
      type: 'SECURITY' as const,
      name: 'Security Deposit',
      amount: '15000.00',
      // Refundable, taken once. It is a deposit rather than a fee at all, which
      // is why it has a ledger of its own.
      frequency: 'ONE_TIME' as const,
      sortOrder: 5,
    },
  ];

  const heads = [];
  for (const entry of catalogue) {
    const id = deterministicId(schoolId, `fee-head:${entry.name}`);
    heads.push(
      await db.feeHead.upsert({
        where: { id },
        // Frequency is corrected on re-seed, not only on create: a database
        // seeded before this was set would otherwise keep charging admission
        // every month forever.
        update: {
          defaultAmount: entry.amount,
          sortOrder: entry.sortOrder,
          frequency: entry.frequency,
        },
        create: {
          id,
          schoolId,
          type: entry.type,
          name: entry.name,
          defaultAmount: entry.amount,
          frequency: entry.frequency,
          sortOrder: entry.sortOrder,
        },
      }),
    );
  }

  for (const { id: studentId, isSibling } of students) {
    for (const head of heads) {
      // The second and later child of a family pay less tuition and a reduced
      // admission fee. That is the concession the label says it is, and it gives
      // the list real variation: about four in ten children are on a discount.
      const discounted =
        isSibling && head.type === 'TUITION'
          ? '4500.00'
          : isSibling && head.type === 'ADMISSION'
            ? '10000.00'
            : null;

      // A fee is now "this amount, from this date". Seeded students are all
      // admitted on the session start, so that is when their agreed amount
      // begins — and pinning it to a constant rather than `new Date()` keeps
      // the seed idempotent: re-running it hits the same row instead of laying
      // down a second one a day later.
      await db.studentFee.upsert({
        where: {
          schoolId_studentId_feeHeadId_effectiveFrom: {
            schoolId,
            studentId,
            feeHeadId: head.id,
            effectiveFrom: SESSION_START,
          },
        },
        update: {},
        create: {
          schoolId,
          studentId,
          feeHeadId: head.id,
          effectiveFrom: SESSION_START,
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
