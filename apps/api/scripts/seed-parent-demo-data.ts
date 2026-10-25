/**
 * Development-only demo data for the parent portal's "My children" screen.
 *
 *   npx tsx --env-file=.env scripts/seed-parent-demo-data.ts <school-slug> "<Student One>" "<Student Two>"
 *   npx tsx --env-file=.env scripts/seed-parent-demo-data.ts whgs "Anas Fahim" "Fariha Fahim"
 *
 * For each named student of that school it adds what the screen draws and a new
 * account would otherwise leave empty:
 *
 * - October 2026 attendance (school days up to the 17th: mostly present, a few
 *   absent, late and on leave);
 * - a published weekly class timetable for their class, with a break, Monday to
 *   Saturday, with each subject's teacher (and the subject's teacher on the class);
 * - a published exam schedule for the coming weeks (a Monthly test);
 * - four tests that have already been held, with this student's marks.
 *
 * Re-running is safe: attendance and marks use their natural unique keys, and a
 * timetable is skipped when its class already has one with the demo's title.
 * Nothing existing is updated or deleted. The rows are written straight to the
 * database, so there are no audit entries or notifications — it is throwaway
 * development data and must never be run against a real school.
 */
import { randomUUID } from 'node:crypto';

import { createAdminClient } from '../src/prisma';

const SLUG = process.argv[2];
const NAMES = process.argv.slice(3);
if (SLUG === undefined || NAMES.length === 0) {
  console.error('Usage: seed-parent-demo-data.ts <school-slug> "<Student Name>" ["<Student Name>" …]');
  process.exit(1);
}

const CLASS_TITLE = (className: string): string => `${className} weekly timetable`;
const EXAM_TITLE = 'Monthly test schedule';

/** Mon–Sat. The weekend's Sunday has no school. */
const SCHOOL_DAYS = [1, 2, 3, 4, 5, 6] as const;

/** The subjects a class studies, in the order the week rotates through them. */
const SUBJECTS: Record<string, readonly string[]> = {
  Playgroup: ['English', 'Urdu', 'Mathematics', 'Islamiyat'],
  'Class 9': ['English', 'Mathematics', 'Science', 'Urdu', 'Islamiyat', 'Computer', 'Social Studies'],
};
const FALLBACK_SUBJECTS = ['English', 'Urdu', 'Mathematics', 'Science', 'Islamiyat', 'Computer'];

/** Teachers are taken from the end of the roster, away from the ones other timetables use. */
const TEACHERS_PER_CLASS = 7;

/** Period starts. A break follows the second period. */
const PERIODS = [
  ['08:00', '08:40'],
  ['08:40', '09:20'],
  ['10:20', '11:00'],
  ['11:00', '11:40'],
  ['11:40', '12:20'],
  ['12:20', '13:00'],
] as const;
const BREAK = ['09:20', '10:20'] as const;

/** Tests already held: [type, subject index, date, total marks, share of marks gained]. */
const HELD = [
  ['Class test', 'Mathematics', '2026-09-10', 20, [0.85, 0.7]],
  ['Monthly test', 'English', '2026-09-25', 50, [0.78, 0.9]],
  ['Class test', 'Science', '2026-10-08', 25, [0.92, 0.64]],
  ['Surprise test', 'Urdu', '2026-10-12', 10, [0.8, 0.95]],
] as const;

/** The coming Monthly test: [subject, date, start, end]. */
const COMING = [
  ['Mathematics', '2026-10-20', '09:00', '09:40'],
  ['English', '2026-10-22', '09:00', '09:40'],
  ['Science', '2026-10-24', '09:00', '09:40'],
] as const;

/** October 2026 school days to the 17th, and what each student was marked. */
const ATTENDANCE_DAYS = [1, 2, 3, 5, 6, 7, 8, 9, 10, 12, 13, 14, 15, 16, 17];
const ABSENT = new Set([6, 14]);
const LEAVE = new Set([9]);
const LATE = new Set([13]);

