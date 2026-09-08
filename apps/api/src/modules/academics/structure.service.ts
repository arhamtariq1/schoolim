import {
  type AcademicSession,
  type ClassLevel,
  type CreateClassLevel,
  type CreateSection,
  type CreateSession,
  type Section,
  type UpdateClassLevel,
  type UpdateSection,
  type UpdateSession,
} from '@ilm/contracts';
import { Injectable } from '@nestjs/common';

import { BusinessRuleError, ConflictError, NotFoundError } from '../../shared/errors/domain-error';
import { PrismaService } from '../../shared/prisma/prisma.service';

/**
 * Sessions, classes and sections — the structure everything else hangs off.
 *
 * ## The rule that shapes every delete in this file
 *
 * Nothing that has students attached can be removed. A class deleted out from
 * under an enrolment leaves a child enrolled in nothing, visible on no class
 * list, and countable in no report — and the school does not find out until a
 * parent asks why their son is missing from the roll. So each delete counts
 * first and refuses with a sentence naming the number, rather than letting a
 * foreign key raise a 500.
 *
 * Classes are **deactivated** rather than deleted once used, which is the same
 * shape as fee heads: the history stays readable and the class stops appearing
 * on new admissions.
 */
@Injectable()
export class StructureService {
  constructor(private readonly prisma: PrismaService) {}

  // --- Sessions -------------------------------------------------------------

  async listSessions(): Promise<AcademicSession[]> {
    return this.prisma.tenant(async (tx) => {
      const rows = await tx.academicSession.findMany({
        orderBy: { startDate: 'desc' },
        select: {
          id: true,
          name: true,
          startDate: true,
          endDate: true,
          status: true,
          isCurrent: true,
          _count: { select: { enrollments: true, sections: true } },
        },
      });

      return rows.map((row) => ({
        id: row.id,
        name: row.name,
        startDate: asDate(row.startDate),
        endDate: asDate(row.endDate),
        status: row.status,
        isCurrent: row.isCurrent,
        enrollmentCount: row._count.enrollments,
        sectionCount: row._count.sections,
      }));
    });
  }

  async createSession(input: CreateSession): Promise<AcademicSession> {
    return this.prisma
      .tenant(async (tx) => {
        // The first session a school creates becomes current, because a school
        // with sessions but no current one has an admission form that cannot
        // enrol anybody, and nothing on screen explains why.
        const isFirst = (await tx.academicSession.count()) === 0;

        const created = await tx.academicSession.create({
          data: {
            name: input.name,
            startDate: new Date(input.startDate),
            endDate: new Date(input.endDate),
            status: input.status,
            isCurrent: isFirst,
          } as never,
          select: {
            id: true,
            name: true,
            startDate: true,
            endDate: true,
            status: true,
            isCurrent: true,
          },
        });

        return {
          ...created,
          startDate: asDate(created.startDate),
          endDate: asDate(created.endDate),
          enrollmentCount: 0,
          sectionCount: 0,
        };
      })
      .catch((error: unknown) => {
        if (isUniqueViolation(error)) {
          throw new ConflictError(`A session called "${input.name}" already exists.`);
        }
        throw error;
      });
  }

  async updateSession(id: string, input: UpdateSession): Promise<AcademicSession> {
    return this.prisma
      .tenant(async (tx) => {
        const existing = await tx.academicSession.findUnique({
          where: { id },
          select: { startDate: true, endDate: true },
        });
        if (existing === null) {
          throw new NotFoundError('Session');
        }

        // Either date may arrive alone, so the ordering has to be checked
        // against what is already stored — the schema can only compare the two
        // it was given.
        const start =
          input.startDate === undefined ? existing.startDate : new Date(input.startDate);
        const end = input.endDate === undefined ? existing.endDate : new Date(input.endDate);
        if (end <= start) {
          throw new BusinessRuleError(
            'BUSINESS_RULE_VIOLATION',
            'The session must end after it starts.',
          );
        }

        const updated = await tx.academicSession.update({
          where: { id },
          data: {
            ...(input.name === undefined ? {} : { name: input.name }),
            ...(input.startDate === undefined ? {} : { startDate: start }),
            ...(input.endDate === undefined ? {} : { endDate: end }),
            ...(input.status === undefined ? {} : { status: input.status }),
          },
          select: {
            id: true,
            name: true,
            startDate: true,
            endDate: true,
            status: true,
            isCurrent: true,
            _count: { select: { enrollments: true, sections: true } },
          },
        });

        return {
          id: updated.id,
          name: updated.name,
          startDate: asDate(updated.startDate),
          endDate: asDate(updated.endDate),
          status: updated.status,
          isCurrent: updated.isCurrent,
          enrollmentCount: updated._count.enrollments,
          sectionCount: updated._count.sections,
        };
      })
      .catch((error: unknown) => {
        if (isUniqueViolation(error)) {
          throw new ConflictError('A session with that name already exists.');
        }
        throw error;
      });
  }

