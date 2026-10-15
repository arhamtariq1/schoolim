import {
  type AssessmentDetail,
  type AssessmentListItem,
  type AssessmentListQuery,
  type AssessmentTypeItem,
  type AssignToClass,
  type ClassMarksSummary,
  type ClassUsageItem,
  type CreateAssessment,
  type MarksRoster,
  type NamedItem,
  type StudentMarkResult,
  type SubjectItem,
  type UpdateAssessment,
} from '@ilm/contracts';
import { Inject, Injectable } from '@nestjs/common';

import { type TransactionClient } from '../../prisma';
import { PrismaService } from '../../prisma/prisma.service';
import { BusinessRuleError, ConflictError, NotFoundError } from '../../shared/errors/domain-error';
import { classInScope, ClassScopeService } from '../../shared/rbac/class-scope.service';
import { TenantContextService } from '../../shared/tenancy/tenant-context.service';
import { CLOCK, type Clock } from '../../shared/time/clock.provider';

/**
 * Subjects a school starts with when it has configured none.
 *
 * Generic to Pakistani schools in general, not to any one of them (R1): the
 * list is only a starting point, and a school adds to it or ignores it.
 */
const DEFAULT_SUBJECTS = [
  'English',
  'Urdu',
  'Mathematics',
  'Science',
  'Islamiyat',
  'Social Studies',
  'Computer',
] as const;

/** Generic starting points, not one school's list (R1). Renamed or deleted freely. */
const DEFAULT_ASSESSMENT_TYPES = ['Class test', 'Monthly test', 'Surprise test', 'Exam'] as const;

type MarksReadPermission = 'exams.result.read' | 'exams.mark.create';

/**
 * Marks — tests and exams.
 *
 * ## Who reaches what
 *
 * Every read and write resolves the caller's class scope first
 * (`ClassScopeService`, ADR-0014) and narrows **in the query**. A teacher's
 * grants are scoped, so an assessment of a class they do not take is "not
 * found" — the same answer as one that does not exist. Owner, principal and
 * office staff hold the unscoped read grant and see every class; parents never
 * come through here (their own endpoint begins at their linked children).
 *
 * ## No duplicates
 *
 * The unique index on (session, class, subject, type, day) is the guard. The
 * service turns its violation into a 409 that says where the existing one is,
 * rather than letting a double-click or two teachers write the same paper twice.
 */
