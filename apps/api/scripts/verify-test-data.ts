import { verify } from '@node-rs/argon2';

import { createAdminClient } from '../src/prisma';

const SCHOOL = '01a145f6-44bc-772b-bea5-0c9a379df92c';

async function main(): Promise<void> {
  const db = createAdminClient({ url: process.env['DATABASE_ADMIN_URL'] ?? '' });
  const show = async (label: string, sql: string) => {
    const rows = await db.$queryRawUnsafe(sql, SCHOOL);
    console.log(`\n== ${label}`);
    console.log(JSON.stringify(rows, (_k, v) => (typeof v === 'bigint' ? Number(v) : v)));
  };

  await show('totals (all, incl. pre-existing)', `select (select count(*) from students where school_id=$1::uuid) students,
    (select count(*) from students where school_id=$1::uuid and custom->>'seed'='whgs-test-data-v1') seeded_students,
    (select count(*) from guardians where school_id=$1::uuid) guardians,
    (select count(*) from staff where school_id=$1::uuid and role='TEACHER') teachers,
    (select count(*) from users where school_id=$1::uuid) users`);
  await show('students per class (seeded)', `select c.name, count(*) students from enrollments e join class_levels c on c.id=e.class_level_id join students s on s.id=e.student_id
    where e.school_id=$1::uuid and s.custom->>'seed'='whgs-test-data-v1' group by c.name, c.numeric_order order by c.numeric_order`);
  await show('classes with no students (all)', `select c.name from class_levels c where c.school_id=$1::uuid and not exists (select 1 from enrollments e where e.class_level_id=c.id and e.status='ENROLLED')`);
  await show('family sizes (seeded parents)', `select kids, count(*) families from (select g.id, count(sg.id) kids from guardians g join student_guardians sg on sg.guardian_id=g.id join students s on s.id=sg.student_id where g.school_id=$1::uuid and s.custom->>'seed'='whgs-test-data-v1' group by g.id) t group by kids order by kids`);
  await show('siblings in the same class (should be none)', `select g.id from guardians g join student_guardians sg on sg.guardian_id=g.id join enrollments e on e.student_id=sg.student_id where g.school_id=$1::uuid group by g.id, e.class_level_id having count(*)>1`);
  await show('integrity: students without guardian / enrollment / fees', `select
    (select count(*) from students s where s.school_id=$1::uuid and s.custom->>'seed'='whgs-test-data-v1' and not exists (select 1 from student_guardians x where x.student_id=s.id)) no_guardian,
    (select count(*) from students s where s.school_id=$1::uuid and s.custom->>'seed'='whgs-test-data-v1' and not exists (select 1 from enrollments x where x.student_id=s.id)) no_enrollment,
    (select count(*) from students s where s.school_id=$1::uuid and s.custom->>'seed'='whgs-test-data-v1' and not exists (select 1 from student_fees x where x.student_id=s.id)) no_fees`);
  await show('duplicates', `select (select count(*) from (select gr_no from students where school_id=$1::uuid group by gr_no having count(*)>1) a) dup_gr,
    (select count(*) from (select student_code from students where school_id=$1::uuid group by student_code having count(*)>1) b) dup_code,
    (select count(*) from (select lower(email) from users where school_id=$1::uuid group by lower(email) having count(*)>1) c) dup_user_email,
    (select count(*) from (select employee_no from staff where school_id=$1::uuid group by employee_no having count(*)>1) d) dup_employee_no`);
  await show('parent logins', `select count(*) parent_users, count(*) filter (where g.user_id is not null) linked from user_roles r join users u on u.id=r.user_id left join guardians g on g.user_id=u.id where r.school_id=$1::uuid and r.role='PARENT'`);
  await show('teachers and their classes', `select s.employee_no, s.name, s.email, count(a.id) classes, string_agg(c.name, ', ' order by c.numeric_order) class_names
    from staff s left join staff_class_assignments a on a.staff_id=s.id left join class_levels c on c.id=a.class_level_id
    where s.school_id=$1::uuid and s.role='TEACHER' group by s.id order by s.employee_no`);
  await show('classes with no teacher', `select c.name from class_levels c where c.school_id=$1::uuid and not exists (select 1 from staff_class_assignments a where a.class_level_id=c.id)`);
  await show('sample multi-child family', `select g.name guardian, g.email, string_agg(s.first_name||' '||s.last_name||' ('||c.name||')', ', ') children from guardians g join student_guardians sg on sg.guardian_id=g.id join students s on s.id=sg.student_id join enrollments e on e.student_id=s.id join class_levels c on c.id=e.class_level_id where g.school_id=$1::uuid and s.custom->>'seed'='whgs-test-data-v1' group by g.id having count(*)>=3 limit 3`);

  const sample = await db.$queryRawUnsafe<{ email: string; password_hash: string }[]>(
    `select u.email, u.password_hash from users u join user_roles r on r.user_id=u.id where u.school_id=$1::uuid and r.role in ('PARENT','TEACHER') and u.email like '%@yopmail.com' and u.password_hash is not null order by u.created_at desc limit 3`,
    SCHOOL,
  );
  for (const row of sample) {
    console.log('password check', row.email, await verify(row.password_hash, 'Abde@112233'), 'plaintext stored?', row.password_hash.includes('Abde'));
  }
  await db.$disconnect();
}
void main();