  /**
   * Make one session the current one.
   *
   * Two statements in one transaction, and the order matters: a partial unique
   * index enforces at most one `is_current` per school, so setting the new one
   * before clearing the old would violate it. Clearing everything first is also
   * what makes this safe to run when nothing is current yet.
   */
  async makeSessionCurrent(id: string): Promise<AcademicSession[]> {
    return this.prisma.tenant(async (tx) => {
      const target = await tx.academicSession.findUnique({
        where: { id },
        select: { id: true, status: true },
      });
      if (target === null) {
        throw new NotFoundError('Session');
      }

      if (target.status === 'CLOSED') {
        throw new BusinessRuleError(
          'BUSINESS_RULE_VIOLATION',
          'A closed session cannot be made current. Reopen it first.',
        );
      }

      await tx.academicSession.updateMany({
        where: { isCurrent: true },
        data: { isCurrent: false },
      });
      await tx.academicSession.update({ where: { id }, data: { isCurrent: true } });

      return this.listSessionsWithin(tx);
    });
  }

  async deleteSession(id: string): Promise<void> {
    await this.prisma.tenant(async (tx) => {
      const session = await tx.academicSession.findUnique({
        where: { id },
        select: {
          name: true,
          isCurrent: true,
          _count: { select: { enrollments: true, sections: true } },
        },
      });

      if (session === null) {
        throw new NotFoundError('Session');
      }

      if (session._count.enrollments > 0) {
        throw new BusinessRuleError(
          'BUSINESS_RULE_VIOLATION',
          `${String(session._count.enrollments)} students are enrolled in "${session.name}", so it cannot be deleted. Close it instead — the records stay readable and it stops accepting new enrolments.`,
        );
      }

      if (session.isCurrent) {
        throw new BusinessRuleError(
          'BUSINESS_RULE_VIOLATION',
          'This is the current session. Make another session current first.',
        );
      }

      await tx.academicSession.delete({ where: { id } });
    });
  }

  // --- Classes --------------------------------------------------------------

  /**
   * Classes, each with the sections of one session.
   *
   * `sessionId` is explicit rather than always "current" because the classes
   * page has a session picker: a school sets up next year's sections while this
   * year is still running, and a page that can only ever show the current year
   * cannot be used for that.
   */
  async listClasses(sessionId?: string): Promise<ClassLevel[]> {
    return this.prisma.tenant(async (tx) => {
      const scopeId =
        sessionId ??
        (
          await tx.academicSession.findFirst({
            where: { isCurrent: true },
            select: { id: true },
          })
        )?.id;

      const rows = await tx.classLevel.findMany({
        orderBy: [{ numericOrder: 'asc' }, { name: 'asc' }],
        select: {
          id: true,
          name: true,
          numericOrder: true,
          isActive: true,
          _count: { select: { enrollments: true } },
          // Always selected, never a false branch. A conditional that can
          // yield false collapses the nested select type, so row.sections
          // silently becomes the bare model with no session and no _count —
          // which typechecks at the call site and is wrong at runtime.
          // Matching nothing is an empty "in" instead.
          sections: {
            where: scopeId === undefined ? { id: { in: [] } } : { sessionId: scopeId },
            orderBy: { name: 'asc' },
            select: {
              id: true,
              name: true,
              capacity: true,
              sessionId: true,
              session: { select: { name: true } },
              _count: { select: { enrollments: true } },
            },
          },
        },
      });

      return rows.map((row) => ({
        id: row.id,
        name: row.name,
        numericOrder: row.numericOrder,
        isActive: row.isActive,
        studentCount: row._count.enrollments,
        sections: (row.sections ?? []).map((section) => ({
          id: section.id,
          name: section.name,
          capacity: section.capacity,
          sessionId: section.sessionId,
          sessionName: section.session.name,
          studentCount: section._count.enrollments,
        })),
      }));
    });
  }

