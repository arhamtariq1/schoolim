/**
 * Development-only test data for one school: students, parents, teachers.
 *
 *   npx tsx --env-file=.env scripts/seed-test-data.ts
 *
 * Target: the school that `yamaan005@yopmail.com` belongs to.
 *
 * - 150 students spread over every class of the current session.
 * - One guardian per family, each with a PARENT login; families have one, two
 *   or three children, in different classes.
 * - 15 teachers, each with a TEACHER login and at least one class; every class
 *   has a teacher.
 *
 * Re-running is safe: a family is skipped when its guardian email already
 * exists, a teacher when their email already has a user. Nothing existing is
 * updated or deleted.
 *
 * Passwords are hashed with the application's own argon2id service. The shared
 * test password is below on purpose — these are throwaway development accounts
 * and must never be created in a real school.
 */
import { randomUUID } from 'node:crypto';

import { formatGrNo } from '@ilm/contracts';

import { createAdminClient } from '../src/prisma';
import { PasswordService } from '../src/shared/auth/password.service';

const OWNER_EMAIL = 'yamaan005@yopmail.com';
const TEST_PASSWORD = 'Abde@112233';
const SEED_MARK = 'whgs-test-data-v1';
const STUDENT_TARGET = 150;
const TEACHER_TARGET = 15;

// ---- deterministic randomness, so a re-run builds the same people -------------

function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = mulberry32(20261017);
const pick = <T>(items: readonly T[]): T => items[Math.floor(rand() * items.length)] as T;
const between = (min: number, max: number): number => min + Math.floor(rand() * (max - min + 1));
function shuffle<T>(items: readonly T[]): T[] {
  const copy = [...items];
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(rand() * (index + 1));
    [copy[index], copy[swap]] = [copy[swap] as T, copy[index] as T];
  }
  return copy;
}

const MALE = [
  'Ahmed', 'Ali', 'Hamza', 'Hassan', 'Hussain', 'Usman', 'Bilal', 'Omar', 'Zain', 'Faizan',
  'Saad', 'Talha', 'Ibrahim', 'Yusuf', 'Daniyal', 'Rayyan', 'Arham', 'Ayaan', 'Shahzaib',
  'Mustafa', 'Abdullah', 'Huzaifa', 'Anas', 'Sufyan', 'Rehan', 'Zayan', 'Moiz', 'Fahad',
  'Hamid', 'Kamran', 'Imran', 'Adeel', 'Waqas', 'Noman', 'Asad', 'Junaid', 'Salman', 'Danish',
  'Shoaib', 'Tariq', 'Naveed', 'Arslan', 'Haris', 'Owais', 'Affan', 'Ammar', 'Ismail', 'Zubair',
] as const;
const FEMALE = [
  'Ayesha', 'Fatima', 'Zainab', 'Maryam', 'Hira', 'Sana', 'Amna', 'Khadija', 'Aliza', 'Iqra',
  'Laiba', 'Noor', 'Eman', 'Areeba', 'Mahnoor', 'Hania', 'Rida', 'Zara', 'Anaya', 'Minahil',
  'Sadia', 'Bushra', 'Samina', 'Rabia', 'Nimra', 'Kinza', 'Alishba', 'Mehwish', 'Hafsa', 'Warda',
  'Esha', 'Dua', 'Fiza', 'Komal', 'Sidra', 'Tooba', 'Anum', 'Aiman', 'Rukhsar', 'Shaista',
] as const;
const FAMILY = [
  'Khan', 'Ahmed', 'Siddiqui', 'Qureshi', 'Malik', 'Sheikh', 'Butt', 'Chaudhry', 'Raza', 'Ansari',
  'Hashmi', 'Farooqui', 'Memon', 'Baig', 'Mirza', 'Abbasi', 'Rizvi', 'Naqvi', 'Javed', 'Hussain',
  'Iqbal', 'Akhtar', 'Shah', 'Lodhi', 'Bhatti', 'Mughal', 'Zaidi', 'Kazmi', 'Awan', 'Niazi',
  'Pasha', 'Rajput', 'Soomro', 'Jatoi', 'Bukhari', 'Gillani', 'Durrani', 'Yousafzai', 'Afridi', 'Paracha',
] as const;
const AREAS = [
  'Gulshan-e-Iqbal', 'North Nazimabad', 'Gulistan-e-Johar', 'Nazimabad', 'Federal B Area',
  'PECHS', 'Malir Cantt', 'Korangi', 'Landhi', 'Saddar', 'Clifton', 'Bahadurabad',
  'Shah Faisal Colony', 'Liaquatabad', 'Orangi Town', 'DHA Phase 5', 'Gulberg', 'Scheme 33',
] as const;
const OCCUPATIONS = [
  'Shopkeeper', 'Engineer', 'Teacher', 'Accountant', 'Doctor', 'Businessman', 'Bank Officer',
  'Driver', 'Government Servant', 'Electrician', 'Pharmacist', 'Software Developer', 'Contractor',
  'Salesman', 'Tailor', 'Homemaker',
] as const;
const SUBJECTS = [
  'Mathematics', 'English', 'Urdu', 'Science', 'Islamiyat', 'Social Studies', 'Computer Science',
  'Physics', 'Chemistry', 'Biology', 'Pakistan Studies', 'General Knowledge', 'Art', 'Early Years',
  'Mathematics',
] as const;

