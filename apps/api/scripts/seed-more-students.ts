/**
 * Development-only: fills the current session up to 600 students and adds the
 * next session, for the school `yamaan005@yopmail.com` belongs to.
 *
 *   npx tsx --env-file=.env scripts/seed-more-students.ts
 *
 * Runs after `seed-test-data.ts` and builds on what it left:
 *
 * - New families (one guardian with a PARENT login, one to three children in
 *   different classes) until the current session has 600 enrolled students,
 *   spread evenly so the emptiest classes fill first.
 * - The session after the current one (`2027-2028` after `2026-2027`), as
 *   PLANNED and not current, with nobody enrolled — promotion is the
 *   product's job, not a seed's.
 *
 * Re-running is safe: it counts what is enrolled and only tops up the
 * difference, and the session is created only when its name is free. Nothing
 * existing is updated or deleted.
 *
 * The shared test password is below on purpose — these are throwaway
 * development accounts and must never be created in a real school.
 */
import { randomUUID } from 'node:crypto';

import { formatGrNo } from '@ilm/contracts';

import { createAdminClient } from '../src/prisma';
import { PasswordService } from '../src/shared/auth/password.service';

const OWNER_EMAIL = 'yamaan005@yopmail.com';
const TEST_PASSWORD = 'Abde@112233';
const SEED_MARK = 'whgs-test-data-v2';
const STUDENT_TOTAL = 600;

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
const rand = mulberry32(20261025);
const pick = <T>(items: readonly T[]): T => items[Math.floor(rand() * items.length)] as T;
const between = (min: number, max: number): number => min + Math.floor(rand() * (max - min + 1));

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

const slug = (value: string): string => value.toLowerCase().replace(/[^a-z]/g, '');

function phone(): string {
  // Pakistani mobile: +92 3xx xxxxxxx, with a network prefix from 300 to 349.
  return `+923${String(between(0, 49)).padStart(2, '0')}${String(between(1_000_000, 9_999_999))}`;
}

const isoDate = (value: Date): string => value.toISOString().slice(0, 10);

/** `2026-2027` → `2027-2028`; one year on from both ends. */
function nextSessionName(name: string): string {
  const years = /^(\d{4})-(\d{4})$/.exec(name);
  if (years === null) {
    throw new Error(`Cannot work out the session after "${name}".`);
  }
  return `${String(Number(years[1]) + 1)}-${String(Number(years[2]) + 1)}`;
}

function addYear(value: Date): string {
  const next = new Date(value);
  next.setUTCFullYear(next.getUTCFullYear() + 1);
  return isoDate(next);
}

// ---- main ---------------------------------------------------------------------

interface ClassRow {
  id: string;
  name: string;
  numeric_order: number;
  enrolled: bigint;
}

interface PlannedChild {
  classId: string;
  gender: 'MALE' | 'FEMALE';
  firstName: string;
}

interface PlannedFamily {
  surname: string;
  guardianRelation: 'FATHER' | 'MOTHER';
  guardianName: string;
  email: string;
  phone: string;
  occupation: string;
  address: string;
  children: PlannedChild[];
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

    const sessions = await db.$queryRawUnsafe<
      { id: string; name: string; start_date: Date; end_date: Date }[]
    >(
      `SELECT id, name, start_date, end_date FROM academic_sessions
        WHERE school_id = $1::uuid AND is_current LIMIT 1`,
      schoolId,
    );
    const session = sessions[0];
    if (session === undefined) {
      throw new Error('The school needs a current session.');
    }
    const classes = await db.$queryRawUnsafe<ClassRow[]>(
      `SELECT c.id, c.name, c.numeric_order,
              (SELECT COUNT(*) FROM enrollments e
                WHERE e.class_level_id = c.id AND e.session_id = $2::uuid AND e.status = 'ENROLLED') AS enrolled
         FROM class_levels c
        WHERE c.school_id = $1::uuid AND c.is_active ORDER BY c.numeric_order`,
      schoolId,
      session.id,
    );
    if (classes.length === 0) {
      throw new Error('The school needs at least one class.');
    }

    const enrolledNow = classes.reduce((sum, entry) => sum + Number(entry.enrolled), 0);
    const toAdd = Math.max(0, STUDENT_TOTAL - enrolledNow);
    console.log(
      `Session ${session.name}: ${String(enrolledNow)} enrolled, adding ${String(toAdd)} to reach ${String(STUDENT_TOTAL)}.`,
    );

    // ---- plan the families ------------------------------------------------------
    // Each class's target is an even share of the total; the gap is what it still needs.
    const need = new Map<string, number>();
    classes.forEach((entry, index) => {
      const target =
        Math.floor(STUDENT_TOTAL / classes.length) +
        (index < STUDENT_TOTAL % classes.length ? 1 : 0);
      need.set(entry.id, Math.max(0, target - Number(entry.enrolled)));
    });

    const existingEmails = new Set(
      (
        await db.$queryRawUnsafe<{ email: string }[]>(
          `SELECT lower(email) AS email FROM users WHERE school_id = $1::uuid
           UNION SELECT lower(email) FROM guardians WHERE school_id = $1::uuid AND email IS NOT NULL`,
          schoolId,
        )
      ).map((row) => row.email),
    );