async function main(): Promise<void> {
  const db = createAdminClient({ url: process.env['DATABASE_ADMIN_URL'] ?? '' });
  const rows = <T>(sql: string, ...params: unknown[]): Promise<T[]> => db.$queryRawUnsafe<T[]>(sql, ...params);
  const run = (sql: string, ...params: unknown[]): Promise<number> => db.$executeRawUnsafe(sql, ...params);

  try {
    const [school] = await rows<{ id: string; name: string }>(`SELECT id::text, name FROM schools WHERE slug = $1`, SLUG);
    if (school === undefined) throw new Error(`No school with slug "${String(SLUG)}".`);
    console.log(`School: ${school.name}`);

    const [session] = await rows<{ id: string }>(
      `SELECT id::text FROM academic_sessions WHERE school_id = $1::uuid AND is_current ORDER BY start_date DESC LIMIT 1`,
      school.id,
    );
    if (session === undefined) throw new Error('The school has no current session.');

    const subjectIds = new Map(
      (await rows<{ id: string; name: string }>(`SELECT id::text, name FROM subjects WHERE school_id = $1::uuid`, school.id)).map(
        (row) => [row.name, row.id] as const,
      ),
    );
    const typeIds = new Map(
      (await rows<{ id: string; name: string }>(`SELECT id::text, name FROM assessment_types WHERE school_id = $1::uuid`, school.id)).map(
        (row) => [row.name, row.id] as const,
      ),
    );
    // Teachers from the end of the roster, leaving the first ones to existing timetables.
    const teachers = (
      await rows<{ id: string; name: string }>(
        `SELECT id::text, name FROM staff WHERE school_id = $1::uuid AND role = 'TEACHER' AND status = 'ACTIVE' AND deleted_at IS NULL ORDER BY name DESC`,
        school.id,
      )
    ).filter((teacher) => teacher.name.split(' ').length > 1);

    let classIndex = 0;
    for (const fullName of NAMES) {
      const [first = '', ...rest] = fullName.split(' ');
      const [student] = await rows<{ id: string; classLevelId: string; sectionId: string | null; className: string }>(
        `SELECT s.id::text AS id, e.class_level_id::text AS "classLevelId", e.section_id::text AS "sectionId", c.name AS "className"
           FROM students s
           JOIN enrollments e ON e.student_id = s.id AND e.session_id = $2::uuid AND e.status = 'ENROLLED'
           JOIN class_levels c ON c.id = e.class_level_id
          WHERE s.school_id = $1::uuid AND s.first_name = $3 AND s.last_name = $4 AND s.deleted_at IS NULL
          LIMIT 1`,
        school.id,
        session.id,
        first,
        rest.join(' '),
      );
      if (student === undefined) {
        console.warn(`  ! ${fullName}: not found, or not enrolled this session — skipped.`);
        continue;
      }
      console.log(`\n${fullName} — ${student.className}`);

      // ---- the class's subjects, each with its teacher ---------------------
      const wanted = (SUBJECTS[student.className] ?? FALLBACK_SUBJECTS).filter((name) => subjectIds.has(name));
      const pool = teachers.slice(classIndex * TEACHERS_PER_CLASS, classIndex * TEACHERS_PER_CLASS + TEACHERS_PER_CLASS);
      const roster = pool.length > 0 ? pool : teachers;
      classIndex += 1;

      const teacherOf = new Map<string, string>();
      for (const [index, name] of wanted.entries()) {
        const subjectId = subjectIds.get(name) as string;
        const teacher = roster[index % roster.length];
        await run(
          `INSERT INTO class_subjects (id, school_id, class_level_id, subject_id, teacher_id, created_at)
           VALUES (gen_random_uuid(), $1::uuid, $2::uuid, $3::uuid, $4::uuid, now())
           ON CONFLICT (school_id, class_level_id, subject_id) DO NOTHING`,
          school.id,
          student.classLevelId,
          subjectId,
          teacher?.id ?? null,
        );
        const [link] = await rows<{ teacherId: string | null }>(
          `SELECT teacher_id::text AS "teacherId" FROM class_subjects WHERE school_id = $1::uuid AND class_level_id = $2::uuid AND subject_id = $3::uuid`,
          school.id,
          student.classLevelId,
          subjectId,
        );
        // A subject that already had a teacher keeps them; the timetable follows it.
        if (link?.teacherId !== null && link?.teacherId !== undefined) teacherOf.set(name, link.teacherId);
        else if (teacher !== undefined) {
          await run(
            `UPDATE class_subjects SET teacher_id = $4::uuid WHERE school_id = $1::uuid AND class_level_id = $2::uuid AND subject_id = $3::uuid`,
            school.id,
            student.classLevelId,
            subjectId,
            teacher.id,
          );
          teacherOf.set(name, teacher.id);
        }
      }

      // ---- attendance --------------------------------------------------------
      let marked = 0;
      for (const day of ATTENDANCE_DAYS) {
        const status = ABSENT.has(day) ? 'ABSENT' : LEAVE.has(day) ? 'LEAVE' : LATE.has(day) ? 'LATE' : 'PRESENT';
        marked += await run(
          `INSERT INTO attendance_records (id, school_id, student_id, session_id, class_level_id, section_id, date, period, status, marked_at, created_at, updated_at)
           VALUES (gen_random_uuid(), $1::uuid, $2::uuid, $3::uuid, $4::uuid, $5::uuid, $6::date, 0, $7::"attendance_status", now(), now(), now())
           ON CONFLICT (school_id, student_id, date, period) DO NOTHING`,
          school.id,
          student.id,
          session.id,
          student.classLevelId,
          student.sectionId,
          `2026-10-${String(day).padStart(2, '0')}`,
          status,
        );
      }
      console.log(`  attendance: ${String(marked)} new day(s)`);

      // ---- the weekly class timetable -----------------------------------------
      const classTitle = CLASS_TITLE(student.className);
      const [haveWeek] = await rows<{ n: bigint }>(
        `SELECT count(*) AS n FROM timetables WHERE school_id = $1::uuid AND session_id = $2::uuid AND class_level_id = $3::uuid AND kind = 'CLASS' AND title = $4`,
        school.id,
        session.id,
        student.classLevelId,
        classTitle,
      );
      if (Number(haveWeek?.n ?? 0) === 0 && wanted.length > 0) {
        const timetableId = randomUUID();
        await run(
          `INSERT INTO timetables (id, school_id, session_id, class_level_id, section_id, kind, title, status, published_at, created_at, updated_at)
           VALUES ($1::uuid, $2::uuid, $3::uuid, $4::uuid, NULL, 'CLASS', $5, 'PUBLISHED', now(), now(), now())`,
          timetableId,
          school.id,
          session.id,
          student.classLevelId,
          classTitle,
        );
        let periods = 0;
        for (const day of SCHOOL_DAYS) {
          // The same subjects each day, shifted, so the week is not one column repeated.
          for (const [slot, [start, end]] of PERIODS.entries()) {
            if (slot >= Math.max(4, Math.min(PERIODS.length, wanted.length))) break;
            const name = wanted[(slot + day) % wanted.length] as string;
            await run(
              `INSERT INTO timetable_entries (id, school_id, timetable_id, subject_id, teacher_id, room, day_of_week, start_time, end_time, is_break, created_at)
               VALUES (gen_random_uuid(), $1::uuid, $2::uuid, $3::uuid, $4::uuid, $5, $6, $7, $8, false, now())`,
              school.id,
              timetableId,
              subjectIds.get(name),
              teacherOf.get(name) ?? null,
              String(100 + classIndex),
              day,
              start,
              end,
            );
            periods += 1;
          }
          await run(
            `INSERT INTO timetable_entries (id, school_id, timetable_id, day_of_week, start_time, end_time, notes, is_break, created_at)
             VALUES (gen_random_uuid(), $1::uuid, $2::uuid, $3, $4, $5, 'Break', true, now())`,
            school.id,
            timetableId,
            day,
            BREAK[0],
            BREAK[1],
          );
        }
        console.log(`  timetable: "${classTitle}" with ${String(periods)} periods`);
      } else {
        console.log(`  timetable: already there`);
      }

      // ---- the coming exam schedule ---------------------------------------------
      const monthlyId = typeIds.get('Monthly test');
      const [haveExam] = await rows<{ n: bigint }>(
        `SELECT count(*) AS n FROM timetables WHERE school_id = $1::uuid AND session_id = $2::uuid AND class_level_id = $3::uuid AND kind = 'ASSESSMENT' AND title = $4`,
        school.id,
        session.id,
        student.classLevelId,
        EXAM_TITLE,
      );
      if (monthlyId !== undefined && Number(haveExam?.n ?? 0) === 0) {
        const examId = randomUUID();
        await run(
          `INSERT INTO timetables (id, school_id, session_id, class_level_id, section_id, kind, assessment_type_id, title, status, published_at, created_at, updated_at)
           VALUES ($1::uuid, $2::uuid, $3::uuid, $4::uuid, NULL, 'ASSESSMENT', $5::uuid, $6, 'PUBLISHED', now(), now(), now())`,
          examId,
          school.id,
          session.id,
          student.classLevelId,
          monthlyId,
          EXAM_TITLE,
        );
        for (const [name, date, start, end] of COMING) {
          const subjectId = subjectIds.get(name);
          if (subjectId === undefined || !wanted.includes(name)) continue;
          await run(
            `INSERT INTO timetable_entries (id, school_id, timetable_id, subject_id, teacher_id, room, on_date, start_time, end_time, is_break, created_at)
             VALUES (gen_random_uuid(), $1::uuid, $2::uuid, $3::uuid, $4::uuid, $5, $6::date, $7, $8, false, now())`,
            school.id,
            examId,
            subjectId,
            teacherOf.get(name) ?? null,
            String(100 + classIndex),
            date,
            start,
            end,
          );
        }
        console.log(`  exam schedule: "${EXAM_TITLE}"`);
      } else {
        console.log(`  exam schedule: already there`);
      }

      // ---- tests already held, with this student's marks ---------------------------
      const position = NAMES.indexOf(fullName);
      let held = 0;
      for (const [typeName, subjectName, date, total, shares] of HELD) {
        const typeId = typeIds.get(typeName);
        const subjectId = subjectIds.get(subjectName);
        if (typeId === undefined || subjectId === undefined || !wanted.includes(subjectName)) continue;

        await run(
          `INSERT INTO assessments (id, school_id, session_id, class_level_id, subject_id, assessment_type_id, held_on, total_marks, created_at, updated_at)
           VALUES (gen_random_uuid(), $1::uuid, $2::uuid, $3::uuid, $4::uuid, $5::uuid, $6::date, $7::numeric, now(), now())
           ON CONFLICT (school_id, session_id, class_level_id, subject_id, assessment_type_id, held_on) DO NOTHING`,
          school.id,
          session.id,
          student.classLevelId,
          subjectId,
          typeId,
          date,
          String(total),
        );
        const [assessment] = await rows<{ id: string }>(
          `SELECT id::text FROM assessments WHERE school_id = $1::uuid AND session_id = $2::uuid AND class_level_id = $3::uuid AND subject_id = $4::uuid AND assessment_type_id = $5::uuid AND held_on = $6::date`,
          school.id,
          session.id,
          student.classLevelId,
          subjectId,
          typeId,
          date,
        );
        if (assessment === undefined) continue;

        // Marks come in whole numbers, or halves, never above the total.
        const share = shares[position % shares.length] ?? 0.8;
        const obtained = Math.min(total, Math.round(total * share * 2) / 2);
        held += await run(
          `INSERT INTO mark_entries (id, school_id, assessment_id, student_id, obtained, created_at, updated_at)
           VALUES (gen_random_uuid(), $1::uuid, $2::uuid, $3::uuid, $4::numeric, now(), now())
           ON CONFLICT (school_id, assessment_id, student_id) DO NOTHING`,
          school.id,
          assessment.id,
          student.id,
          String(obtained),
        );
      }
      console.log(`  marks: ${String(held)} new result(s)`);
    }
    console.log('\nDone.');
  } finally {
    await db.$disconnect();
  }
}

void main();