@Injectable()
export class MarksService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly classScope: ClassScopeService,
    private readonly context: TenantContextService,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  // --- Subjects -------------------------------------------------------------

  async listSubjects(): Promise<SubjectItem[]> {
    return this.prisma.tenant(async (tx) => {
      if ((await tx.subject.count()) === 0) {
        await tx.subject.createMany({
          data: DEFAULT_SUBJECTS.map((name) => ({ name })) as never,
          skipDuplicates: true,
        });
      }
      const rows = await tx.subject.findMany({
        orderBy: { name: 'asc' },
        select: { id: true, name: true, _count: { select: { assessments: true } } },
      });
      return rows.map((row) => ({ id: row.id, name: row.name, usageCount: row._count.assessments }));
    });
  }

  async createSubject(input: NamedItem): Promise<SubjectItem> {
    return this.prisma
      .tenant((tx) => tx.subject.create({ data: { name: input.name } as never, select: { id: true } }))
      .then((row) => ({ id: row.id, name: input.name, usageCount: 0 }))
      .catch((error: unknown) => {
        if (isUniqueViolation(error)) {
          throw new ConflictError(`"${input.name}" is already a subject.`);
        }
        throw error;
      });
  }

  async renameSubject(id: string, input: NamedItem): Promise<SubjectItem> {
    return this.prisma
      .tenant(async (tx) => {
        const found = await tx.subject.findFirst({ where: { id }, select: { id: true } });
        if (found === null) {
          throw new NotFoundError('subject');
        }
        await tx.subject.update({ where: { id }, data: { name: input.name } });
        return tx.subject.count({ where: { id } });
      })
      .then(() => this.listSubjects())
      .then((all) => all.find((item) => item.id === id) as SubjectItem)
      .catch((error: unknown) => {
        if (isUniqueViolation(error)) {
          throw new ConflictError(`"${input.name}" is already a subject.`);
        }
        throw error;
      });
  }

  /** Refused while any assessment uses it: deleting would orphan real results. */
  async deleteSubject(id: string): Promise<void> {
    await this.prisma.tenant(async (tx) => {
      const found = await tx.subject.findFirst({
        where: { id },
        select: { name: true, _count: { select: { assessments: true } } },
      });
      if (found === null) {
        throw new NotFoundError('subject');
      }
      if (found._count.assessments > 0) {
        throw new ConflictError(
          `${found.name} is used by ${String(found._count.assessments)} test${found._count.assessments === 1 ? '' : 's'} and cannot be deleted. Rename it instead.`,
        );
      }
      await tx.subject.delete({ where: { id } });
    });
  }

  // --- Assessment types -----------------------------------------------------

  async listAssessmentTypes(): Promise<AssessmentTypeItem[]> {
    return this.prisma.tenant(async (tx) => {
      if ((await tx.assessmentType.count()) === 0) {
        await tx.assessmentType.createMany({
          data: DEFAULT_ASSESSMENT_TYPES.map((name) => ({ name })) as never,
          skipDuplicates: true,
        });
      }
      const rows = await tx.assessmentType.findMany({
        orderBy: { createdAt: 'asc' },
        select: { id: true, name: true, _count: { select: { assessments: true } } },
      });
      return rows.map((row) => ({ id: row.id, name: row.name, usageCount: row._count.assessments }));
    });
  }

  async createAssessmentType(input: NamedItem): Promise<AssessmentTypeItem> {
    return this.prisma
      .tenant((tx) =>
        tx.assessmentType.create({ data: { name: input.name } as never, select: { id: true } }),
      )
      .then((row) => ({ id: row.id, name: input.name, usageCount: 0 }))
      .catch((error: unknown) => {
        if (isUniqueViolation(error)) {
          throw new ConflictError(`"${input.name}" is already an assessment type.`);
        }
        throw error;
      });
  }

  async renameAssessmentType(id: string, input: NamedItem): Promise<AssessmentTypeItem> {
    return this.prisma
      .tenant(async (tx) => {
        const found = await tx.assessmentType.findFirst({ where: { id }, select: { id: true } });
        if (found === null) {
          throw new NotFoundError('assessment type');
        }
        await tx.assessmentType.update({ where: { id }, data: { name: input.name } });
      })
      .then(() => this.listAssessmentTypes())
      .then((all) => all.find((item) => item.id === id) as AssessmentTypeItem)
      .catch((error: unknown) => {
        if (isUniqueViolation(error)) {
          throw new ConflictError(`"${input.name}" is already an assessment type.`);
        }
        throw error;
      });
  }

  async deleteAssessmentType(id: string): Promise<void> {
    await this.prisma.tenant(async (tx) => {
      const found = await tx.assessmentType.findFirst({
        where: { id },
        select: { name: true, _count: { select: { assessments: true } } },
      });
      if (found === null) {
        throw new NotFoundError('assessment type');
      }
      if (found._count.assessments > 0) {
        throw new ConflictError(
          `${found.name} is used by ${String(found._count.assessments)} test${found._count.assessments === 1 ? '' : 's'} and cannot be deleted. Rename it instead.`,
        );
      }
      await tx.assessmentType.delete({ where: { id } });
    });
  }

  // --- Reading --------------------------------------------------------------

  /** The students an entry grid starts from: the class as enrolled right now. */
  async roster(classLevelId: string): Promise<MarksRoster> {
    return this.prisma.tenant(async (tx) => {
      await this.assertClassVisible(tx, classLevelId, 'exams.mark.create');
      const session = await currentSession(tx);

      const classLevel = await tx.classLevel.findUnique({
        where: { id: classLevelId },
        select: { name: true },
      });
      if (classLevel === null) {
        throw new NotFoundError('class');
      }

      return {
        classLevelId,
        className: classLevel.name,
        students: await enrolled(tx, classLevelId, session),
      };
    });
  }

  async list(query: AssessmentListQuery): Promise<AssessmentListItem[]> {
    return this.prisma.tenant(async (tx) => {
      const scope = await this.classScope.classLevelIds(tx, 'exams.result.read');

      // A requested class that is outside the scope narrows to nothing rather
      // than being ignored, so asking for somebody else's class is empty, not
      // "everything of mine".
      if (query.classLevelId !== undefined && !classInScope(scope, query.classLevelId)) {
        return [];
      }

      const rows = await tx.assessment.findMany({
        where: {
          ...(scope === undefined ? {} : { classLevelId: { in: [...scope] } }),
          ...(query.classLevelId === undefined ? {} : { classLevelId: query.classLevelId }),
          ...(query.subjectId === undefined ? {} : { subjectId: query.subjectId }),
          ...(query.assessmentTypeId === undefined
            ? {}
            : { assessmentTypeId: query.assessmentTypeId }),
          ...(query.from === undefined && query.to === undefined
            ? {}
            : {
                heldOn: {
                  ...(query.from === undefined ? {} : { gte: new Date(query.from) }),
                  ...(query.to === undefined ? {} : { lte: new Date(query.to) }),
                },
              }),
        },
        orderBy: [{ heldOn: 'desc' }, { createdAt: 'desc' }],
        take: 200,
        select: listSelection,
      });

      return rows.map(toListItem);
    });
  }

  async get(id: string): Promise<AssessmentDetail> {
    return this.prisma.tenant((tx) => this.detail(tx, id, 'exams.result.read'));
  }

  /**
   * Every subject and every assessment type, with how each has been used in one
   * class this session.
   *
   * Averaged per test first and then across tests, so a test with five sitters
   * counts as much as one with fifty: the question is "how is this class doing
   * in Maths across its tests", not "how many marks were handed out".
   */
  async classSummary(classLevelId: string, sessionId?: string): Promise<ClassMarksSummary> {
    // Seeds the defaults on first use, exactly as the entry form's lists do.
    const [subjects, types] = [await this.listSubjects(), await this.listAssessmentTypes()];

    return this.prisma.tenant(async (tx) => {
      await this.assertClassVisible(tx, classLevelId, 'exams.result.read');

      const [subjectLinks, typeLinks] = await Promise.all([
        tx.classSubject.findMany({ where: { classLevelId }, select: { subjectId: true } }),
        tx.classAssessmentType.findMany({ where: { classLevelId }, select: { assessmentTypeId: true } }),
      ]);
      const hasSubject = new Set(subjectLinks.map((link) => link.subjectId));
      const hasType = new Set(typeLinks.map((link) => link.assessmentTypeId));

      const session =
        sessionId ??
        (await tx.academicSession.findFirst({ where: { isCurrent: true }, select: { id: true } }))?.id;

      const tests =
        session === undefined
          ? []
          : await tx.assessment.findMany({
              where: { classLevelId, sessionId: session },
              select: {
                subjectId: true,
                assessmentTypeId: true,
                heldOn: true,
                totalMarks: true,
                entries: { select: { obtained: true } },
              },
            });

      const perTest = tests.map((test) => {
        const total = Number(test.totalMarks);
        const sat = test.entries.flatMap((entry) => (entry.obtained === null ? [] : [Number(entry.obtained)]));
        return {
          subjectId: test.subjectId,
          typeId: test.assessmentTypeId,
          heldOn: test.heldOn.toISOString().slice(0, 10),
          percent: sat.length === 0 ? null : (sat.reduce((sum, value) => sum + value, 0) / sat.length / total) * 100,
        };
      });

      const usage = (id: string, name: string, pick: (t: (typeof perTest)[number]) => string): ClassUsageItem => {
        const mine = perTest.filter((test) => pick(test) === id);
        const percents = mine.flatMap((test) => (test.percent === null ? [] : [test.percent]));
        return {
          id,
          name,
          testCount: mine.length,
          lastHeldOn: mine.map((test) => test.heldOn).sort().at(-1) ?? null,
          averagePercent:
            percents.length === 0 ? null : tenth(percents.reduce((sum, value) => sum + value, 0) / percents.length),
        };
      };

      const all = perTest.flatMap((test) => (test.percent === null ? [] : [test.percent]));
      return {
        subjects: subjects
          .filter((item) => hasSubject.has(item.id))
          .map((item) => usage(item.id, item.name, (test) => test.subjectId)),
        assessmentTypes: types
          .filter((item) => hasType.has(item.id))
          .map((item) => usage(item.id, item.name, (test) => test.typeId)),
        availableSubjects: subjects
          .filter((item) => !hasSubject.has(item.id))
          .map((item) => ({ id: item.id, name: item.name })),
        availableAssessmentTypes: types
          .filter((item) => !hasType.has(item.id))
          .map((item) => ({ id: item.id, name: item.name })),
        testCount: perTest.length,
        averagePercent: all.length === 0 ? null : tenth(all.reduce((sum, value) => sum + value, 0) / all.length),
      };
    });
  }

  // --- A class's own subjects and assessment types -------------------------

  /**
   * Give a class a subject: one the school already has, or a new name that joins
   * the school's list and the class together.
   *
   * A new name that matches an existing subject reuses it rather than failing —
   * typing "Maths" when "Maths" exists means "that one", and a duplicate error
   * would make the person go and find it in a dropdown instead.
   */
  async addSubjectToClass(classLevelId: string, input: AssignToClass): Promise<ClassMarksSummary> {
    await this.prisma
      .tenant(async (tx) => {
        await this.assertClassExists(tx, classLevelId);

        let subjectId = input.itemId;
        if (subjectId === undefined) {
          const name = input.name ?? '';
          const existing = await tx.subject.findFirst({
            where: { name: { equals: name, mode: 'insensitive' } },
            select: { id: true },
          });
          subjectId =
            existing?.id ??
            (await tx.subject.create({ data: { name } as never, select: { id: true } })).id;
        } else if ((await tx.subject.findUnique({ where: { id: subjectId }, select: { id: true } })) === null) {
          throw new NotFoundError('subject');
        }

        await tx.classSubject.create({ data: { classLevelId, subjectId } as never });
      })
      .catch((error: unknown) => {
        if (isUniqueViolation(error)) {
          throw new ConflictError('This class already has that subject.');
        }
        throw error;
      });
    return this.classSummary(classLevelId);
  }

  /** Refused while the class has tests in it: removing would hide real results. */
  async removeSubjectFromClass(classLevelId: string, subjectId: string): Promise<ClassMarksSummary> {
    await this.prisma.tenant(async (tx) => {
      const link = await tx.classSubject.findFirst({
        where: { classLevelId, subjectId },
        select: { id: true, subject: { select: { name: true } } },
      });
      if (link === null) {
        throw new NotFoundError('subject');
      }
      const tests = await tx.assessment.count({ where: { classLevelId, subjectId } });
      if (tests > 0) {
        throw new ConflictError(
          `${link.subject.name} has ${String(tests)} test${tests === 1 ? '' : 's'} in this class, so it cannot be removed.`,
        );
      }
      await tx.classSubject.deleteMany({ where: { classLevelId, subjectId } });
    });
    return this.classSummary(classLevelId);
  }

  async addAssessmentTypeToClass(classLevelId: string, input: AssignToClass): Promise<ClassMarksSummary> {
    await this.prisma
      .tenant(async (tx) => {
        await this.assertClassExists(tx, classLevelId);

        let assessmentTypeId = input.itemId;
        if (assessmentTypeId === undefined) {
          const name = input.name ?? '';
          const existing = await tx.assessmentType.findFirst({
            where: { name: { equals: name, mode: 'insensitive' } },
            select: { id: true },
          });
          assessmentTypeId =
            existing?.id ??
            (await tx.assessmentType.create({ data: { name } as never, select: { id: true } })).id;
        } else if (
          (await tx.assessmentType.findUnique({ where: { id: assessmentTypeId }, select: { id: true } })) === null
        ) {
          throw new NotFoundError('assessment type');
        }

        await tx.classAssessmentType.create({ data: { classLevelId, assessmentTypeId } as never });
      })
      .catch((error: unknown) => {
        if (isUniqueViolation(error)) {
          throw new ConflictError('This class already has that assessment type.');
        }
        throw error;
      });
    return this.classSummary(classLevelId);
  }

  async removeAssessmentTypeFromClass(classLevelId: string, assessmentTypeId: string): Promise<ClassMarksSummary> {
    await this.prisma.tenant(async (tx) => {
      const link = await tx.classAssessmentType.findFirst({
        where: { classLevelId, assessmentTypeId },
        select: { id: true, assessmentType: { select: { name: true } } },
      });
      if (link === null) {
        throw new NotFoundError('assessment type');
      }
      const tests = await tx.assessment.count({ where: { classLevelId, assessmentTypeId } });
      if (tests > 0) {
        throw new ConflictError(
          `${link.assessmentType.name} has ${String(tests)} test${tests === 1 ? '' : 's'} in this class, so it cannot be removed.`,
        );
      }
      await tx.classAssessmentType.deleteMany({ where: { classLevelId, assessmentTypeId } });
    });
    return this.classSummary(classLevelId);
  }

  private async assertClassExists(tx: TransactionClient, classLevelId: string): Promise<void> {
    const found = await tx.classLevel.findUnique({ where: { id: classLevelId }, select: { id: true } });
    if (found === null) {
      throw new NotFoundError('class');
    }
  }

  /** One child's results — for the office, a teacher of their class, never a stranger. */
  async forStudent(studentId: string): Promise<StudentMarkResult[]> {
    return this.prisma.tenant(async (tx) => {
      const scope = await this.classScope.classLevelIds(tx, 'exams.result.read');

      if (scope !== undefined) {
        const placement = await tx.enrollment.findFirst({
          where: { studentId, status: 'ENROLLED', classLevelId: { in: [...scope] } },
          select: { id: true },
        });
        if (placement === null) {
          throw new NotFoundError('student');
        }
      }

      const rows = await tx.markEntry.findMany({
        where: {
          studentId,
          ...(scope === undefined ? {} : { assessment: { classLevelId: { in: [...scope] } } }),
        },
        orderBy: { assessment: { heldOn: 'desc' } },
        select: {
          obtained: true,
          assessment: {
            select: {
              id: true,
              type: { select: { name: true } },
              heldOn: true,
              totalMarks: true,
              subject: { select: { name: true } },
            },
          },
        },
      });

      return rows.map((row) => toStudentResult(row));
    });
  }

  // --- Writing --------------------------------------------------------------

  async create(input: CreateAssessment): Promise<AssessmentDetail> {
    const id = await this.prisma
      .tenant(async (tx) => {
        await this.assertClassVisible(tx, input.classLevelId, 'exams.mark.create');
        const session = await currentSession(tx);

        const subject = await tx.subject.findUnique({
          where: { id: input.subjectId },
          select: { id: true },
        });
        if (subject === null) {
          throw new BusinessRuleError(
            'BUSINESS_RULE_VIOLATION',
            'That subject no longer exists. Reload and choose again.',
          );
        }

        const kind = await tx.assessmentType.findUnique({
          where: { id: input.assessmentTypeId },
          select: { id: true },
        });
        if (kind === null) {
          throw new BusinessRuleError(
            'BUSINESS_RULE_VIOLATION',
            'That assessment type no longer exists. Reload and choose again.',
          );
        }

        // The class's own lists, enforced here and not only in the dropdown: a
        // request naming a subject the class does not have is refused, however
        // it was made.
        const [hasSubject, hasType] = await Promise.all([
          tx.classSubject.findFirst({
            where: { classLevelId: input.classLevelId, subjectId: input.subjectId },
            select: { id: true },
          }),
          tx.classAssessmentType.findFirst({
            where: { classLevelId: input.classLevelId, assessmentTypeId: input.assessmentTypeId },
            select: { id: true },
          }),
        ]);
        if (hasSubject === null) {
          throw new BusinessRuleError(
            'BUSINESS_RULE_VIOLATION',
            'That subject is not set up for this class. Ask the school office to add it on the class page.',
          );
        }
        if (hasType === null) {
          throw new BusinessRuleError(
            'BUSINESS_RULE_VIOLATION',
            'That assessment type is not set up for this class. Ask the school office to add it on the class page.',
          );
        }

        await assertEnrolled(tx, input.classLevelId, session, input.entries);

        const created = await tx.assessment.create({
          data: {
            sessionId: session,
            classLevelId: input.classLevelId,
            subjectId: input.subjectId,
            assessmentTypeId: input.assessmentTypeId,
            heldOn: new Date(input.heldOn),
            totalMarks: input.totalMarks,
            createdBy: this.context.userId ?? null,
          } as never,
          select: { id: true },
        });

        await tx.markEntry.createMany({
          data: input.entries.map((entry) => ({
            assessmentId: created.id,
            studentId: entry.studentId,
            obtained: entry.obtained,
          })) as never,
        });

        await this.audit(tx, 'marks.assessment.create', created.id, {}, {
          classLevelId: input.classLevelId,
          subjectId: input.subjectId,
          assessmentTypeId: input.assessmentTypeId,
          heldOn: input.heldOn,
          totalMarks: input.totalMarks,
          entries: input.entries.length,
        });

        return created.id;
      })
      .catch((error: unknown) => {
        if (isUniqueViolation(error)) {
          throw new ConflictError(
            'That test has already been entered for this class, subject and day. Open it from the list to change the marks.',
          );
        }
        throw error;
      });

    return this.get(id);
  }

  async update(id: string, input: UpdateAssessment): Promise<AssessmentDetail> {
    await this.prisma.tenant(async (tx) => {
      const existing = await tx.assessment.findFirst({
        where: { id },
        select: { id: true, classLevelId: true, sessionId: true, totalMarks: true },
      });
      // Hidden and missing look the same; scope is judged against the grant of
      // the action, so a teacher who can read a class's marks but not write
      // them is refused here and not only in the UI.
      if (existing === null) {
        throw new NotFoundError('assessment');
      }
      await this.assertClassVisible(tx, existing.classLevelId, 'exams.mark.create');
      await assertEnrolled(tx, existing.classLevelId, existing.sessionId, input.entries);

      await tx.assessment.update({ where: { id }, data: { totalMarks: input.totalMarks } });
      await tx.markEntry.deleteMany({ where: { assessmentId: id } });
      await tx.markEntry.createMany({
        data: input.entries.map((entry) => ({
          assessmentId: id,
          studentId: entry.studentId,
          obtained: entry.obtained,
        })) as never,
      });

      await this.audit(tx, 'marks.assessment.update', id, { totalMarks: Number(existing.totalMarks) }, {
        totalMarks: input.totalMarks,
        entries: input.entries.length,
      });
    });

    return this.get(id);
  }

  // --- Shared ---------------------------------------------------------------

  private async detail(
    tx: TransactionClient,
    id: string,
    permission: MarksReadPermission,
  ): Promise<AssessmentDetail> {
    const row = await tx.assessment.findFirst({ where: { id }, select: listSelection });
    if (row === null) {
      throw new NotFoundError('assessment');
    }
    await this.assertClassVisible(tx, row.classLevelId, permission);

    const [entries, current] = await Promise.all([
      tx.markEntry.findMany({
        where: { assessmentId: id },
        select: {
          studentId: true,
          obtained: true,
          student: { select: { firstName: true, lastName: true, grNo: true } },
        },
      }),
      enrolled(tx, row.classLevelId, row.sessionId),
    ]);

    const byStudent = new Map(entries.map((entry) => [entry.studentId, entry]));
    const rollOf = new Map(current.map((student) => [student.studentId, student.rollNo]));

    // Everyone with a result, then anybody enrolled who has none yet — so a
    // child admitted after the test can still be given a mark when editing.
    const rows = [
      ...entries.map((entry) => ({
        studentId: entry.studentId,
        name: `${entry.student.firstName} ${entry.student.lastName}`.trim(),
        grNo: entry.student.grNo,
        rollNo: rollOf.get(entry.studentId) ?? null,
        obtained: entry.obtained === null ? null : Number(entry.obtained),
      })),
      ...current
        .filter((student) => !byStudent.has(student.studentId))
        .map((student) => ({ ...student, obtained: null })),
    ].sort((a, b) => (a.rollNo ?? Number.MAX_SAFE_INTEGER) - (b.rollNo ?? Number.MAX_SAFE_INTEGER));

    return { ...toListItem(row), entries: rows };
  }

  private async assertClassVisible(
    tx: TransactionClient,
    classLevelId: string,
    permission: MarksReadPermission,
  ): Promise<void> {
    const scope = await this.classScope.classLevelIds(tx, permission);
    if (!classInScope(scope, classLevelId)) {
      throw new NotFoundError('class');
    }
  }

  private async audit(
    tx: TransactionClient,
    action: string,
    entityId: string,
    before: Record<string, unknown>,
    after: Record<string, unknown>,
  ): Promise<void> {
    await tx.auditLog.create({
      data: {
        schoolId: this.context.schoolId,
        action,
        entityType: 'Assessment',
        entityId,
        actorType: 'USER',
        actorUserId: this.context.userId ?? null,
        before: before as never,
        after: after as never,
        at: this.clock.now(),
      },
    });
  }
}

