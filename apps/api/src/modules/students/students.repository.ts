import { type StudentListQuery } from '@ilm/contracts';
import { type TransactionClient } from '@ilm/db';
import { Injectable } from '@nestjs/common';

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
  admission_no: string;
  first_name: string;
  last_name: string;
  status: string;
  gender: string | null;
  class_name: string | null;
  section_name: string | null;
  roll_no: number | null;
  guardian_name: string | null;
  guardian_phone: string | null;
}

/** Extra restriction from a scoped permission, composed into the query. */
export interface StudentScope {
  /** Narrow to one student, while keeping every other restriction identical. */
  readonly studentId?: string | undefined;
  /** A teacher sees only their assigned sections. */
  readonly sectionIds?: readonly string[] | undefined;
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
      // Trigram-friendly: matches a half-remembered name or an admission
      // number, which is what reception actually types.
      const term = bind(`%${query.q}%`);
      where.push(
        // Reception types whichever number is on the paper in front of them.
        `((s.first_name || ' ' || s.last_name) ILIKE ${term}
           OR s.admission_no ILIKE ${term}
           OR s.gr_no ILIKE ${term})`,
      );
    }

    // --- Scoped permissions become a query clause, never a post-fetch filter.
    // Filtering after the fetch would page over rows the caller may not see,
    // so counts and pagination would silently lie (docs/04 §5).
    if (scope.sectionIds !== undefined) {
      where.push(
        scope.sectionIds.length === 0
          ? 'FALSE'
          : `e.section_id = ANY(${bind(scope.sectionIds)}::uuid[])`,
      );
    }
    if (scope.guardianUserId !== undefined) {
      where.push(
        `EXISTS (SELECT 1 FROM student_guardians sg2
                 JOIN guardians g2 ON g2.id = sg2.guardian_id
                 WHERE sg2.student_id = s.id AND g2.user_id = ${bind(scope.guardianUserId)}::uuid)`,
      );
    }
    if (scope.studentUserId !== undefined) {
      where.push(`s.user_id = ${bind(scope.studentUserId)}::uuid`);
    }
    if (scope.studentId !== undefined) {
      where.push(`s.id = ${bind(scope.studentId)}::uuid`);
    }

    const ORDER: Record<StudentListQuery['sort'], string> = {
      name: 's.last_name, s.first_name',
      grNo: 's.gr_no',
      admissionNo: 's.admission_no',
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
      `SELECT s.id, s.gr_no, s.admission_no, s.first_name, s.last_name, s.status::text AS status,
              s.gender::text AS gender,
              cl.name AS class_name, sec.name AS section_name, e.roll_no,
              g.name AS guardian_name, g.phone AS guardian_phone
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

  async countByStatus(tx: TransactionClient): Promise<Record<string, number>> {
    const rows = await tx.$queryRaw<{ status: string; n: bigint }[]>`
      SELECT status::text AS status, count(*) AS n
      FROM students
      WHERE deleted_at IS NULL
      GROUP BY status
    `;
    return Object.fromEntries(rows.map((row) => [row.status, Number(row.n)]));
  }
}
