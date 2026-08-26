import {
  grantFor,
  type ChangeStudentStatus,
  type CreateStudent,
  type SchoolRole,
  type StudentListItem,
  type StudentListQuery,
  type UpdateStudent,
} from '@ilm/contracts';
import { Prisma } from '@ilm/db';
import { Inject, Injectable } from '@nestjs/common';

import { BusinessRuleError, NotFoundError } from '../../shared/errors/domain-error';
import { PrismaService } from '../../shared/prisma/prisma.service';
import { TenantContextService } from '../../shared/tenancy/tenant-context.service';
import { CLOCK, type Clock } from '../../shared/time/clock.provider';

import { StudentsRepository, type StudentRow, type StudentScope } from './students.repository';

/** Statuses that end a child's current enrolment when they are set. */
const ENDS_ENROLMENT = new Set(['LEFT', 'STRUCK_OFF', 'GRADUATED']);

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
    @Inject(CLOCK) private readonly clock: Clock,
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
  async create(input: CreateStudent): Promise<{ id: string; grNo: string; admissionNo: string }> {
    return this.prisma.tenant(async (tx) => {
      // Both numbers come from locked counters inside this same transaction.
      // If anything below fails, neither is consumed, and the register is left
      // with no gap where a child never was.
      const grNo = await this.nextNumber(tx, 'gr', (value) => String(value).padStart(4, '0'));
      const admissionNo = await this.nextNumber(
        tx,
        'admission',
        (value) => `${String(this.clock.now().getUTCFullYear())}-${String(value).padStart(4, '0')}`,
      );

      const student = await tx.student.create({
        data: {
          grNo,
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

      return { id: student.id, grNo, admissionNo };
    });
  }

  /**
   * Edit a student's own details.
   *
   * **Status is not editable here**, and neither are the two register numbers.
   * A status change has consequences — striking a child off ends their
   * enrolment and their billing — so it is its own endpoint that demands a
   * reason and writes a meaningful audit entry. A generic `PATCH { status }`
   * can do none of those things (docs/11 §7).
   *
   * The row is fetched through `findOne` first rather than trusting the id in
   * the path. Without that, a teacher restricted to their own sections could
   * edit any student in the school by pasting an id into the URL.
   */
  async update(id: string, input: UpdateStudent): Promise<StudentListItem> {
    await this.findOne(id);

    await this.prisma.tenant(async (tx) => {
      await tx.student.update({
        where: { id },
        data: {
          ...(input.firstName === undefined ? {} : { firstName: input.firstName }),
          ...(input.lastName === undefined ? {} : { lastName: input.lastName }),
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
          ...(input.custom === undefined ? {} : { custom: input.custom as Prisma.InputJsonValue }),
        },
      });
    });

    return this.findOne(id);
  }

  /**
   * Change a student's status.
   *
   * Leaving, graduating and being struck off all end the current enrolment, in
   * the **same transaction** as the status write. Doing it in two steps leaves
   * a child who has left still sitting in a section, still on the class list
   * and still being billed — and nobody finds out until a fee voucher goes out
   * to a family whose child does not attend any more.
   */
  async changeStatus(id: string, input: ChangeStudentStatus): Promise<StudentListItem> {
    const current = await this.findOne(id);

    if (current.status === input.status) {
      throw new BusinessRuleError(
        'BUSINESS_RULE_VIOLATION',
        `This student is already ${input.status.toLowerCase().replace('_', ' ')}.`,
      );
    }

    // The contract leaves the reason optional because reinstating does not need
    // one. Leaving does: the register has to say why.
    if (ENDS_ENROLMENT.has(input.status) && input.reason === undefined) {
      throw new BusinessRuleError(
        'VALIDATION_FAILED',
        'Give a reason. The register has to record why a student left.',
      );
    }

    const effectiveOn =
      input.effectiveOn === undefined ? this.clock.now() : new Date(input.effectiveOn);

    await this.prisma.tenant(async (tx) => {
      await tx.student.update({
        where: { id },
        data: {
          status: input.status,
          ...(ENDS_ENROLMENT.has(input.status)
            ? { leftOn: effectiveOn, leavingReason: input.reason ?? null }
            : // Coming back clears the leaving record rather than leaving a
              // stale date on an active student.
              { leftOn: null, leavingReason: null }),
        },
      });

      if (ENDS_ENROLMENT.has(input.status)) {
        await tx.enrollment.updateMany({
          where: { studentId: id, status: 'ENROLLED' },
          data: {
            // The enrolment's own vocabulary, which is not the student's:
            // graduating *promotes* the enrolment out of its class, everything
            // else *leaves* it. There is no COMPLETED or WITHDRAWN here.
            status: input.status === 'GRADUATED' ? 'PROMOTED' : 'LEFT',
            // `endedOn` on the enrolment, `leftOn` on the student. Two records,
            // two dates: a child can end one enrolment and start another
            // without ever leaving the school.
            endedOn: effectiveOn,
          },
        });
      }
    });

    return this.findOne(id);
  }

  /**
   * Remove a student admitted in error.
   *
   * A **soft** delete, and that is not timidity. A school's register is a legal
   * record: a row that vanishes takes with it the answer to "was this child
   * ever enrolled here", which is the one question a register exists to answer.
   * The row leaves every screen and every query immediately, and the retention
   * job in docs/17 §4 erases it on schedule.
   *
   * A student who has simply left is a status change, not this.
   */
  async remove(id: string, reason: string): Promise<void> {
    await this.findOne(id);
    const now = this.clock.now();

    await this.prisma.tenant(async (tx) => {
      await tx.student.update({
        where: { id },
        data: { deletedAt: now, leavingReason: reason },
      });

      // Otherwise the section roll still counts them and the class list still
      // shows a child who is no longer in the register.
      await tx.enrollment.updateMany({
        where: { studentId: id, status: 'ENROLLED' },
        data: { status: 'LEFT', endedOn: now },
      });
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
   * Allocate the next number of a given kind for this school.
   *
   * `ON CONFLICT DO UPDATE` takes a row lock on the counter, so two
   * receptionists clicking Admit at the same instant get consecutive numbers
   * rather than the same one.
   *
   * One function for both kinds deliberately: "the GR counter is allocated
   * slightly differently from the admission counter" is exactly the drift that
   * surfaces a year later as two children sharing a register number.
   */
  private async nextNumber(
    tx: {
      $queryRawUnsafe: <T>(q: string, ...v: unknown[]) => Promise<T>;
    },
    kind: 'admission' | 'gr',
    format: (value: number) => string,
  ): Promise<string> {
    // `id` is supplied explicitly: Prisma's `@default(uuid(7))` is generated by
    // the client, not by the database, so a raw INSERT gets no default at all.
    // `updated_at` likewise — `@updatedAt` is a client-side concern.
    const rows = await tx.$queryRawUnsafe<{ next: number }[]>(
      `INSERT INTO number_sequences (id, school_id, kind, next_value, updated_at)
       VALUES (gen_random_uuid(), current_school_id(), $1, 2, now())
       ON CONFLICT (school_id, kind)
       DO UPDATE SET next_value = number_sequences.next_value + 1, updated_at = now()
       RETURNING next_value - 1 AS next`,
      kind,
    );

    const value = rows[0]?.next;
    if (value === undefined) {
      throw new BusinessRuleError(
        'INTERNAL_ERROR',
        `Could not allocate a ${kind} number. Nothing was saved.`,
      );
    }

    return format(value);
  }
}

function toListItem(row: StudentRow): StudentListItem {
  return {
    id: row.id,
    grNo: row.gr_no,
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