const slug = (value: string): string => value.toLowerCase().replace(/[^a-z]/g, '');

function phone(): string {
  // Pakistani mobile: +92 3xx xxxxxxx, with a network prefix from 300 to 349.
  return `+923${String(between(0, 49)).padStart(2, '0')}${String(between(1_000_000, 9_999_999))}`;
}

// ---- main ---------------------------------------------------------------------

interface ClassRow {
  id: string;
  name: string;
  numeric_order: number;
}

async function main(): Promise<void> {
  const db = createAdminClient({ url: process.env['DATABASE_ADMIN_URL'] ?? '' });
  const passwords = new PasswordService();

  try {
    const owner = await db.$queryRawUnsafe<{ school_id: string; name: string }[]>(
      `SELECT u.school_id, s.name FROM users u JOIN schools s ON s.id = u.school_id
        WHERE lower(u.email) = lower($1)`,
      OWNER_EMAIL,
    );
    const school = owner[0];
    if (school === undefined) {
      throw new Error(`No school found for ${OWNER_EMAIL}.`);
    }
    const schoolId = school.school_id;
    console.log(`School: ${school.name} (${schoolId})`);

    const classes = await db.$queryRawUnsafe<ClassRow[]>(
      `SELECT id, name, numeric_order FROM class_levels
        WHERE school_id = $1::uuid AND is_active ORDER BY numeric_order`,
      schoolId,
    );
    const sessions = await db.$queryRawUnsafe<{ id: string; name: string; start_date: Date }[]>(
      `SELECT id, name, start_date FROM academic_sessions
        WHERE school_id = $1::uuid AND is_current LIMIT 1`,
      schoolId,
    );
    const session = sessions[0];
    if (session === undefined || classes.length === 0) {
      throw new Error('The school needs a current session and at least one class.');
    }
    console.log(`Session: ${session.name}; classes: ${classes.map((entry) => entry.name).join(', ')}`);

    const already = await db.$queryRawUnsafe<{ n: bigint }[]>(
      `SELECT COUNT(*) AS n FROM students WHERE school_id = $1::uuid AND custom ->> 'seed' = $2`,
      schoolId,
      SEED_MARK,
    );
    const alreadySeeded = Number(already[0]?.n ?? 0);

    // ---- plan the families ------------------------------------------------------
    // 150 children: 84 only children, 24 pairs, 6 families of three.
    const sizes = shuffle([
      ...Array.from({ length: 84 }, () => 1),
      ...Array.from({ length: 24 }, () => 2),
      ...Array.from({ length: 6 }, () => 3),
    ]).sort((a, b) => b - a);

    const slots = new Map<string, number>();
    classes.forEach((entry, index) => {
      slots.set(entry.id, Math.floor(STUDENT_TARGET / classes.length) + (index < STUDENT_TARGET % classes.length ? 1 : 0));
    });

    interface PlannedChild {
      classId: string;
      gender: 'MALE' | 'FEMALE';
      firstName: string;
    }
    interface PlannedFamily {
      index: number;
      surname: string;
      guardianRelation: 'FATHER' | 'MOTHER';
      guardianName: string;
      email: string;
      phone: string;
      occupation: string;
      address: string;
      children: PlannedChild[];
    }

    const usedEmails = new Set<string>();
    const families: PlannedFamily[] = [];

    sizes.forEach((size, familyIndex) => {
      // A family's children go to different classes, from whichever are fullest to fill.
      const order = shuffle(classes)
        .sort((a, b) => (slots.get(b.id) ?? 0) - (slots.get(a.id) ?? 0))
        .slice(0, size);

      const surname = pick(FAMILY);
      const mother = rand() < 0.15;
      const guardianFirst = mother ? pick(FEMALE) : pick(MALE);
      const children: PlannedChild[] = order
        .sort((a, b) => a.numeric_order - b.numeric_order)
        .map((cls) => {
          slots.set(cls.id, (slots.get(cls.id) ?? 1) - 1);
          const gender: 'MALE' | 'FEMALE' = rand() < 0.52 ? 'MALE' : 'FEMALE';
          return {
            classId: cls.id,
            gender,
            firstName: gender === 'MALE' ? pick(MALE) : pick(FEMALE),
          };
        });

      // Siblings must not share a first name.
      const seen = new Set<string>();
      for (const child of children) {
        while (seen.has(child.firstName)) {
          child.firstName = child.gender === 'MALE' ? pick(MALE) : pick(FEMALE);
        }
        seen.add(child.firstName);
      }

      let email = `${slug(guardianFirst)}.${slug(surname)}${String(familyIndex + 1)}@yopmail.com`;
      while (usedEmails.has(email)) {
        email = `x${email}`;
      }
      usedEmails.add(email);

      families.push({
        index: familyIndex + 1,
        surname,
        guardianRelation: mother ? 'MOTHER' : 'FATHER',
        guardianName: `${guardianFirst} ${surname}`,
        email,
        phone: phone(),
        occupation: mother ? 'Homemaker' : pick(OCCUPATIONS),
        address: `House ${String(between(1, 480))}, Street ${String(between(1, 40))}, ${pick(AREAS)}, Karachi`,
        children,
      });
    });

    // ---- teachers ---------------------------------------------------------------
    const teacherPlans = Array.from({ length: TEACHER_TARGET }, (_, index) => {
      const female = index % 2 === 0;
      const first = female ? FEMALE[(index * 2 + 3) % FEMALE.length] : MALE[(index * 3 + 5) % MALE.length];
      const surname = FAMILY[(index * 5 + 7) % FAMILY.length];
      const classIndexes = new Set<number>([index % classes.length]);
      if (index < 10) {
        classIndexes.add((index + 3) % classes.length);
      }
      if (index < 4) {
        classIndexes.add((index + 7) % classes.length);
      }
      return {
        name: `${first} ${surname}`,
        email: `${slug(first ?? '')}.${slug(surname ?? '')}.teacher@yopmail.com`,
        gender: female ? 'FEMALE' : 'MALE',
        phone: phone(),
        salary: 28_000 + 500 * between(0, 72),
        joinedOn: `${String(between(2021, 2026))}-${String(between(1, 9)).padStart(2, '0')}-${String(between(1, 28)).padStart(2, '0')}`,
        subject: SUBJECTS[index] ?? 'General',
        classIds: [...classIndexes].map((position) => classes[position]?.id ?? ''),
      };
    });

    // ---- who is new -------------------------------------------------------------
    const existingGuardians = new Set(
      (
        await db.$queryRawUnsafe<{ email: string }[]>(
          `SELECT lower(email) AS email FROM guardians WHERE school_id = $1::uuid AND email IS NOT NULL`,
          schoolId,
        )
      ).map((row) => row.email),
    );
    const existingUsers = new Set(
      (
        await db.$queryRawUnsafe<{ email: string }[]>(
          `SELECT lower(email) AS email FROM users WHERE school_id = $1::uuid`,
          schoolId,
        )
      ).map((row) => row.email),
    );

    const newFamilies = families.filter(
      (family) => !existingGuardians.has(family.email) && !existingUsers.has(family.email),
    );
    const newTeachers = teacherPlans.filter((plan) => !existingUsers.has(plan.email));
    const newStudentCount = newFamilies.reduce((sum, family) => sum + family.children.length, 0);
    console.log(
      `Already seeded students: ${String(alreadySeeded)}. To create: ${String(newFamilies.length)} families / ${String(newStudentCount)} students, ${String(newTeachers.length)} teachers.`,
    );

    // Hash outside the transaction: argon2 is deliberately slow.
    const parentHashes = await Promise.all(newFamilies.map(() => passwords.hash(TEST_PASSWORD)));
    const teacherHashes = await Promise.all(newTeachers.map(() => passwords.hash(TEST_PASSWORD)));

    await db.$transaction(
      async (tx) => {
        const now = new Date();
        const admissionYear = session.start_date.getUTCFullYear();

        // Numbers come from the school's own sequences, the way admission does it,
        // in one block so nothing else is handed the same range.
        const grBlock =
          newStudentCount === 0
            ? undefined
            : (
                await tx.$queryRawUnsafe<{ first: number; prefix: string; pad: number }[]>(
                  `UPDATE number_sequences SET next_value = next_value + $2::int, updated_at = now()
                    WHERE kind = 'gr' AND school_id = $1::uuid
                RETURNING next_value - $2::int AS first, prefix, pad`,
                  schoolId,
                  newStudentCount,
                )
              )[0];
        const codeBlock =
          newStudentCount === 0
            ? undefined
            : (
                await tx.$queryRawUnsafe<{ first: number }[]>(
                  `UPDATE number_sequences SET next_value = next_value + $2::int, updated_at = now()
                    WHERE kind = 'student' AND school_id = $1::uuid
                RETURNING next_value - $2::int AS first`,
                  schoolId,
                  newStudentCount,
                )
              )[0];
        if (newStudentCount > 0 && (grBlock === undefined || codeBlock === undefined)) {
          throw new Error('The GR number and student ID sequences must be set up first.');
        }

        const feeHeads = await tx.$queryRawUnsafe<
          { id: string; amount: string; links: string[] | null }[]
        >(
          `SELECT h.id, h.default_amount::text AS amount,
                  (SELECT array_agg(l.class_level_id::text) FROM fee_head_class_levels l WHERE l.fee_head_id = h.id) AS links
             FROM fee_heads h WHERE h.school_id = $1::uuid AND h.is_active`,
          schoolId,
        );

        let counter = 0;
        for (const [familyPosition, family] of newFamilies.entries()) {
          const userId = randomUUID();
          const guardianId = randomUUID();

          await tx.$executeRawUnsafe(
            `INSERT INTO users (id, school_id, email, phone, name, password_hash, status, email_verified_at,
                                must_change_password, profile_completed_at, created_at, updated_at)
             VALUES ($1::uuid, $2::uuid, $3, $4, $5, $6, 'ACTIVE', $7, false, $7, $7, $7)`,
            userId,
            schoolId,
            family.email,
            family.phone,
            family.guardianName,
            parentHashes[familyPosition],
            now,
          );
          await tx.$executeRawUnsafe(
            `INSERT INTO user_roles (id, school_id, user_id, role, created_at)
             VALUES (gen_random_uuid(), $1::uuid, $2::uuid, 'PARENT', $3)`,
            schoolId,
            userId,
            now,
          );
          await tx.$executeRawUnsafe(
            `INSERT INTO guardians (id, school_id, name, relation, phone, email, occupation, address, user_id, created_at, updated_at)
             VALUES ($1::uuid, $2::uuid, $3, $4::guardian_relation, $5, $6, $7, $8, $9::uuid, $10, $10)`,
            guardianId,
            schoolId,
            family.guardianName,
            family.guardianRelation,
            family.phone,
            family.email,
            family.occupation,
            family.address,
            userId,
            now,
          );

          for (const child of family.children) {
            const studentId = randomUUID();
            const classIndex = classes.findIndex((entry) => entry.id === child.classId);
            const born = `${String(admissionYear - 3 - classIndex - between(0, 0))}-${String(between(1, 12)).padStart(2, '0')}-${String(between(1, 28)).padStart(2, '0')}`;
            const admitted = `${String(admissionYear)}-10-${String(between(1, 16)).padStart(2, '0')}`;
            const grNo = formatGrNo(grBlock?.prefix ?? '', (grBlock?.first ?? 0) + counter, grBlock?.pad ?? 4);
            const studentCode = `${String(admissionYear)}-${String((codeBlock?.first ?? 0) + counter).padStart(4, '0')}`;
            counter += 1;

            await tx.$executeRawUnsafe(
              `INSERT INTO students (id, school_id, gr_no, student_code, first_name, last_name, gender, date_of_birth,
                                    religion, nationality, address, city, emergency_contact, status, admitted_on,
                                    custom, created_at, updated_at)
               VALUES ($1::uuid, $2::uuid, $3, $4, $5, $6, $7::gender, $8::date, 'Islam', 'Pakistani', $9, 'Karachi', $10,
                       'ACTIVE', $11::date, $12::jsonb, $13, $13)`,
              studentId,
              schoolId,
              grNo,
              studentCode,
              child.firstName,
              family.surname,
              child.gender,
              born,
              family.address,
              family.phone,
              admitted,
              JSON.stringify({ seed: SEED_MARK }),
              now,
            );
            await tx.$executeRawUnsafe(
              `INSERT INTO student_guardians (id, school_id, student_id, guardian_id, is_primary, is_fee_payer, can_pickup, created_at)
               VALUES (gen_random_uuid(), $1::uuid, $2::uuid, $3::uuid, true, true, true, $4)`,
              schoolId,
              studentId,
              guardianId,
              now,
            );
            await tx.$executeRawUnsafe(
              `INSERT INTO enrollments (id, school_id, student_id, session_id, class_level_id, status, enrolled_on, created_at, updated_at)
               VALUES (gen_random_uuid(), $1::uuid, $2::uuid, $3::uuid, $4::uuid, 'ENROLLED', $5::date, $6, $6)`,
              schoolId,
              studentId,
              session.id,
              child.classId,
              admitted,
              now,
            );
            for (const head of feeHeads) {
              if (head.links !== null && !head.links.includes(child.classId)) {
                continue;
              }
              await tx.$executeRawUnsafe(
                `INSERT INTO student_fees (id, school_id, student_id, fee_head_id, amount, effective_from, created_at, updated_at)
                 VALUES (gen_random_uuid(), $1::uuid, $2::uuid, $3::uuid, $4::numeric, $5::date, $6, $6)`,
                schoolId,
                studentId,
                head.id,
                head.amount,
                admitted,
                now,
              );
            }
          }
        }

        for (const [position, plan] of newTeachers.entries()) {
          const userId = randomUUID();
          const staffId = randomUUID();
          const employeeNo = (
            await tx.$queryRawUnsafe<{ next: number }[]>(
              `INSERT INTO number_sequences (id, school_id, kind, next_value, updated_at)
               VALUES (gen_random_uuid(), $1::uuid, 'staff', 2, now())
               ON CONFLICT (school_id, kind)
               DO UPDATE SET next_value = number_sequences.next_value + 1, updated_at = now()
               RETURNING next_value - 1 AS next`,
              schoolId,
            )
          )[0]?.next;
          if (employeeNo === undefined) {
            throw new Error('Could not allocate an employee number.');
          }

          await tx.$executeRawUnsafe(
            `INSERT INTO users (id, school_id, email, phone, name, password_hash, status, email_verified_at,
                                must_change_password, profile_completed_at, created_at, updated_at)
             VALUES ($1::uuid, $2::uuid, $3, $4, $5, $6, 'ACTIVE', $7, false, $7, $7, $7)`,
            userId,
            schoolId,
            plan.email,
            plan.phone,
            plan.name,
            teacherHashes[position],
            now,
          );
          await tx.$executeRawUnsafe(
            `INSERT INTO user_roles (id, school_id, user_id, role, created_at)
             VALUES (gen_random_uuid(), $1::uuid, $2::uuid, 'TEACHER', $3)`,
            schoolId,
            userId,
            now,
          );
          await tx.$executeRawUnsafe(
            `INSERT INTO staff (id, school_id, employee_no, user_id, name, email, phone, gender, role, casual_leaves,
                                sick_leaves, basic_salary, status, joined_on, designation, address, created_at, updated_at)
             VALUES ($1::uuid, $2::uuid, $3, $4::uuid, $5, $6, $7, $8::gender, 'TEACHER', 10, 10, $9::numeric,
                     'ACTIVE', $10::date, $11, $12, $13, $13)`,
            staffId,
            schoolId,
            String(employeeNo).padStart(4, '0'),
            userId,
            plan.name,
            plan.email,
            plan.phone,
            plan.gender,
            plan.salary,
            plan.joinedOn,
            `${plan.subject} Teacher`,
            `House ${String(between(1, 300))}, ${pick(AREAS)}, Karachi`,
            now,
          );
          for (const classId of plan.classIds) {
            await tx.$executeRawUnsafe(
              `INSERT INTO staff_class_assignments (id, school_id, staff_id, class_level_id, created_at)
               VALUES (gen_random_uuid(), $1::uuid, $2::uuid, $3::uuid, $4)
               ON CONFLICT (school_id, staff_id, class_level_id) DO NOTHING`,
              schoolId,
              staffId,
              classId,
              now,
            );
          }
        }
      },
      { timeout: 180_000, maxWait: 30_000 },
    );

    console.log('Done.');
  } finally {
    await db.$disconnect();
  }
}

void main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
