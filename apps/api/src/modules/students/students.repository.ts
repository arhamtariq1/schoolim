import { type StudentListQuery } from '@ilm/contracts';
import { Injectable } from '@nestjs/common';

import { type TransactionClient } from '../../prisma';

/**
 * Data access for students.
 *
 * The bottom layer (docs/03 §3): it reads and writes, and knows nothing about
 * permissions or business rules. Note what is absent from every signature here
 * — `schoolId`. Tenant scope arrives on the transaction client, injected by the
 * Prisma extension and enforced again by RLS (docs/12 R2).
 */

/** Rows the list query returns, shaped for the grid rather than the model. */
export interface StudentRow {
  id: string;
  gr_no: string;
  student_code: string;
  first_name: string;
  last_name: string;
  status: string;
  gender: string | null;
  class_name: string | null;
  section_name: string | null;
  roll_no: number | null;
  guardian_name: string | null;
  guardian_phone: string | null;
  father_name: string | null;
  admitted_on: Date | null;
  photo_url: string | null;
  /**
   * `numeric(14,2)` rupees, converted to paisa in `toListItem`.
   *
   * Typed as `unknown` on purpose: a raw query hands `numeric` back as a Prisma
   * `Decimal`, not the string the `pg` driver returns, and writing `string`
   * here produced a `value.trim is not a function` 500 on the student list that
   * no unit test saw. `decimalToMinor` narrows it rather than trusting either.
   */
  tuition_fee: unknown;
}

/** Extra restriction from a scoped permission, composed into the query. */
export interface StudentScope {
  /** Narrow to one student, while keeping every other restriction identical. */
  readonly studentId?: string | undefined;
  /**
   * A teacher sees only the classes assigned to them (ADR-0014).
   *
   * An empty array means **nothing**, and `undefined` means no restriction —
   * the two are opposites and the clause below keeps them apart.
   */
  readonly classLevelIds?: readonly string[] | undefined;
  /** A parent sees only their own children. */
  readonly guardianUserId?: string | undefined;
  /** A student sees only themselves. */
  readonly studentUserId?: string | undefined;
}

