import { type CreateHoliday, type Holiday, type UpdateHoliday } from '@ilm/contracts';
import { calendarDate, daysBetween } from '@ilm/utils';
import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../prisma/prisma.service';
import { BusinessRuleError, NotFoundError } from '../../shared/errors/domain-error';

/**
 * The school calendar.
 *
 * Holidays are stored as **inclusive ranges**, so "Summer vacation, 1 June to
 * 15 August" is one row a school can rename or shorten, rather than 76 rows
 * that have to be deleted and recreated to move an end date.
 */
@Injectable()
export class HolidaysService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * The calendar for one session, earliest first.
   *
   * Chronological rather than newest-first: a calendar is read forwards, and
   * the question people bring to it is "what is coming up".
   */
  async list(sessionId?: string): Promise<Holiday[]> {
    return this.prisma.tenant(async (tx) => {
      const scopeId =
        sessionId ??
        (await tx.academicSession.findFirst({ where: { isCurrent: true }, select: { id: true } }))
          ?.id;

      if (scopeId === undefined) {
        return [];
      }

      const rows = await tx.holiday.findMany({
        where: { sessionId: scopeId },
        orderBy: { startDate: 'asc' },
        select: {
          id: true,
          sessionId: true,
          name: true,
          type: true,
          appliesTo: true,
          startDate: true,
          endDate: true,
          notes: true,
        },
      });

      return rows.map(toHoliday);
    });
  }

  async create(input: CreateHoliday): Promise<Holiday> {
    return this.prisma.tenant(async (tx) => {
      const session = await tx.academicSession.findUnique({
        where: { id: input.sessionId },
        select: { id: true, startDate: true, endDate: true, name: true },
      });
      if (session === null) {
        throw new NotFoundError('session');
      }

      // A single day is the common case, so the form need not send an end date.
      const start = new Date(input.startDate);
      const end = input.endDate === undefined ? start : new Date(input.endDate);

      assertWithinSession(start, end, session);

      const created = await tx.holiday.create({
        data: {
          sessionId: input.sessionId,
          name: input.name,
          type: input.type,
          appliesTo: input.appliesTo,
          startDate: start,
          endDate: end,
          ...(input.notes === undefined || input.notes === '' ? {} : { notes: input.notes }),
        } as never,
        select: {
          id: true,
          sessionId: true,
          name: true,
          type: true,
          appliesTo: true,
          startDate: true,
          endDate: true,
          notes: true,
        },
      });

      return toHoliday(created);
    });
  }

  async update(id: string, input: UpdateHoliday): Promise<Holiday> {
    return this.prisma.tenant(async (tx) => {
      const existing = await tx.holiday.findUnique({
        where: { id },
        select: {
          startDate: true,
          endDate: true,
          session: { select: { startDate: true, endDate: true, name: true } },
        },
      });
      if (existing === null) {
        throw new NotFoundError('holiday');
      }

      // Either end may arrive alone, so the range is re-checked against what is
      // stored rather than only against what was sent.
      const start = input.startDate === undefined ? existing.startDate : new Date(input.startDate);
      const end = input.endDate === undefined ? existing.endDate : new Date(input.endDate);

      if (end < start) {
        throw new BusinessRuleError(
          'BUSINESS_RULE_VIOLATION',
          'The last day cannot be before the first.',
        );
      }
      assertWithinSession(start, end, existing.session);

      const updated = await tx.holiday.update({
        where: { id },
        data: {
          ...(input.name === undefined ? {} : { name: input.name }),
          ...(input.type === undefined ? {} : { type: input.type }),
          ...(input.appliesTo === undefined ? {} : { appliesTo: input.appliesTo }),
          ...(input.startDate === undefined ? {} : { startDate: start }),
          ...(input.endDate === undefined ? {} : { endDate: end }),
          ...(input.notes === undefined ? {} : { notes: input.notes }),
        },
        select: {
          id: true,
          sessionId: true,
          name: true,
          type: true,
          appliesTo: true,
          startDate: true,
          endDate: true,
          notes: true,
        },
      });

      return toHoliday(updated);
    });
  }

  /**
   * Holidays delete outright, unlike classes and fees.
   *
   * Nothing references them — no enrolment, no voucher, no attendance row
   * points at a holiday — so removing one destroys no history. Soft-deleting it
   * would leave a school unable to correct a date they typed wrongly, which is
   * the whole reason they opened the page.
   */
  async remove(id: string): Promise<void> {
    await this.prisma.tenant(async (tx) => {
      const existing = await tx.holiday.findUnique({ where: { id }, select: { id: true } });
      if (existing === null) {
        throw new NotFoundError('holiday');
      }
      await tx.holiday.delete({ where: { id } });
    });
  }
}

/**
 * A holiday outside its session is almost always a typo — "2025" for "2026" —
 * and left alone it produces a calendar entry nothing will ever display,
 * because every screen filters by session. Better to refuse it at the door.
 */
function assertWithinSession(
  start: Date,
  end: Date,
  session: { startDate: Date; endDate: Date; name: string },
): void {
  if (start < session.startDate || end > session.endDate) {
    throw new BusinessRuleError(
      'BUSINESS_RULE_VIOLATION',
      `Those dates fall outside ${session.name}, which runs ${iso(session.startDate)} to ${iso(session.endDate)}.`,
    );
  }
}

function toHoliday(row: {
  id: string;
  sessionId: string;
  name: string;
  type: Holiday['type'];
  appliesTo: Holiday['appliesTo'];
  startDate: Date;
  endDate: Date;
  notes: string | null;
}): Holiday {
  return {
    id: row.id,
    sessionId: row.sessionId,
    name: row.name,
    type: row.type,
    appliesTo: row.appliesTo,
    startDate: iso(row.startDate),
    endDate: iso(row.endDate),
    notes: row.notes,
    // Inclusive: 1 June to 1 June is one day, not zero.
    //
    // Through the calendar helper rather than dividing milliseconds — the two
    // agree for UTC-midnight dates, and only one of them keeps agreeing if a
    // date ever arrives with an offset on it.
    days: daysBetween(calendarDate(iso(row.startDate)), calendarDate(iso(row.endDate))) + 1,
  };
}

/** `@db.Date` comes back at UTC midnight; the calendar day is its ISO prefix. */
function iso(value: Date): string {
  return value.toISOString().slice(0, 10);
}
