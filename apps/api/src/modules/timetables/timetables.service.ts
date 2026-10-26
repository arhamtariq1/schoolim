import {
  DEFAULT_ASSESSMENT_TYPE_NAMES,
  eventKindForAssessmentType,
  formatTimeOfDay,
  PERMISSION_GRANT,
  MAX_CALENDAR_DAYS,
  TIMETABLE_KIND_LABELS,
  timesOverlap,
  WEEKDAY_LABELS,
  type SchoolRole,
  type TimetableCalendarEvent,
  type TimetableCalendarQuery,
  type TimetableDetail,
  type TimetableEntry,
  type TimetableEntryInput,
  type TimetableInput,
  type TimetableKind,
  type TimetableListItem,
  type TimetableListQuery,
  type TimetableOptions,
} from '@ilm/contracts';
import { Inject, Injectable } from '@nestjs/common';

import { type Prisma, type TransactionClient } from '../../prisma';
import { PrismaService } from '../../prisma/prisma.service';
import { BusinessRuleError, NotFoundError } from '../../shared/errors/domain-error';
import { TenantContextService } from '../../shared/tenancy/tenant-context.service';
import { CLOCK, type Clock } from '../../shared/time/clock.provider';
import { NotificationsService } from '../notifications/notifications.service';

/** How many clashes an error message spells out; the rest are counted. */
const CONFLICTS_SHOWN = 4;
/** The calendar stops here rather than send a page nobody can read. */
const CALENDAR_EVENT_CAP = 3000;

const NO_ROWS = '00000000-0000-0000-0000-000000000000';

/**
 * Timetables — ADR-0017.
 *
 * ## Who sees what is a query clause
 *
 * The office reads every timetable, drafts included. Anyone else reads only
 * **published** ones, and only those that concern them: a teacher's assigned
 * classes plus any timetable they teach an entry in; a parent's — and a
 * student's — own class and section. That is `visible()`, applied inside every
 * query that touches a timetable, never after the fetch; a timetable that is not
 * yours answers "not found", the same as one that does not exist.
 *
 * ## The calendar is a read, not a copy
 *
 * `calendar()` expands what is already here. Edit an entry and the calendar
 * changes on the next read; delete a timetable and its events go; there is no
 * second table that could disagree.
 *
 * ## Conflicts are refused, with names
 *
 * Two entries may not put the same class, teacher or room in two places at
 * once. The error says who and when, so the office can fix it without hunting.
 */