  async createClass(input: CreateClassLevel): Promise<ClassLevel> {
    return this.prisma
      .tenant(async (tx) => {
        const created = await tx.classLevel.create({
          data: {
            name: input.name,
            numericOrder: input.numericOrder,
            isActive: input.isActive,
          } as never,
          select: { id: true, name: true, numericOrder: true, isActive: true },
        });
        return { ...created, sections: [], studentCount: 0 };
      })
      .catch((error: unknown) => {
        if (isUniqueViolation(error)) {
          throw new ConflictError(`A class called "${input.name}" already exists.`);
        }
        throw error;
      });
  }

  async updateClass(id: string, input: UpdateClassLevel): Promise<ClassLevel> {
    return this.prisma
      .tenant(async (tx) => {
        const existing = await tx.classLevel.findUnique({ where: { id }, select: { id: true } });
        if (existing === null) {
          throw new NotFoundError('Class');
        }

        await tx.classLevel.update({
          where: { id },
          data: {
            ...(input.name === undefined ? {} : { name: input.name }),
            ...(input.numericOrder === undefined ? {} : { numericOrder: input.numericOrder }),
            ...(input.isActive === undefined ? {} : { isActive: input.isActive }),
          },
        });

        const [refreshed] = await this.listClassesWithin(tx, undefined, id);
        if (refreshed === undefined) {
          throw new NotFoundError('Class');
        }
        return refreshed;
      })
      .catch((error: unknown) => {
        if (isUniqueViolation(error)) {
          throw new ConflictError('A class with that name already exists.');
        }
        throw error;
      });
  }

  async deleteClass(id: string): Promise<void> {
    await this.prisma.tenant(async (tx) => {
      const cls = await tx.classLevel.findUnique({
        where: { id },
        select: {
          name: true,
          _count: { select: { enrollments: true, sections: true } },
        },
      });

      if (cls === null) {
        throw new NotFoundError('Class');
      }

      if (cls._count.enrollments > 0) {
        throw new BusinessRuleError(
          'BUSINESS_RULE_VIOLATION',
          `${String(cls._count.enrollments)} students are or have been enrolled in ${cls.name}, so it cannot be deleted. Turn it off instead — the records stay intact and it stops appearing on new admissions.`,
        );
      }

      // Sections of an unused class carry nobody, so removing them with it is
      // safe and saves a delete-the-sections-first dance nobody would enjoy.
      await tx.section.deleteMany({ where: { classLevelId: id } });
      await tx.classLevel.delete({ where: { id } });
    });
  }

  // --- Sections -------------------------------------------------------------

  async createSection(input: CreateSection): Promise<Section> {
    return this.prisma
      .tenant(async (tx) => {
        const [cls, session] = await Promise.all([
          tx.classLevel.findUnique({ where: { id: input.classLevelId }, select: { id: true } }),
          tx.academicSession.findUnique({ where: { id: input.sessionId }, select: { id: true } }),
        ]);

        if (cls === null) {
          throw new NotFoundError('Class');
        }
        if (session === null) {
          throw new NotFoundError('Session');
        }

        const created = await tx.section.create({
          data: {
            classLevelId: input.classLevelId,
            sessionId: input.sessionId,
            name: input.name,
            ...(input.capacity === undefined ? {} : { capacity: input.capacity }),
          } as never,
          select: {
            id: true,
            name: true,
            capacity: true,
            sessionId: true,
            session: { select: { name: true } },
          },
        });

        return {
          id: created.id,
          name: created.name,
          capacity: created.capacity,
          sessionId: created.sessionId,
          sessionName: created.session.name,
          studentCount: 0,
        };
      })
      .catch((error: unknown) => {
        if (isUniqueViolation(error)) {
          throw new ConflictError(
            `Section "${input.name}" already exists for that class in this session.`,
          );
        }
        throw error;
      });
  }

