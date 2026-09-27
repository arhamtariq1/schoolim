import {
  grantFor,
  type ChangeStudentStatus,
  type CreateStudent,
  type SchoolRole,
  type StudentListItem,
  type StudentListQuery,
  type StudentProfile,
  type UpdateStudent,
} from '@ilm/contracts';
import { DEFAULT_TIMEZONE, fromDecimalString, today } from '@ilm/utils';
import { Inject, Injectable } from '@nestjs/common';

import { Prisma, type TransactionClient } from '../../prisma';
import { PrismaService } from '../../prisma/prisma.service';
import { BusinessRuleError, NotFoundError } from '../../shared/errors/domain-error';
import { TenantContextService } from '../../shared/tenancy/tenant-context.service';
import { CLOCK, type Clock } from '../../shared/time/clock.provider';
import {
  assertHeadsExist,
  defaultFeeLines,
  readStructure,
  toRow as toFeeRow,
} from '../fees/student-fees.service';

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
   * Both numbers are allocated **inside the same transaction** as the insert,
   * from per-school counters taken under a row lock. Deriving either from
   * `count(*) + 1` would hand two receptionists admitting at once the same
   * number, and a school that finds two children sharing one stops trusting the
   * register entirely.
   */
  async create(input: CreateStudent): Promise<{ id: string; grNo: string; studentCode: string }> {
    return this.prisma.tenant(async (tx) => {
      // The year on the Student ID is the year the child was **admitted**, in
      // the school's own calendar.
      //
      // It was `clock.now().getUTCFullYear()`, which is wrong twice over. A
      // Karachi school admitting at 2am on 1 January is still on 31 December in
      // UTC, so the first children of every year were stamped with the last
      // one; and a school entering an older record backdated to 2019 got the
      // current year on it, which makes the prefix a lie about the only thing
      // it claims to say.
      const admissionDate = input.admittedOn ?? today(this.clock, await schoolTimeZone(tx));
      const admissionYear = admissionDate.slice(0, 4);

      // Both numbers come from locked counters inside this same transaction. If
      // anything below fails, neither is consumed, and the register is left
      // with no gap where a child never was.
      const grNo = await this.nextNumber(tx, 'gr', (value) => String(value).padStart(4, '0'));
      const studentCode = await this.nextNumber(
        tx,
        'student',
        (value) => `${admissionYear}-${String(value).padStart(4, '0')}`,
      );

      const student = await tx.student.create({
        data: {
          grNo,
          studentCode,
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
        await assertEnrollmentTarget(tx, input.enrollment, admissionDate);

        const rollNo = await nextRollNo(tx, input.enrollment);

        await tx.enrollment.create({
          data: {
            studentId: student.id,
            sessionId: input.enrollment.sessionId,
            classLevelId: input.enrollment.classLevelId,
            ...(input.enrollment.sectionId === undefined
              ? {}
              : { sectionId: input.enrollment.sectionId }),
            ...(rollNo === undefined ? {} : { rollNo }),
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
            address: input.guardian.address,
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

      // The fee structure, in the same transaction as the child.
      //
      // A student admitted with no fees — because a second request failed, or a
      // tab closed between them — is invisible to billing and looks completely
      // fine on every screen until the month a voucher does not arrive. So this
      // is not a follow-up call.
      //
      // Omitting `fees` means "charge the standard catalogue", which is what the
      // form sends when nobody edited anything. Sending `[]` explicitly means
      // "this child is charged nothing", which is a real thing a school does for
      // a staff child, and the two must not collapse into each other.
      const lines =
        input.fees ??
        (await defaultFeeLines(tx)).map((line) => ({
          feeHeadId: line.feeHeadId,
          amountMinor: line.amountMinor,
        }));

      await assertHeadsExist(tx, lines);

      if (lines.length > 0) {
        await tx.studentFee.createMany({
          // Dated from the admission, not from now. The two are the same day
          // for a walk-in and different by months for a school entering an old
          // register or admitting next term's intake early — and in the second
          // case the difference is months of fees for a child who has not
          // arrived.
          data: lines.map((line) =>
            toFeeRow(student.id, line, new Date(input.admittedOn ?? admissionDate)),
          ) as never,
        });
      }

      return { id: student.id, grNo, studentCode };
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
   * The student's own page: details, guardians and enrolment history.
   *
   * Scope is applied by going through `findOne` first, so a teacher restricted
   * to their sections cannot open a student they cannot list by pasting an id.
   * Everything after that is safe because the row has already been proven
   * visible to this caller.
   */
  async profile(id: string): Promise<StudentProfile> {
    const listRow = await this.findOne(id);

    return this.prisma.tenant(async (tx) => {
      const record = await tx.student.findUnique({
        where: { id },
        select: {
          dateOfBirth: true,
          photoUrl: true,
          religion: true,
          bloodGroup: true,
          nationality: true,
          address: true,
          city: true,
          emergencyContact: true,
          admittedOn: true,
          leftOn: true,
          leavingReason: true,
          custom: true,
        },
      });

      if (record === null) {
        throw new NotFoundError('student');
      }

      // Read inside the same transaction as the rest of the page, so the fees
      // shown and the details shown are the same instant.
      const { fees, totals } = await readStructure(tx, id);

      const enrollments = await tx.enrollment.findMany({
        where: { studentId: id },
        // Newest session first: the current year is what someone came to see.
        orderBy: { session: { startDate: 'desc' } },
        select: {
          id: true,
          rollNo: true,
          status: true,
          enrolledOn: true,
          endedOn: true,
          session: { select: { name: true } },
          classLevel: { select: { name: true } },
          section: { select: { name: true } },
        },
      });

      return {
        ...listRow,
        dateOfBirth: asCalendarDate(record.dateOfBirth),
        photoUrl: record.photoUrl,
        religion: record.religion,
        bloodGroup: record.bloodGroup,
        nationality: record.nationality,
        address: record.address,
        city: record.city,
        emergencyContact: record.emergencyContact,
        admittedOn: asCalendarDate(record.admittedOn),
        leftOn: asCalendarDate(record.leftOn),
        leavingReason: record.leavingReason,
        custom: (record.custom ?? {}) as Record<string, unknown>,
        // Filled by the controller from GuardiansService — kept out of this
        // service so guardians have one owner rather than two.
        guardians: [],
        enrollments: enrollments.map((entry) => ({
          id: entry.id,
          sessionName: entry.session.name,
          className: entry.classLevel.name,
          sectionName: entry.section?.name ?? null,
          rollNo: entry.rollNo,
          status: entry.status,
          enrolledOn: asCalendarDate(entry.enrolledOn),
          endedOn: asCalendarDate(entry.endedOn),
        })),
        fees,
        feeTotals: totals,
      };
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
    kind: 'student' | 'gr',
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

/**
 * The next roll number in a section's register.
 *
 * ## Why a roll belongs to a section, and why no section means no roll
 *
 * A roll number is a child's position in one register: "Grade 4 — A, 2026-2027,
 * number 7". It is not an identifier — it repeats in every section, and it is
 * reassigned every year on promotion. A child not yet placed in a section is
 * not on any register, so there is no position to give them, and inventing one
 * would be a number that means nothing until it silently changes.
 *
 * Which is exactly what the screen was doing before: nothing assigned a roll at
 * all, so every real admission showed a dash, and the attendance roster filled
 * the gap with the row's index — a number that looked recorded, was not, and
 * moved every time somebody joined the class.
 *
 * ## Why the section row is locked
 *
 * `MAX(roll_no) + 1` read by two receptionists admitting into the same section
 * at the same instant returns the same answer to both, and READ COMMITTED does
 * nothing to stop it — the second insert is not blocked by the first, because
 * it is a different row. Locking the section serialises admissions **into that
 * section** and nothing else: a second desk admitting into Grade 5 — B is not
 * held up at all.
 *
 * The unique index added in `20260925010000_enrollment_roll_unique` is the
 * backstop. This lock is what stops anybody meeting it.
 */
async function nextRollNo(
  tx: TransactionClient,
  enrollment: { sessionId: string; sectionId?: string },
): Promise<number | undefined> {
  if (enrollment.sectionId === undefined) {
    return undefined;
  }

  // RLS applies to this statement as it does to any other, so the lock can only
  // ever be taken on a section this school owns — and `assertEnrollmentTarget`
  // has already established that it is one.
  await tx.$queryRaw`SELECT id FROM sections WHERE id = ${enrollment.sectionId}::uuid FOR UPDATE`;

  const highest = await tx.enrollment.aggregate({
    where: { sessionId: enrollment.sessionId, sectionId: enrollment.sectionId },
    _max: { rollNo: true },
  });

  return (highest._max.rollNo ?? 0) + 1;
}

/**
 * The session, class and section an admission names are this school's.
 *
 * ## Why RLS is not enough on its own
 *
 * The row being written is an `enrollments` row, and RLS stamps and confines
 * *that* row to the caller's school perfectly well. What it says nothing about
 * is where the row **points**: `session_id` and `class_level_id` are foreign
 * keys, and PostgreSQL checks a foreign key with the referential-integrity
 * trigger, which does not apply row-level security. So a body naming another
 * school's session satisfied the constraint and the admission succeeded.
 *
 * Nothing leaked — the other school still cannot see the row, and this school
 * still cannot read the session it now points at. What it produced was worse in
 * an ordinary way: a child enrolled into a session their own school cannot see,
 * missing from every list filtered by session, on a register that no longer
 * adds up.
 *
 * These lookups run on the tenant client, so RLS is what makes them work — a
 * foreign row is simply not there, and the answer is the same 404 as for an id
 * that never existed. That is deliberate: a different error would confirm which
 * ids are real in some other school.
 *
 * ## What is deliberately not checked
 *
 * Whether the session is closed. A school digitising an old register admits
 * into a year that has ended, which is exactly what backdating is for. The
 * admission form does not offer closed sessions; the API allows one, because
 * "you may not enter your own history" is not a rule worth having.
 */
async function assertEnrollmentTarget(
  tx: TransactionClient,
  enrollment: { sessionId: string; classLevelId: string; sectionId?: string },
  admittedOn?: string,
): Promise<void> {
  const [session, classLevel] = await Promise.all([
    tx.academicSession.findFirst({
      where: { id: enrollment.sessionId },
      select: { id: true, name: true, endDate: true },
    }),
    tx.classLevel.findFirst({ where: { id: enrollment.classLevelId }, select: { id: true } }),
  ]);

  if (session === null) {
    throw new NotFoundError('academic session');
  }
  if (classLevel === null) {
    throw new NotFoundError('class');
  }

  // The admission date has to fall on or before the session ends.
  //
  // Only the upper bound, deliberately. Admitting *before* a session starts is
  // ordinary — a school fills next year's classes in March — so a lower bound
  // would refuse the most common advance admission there is. Admitting into a
  // year that has already finished is not a thing that happens.
  //
  // Without this the two fields simply did not have to agree, and they drifted
  // in exactly the way that is hardest to spot later: a child dated April 2027
  // sitting in the 2025-2026 register, indistinguishable on the student list
  // from one admitted last week, and showing up as an unexplained "skipped" on
  // every fee run for a year.
  if (admittedOn !== undefined) {
    const sessionEnd = session.endDate.toISOString().slice(0, 10);
    if (admittedOn > sessionEnd) {
      throw new BusinessRuleError(
        'BUSINESS_RULE_VIOLATION',
        `The ${session.name} session ends on ${sessionEnd}, so somebody joining on ${admittedOn} belongs to a later one. Pick the session they are actually joining.`,
      );
    }
  }

  if (enrollment.sectionId !== undefined) {
    // Matched against the session *and* the class, not merely owned by this
    // school. A section is "Grade 1 — A, 2026-2027"; accepting one that belongs
    // to a different class or a different year places the child in a register
    // their own class list will never show.
    const section = await tx.section.findFirst({
      where: {
        id: enrollment.sectionId,
        sessionId: enrollment.sessionId,
        classLevelId: enrollment.classLevelId,
      },
      select: { id: true },
    });

    if (section === null) {
      throw new NotFoundError('section');
    }
  }
}

/**
 * The school's own time zone, for deciding what "today" is.
 *
 * One row by primary key, inside the transaction that is already open, and only
 * on the path that needs it — an admission with no date on it, which the form
 * never sends. The fallback is the product's default rather than the server's:
 * a machine in Frankfurt must not decide what day it is in Lahore.
 */
async function schoolTimeZone(tx: TransactionClient): Promise<string> {
  const school = await tx.school.findFirst({ select: { timezone: true } });
  return school?.timezone ?? DEFAULT_TIMEZONE;
}

function toListItem(row: StudentRow): StudentListItem {
  return {
    id: row.id,
    grNo: row.gr_no,
    studentCode: row.student_code,
    firstName: row.first_name,
    lastName: row.last_name,
    status: row.status as StudentListItem['status'],
    gender: row.gender as StudentListItem['gender'],
    className: row.class_name,
    sectionName: row.section_name,
    rollNo: row.roll_no,
    guardianName: row.guardian_name,
    guardianPhone: row.guardian_phone,
    // Falls back to the primary guardian rather than showing a blank: the
    // column has always read "Father Name" on a Pakistani register, and a child
    // raised by an aunt still needs a name printed next to them.
    fatherName: row.father_name ?? row.guardian_name,
    admittedOn: asCalendarDate(row.admitted_on),
    tuitionFeeMinor: decimalToMinor(row.tuition_fee),
  };
}

/**
 * A `numeric` column from a raw query, as integer paisa.
 *
 * Prisma returns `numeric` as a `Decimal` from `$queryRaw`, while the `pg`
 * driver returns a string, and this row type is filled by the former. Both are
 * exact — the point is only that the shape differs — so this narrows rather
 * than assuming, and goes through `fromDecimalString` either way so the
 * conversion cannot lose a paisa to a float.
 */
function decimalToMinor(value: unknown): number | null {
  if (value === null || value === undefined) {
    return null;
  }
  if (typeof value === 'string') {
    return fromDecimalString(value);
  }
  if (typeof value === 'object' && 'toFixed' in value) {
    return fromDecimalString((value as { toFixed: (digits: number) => string }).toFixed(2));
  }
  if (typeof value === 'number') {
    // Should not happen for `numeric`, and is handled rather than silently
    // producing NaN if a driver ever starts doing it.
    return fromDecimalString(value.toFixed(2));
  }
  return null;
}

/**
 * A `@db.Date` column comes back as a Date at UTC midnight. Formatting it with
 * anything timezone-aware shifts a birthday by a day in half the world, so it
 * is sliced rather than converted.
 */
function asCalendarDate(value: Date | null): string | null {
  return value === null ? null : value.toISOString().slice(0, 10);
}