const listSelection = {
  id: true,
  classLevelId: true,
  subjectId: true,
  sessionId: true,
  assessmentTypeId: true,
  heldOn: true,
  totalMarks: true,
  classLevel: { select: { name: true } },
  subject: { select: { name: true } },
  type: { select: { name: true } },
  entries: { select: { obtained: true } },
} as const;

function toListItem(row: {
  id: string;
  classLevelId: string;
  subjectId: string;
  assessmentTypeId: string;
  heldOn: Date;
  totalMarks: { toString: () => string };
  classLevel: { name: string };
  subject: { name: string };
  type: { name: string };
  entries: { obtained: { toString: () => string } | null }[];
}): AssessmentListItem {
  const total = Number(row.totalMarks);
  const sat = row.entries.flatMap((entry) => (entry.obtained === null ? [] : [Number(entry.obtained)]));
  const mean = sat.length === 0 ? null : sat.reduce((sum, value) => sum + value, 0) / sat.length;

  return {
    id: row.id,
    classLevelId: row.classLevelId,
    className: row.classLevel.name,
    subjectId: row.subjectId,
    subjectName: row.subject.name,
    typeId: row.assessmentTypeId,
    typeName: row.type.name,
    heldOn: row.heldOn.toISOString().slice(0, 10),
    totalMarks: total,
    entryCount: row.entries.length,
    averagePercent: mean === null ? null : percentOf(mean, total),
  };
}

