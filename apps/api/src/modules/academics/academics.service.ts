import { type ClassLevelWithSections, type CurrentSession } from '@ilm/contracts';
import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../shared/prisma/prisma.service';

/**
 * Classes, sections and the current academic session.
 *
 * The shape every screen that places a child needs: admission, promotion,
 * timetable, the attendance register. Returned as one nested payload rather
 * than three endpoints, because a form that has to fetch classes, then sections
 * for a class, then the session, renders three loading states and shows a
 * section list that briefly belongs to the previous class.
 *
 * Sections are scoped to the **current** session, not all of them. A section
 * from a session that ended is not somewhere a child can be placed, and
 * offering it is how a student ends up enrolled into last year.
 */
@Injectable()
export class AcademicsService {
  constructor(private readonly prisma: PrismaService) {}

  async currentSession(): Promise<CurrentSession | undefined> {
    return this.prisma.tenant(async (tx) => {
      const session = await tx.academicSession.findFirst({
        where: { isCurrent: true },
        select: { id: true, name: true, startDate: true, endDate: true },
      });

      return session === null
        ? undefined
        : {
            id: session.id,
            name: session.name,
            startDate: session.startDate.toISOString().slice(0, 10),
            endDate: session.endDate.toISOString().slice(0, 10),
          };
    });
  }

  async classes(): Promise<ClassLevelWithSections[]> {
    return this.prisma.tenant(async (tx) => {
      const current = await tx.academicSession.findFirst({
        where: { isCurrent: true },
        select: { id: true },
      });

      const levels = await tx.classLevel.findMany({
        // `numericOrder`, never alphabetical: sorted by name, "Grade 10" comes
        // before "Grade 2" and a dropdown becomes a puzzle.
        orderBy: { numericOrder: 'asc' },
        select: {
          id: true,
          name: true,
          numericOrder: true,
          sections: {
            where: current === null ? { id: undefined } : { sessionId: current.id },
            orderBy: { name: 'asc' },
            select: { id: true, name: true, capacity: true },
          },
        },
      });

      return levels.map((level) => ({
        id: level.id,
        name: level.name,
        numericOrder: level.numericOrder,
        sections: level.sections.map((section) => ({
          id: section.id,
          name: section.name,
          capacity: section.capacity,
        })),
      }));
    });
  }
}