@Injectable()
export class TimetablesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly context: TenantContextService,
    private readonly notifications: NotificationsService,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  // --- Reading ---------------------------------------------------------------

  async list(query: TimetableListQuery): Promise<{ items: TimetableListItem[]; total: number }> {
    return this.prisma.tenant(async (tx) => {
      const where: Prisma.TimetableWhereInput = { AND: [await this.visible(tx), listFilters(query)] };
      const [rows, total] = await Promise.all([
        tx.timetable.findMany({
          where,
          orderBy: [{ [query.sort]: query.order }, { id: query.order }],
          skip: query.offset,
          take: query.limit,
          select: LIST_SELECT,
        }),
        tx.timetable.count({ where }),
      ]);
      return { items: rows.map(toListItem), total };
    });
  }

  async detail(id: string): Promise<TimetableDetail> {
    return this.prisma.tenant(async (tx) => this.loadDetail(tx, id));
  }

  /** What the form offers: only things this school already has. Managers only. */
  async options(): Promise<TimetableOptions> {
    return this.prisma.tenant(async (tx) => {
      // The same starting list the marks screens use, so a school that opens
      // this form first still finds Class test, Midterm exam and the rest.
      if ((await tx.assessmentType.count()) === 0) {
        await tx.assessmentType.createMany({
          data: DEFAULT_ASSESSMENT_TYPE_NAMES.map((name) => ({ name })) as never,
          skipDuplicates: true,
        });
      }

      const [sessions, classes, subjects, assessmentTypes, teachers] = await Promise.all([
        tx.academicSession.findMany({
          orderBy: { startDate: 'desc' },
          select: { id: true, name: true, isCurrent: true, startDate: true, endDate: true },
        }),
        tx.classLevel.findMany({
          where: { isActive: true },
          orderBy: { numericOrder: 'asc' },
          select: {
            id: true,
            name: true,
            sections: { orderBy: { name: 'asc' }, select: { id: true, name: true, sessionId: true } },
          },
        }),
        tx.subject.findMany({ orderBy: { name: 'asc' }, select: { id: true, name: true } }),
        tx.assessmentType.findMany({ orderBy: { createdAt: 'asc' }, select: { id: true, name: true } }),
        tx.staff.findMany({
          where: { role: 'TEACHER', status: 'ACTIVE', deletedAt: null },
          orderBy: { name: 'asc' },
          select: { id: true, name: true },
        }),
      ]);
      const classSubjects = await tx.classSubject.findMany({ select: { classLevelId: true, subjectId: true, teacherId: true } });

      return {
        sessions: sessions.map((session) => ({
          id: session.id,
          name: session.name,
          isCurrent: session.isCurrent,
          startDate: asDate(session.startDate),
          endDate: asDate(session.endDate),
        })),
        classes: classes.map((row) => ({
          id: row.id,
          name: row.name,
          sections: row.sections,
          subjectIds: classSubjects.filter((link) => link.classLevelId === row.id).map((link) => link.subjectId),
          subjectTeachers: classSubjects.flatMap((link) =>
            link.classLevelId === row.id && link.teacherId !== null
              ? [{ subjectId: link.subjectId, teacherId: link.teacherId }]
              : [],
          ),
        })),
        subjects,
        assessmentTypes,
        teachers,
      };
    });
  }

  /**
   * What is scheduled between two dates, as events with a date each.
   *
   * Dated papers come out as they are; weekly periods are expanded to the dates
   * they fall on, inside the timetable's effective dates and its session's. A
   * manager looking at the whole school sees papers only — every period of
   * every class would bury them — and chooses a class to see its periods.
   */
  async calendar(query: TimetableCalendarQuery): Promise<TimetableCalendarEvent[]> {
    if (daysBetween(query.from, query.to) > MAX_CALENDAR_DAYS) {
      throw new BusinessRuleError('VALIDATION_FAILED', 'Choose a shorter span of dates.');
    }

    return this.prisma.tenant(async (tx) => {
      const manager = this.isManager();
      const classFilter: Prisma.TimetableWhereInput = {
        ...(query.classLevelId === undefined ? {} : { classLevelId: query.classLevelId }),
        ...(query.sectionId === undefined
          ? {}
          : { OR: [{ sectionId: null }, { sectionId: query.sectionId }] }),
      };
      const withPeriods = !manager || query.classLevelId !== undefined;

      const timetables = await tx.timetable.findMany({
        where: {
          AND: [
            await this.visible(tx),
            classFilter,
            {
              OR: [
                { kind: 'ASSESSMENT', entries: { some: { onDate: { gte: asUtc(query.from), lte: asUtc(query.to) } } } },
                ...(withPeriods
                  ? [
                      {
                        kind: 'CLASS' as const,
                        OR: [{ endsOn: null }, { endsOn: { gte: asUtc(query.from) } }],
                        AND: [{ OR: [{ startsOn: null }, { startsOn: { lte: asUtc(query.to) } }] }],
                      },
                    ]
                  : []),
              ],
            },
          ],
        },
        select: {
          id: true,
          title: true,
          kind: true,
          status: true,
          startsOn: true,
          endsOn: true,
          session: { select: { startDate: true, endDate: true } },
          classLevel: { select: { name: true } },
          section: { select: { name: true } },
          assessmentType: { select: { name: true } },
          entries: {
            where: { isBreak: false },
            select: {
              id: true,
              dayOfWeek: true,
              onDate: true,
              startTime: true,
              endTime: true,
              room: true,
              subject: { select: { name: true } },
              teacher: { select: { name: true } },
            },
          },
        },
      });

      const events: TimetableCalendarEvent[] = [];
      for (const timetable of timetables) {
        const base = {
          timetableId: timetable.id,
          title: timetable.title,
          classLevel: timetable.classLevel.name,
          section: timetable.section?.name ?? null,
          status: timetable.status,
        };

        if (timetable.kind === 'ASSESSMENT') {
          const kind = eventKindForAssessmentType(timetable.assessmentType?.name ?? '');
          for (const entry of timetable.entries) {
            if (entry.onDate === null) continue;
            const date = asDate(entry.onDate);
            if (date < query.from || date > query.to) continue;
            events.push({
              ...base,
              key: `${entry.id}:${date}`,
              kind,
              subject: entry.subject?.name ?? null,
              date,
              startTime: entry.startTime,
              endTime: entry.endTime,
              room: entry.room,
              teacher: entry.teacher?.name ?? null,
            });
          }
          continue;
        }

        const first = maxDate(query.from, timetable.startsOn === null ? query.from : asDate(timetable.startsOn), asDate(timetable.session.startDate));
        const last = minDate(query.to, timetable.endsOn === null ? query.to : asDate(timetable.endsOn), asDate(timetable.session.endDate));
        for (const entry of timetable.entries) {
          if (entry.dayOfWeek === null) continue;
          for (const date of datesOnWeekday(first, last, entry.dayOfWeek)) {
            events.push({
              ...base,
              key: `${entry.id}:${date}`,
              kind: 'CLASS',
              subject: entry.subject?.name ?? null,
              date,
              startTime: entry.startTime,
              endTime: entry.endTime,
              room: entry.room,
              teacher: entry.teacher?.name ?? null,
            });
          }
        }
        if (events.length > CALENDAR_EVENT_CAP) break;
      }

      return events
        .sort((a, b) => a.date.localeCompare(b.date) || a.startTime.localeCompare(b.startTime))
        .slice(0, CALENDAR_EVENT_CAP);
    });
  }

  // --- Writing (the office only) ---------------------------------------------

  async create(input: TimetableInput): Promise<TimetableDetail> {
    return this.prisma.tenant(async (tx) => {
      const prepared = await this.prepare(tx, input, undefined);
      const now = this.clock.now();

      const created = await tx.timetable.create({
        data: {
          schoolId: this.context.schoolId,
          sessionId: input.sessionId,
          classLevelId: input.classLevelId,
          sectionId: input.sectionId,
          kind: input.kind,
          assessmentTypeId: input.assessmentTypeId,
          title: input.title,
          description: input.description,
          status: input.publish ? 'PUBLISHED' : 'DRAFT',
          startsOn: prepared.startsOn === null ? null : asUtc(prepared.startsOn),
          endsOn: prepared.endsOn === null ? null : asUtc(prepared.endsOn),
          publishedAt: input.publish ? now : null,
          createdBy: this.context.userId ?? null,
        },
        select: { id: true },
      });
      await this.writeEntries(tx, created.id, input.entries);

      await this.audit(tx, 'timetables.create', created.id, null, {
        title: input.title,
        kind: input.kind,
        entries: input.entries.length,
        published: input.publish,
      });
      if (input.publish) {
        await this.announce(tx, created.id, 'timetable.published');
      }
      return this.loadDetail(tx, created.id);
    });
  }

  async update(id: string, input: TimetableInput): Promise<TimetableDetail> {
    return this.prisma.tenant(async (tx) => {
      const before = await this.loadDetail(tx, id);
      const prepared = await this.prepare(tx, input, id);
      const now = this.clock.now();

      const publishing = input.publish && before.status === 'DRAFT';
      await tx.timetable.update({
        where: { id },
        data: {
          sessionId: input.sessionId,
          classLevelId: input.classLevelId,
          sectionId: input.sectionId,
          kind: input.kind,
          assessmentTypeId: input.assessmentTypeId,
          title: input.title,
          description: input.description,
          startsOn: prepared.startsOn === null ? null : asUtc(prepared.startsOn),
          endsOn: prepared.endsOn === null ? null : asUtc(prepared.endsOn),
          // Editing never takes a timetable back to draft: that is its own act.
          ...(publishing ? { status: 'PUBLISHED' as const, publishedAt: now } : {}),
        },
      });
      await tx.timetableEntry.deleteMany({ where: { timetableId: id } });
      await this.writeEntries(tx, id, input.entries);

      await this.audit(
        tx,
        'timetables.update',
        id,
        { title: before.title, entries: before.entries.length },
        { title: input.title, entries: input.entries.length },
      );

      if (publishing) {
        await this.announce(tx, id, 'timetable.published');
      } else if (before.status === 'PUBLISHED' && signature(before) !== signatureOfInput(input)) {
        // Told only when the schedule itself moved. A corrected description is
        // not something a parent needs a notification about.
        await this.announce(tx, id, 'timetable.updated');
      }
      return this.loadDetail(tx, id);
    });
  }

  async publish(id: string): Promise<TimetableDetail> {
    return this.prisma.tenant(async (tx) => {
      const found = await this.findManaged(tx, id);
      if (found.status === 'PUBLISHED') {
        // Already where it was asked to be: not an error, and nobody is told twice.
        return this.loadDetail(tx, id);
      }
      await tx.timetable.update({
        where: { id },
        data: { status: 'PUBLISHED', publishedAt: this.clock.now() },
      });
      await this.audit(tx, 'timetables.publish', id, { status: 'DRAFT' }, { status: 'PUBLISHED' });
      await this.announce(tx, id, 'timetable.published');
      return this.loadDetail(tx, id);
    });
  }

  /** Back to a draft, hidden from everyone but the office. Nobody is notified. */
  async unpublish(id: string): Promise<TimetableDetail> {
    return this.prisma.tenant(async (tx) => {
      const found = await this.findManaged(tx, id);
      if (found.status === 'DRAFT') {
        return this.loadDetail(tx, id);
      }
      await tx.timetable.update({ where: { id }, data: { status: 'DRAFT', publishedAt: null } });
      await this.audit(tx, 'timetables.unpublish', id, { status: 'PUBLISHED' }, { status: 'DRAFT' });
      return this.loadDetail(tx, id);
    });
  }

  async remove(id: string): Promise<void> {
    await this.prisma.tenant(async (tx) => {
      const found = await this.findManaged(tx, id);
      // Its entries go with it, and so do its events on the calendar: they were
      // never separate things.
      await tx.timetable.delete({ where: { id } });
      await this.audit(tx, 'timetables.delete', id, { title: found.title, status: found.status }, { deleted: true });
    });
  }

  // --- Who may see what ------------------------------------------------------

  private isManager(): boolean {
    return this.context.grantFor('academics.timetable.configure') === PERMISSION_GRANT.ALL;
  }

  /**
   * The timetables the caller may see, as a `where`.
   *
   * Anything unclear is nobody: a role with no grant, a parent with no enrolled
   * child. A teacher sees every published timetable; a parent or student only
   * their own class's.
   */
  private async visible(tx: TransactionClient): Promise<Prisma.TimetableWhereInput> {
    if (this.isManager()) {
      return {};
    }

    const roles = this.context.roles as readonly SchoolRole[];
    const userId = this.context.userId;
    const none: Prisma.TimetableWhereInput = { id: NO_ROWS };
    if (userId === undefined || !this.context.can('academics.timetable.read')) {
      return none;
    }

    const clauses: Prisma.TimetableWhereInput[] = [];

    // Every teacher sees every published timetable: a teacher covers a colleague, and
    // reads the exam schedule of a class they do not teach. Only drafts stay back.
    if (roles.includes('TEACHER') || roles.includes('COORDINATOR')) {
      clauses.push({});
    }

    if (roles.includes('PARENT') || roles.includes('STUDENT')) {
      const placements = await tx.enrollment.findMany({
        where: {
          status: 'ENROLLED',
          student: {
            deletedAt: null,
            OR: [
              ...(roles.includes('PARENT') ? [{ guardians: { some: { guardian: { userId, deletedAt: null } } } }] : []),
              ...(roles.includes('STUDENT') ? [{ userId }] : []),
            ],
          },
        },
        select: { sessionId: true, classLevelId: true, sectionId: true },
      });
      if (placements.length > 0) {
        clauses.push({
          OR: placements.map((placement) => ({
            sessionId: placement.sessionId,
            classLevelId: placement.classLevelId,
            OR: [{ sectionId: null }, ...(placement.sectionId === null ? [] : [{ sectionId: placement.sectionId }])],
          })),
        });
      }
    }

    if (clauses.length === 0) {
      return none;
    }
    // Published, and concerning them. Drafts are the office's alone.
    return { status: 'PUBLISHED', OR: clauses };
  }

  private async findManaged(tx: TransactionClient, id: string) {
    const found = await tx.timetable.findFirst({ where: { id }, select: { id: true, title: true, status: true } });
    if (found === null) {
      throw new NotFoundError('timetable');
    }
    return found;
  }

  // --- Building answers ------------------------------------------------------

  private async loadDetail(tx: TransactionClient, id: string): Promise<TimetableDetail> {
    const row = await tx.timetable.findFirst({
      where: { AND: [{ id }, await this.visible(tx)] },
      select: {
        ...LIST_SELECT,
        description: true,
        entries: {
          orderBy: [{ dayOfWeek: 'asc' }, { onDate: 'asc' }, { startTime: 'asc' }],
          select: {
            id: true,
            room: true,
            dayOfWeek: true,
            onDate: true,
            startTime: true,
            endTime: true,
            notes: true,
            isBreak: true,
            subject: { select: { id: true, name: true } },
            teacher: { select: { id: true, name: true } },
          },
        },
      },
    });
    if (row === null) {
      throw new NotFoundError('timetable');
    }

    const entries: TimetableEntry[] = row.entries.map((entry) => ({
      id: entry.id,
      subject: entry.subject,
      teacher: entry.teacher,
      room: entry.room,
      dayOfWeek: entry.dayOfWeek,
      onDate: entry.onDate === null ? null : asDate(entry.onDate),
      startTime: entry.startTime,
      endTime: entry.endTime,
      notes: entry.notes,
      isBreak: entry.isBreak,
    }));
    return { ...toListItem(row), entryCount: entries.length, description: row.description, entries };
  }

  // --- Validation ------------------------------------------------------------

  /**
   * Everything a timetable must satisfy before it is stored, in the caller's
   * transaction: that what it names exists and belongs together, that its dates
   * make sense, and that nothing in it — or against what is already scheduled —
   * puts a class, a teacher or a room in two places.
   */
  private async prepare(
    tx: TransactionClient,
    input: TimetableInput,
    excludeId: string | undefined,
  ): Promise<{ startsOn: string | null; endsOn: string | null }> {
    const session = await tx.academicSession.findFirst({
      where: { id: input.sessionId },
      select: { startDate: true, endDate: true },
    });
    if (session === null) {
      throw new BusinessRuleError('VALIDATION_FAILED', 'Choose a session.');
    }
    const sessionStart = asDate(session.startDate);
    const sessionEnd = asDate(session.endDate);

    const classLevel = await tx.classLevel.findFirst({
      where: { id: input.classLevelId, isActive: true },
      select: { name: true },
    });
    if (classLevel === null) {
      throw new BusinessRuleError('VALIDATION_FAILED', 'Choose a class.');
    }
    if (input.sectionId !== null) {
      const section = await tx.section.findFirst({
        where: { id: input.sectionId, classLevelId: input.classLevelId, sessionId: input.sessionId },
        select: { id: true },
      });
      if (section === null) {
        throw new BusinessRuleError('VALIDATION_FAILED', 'That section is not in this class and session.');
      }
    }
    if (input.assessmentTypeId !== null) {
      const type = await tx.assessmentType.findFirst({ where: { id: input.assessmentTypeId }, select: { id: true } });
      if (type === null) {
        throw new BusinessRuleError('VALIDATION_FAILED', 'Choose a type of assessment from the list.');
      }
    }

    await this.checkReferences(tx, input);

    // Dates. A paper is held inside the session; a class timetable's effective
    // dates, if it has them, are too.
    for (const entry of input.entries) {
      if (entry.onDate !== null && (entry.onDate < sessionStart || entry.onDate > sessionEnd)) {
        throw new BusinessRuleError(
          'VALIDATION_FAILED',
          `${entry.onDate} is outside the session (${sessionStart} to ${sessionEnd}).`,
        );
      }
    }
    for (const date of [input.startsOn, input.endsOn]) {
      if (date !== null && (date < sessionStart || date > sessionEnd)) {
        throw new BusinessRuleError('VALIDATION_FAILED', `Keep the dates inside the session (${sessionStart} to ${sessionEnd}).`);
      }
    }

    // An assessment timetable's span is whatever its papers cover.
    const paperDates = input.entries.flatMap((entry) => (entry.onDate === null ? [] : [entry.onDate])).sort();
    const startsOn = input.kind === 'ASSESSMENT' ? (paperDates[0] ?? null) : input.startsOn;
    const endsOn = input.kind === 'ASSESSMENT' ? (paperDates.at(-1) ?? null) : input.endsOn;

    const conflicts = [
      ...selfConflicts(input.entries, input.kind),
      ...(await this.databaseConflicts(tx, input, startsOn, endsOn, excludeId)),
    ];
    if (conflicts.length > 0) {
      const shown = conflicts.slice(0, CONFLICTS_SHOWN).join(' ');
      const more = conflicts.length > CONFLICTS_SHOWN ? ` And ${String(conflicts.length - CONFLICTS_SHOWN)} more.` : '';
      throw new BusinessRuleError('TIMETABLE_CONFLICT', `${shown}${more}`);
    }

    return { startsOn, endsOn };
  }

  /** The subjects and teachers named must exist, and be allowed here. */
  private async checkReferences(tx: TransactionClient, input: TimetableInput): Promise<void> {
    const subjectIds = [...new Set(input.entries.flatMap((entry) => (entry.subjectId === null ? [] : [entry.subjectId])))];
    if (subjectIds.length > 0) {
      const subjects = await tx.subject.findMany({ where: { id: { in: subjectIds } }, select: { id: true, name: true } });
      if (subjects.length !== subjectIds.length) {
        throw new BusinessRuleError('VALIDATION_FAILED', 'One of the subjects is not in this school’s list.');
      }
      const configured = await tx.classSubject.findMany({
        where: { classLevelId: input.classLevelId },
        select: { subjectId: true },
      });
      // A class with subjects set up may only schedule those. One with none set
      // up has not said, and is not stopped.
      if (configured.length > 0) {
        const allowed = new Set(configured.map((link) => link.subjectId));
        const outside = subjects.find((subject) => !allowed.has(subject.id));
        if (outside !== undefined) {
          throw new BusinessRuleError('VALIDATION_FAILED', `${outside.name} is not one of this class’s subjects.`);
        }
      }
    }

    const teacherIds = [...new Set(input.entries.flatMap((entry) => (entry.teacherId === null ? [] : [entry.teacherId])))];
    if (teacherIds.length > 0) {
      const teachers = await tx.staff.count({
        where: { id: { in: teacherIds }, role: 'TEACHER', status: 'ACTIVE', deletedAt: null },
      });
      if (teachers !== teacherIds.length) {
        throw new BusinessRuleError('VALIDATION_FAILED', 'Choose teachers from the list of active teachers.');
      }
    }
  }

  /** Clashes with what is already scheduled in the same session, by name. */
  private async databaseConflicts(
    tx: TransactionClient,
    input: TimetableInput,
    startsOn: string | null,
    endsOn: string | null,
    excludeId: string | undefined,
  ): Promise<string[]> {
    const days = [...new Set(input.entries.flatMap((entry) => (entry.dayOfWeek === null ? [] : [entry.dayOfWeek])))];
    const dates = [...new Set(input.entries.flatMap((entry) => (entry.onDate === null ? [] : [entry.onDate])))];
    const teacherIds = [...new Set(input.entries.flatMap((entry) => (entry.teacherId === null ? [] : [entry.teacherId])))];
    const rooms = [...new Set(input.entries.flatMap((entry) => (entry.room === null ? [] : [entry.room])))];

    const others = await tx.timetableEntry.findMany({
      where: {
        isBreak: false,
        timetable: {
          sessionId: input.sessionId,
          kind: input.kind,
          ...(excludeId === undefined ? {} : { id: { not: excludeId } }),
        },
        AND: [
          input.kind === 'CLASS'
            ? { dayOfWeek: { in: days } }
            : { onDate: { in: dates.map((date) => asUtc(date)) } },
          {
            OR: [
              { timetable: { classLevelId: input.classLevelId } },
              ...(teacherIds.length > 0 ? [{ teacherId: { in: teacherIds } }] : []),
              ...(rooms.length > 0 ? [{ room: { in: rooms, mode: 'insensitive' as const } }] : []),
            ],
          },
        ],
      },
      select: {
        dayOfWeek: true,
        onDate: true,
        startTime: true,
        endTime: true,
        room: true,
        teacherId: true,
        teacher: { select: { name: true } },
        timetable: {
          select: {
            title: true,
            classLevelId: true,
            sectionId: true,
            startsOn: true,
            endsOn: true,
            classLevel: { select: { name: true } },
            section: { select: { name: true } },
          },
        },
      },
    });

    const messages: string[] = [];
    for (const mine of input.entries) {
      // A break shares the clock with other classes's periods; only its own timetable can clash with it.
      if (mine.isBreak) continue;
      for (const other of others) {
        const sameSlot =
          mine.dayOfWeek !== null
            ? other.dayOfWeek === mine.dayOfWeek
            : other.onDate !== null && asDate(other.onDate) === mine.onDate;
        if (!sameSlot || !timesOverlap(mine, other)) continue;

        // Weekly periods only clash where their effective dates meet.
        const rangesMeet =
          input.kind === 'ASSESSMENT' ||
          rangesOverlap(startsOn, endsOn, asDateOrNull(other.timetable.startsOn), asDateOrNull(other.timetable.endsOn));
        if (!rangesMeet) continue;

        // The booking that is already there is what the office needs to see.
        const when = `${slotLabel(mine)}, ${formatTimeOfDay(other.startTime)}–${formatTimeOfDay(other.endTime)}`;
        const where = `“${other.timetable.title}” (${other.timetable.classLevel.name}${other.timetable.section === null ? '' : ` ${other.timetable.section.name}`})`;

        if (
          other.timetable.classLevelId === input.classLevelId &&
          sectionsOverlap(input.sectionId, other.timetable.sectionId)
        ) {
          messages.push(`This class already has ${where} on ${when}.`);
        }
        if (mine.teacherId !== null && mine.teacherId === other.teacherId) {
          messages.push(`${other.teacher?.name ?? 'That teacher'} is already in ${where} on ${when}.`);
        }
        if (mine.room !== null && other.room !== null && mine.room.toLowerCase() === other.room.toLowerCase()) {
          messages.push(`Room ${other.room} is already used by ${where} on ${when}.`);
        }
      }
    }
    return [...new Set(messages)];
  }

  private async writeEntries(
    tx: TransactionClient,
    timetableId: string,
    entries: readonly TimetableEntryInput[],
  ): Promise<void> {
    await tx.timetableEntry.createMany({
      data: entries.map((entry) => ({
        schoolId: this.context.schoolId,
        timetableId,
        subjectId: entry.subjectId,
        teacherId: entry.teacherId,
        room: entry.room,
        dayOfWeek: entry.dayOfWeek,
        onDate: entry.onDate === null ? null : asUtc(entry.onDate),
        startTime: entry.startTime,
        endTime: entry.endTime,
        notes: entry.notes,
        isBreak: entry.isBreak,
      })),
    });
  }

  // --- Telling people --------------------------------------------------------

  /**
   * Tell the teachers and the families a timetable concerns, in the caller's
   * transaction: a notification exists if and only if the change it describes
   * does.
   */
  private async announce(
    tx: TransactionClient,
    id: string,
    kind: 'timetable.published' | 'timetable.updated',
  ): Promise<void> {
    const timetable = await tx.timetable.findFirst({
      where: { id },
      select: {
        title: true,
        kind: true,
        sessionId: true,
        classLevelId: true,
        sectionId: true,
        classLevel: { select: { name: true } },
        section: { select: { name: true } },
        entries: { select: { teacher: { select: { userId: true } } } },
      },
    });
    if (timetable === null) return;

    const [assigned, guardians, students] = await Promise.all([
      tx.staffClassAssignment.findMany({
        where: { classLevelId: timetable.classLevelId, staff: { deletedAt: null, status: 'ACTIVE' } },
        select: { staff: { select: { userId: true } } },
      }),
      tx.studentGuardian.findMany({
        where: {
          student: { deletedAt: null, enrollments: { some: enrolledIn(timetable) } },
          guardian: { deletedAt: null, userId: { not: null } },
        },
        select: { guardian: { select: { userId: true } } },
      }),
      tx.student.findMany({
        where: { deletedAt: null, userId: { not: null }, enrollments: { some: enrolledIn(timetable) } },
        select: { userId: true },
      }),
    ]);

    const recipients = [
      ...timetable.entries.map((entry) => entry.teacher?.userId),
      ...assigned.map((row) => row.staff.userId),
      ...guardians.map((row) => row.guardian.userId),
      ...students.map((row) => row.userId),
    ].filter((userId): userId is string => userId !== null && userId !== undefined);

    await this.notifications.notify(tx, {
      recipientIds: recipients,
      exceptUserId: this.context.userId,
      kind,
      title: kind === 'timetable.published' ? `Timetable published: ${timetable.title}` : `Timetable updated: ${timetable.title}`,
      body: `${timetable.classLevel.name}${timetable.section === null ? '' : ` · ${timetable.section.name}`} · ${TIMETABLE_KIND_LABELS[timetable.kind]}`,
      entityType: 'timetable',
      entityId: id,
    });
  }

  private async audit(
    tx: TransactionClient,
    action: string,
    id: string,
    before: Prisma.InputJsonValue | null,
    after: Prisma.InputJsonValue,
  ): Promise<void> {
    await tx.auditLog.create({
      data: {
        schoolId: this.context.schoolId,
        action,
        entityType: 'Timetable',
        entityId: id,
        actorType: 'USER',
        actorUserId: this.context.userId ?? null,
        ...(before === null ? {} : { before }),
        after,
        at: this.clock.now(),
      },
    });
  }
}

