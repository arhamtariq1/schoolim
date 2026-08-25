import {
  grantFor,
  type CreateStudent,
  type SchoolRole,
  type StudentListItem,
  type StudentListQuery,
} from '@ilm/contracts';
import { Injectable } from '@nestjs/common';

import { BusinessRuleError, NotFoundError } from '../../shared/errors/domain-error';
import { PrismaService } from '../../shared/prisma/prisma.service';
import { TenantContextService } from '../../shared/tenancy/tenant-context.service';

import { StudentsRepository, type StudentRow, type StudentScope } from './students.repository';

/**
 * Student business logic.
 *
 * docs/12 R6: services decide. The controller maps and the repository reads;
 * anything that constitutes a rule — who may see which rows, how an admission
 * number is allocated, what a status change means — lives here, because the
 * PDF, the API and the report all need the same answer.
 */
@Injectable()
export class StudentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly context: TenantContextService,
    private readonly students: StudentsRepository,
  ) {}

  /**
   * Turn a scoped permission into a data restriction.
   *
   * docs/04 §5: scope is **data**, compiled into the query, not a code branch.
   * A holder of the unscoped grant gets no restriction; a teacher gets their
   * sections; a parent gets their children.
   *
   * The empty-scope case matters: a teacher assigned no sections yet must see
   * **nothing**, not everything. Returning an empty restriction here would be
   * a cross-tenant-shaped bug inside a single tenant.
   */
  private scopeFor(roles: readonly SchoolRole[]): StudentScope {
    if (grantFor(roles, 'students.student.read') === 'all') {
      return {};
    }

    const userId = this.context.userId;

    if (roles.includes('TEACHER') || roles.includes('COORDINATOR')) {
      // Section assignments land with the staff module in Phase 1; until then a
      // scoped teacher sees nothing rather than everything.
      return { sectionIds: [] };
    }
    if (roles.includes('PARENT')) {
      return { guardianUserId: userId };
    }
    if (roles.includes('STUDENT')) {
      return { studentUserId: userId };
    }

    // A scoped grant with no rule to compile is a denial, not a free pass.
    return { sectionIds: [] };
  }

  async list(
    query: StudentListQuery,
  ): Promise<{ items: StudentListItem[]; total: number; aggregates: Record<string, number> }> {
    const roles = this.context.roles as readonly SchoolRole[];
    const scope = this.scopeFor(roles);

    return this.prisma.tenant(async (tx) => {
      const { rows, total } = await this.students.list(tx, query, scope);
      const counts = await this.students.countByStatus(tx);

      return {
        items: rows.map(toListItem),
        total,
        aggregates: {
          totalActive: counts['ACTIVE'] ?? 0,
          totalInactive: (counts['INACTIVE'] ?? 0) + (counts['LEFT'] ?? 0),
        },
      };
    });
  }

  /**
   * Admit a student.
   *
   * The admission number is allocated **inside the same transaction** as the
   * insert, from a per-school counter taken under a row lock. Deriving it from
   * `count(*) + 1` would hand two receptionists admitting at once the same
   * number, and a school that finds two children sharing an admission number
   * stops trusting the register entirely.
   */
  async create(input: CreateStudent): Promise<{ id: string; admissionNo: string }> {
    return this.prisma.tenant(async (tx) => {
      const admissionNo = await this.nextAdmissionNo(tx);

      const student = await tx.student.create({
        data: {
          admissionNo,
          firstName: input.firstName,
          lastName: input.lastName,
          ...(input.gender === undefined ? {} : { gender: input.gender }),
          ...(input.dateOfBirth === undefined ? {} : { dateOfBirth: new Date(input.dateOfBirth) }),
          ...(input.bFormNo === undefined ? {} : { bFormNo: input.bFormNo }),
          ...(input.religion === undefined ? {} : { religion: input.religion }),
          ...(input.bloodGroup === undefined ? {} : { bloodGroup: input.bloodGroup }),
          ...(input.nationality === undefined ? {} : { nationality: input.nationality }),
          ...(input.address === undefined ? {} : { address: input.address }),
          ...(input.city === undefined ? {} : { city: input.city }),
          ...(input.emergencyContact === undefined
            ? {}
            : { emergencyContact: input.emergencyContact }),
          ...(input.admittedOn === undefined ? {} : { admittedOn: new Date(input.admittedOn) }),
          ...(input.custom === undefined ? {} : { custom: input.custom }),
        } as never,
      });

      if (input.enrollment !== undefined) {
        await tx.enrollment.create({
          data: {
            studentId: student.id,
            sessionId: input.enrollment.sessionId,
            classLevelId: input.enrollment.classLevelId,
            ...(input.enrollment.sectionId === undefined
              ? {}
              : { sectionId: input.enrollment.sectionId }),
            ...(input.enrollment.rollNo === undefined ? {} : { rollNo: input.enrollment.rollNo }),
          } as never,
        });
      }

      if (input.guardian !== undefined) {
        const guardian = await tx.guardian.create({
          data: {
            name: input.guardian.name,
            relation: input.guardian.relation,
            ...(input.guardian.phone === undefined ? {} : { phone: input.guardian.phone }),
            ...(input.guardian.email === undefined ? {} : { email: input.guardian.email }),
            ...(input.guardian.cnic === undefined ? {} : { cnic: input.guardian.cnic }),
            ...(input.guardian.occupation === undefined
              ? {}
              : { occupation: input.guardian.occupation }),
          } as never,
        });

        await tx.studentGuardian.create({
          data: {
            studentId: student.id,
            guardianId: guardian.id,
            isPrimary: true,
            isFeePayer: true,
          } as never,
        });
      }

      return { id: student.id, admissionNo };
    });
  }

  async findOne(id: string): Promise<StudentListItem> {
    const roles = this.context.roles as readonly SchoolRole[];
    const scope = this.scopeFor(roles);

    return this.prisma.tenant(async (tx) => {
      // Re-uses the list query with the id pushed into the same WHERE clause,
      // so scope is applied identically. A separate "find by id" path is where
      // scope rules diverge and a teacher ends up able to open a student they
      // cannot list.
      const { rows } = await this.students.list(
        tx,
        { limit: 1, offset: 0, sort: 'name', order: 'asc' },
        { ...scope, studentId: id },
      );

      const found = rows[0];
      if (found === undefined) {
        // Not found and not-permitted are the same answer on purpose: a 403
        // would confirm the record exists (docs/11 §4).
        throw new NotFoundError('student');
      }
      return toListItem(found);
    });
  }

  /**
   * Allocate the next admission number for this school.
   *
   * `SELECT ... FOR UPDATE` on the counter row serialises concurrent
   * admissions. Two receptionists clicking Admit at the same instant get
   * consecutive numbers rather than the same one.
   */
  private async nextAdmissionNo(tx: {
    $queryRaw: <T>(q: TemplateStringsArray, ...v: unknown[]) => Promise<T>;
  }): Promise<string> {
    // `id` is supplied explicitly: Prisma's `@default(uuid(7))` is generated by
    // the client, not by the database, so a raw INSERT gets no default at all.
    // `updated_at` likewise — `@updatedAt` is a client-side concern.
    const rows = await tx.$queryRaw<{ next: number }[]>`
      INSERT INTO number_sequences (id, school_id, kind, next_value, updated_at)
      VALUES (gen_random_uuid(), current_school_id(), 'admission', 2, now())
      ON CONFLICT (school_id, kind)
      DO UPDATE SET next_value = number_sequences.next_value + 1, updated_at = now()
      RETURNING next_value - 1 AS next
    `;

    const value = rows[0]?.next;
    if (value === undefined) {
      throw new BusinessRuleError(
        'INTERNAL_ERROR',
        'Could not allocate an admission number. Nothing was saved.',
      );
    }

    const year = new Date(Date.now()).getUTCFullYear();
    return `${String(year)}-${String(value).padStart(4, '0')}`;
  }
}

function toListItem(row: StudentRow): StudentListItem {
  return {
    id: row.id,
    admissionNo: row.admission_no,
    firstName: row.first_name,
    lastName: row.last_name,
    status: row.status as StudentListItem['status'],
    gender: row.gender as StudentListItem['gender'],
    className: row.class_name,
    sectionName: row.section_name,
    rollNo: row.roll_no,
    guardianName: row.guardian_name,
    guardianPhone: row.guardian_phone,
  };
}