    const families: PlannedFamily[] = [];
    let planned = 0;
    while (planned < toAdd) {
      // Mostly only children, some pairs, a few of three — never more than is left.
      const roll = rand();
      const size = Math.min(roll < 0.6 ? 1 : roll < 0.9 ? 2 : 3, toAdd - planned);

      // Siblings go to different classes, the ones furthest from their share first.
      const order = [...classes]
        .sort((a, b) => (need.get(b.id) ?? 0) - (need.get(a.id) ?? 0) || rand() - 0.5)
        .slice(0, size)
        .sort((a, b) => a.numeric_order - b.numeric_order);

      const surname = pick(FAMILY);
      const mother = rand() < 0.15;
      const guardianFirst = mother ? pick(FEMALE) : pick(MALE);
      const seen = new Set<string>();
      const children = order.map((cls): PlannedChild => {
        need.set(cls.id, (need.get(cls.id) ?? 1) - 1);
        const gender: 'MALE' | 'FEMALE' = rand() < 0.52 ? 'MALE' : 'FEMALE';
        let firstName = gender === 'MALE' ? pick(MALE) : pick(FEMALE);
        while (seen.has(firstName)) {
          firstName = gender === 'MALE' ? pick(MALE) : pick(FEMALE);
        }
        seen.add(firstName);
        return { classId: cls.id, gender, firstName };
      });

      let email = `${slug(guardianFirst)}.${slug(surname)}.f${String(families.length + 1)}@yopmail.com`;
      while (existingEmails.has(email)) {
        email = `x${email}`;
      }
      existingEmails.add(email);

      families.push({
        surname,
        guardianRelation: mother ? 'MOTHER' : 'FATHER',
        guardianName: `${guardianFirst} ${surname}`,
        email,
        phone: phone(),
        occupation: mother ? 'Homemaker' : pick(OCCUPATIONS),
        address: `House ${String(between(1, 480))}, Street ${String(between(1, 40))}, ${pick(AREAS)}, Karachi`,
        children,
      });
      planned += children.length;
    }

    // One hash for every account: argon2 is deliberately slow, and these all share a password.
    const parentHash = families.length === 0 ? '' : await passwords.hash(TEST_PASSWORD);
    const nextName = nextSessionName(session.name);

    await db.$transaction(
      async (tx) => {
        const now = new Date();
        const admissionYear = session.start_date.getUTCFullYear();
        // Admitted between the session's start and today, as a real intake would be.
        const lastAdmissionDay = Math.max(
          1,
          Math.min(28, Math.floor((now.getTime() - session.start_date.getTime()) / 86_400_000) + 1),
        );
        const startMonth = String(session.start_date.getUTCMonth() + 1).padStart(2, '0');

        // ---- the next session -----------------------------------------------------
        const created = await tx.$executeRawUnsafe(
          `INSERT INTO academic_sessions (id, school_id, name, start_date, end_date, status, is_current, created_at, updated_at)
           SELECT gen_random_uuid(), $1::uuid, $2, $3::date, $4::date, 'PLANNED', false, $5, $5
            WHERE NOT EXISTS (SELECT 1 FROM academic_sessions WHERE school_id = $1::uuid AND name = $2)`,
          schoolId,
          nextName,
          addYear(session.start_date),
          addYear(session.end_date),
          now,
        );
        console.log(
          created === 0
            ? `Session ${nextName} already exists.`
            : `Created session ${nextName} (planned).`,
        );

        if (toAdd === 0) {
          return;
        }

        // Numbers come from the school's own sequences, the way admission does it,
        // in one block so nothing else is handed the same range.
        const grBlock = (
          await tx.$queryRawUnsafe<{ first: number; prefix: string; pad: number }[]>(
            `UPDATE number_sequences SET next_value = next_value + $2::int, updated_at = now()
              WHERE kind = 'gr' AND school_id = $1::uuid
          RETURNING next_value - $2::int AS first, prefix, pad`,
            schoolId,
            toAdd,
          )
        )[0];
        const codeBlock = (
          await tx.$queryRawUnsafe<{ first: number }[]>(
            `UPDATE number_sequences SET next_value = next_value + $2::int, updated_at = now()
              WHERE kind = 'student' AND school_id = $1::uuid
          RETURNING next_value - $2::int AS first`,
            schoolId,
            toAdd,
          )
        )[0];
        if (grBlock === undefined || codeBlock === undefined) {
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
        for (const family of families) {
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
            parentHash,
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
            const born = `${String(admissionYear - 3 - classIndex)}-${String(between(1, 12)).padStart(2, '0')}-${String(between(1, 28)).padStart(2, '0')}`;
            const admitted = `${String(admissionYear)}-${startMonth}-${String(between(1, lastAdmissionDay)).padStart(2, '0')}`;
            const grNo = formatGrNo(grBlock.prefix, grBlock.first + counter, grBlock.pad);
            const studentCode = `${String(admissionYear)}-${String(codeBlock.first + counter).padStart(4, '0')}`;
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
        console.log(`Created ${String(families.length)} families / ${String(counter)} students.`);
      },
      { timeout: 600_000, maxWait: 30_000 },
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