// --- Pure helpers --------------------------------------------------------------

const LIST_SELECT = {
  id: true,
  title: true,
  kind: true,
  status: true,
  startsOn: true,
  endsOn: true,
  publishedAt: true,
  updatedAt: true,
  session: { select: { id: true, name: true } },
  classLevel: { select: { id: true, name: true } },
  section: { select: { id: true, name: true } },
  assessmentType: { select: { id: true, name: true } },
  _count: { select: { entries: true } },
} as const;

type ListRow = Prisma.TimetableGetPayload<{ select: typeof LIST_SELECT }>;

function toListItem(row: ListRow): TimetableListItem {
  return {
    id: row.id,
    title: row.title,
    kind: row.kind,
    status: row.status,
    session: row.session,
    classLevel: row.classLevel,
    section: row.section,
    assessmentType: row.assessmentType,
    startsOn: asDateOrNull(row.startsOn),
    endsOn: asDateOrNull(row.endsOn),
    entryCount: row._count.entries,
    publishedAt: row.publishedAt === null ? null : row.publishedAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function listFilters(query: TimetableListQuery): Prisma.TimetableWhereInput {
  const filters: Prisma.TimetableWhereInput[] = [];
  if (query.sessionId !== undefined) filters.push({ sessionId: query.sessionId });
  if (query.classLevelId !== undefined) filters.push({ classLevelId: query.classLevelId });
  if (query.sectionId !== undefined) filters.push({ sectionId: query.sectionId });
  if (query.kind !== undefined) filters.push({ kind: query.kind });
  if (query.assessmentTypeId !== undefined) filters.push({ assessmentTypeId: query.assessmentTypeId });
  if (query.status !== undefined) filters.push({ status: query.status });
  if (query.q !== undefined) {
    const contains = { contains: query.q, mode: 'insensitive' } as const;
    filters.push({ OR: [{ title: contains }, { classLevel: { name: contains } }, { section: { name: contains } }] });
  }
  return { AND: filters };
}

function asDate(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function asDateOrNull(value: Date | null): string | null {
  return value === null ? null : asDate(value);
}

function asUtc(date: string): Date {
  return new Date(`${date}T00:00:00.000Z`);
}

/**
 * Whole days between two `YYYY-MM-DD` dates.
 *
 * Both sides are UTC midnight, so the difference is always an exact multiple of
 * a day and the division is exact — the `Math.round` that used to wrap it was a
 * no-op, and one the lint rule (ADR-0007) rightly asks about.
 */
function daysBetween(from: string, to: string): number {
  return (asUtc(to).getTime() - asUtc(from).getTime()) / 86_400_000;
}

function maxDate(...dates: string[]): string {
  return dates.reduce((a, b) => (a > b ? a : b));
}

function minDate(...dates: string[]): string {
  return dates.reduce((a, b) => (a < b ? a : b));
}

/** ISO weekday of a calendar date: 1 is Monday, 7 is Sunday. */
function isoWeekday(date: string): number {
  const day = asUtc(date).getUTCDay();
  return day === 0 ? 7 : day;
}

/** Every date from `first` to `last` that falls on the weekday. */
function datesOnWeekday(first: string, last: string, weekday: number): string[] {
  const dates: string[] = [];
  if (first > last) return dates;
  let cursor = asUtc(first);
  const end = asUtc(last);
  while (cursor <= end) {
    const iso = cursor.toISOString().slice(0, 10);
    if (isoWeekday(iso) === weekday) {
      dates.push(iso);
      cursor = new Date(cursor.getTime() + 7 * 86_400_000);
    } else {
      cursor = new Date(cursor.getTime() + 86_400_000);
    }
  }
  return dates;
}

/** Open-ended ranges: `null` is unbounded on that side. */
function rangesOverlap(
  aStart: string | null,
  aEnd: string | null,
  bStart: string | null,
  bEnd: string | null,
): boolean {
  return (aEnd === null || bStart === null || aEnd >= bStart) && (bEnd === null || aStart === null || bEnd >= aStart);
}

/** A whole-class timetable overlaps every section; two named sections only overlap if they are the same. */
function sectionsOverlap(a: string | null, b: string | null): boolean {
  return a === null || b === null || a === b;
}

function slotLabel(entry: { dayOfWeek: number | null; onDate: string | null }): string {
  return entry.dayOfWeek === null ? (entry.onDate ?? '') : (WEEKDAY_LABELS[entry.dayOfWeek] ?? '');
}

/** Clashes among the entries being saved — the same class is always one class. */
function selfConflicts(entries: readonly TimetableEntryInput[], kind: TimetableKind): string[] {
  const messages: string[] = [];
  for (let i = 0; i < entries.length; i += 1) {
    for (let j = i + 1; j < entries.length; j += 1) {
      const a = entries[i];
      const b = entries[j];
      if (a === undefined || b === undefined) continue;
      const sameSlot = kind === 'CLASS' ? a.dayOfWeek === b.dayOfWeek : a.onDate === b.onDate;
      if (!sameSlot || !timesOverlap(a, b)) continue;
      messages.push(
        `Two entries overlap on ${slotLabel(a)}, ${formatTimeOfDay(a.startTime)}–${formatTimeOfDay(a.endTime)}: a class cannot be in two places at once.`,
      );
    }
  }
  return messages;
}

function enrolledIn(timetable: {
  sessionId: string;
  classLevelId: string;
  sectionId: string | null;
}): Prisma.EnrollmentWhereInput {
  return {
    status: 'ENROLLED',
    sessionId: timetable.sessionId,
    classLevelId: timetable.classLevelId,
    ...(timetable.sectionId === null ? {} : { sectionId: timetable.sectionId }),
  };
}

/** What changed in substance: the schedule, not the wording around it. */
function signature(detail: TimetableDetail): string {
  return JSON.stringify({
    title: detail.title,
    kind: detail.kind,
    classLevel: detail.classLevel.id,
    section: detail.section?.id ?? null,
    type: detail.assessmentType?.id ?? null,
    entries: detail.entries
      .map((entry) => [
        entry.subject?.id ?? null,
        entry.teacher?.id ?? null,
        entry.room,
        entry.dayOfWeek,
        entry.onDate,
        entry.startTime,
        entry.endTime,
        entry.notes,
        entry.isBreak,
      ])
      .sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b))),
  });
}

function signatureOfInput(input: TimetableInput): string {
  return JSON.stringify({
    title: input.title,
    kind: input.kind,
    classLevel: input.classLevelId,
    section: input.sectionId,
    type: input.assessmentTypeId,
    entries: input.entries
      .map((entry) => [
        entry.subjectId,
        entry.teacherId,
        entry.room,
        entry.dayOfWeek,
        entry.onDate,
        entry.startTime,
        entry.endTime,
        entry.notes,
        entry.isBreak,
      ])
      .sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b))),
  });
}
