import { type ClassLevelWithSections, type CurrentSession } from '@ilm/contracts';
import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../prisma/prisma.service';

/**
 * Classes, sections and the academic session a placement is being made into.
 *
 * The shape every screen that places a child needs: admission, promotion,
 * timetable, the attendance register. Returned as one nested payload rather
 * than three endpoints, because a form that has to fetch classes, then sections
 * for a class, then the session, renders three loading states and shows a
 * section list that briefly belongs to the previous class.
 *
 * ## Sections belong to a session
 *
 * That is the whole reason these take a session at all (docs/07 §3). "Grade 4"
 * is the same class every year; "Grade 4 — A, 2027-2028" is a different row
 * from "Grade 4 — A, 2026-2027", with its own capacity and its own register.
 *
 * So `sessionId` is optional and defaults to the current session, which is what
 * almost every caller wants. A school admitting next year's intake in March
 * passes the session it is admitting into, and gets that year's sections — not
 * this year's, which would enrol the child into the year that is ending.
 *
 * A session that has **closed** is not offered: it is not somewhere a child can
 * be placed, and a request naming one comes back with no session rather than
 * with a list of places to put a student who cannot go there.
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

      return session === null ? undefined : toCurrentSession(session);
    });
  }

  /**
   * One named session, when it is one a student may still be placed into.
   *
   * Returns undefined for a closed session and for an id that does not exist —
   * the same answer, deliberately. Under RLS a foreign school's session is
   * already invisible, and distinguishing "closed" from "no such row" would let
   * a caller probe which ids are real.
   */
  async openSession(sessionId: string): Promise<CurrentSession | undefined> {
    return this.prisma.tenant(async (tx) => {
      const session = await tx.academicSession.findFirst({
        where: { id: sessionId, status: { in: ['ACTIVE', 'PLANNED'] } },
        select: { id: true, name: true, startDate: true, endDate: true },
      });

      return session === null ? undefined : toCurrentSession(session);
    });
  }

  /**
   * The class tree, with the sections that exist in `sessionId`.
   *
   * Classes are listed whether or not they have sections in that session: a
   * school planning next year has created the sessions before it has cloned the
   * sections, and a class list that is empty until then reads as "the setup is
   * broken" rather than "no sections yet".
   */
  async classes(sessionId?: string): Promise<ClassLevelWithSections[]> {
    return this.prisma.tenant(async (tx) => {
      const scopeTo =
        sessionId ??
        (
          await tx.academicSession.findFirst({
            where: { isCurrent: true },
            select: { id: true },
          })
        )?.id;

      const levels = await tx.classLevel.findMany({
        // `numericOrder`, never alphabetical: sorted by name, "Grade 10" comes
        // before "Grade 2" and a dropdown becomes a puzzle.
        orderBy: { numericOrder: 'asc' },
        select: {
          id: true,
          name: true,
          numericOrder: true,
          sections: {
            // No session at all means no sections — never *every* session's,
            // which would offer three identically named "A"s from three years.
            where: scopeTo === undefined ? { id: undefined } : { sessionId: scopeTo },
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

function toCurrentSession(session: {
  id: string;
  name: string;
  startDate: Date;
  endDate: Date;
}): CurrentSession {
  return {
    id: session.id,
    name: session.name,
    startDate: session.startDate.toISOString().slice(0, 10),
    endDate: session.endDate.toISOString().slice(0, 10),
  };
}