function toStudentResult(row: {
  obtained: { toString: () => string } | null;
  assessment: {
    id: string;
    type: { name: string };
    heldOn: Date;
    totalMarks: { toString: () => string };
    subject: { name: string };
  };
}): StudentMarkResult {
  const total = Number(row.assessment.totalMarks);
  const obtained = row.obtained === null ? null : Number(row.obtained);
  return {
    assessmentId: row.assessment.id,
    subjectName: row.assessment.subject.name,
    typeName: row.assessment.type.name,
    heldOn: row.assessment.heldOn.toISOString().slice(0, 10),
    totalMarks: total,
    obtained,
    percent: obtained === null ? null : percentOf(obtained, total),
  };
}

/** One decimal place, without money rounding — these are percentages. */
function tenth(value: number): number {
  return Math.trunc(value * 10 + 0.5) / 10;
}

/** A percentage to one decimal. Marks are not money, so no money rounding applies. */
function percentOf(part: number, whole: number): number {
  return Math.trunc((part / whole) * 1000 + 0.5) / 10;
}

async function currentSession(tx: TransactionClient): Promise<string> {
  const session = await tx.academicSession.findFirst({
    where: { isCurrent: true },
    select: { id: true },
  });
  if (session === null) {
    throw new BusinessRuleError(
      'BUSINESS_RULE_VIOLATION',
      'No academic session is current. Set one under Academics before entering marks.',
    );
  }
  return session.id;
}