@Injectable()
export class StudentsRepository {
  /**
   * List students with their current enrolment and primary guardian.
   *
   * Written as one raw query rather than a Prisma `include` on purpose: the
   * grid needs a flat row, and the alternative is three round trips plus an
   * N+1 over guardians for every page of 50.
   *
   * Because it is raw SQL, the Prisma extension does not scope it — which is
   * exactly the case layer 3 exists for. RLS still filters every row to the
   * tenant, and the isolation suite proves it with the extension disabled.
   *
   * Every value is bound, never interpolated. `sort` is an allow-list mapped to
   * a fixed expression below, so a client cannot reach the ORDER BY clause.
   */
  async list(
    tx: TransactionClient,
    query: StudentListQuery,
    scope: StudentScope,
  ): Promise<{ rows: StudentRow[]; total: number }> {
    const where: string[] = ['s.deleted_at IS NULL'];
    const params: unknown[] = [];

    const bind = (value: unknown): string => {
      params.push(value);
      return `$${String(params.length)}`;
    };

    if (query.status !== undefined) {
      where.push(`s.status = ${bind(query.status)}::student_status`);
    }
    if (query.gender !== undefined) {
      where.push(`s.gender = ${bind(query.gender)}::gender`);
    }
    if (query.sessionId !== undefined) {
      where.push(`e.session_id = ${bind(query.sessionId)}::uuid`);
    }
    if (query.sectionId !== undefined) {
      where.push(`e.section_id = ${bind(query.sectionId)}::uuid`);
    }
    if (query.classLevelId !== undefined) {
      where.push(`e.class_level_id = ${bind(query.classLevelId)}::uuid`);
    }

    if (query.q !== undefined) {
      // Trigram-friendly: matches a half-remembered name or either number,
      // which is what reception actually types.
      const term = bind(`%${query.q}%`);
      where.push(
        // Reception types whichever number is on the paper in front of them.
        `((s.first_name || ' ' || s.last_name) ILIKE ${term}
           OR s.student_code ILIKE ${term}
           OR s.gr_no ILIKE ${term}
           OR g.name ILIKE ${term}
           OR g.phone ILIKE ${term}
           OR EXISTS (
                SELECT 1
                  FROM student_guardians sgf
                  JOIN guardians gf ON gf.id = sgf.guardian_id
                 WHERE sgf.student_id = s.id
                   AND (gf.name ILIKE ${term} OR gf.phone ILIKE ${term})
              ))`,
      );
    }

    // --- Scoped permissions become a query clause, never a post-fetch filter.
    // Filtering after the fetch would page over rows the caller may not see,
    // so counts and pagination would silently lie (docs/04 §5).
    if (scope.classLevelIds !== undefined) {
      // On `e`, the enrolment the row is displayed with, so a teacher cannot
      // be shown a child under a class that is not theirs.
      where.push(
        scope.classLevelIds.length === 0
          ? 'FALSE'
          : `e.class_level_id = ANY(${bind(scope.classLevelIds)}::uuid[])`,
      );
    }
    where.push(...identityScopeClauses(scope, bind));

    // `length` first, on both numbers.
    //
    // Both are text, and both are zero-padded to four digits — which sorts
    // correctly right up to the ten-thousandth child and then silently stops:
    // as text, `'10000' < '9999'`, so a forty-year-old school's newest
    // admissions would file themselves at the top of the register. Ordering by
    // length and then by value is the natural numeric order for any padded
    // number, and stays sane if a school ever imports legacy numbers that are
    // not purely digits. It sorts rather than walking the index, which is worth
    // it here: neither is the default sort, both run against one school's
    // students, and a register in the wrong order is wrong at any speed.
    const ORDER: Record<StudentListQuery['sort'], string> = {
      name: 's.last_name, s.first_name',
      grNo: 'length(s.gr_no), s.gr_no',
      studentCode: 'length(s.student_code), s.student_code',
      className: 'cl.numeric_order, sec.name',
      createdAt: 's.created_at',
    };
    const direction = query.order === 'desc' ? 'DESC' : 'ASC';

    const from = `
      FROM students s
      LEFT JOIN enrollments e
        ON e.student_id = s.id
       -- Only a LIVE enrolment. Without this, a child who left last week still
       -- shows "Grade 1" on the list and — far worse — still comes back when
       -- the query is filtered by that section, so the class list, the roll and
       -- anything built on them silently include a student who is gone.
       AND e.status = 'ENROLLED'
       AND e.session_id = COALESCE(
             ${query.sessionId === undefined ? '(SELECT id FROM academic_sessions WHERE is_current LIMIT 1)' : bind(query.sessionId) + '::uuid'},
             e.session_id)
      LEFT JOIN class_levels cl ON cl.id = e.class_level_id
      LEFT JOIN sections sec ON sec.id = e.section_id
      LEFT JOIN student_guardians sg ON sg.student_id = s.id AND sg.is_primary
      LEFT JOIN guardians g ON g.id = sg.guardian_id
      WHERE ${where.join(' AND ')}
    `;

    const rows = await tx.$queryRawUnsafe<StudentRow[]>(
      `SELECT s.id, s.gr_no, s.student_code, s.first_name, s.last_name, s.status::text AS status,
              s.gender::text AS gender,
              cl.name AS class_name, sec.name AS section_name, e.roll_no,
              g.name AS guardian_name, g.phone AS guardian_phone,
              s.admitted_on, s.photo_url,
              -- Scalar subqueries, deliberately, not joins.
              --
              -- A child has several fee lines and often more than one guardian,
              -- so joining either would fan the result out: one student would
              -- come back as five rows, LIMIT would cut the page mid-student,
              -- and the list would show duplicates. The count below uses
              -- count(DISTINCT s.id), so it would still report the right total
              -- while the rows were wrong — which is what makes that bug so
              -- unpleasant to find.
              (SELECT gf.name
                 FROM student_guardians sgf
                 JOIN guardians gf ON gf.id = sgf.guardian_id
                WHERE sgf.student_id = s.id AND gf.relation = 'FATHER'
                LIMIT 1) AS father_name,
              -- student_fees is a timeline (one row per change), so "the"
              -- tuition is the row in force today in the school's own zone,
              -- or, for a child whose fees have not started yet, the first
              -- one to come. An unordered LIMIT 1 picked either at random.
              (SELECT COALESCE(sf.discounted_amount, sf.amount)
                 FROM student_fees sf
                 JOIN fee_heads fh ON fh.id = sf.fee_head_id
                 CROSS JOIN (
                   SELECT (now() AT TIME ZONE COALESCE(
                             (SELECT timezone FROM schools LIMIT 1), 'Asia/Karachi'))::date AS d
                 ) today
                WHERE sf.student_id = s.id AND fh.type = 'TUITION'
                ORDER BY (sf.effective_from <= today.d) DESC,
                         CASE WHEN sf.effective_from <= today.d THEN sf.effective_from END DESC,
                         sf.effective_from ASC,
                         fh.sort_order ASC
                LIMIT 1) AS tuition_fee
       ${from}
       ORDER BY ${ORDER[query.sort]} ${direction}
       LIMIT ${bind(query.limit)} OFFSET ${bind(query.offset)}`,
      ...params,
    );

    // The count re-runs the same predicate, so the total always matches the
    // rows. Counting a different query is how "1 of 482" ends up wrong.
    const countParams = params.slice(0, params.length - 2);
    const counted = await tx.$queryRawUnsafe<{ total: bigint }[]>(
      `SELECT count(DISTINCT s.id) AS total ${from}`,
      ...countParams,
    );

    return { rows, total: Number(counted[0]?.total ?? 0) };
  }