  async updateSection(id: string, input: UpdateSection): Promise<Section> {
    return this.prisma
      .tenant(async (tx) => {
        const existing = await tx.section.findUnique({ where: { id }, select: { id: true } });
        if (existing === null) {
          throw new NotFoundError('Section');
        }

        const updated = await tx.section.update({
          where: { id },
          data: {
            ...(input.name === undefined ? {} : { name: input.name }),
            ...(input.capacity === undefined ? {} : { capacity: input.capacity }),
            ...(input.classLevelId === undefined ? {} : { classLevelId: input.classLevelId }),
          },
          select: {
            id: true,
            name: true,
            capacity: true,
            sessionId: true,
            session: { select: { name: true } },
            _count: { select: { enrollments: true } },
          },
        });

        return {
          id: updated.id,
          name: updated.name,
          capacity: updated.capacity,
          sessionId: updated.sessionId,
          sessionName: updated.session.name,
          studentCount: updated._count.enrollments,
        };
      })
      .catch((error: unknown) => {
        if (isUniqueViolation(error)) {
          throw new ConflictError('A section with that name already exists for this class.');
        }
        throw error;
      });
  }

  async deleteSection(id: string): Promise<void> {
    await this.prisma.tenant(async (tx) => {
      const section = await tx.section.findUnique({
        where: { id },
        select: { name: true, _count: { select: { enrollments: true } } },
      });

      if (section === null) {
        throw new NotFoundError('Section');
      }

      if (section._count.enrollments > 0) {
        throw new BusinessRuleError(
          'BUSINESS_RULE_VIOLATION',
          `${String(section._count.enrollments)} students are in section ${section.name}. Move them to another section first.`,
        );
      }

      await tx.section.delete({ where: { id } });
    });
  }

  // --- Shared readers, for use inside an existing transaction ---------------

  private async listSessionsWithin(
    tx: Parameters<Parameters<PrismaService['tenant']>[0]>[0],
  ): Promise<AcademicSession[]> {
    const rows = await tx.academicSession.findMany({
      orderBy: { startDate: 'desc' },
      select: {
        id: true,
        name: true,
        startDate: true,
        endDate: true,
        status: true,
        isCurrent: true,
        _count: { select: { enrollments: true, sections: true } },
      },
    });

    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      startDate: asDate(row.startDate),
      endDate: asDate(row.endDate),
      status: row.status,
      isCurrent: row.isCurrent,
      enrollmentCount: row._count.enrollments,
      sectionCount: row._count.sections,
    }));
  }

  private async listClassesWithin(
    tx: Parameters<Parameters<PrismaService['tenant']>[0]>[0],
    sessionId: string | undefined,
    onlyId?: string,
  ): Promise<ClassLevel[]> {
    const scopeId =
      sessionId ??
      (await tx.academicSession.findFirst({ where: { isCurrent: true }, select: { id: true } }))
        ?.id;

    const rows = await tx.classLevel.findMany({
      ...(onlyId === undefined ? {} : { where: { id: onlyId } }),
      orderBy: [{ numericOrder: 'asc' }, { name: 'asc' }],
      select: {
        id: true,
        name: true,
        numericOrder: true,
        isActive: true,
        _count: { select: { enrollments: true } },
        // Always selected, never a false branch. A conditional that can
        // yield false collapses the nested select type, so row.sections
        // silently becomes the bare model with no session and no _count —
        // which typechecks at the call site and is wrong at runtime.
        // Matching nothing is an empty "in" instead.
        sections: {
          where: scopeId === undefined ? { id: { in: [] } } : { sessionId: scopeId },
          orderBy: { name: 'asc' },
          select: {
            id: true,
            name: true,
            capacity: true,
            sessionId: true,
            session: { select: { name: true } },
            _count: { select: { enrollments: true } },
          },
        },
      },
    });

    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      numericOrder: row.numericOrder,
      isActive: row.isActive,
      studentCount: row._count.enrollments,
      sections: (row.sections ?? []).map((section) => ({
        id: section.id,
        name: section.name,
        capacity: section.capacity,
        sessionId: section.sessionId,
        sessionName: section.session.name,
        studentCount: section._count.enrollments,
      })),
    }));
  }
}

/** `@db.Date` comes back as a Date at UTC midnight; the calendar day is its ISO prefix. */
function asDate(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: string }).code === 'P2002'
  );
}