async function enrolled(tx: TransactionClient, classLevelId: string, sessionId: string) {
  const rows = await tx.enrollment.findMany({
    where: { classLevelId, sessionId, status: 'ENROLLED' },
    orderBy: [{ rollNo: 'asc' }, { student: { firstName: 'asc' } }],
    select: {
      rollNo: true,
      student: { select: { id: true, firstName: true, lastName: true, grNo: true } },
    },
  });
  return rows.map((row) => ({
    studentId: row.student.id,
    name: `${row.student.firstName} ${row.student.lastName}`.trim(),
    grNo: row.student.grNo,
    rollNo: row.rollNo,
  }));
}

/**
 * Every student named must be in the class — **refused**, not skipped.
 *
 * Attendance quietly skips a stale tab's strangers because a missed tap is
 * recoverable. A mark written against the wrong child is a wrong result on
 * somebody's report card, so here it stops the whole save.
 */
async function assertEnrolled(
  tx: TransactionClient,
  classLevelId: string,
  sessionId: string,
  entries: readonly { studentId: string }[],
): Promise<void> {
  const ids = entries.map((entry) => entry.studentId);
  const found = await tx.enrollment.count({
    where: { classLevelId, sessionId, studentId: { in: ids } },
  });
  if (found !== new Set(ids).size) {
    throw new BusinessRuleError(
      'BUSINESS_RULE_VIOLATION',
      'Some of these students are not in this class. Reload the class list and try again.',
    );
  }
}

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: string }).code === 'P2002'
  );
}