  /**
   * Head-counts by status, for the people the caller is allowed to see.
   *
   * Scoped like the list, because these numbers sit at the top of the same
   * screen: a teacher shown "482 active" above a list of 31 has been told how
   * big the school is, and that is a disclosure with no row in it.
   */
  async countByStatus(
    tx: TransactionClient,
    scope: StudentScope = {},
  ): Promise<Record<string, number>> {
    const where: string[] = ['s.deleted_at IS NULL'];
    const params: unknown[] = [];
    const bind = (value: unknown): string => {
      params.push(value);
      return `$${String(params.length)}`;
    };

    if (scope.classLevelIds !== undefined) {
      // The current session's live enrolment, which is what the list shows.
      where.push(
        scope.classLevelIds.length === 0
          ? 'FALSE'
          : `EXISTS (SELECT 1
                      FROM enrollments ce
                      JOIN academic_sessions cs ON cs.id = ce.session_id AND cs.is_current
                     WHERE ce.student_id = s.id
                       AND ce.status = 'ENROLLED'
                       AND ce.class_level_id = ANY(${bind(scope.classLevelIds)}::uuid[]))`,
      );
    }
    where.push(...identityScopeClauses(scope, bind));

    const rows = await tx.$queryRawUnsafe<{ status: string; n: bigint }[]>(
      `SELECT s.status::text AS status, count(*) AS n
         FROM students s
        WHERE ${where.join(' AND ')}
        GROUP BY s.status`,
      ...params,
    );
    return Object.fromEntries(rows.map((row) => [row.status, Number(row.n)]));
  }
}

/**
 * The restrictions that depend on the student's own row rather than on a
 * class — shared by the list and the counts so the two cannot disagree about
 * who a parent or a student may see.
 */
function identityScopeClauses(scope: StudentScope, bind: (value: unknown) => string): string[] {
  const clauses: string[] = [];

  if (scope.guardianUserId !== undefined) {
    clauses.push(
      `EXISTS (SELECT 1 FROM student_guardians sg2
               JOIN guardians g2 ON g2.id = sg2.guardian_id
               WHERE sg2.student_id = s.id AND g2.user_id = ${bind(scope.guardianUserId)}::uuid)`,
    );
  }
  if (scope.studentUserId !== undefined) {
    clauses.push(`s.user_id = ${bind(scope.studentUserId)}::uuid`);
  }
  if (scope.studentId !== undefined) {
    clauses.push(`s.id = ${bind(scope.studentId)}::uuid`);
  }

  return clauses;
}
