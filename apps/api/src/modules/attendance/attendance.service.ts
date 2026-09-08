import {
  PRESENT_STATUSES,
  type ClassOverview,
  type ClassOverviewQuery,
  type MarkAttendance,
  type MarkResult,
  type MonthlyReport,
  type MonthlyReportQuery,
  type Roster,
  type RosterQuery,
} from '@ilm/contracts';
import { type TransactionClient } from '@ilm/db';
import { systemClock } from '@ilm/utils';
import { Injectable } from '@nestjs/common';

import { BusinessRuleError, NotFoundError } from '../../shared/errors/domain-error';
import { PrismaService } from '../../shared/prisma/prisma.service';

import {
  attendanceBasisPoints,
  daysInMonth,
  describeDay,
  describeMonth,
  expectedDaysFor,
  lockReason,
  todayIn,
  type CalendarConfig,
  type HolidaySpan,
} from './school-calendar';

/**
 * Student attendance — docs/modules/attendance-and-exams.md Part A.
 *
 * ## Default present
 *
 * The roster hands back `status: null` for an unmarked student and the screen
 * pre-selects Present. Docs §3 makes that mandatory rather than a nicety: a
 * teacher marking forty children in a corridor taps only the exceptions, and
 * that alone is the difference between thirty seconds and three minutes. A
 * product that takes three minutes goes back to the paper register, and then
 * every attendance report here is a lie.
 *
 * ## Submitting twice changes nothing
 *
 * One statement, `ON CONFLICT DO UPDATE`, against the unique index on
 * `(school_id, student_id, date, period)`. A teacher who taps submit twice on a
 * bad connection gets one register, because the database refuses the second
 * row rather than because the client was careful.
 *
 * ## Nobody is marked for a day they were not there
 *
 * The roster is the enrolment as it stood **on that date**, not today's class
 * list. A child admitted on the 20th does not appear in the 5th's register, and
 * therefore never acquires an absence for a day they had not joined.
 */
@Injectable()
export class AttendanceService {
  constructor(private readonly prisma: PrismaService) {}

  // --- Reading --------------------------------------------------------------

  /** The class cards, with the chosen day's counts already on them. */
  async classOverview(query: ClassOverviewQuery): Promise<ClassOverview> {
    return this.prisma.tenant(async (tx) => {
      const context = await this.loadContext(tx, query.sessionId);
      const date = query.date ?? context.today;
      const day = describeDay(date, context.calendar);

      const classes = await tx.classLevel.findMany({
        where: { isActive: true },
        orderBy: { numericOrder: 'asc' },
        select: { id: true, name: true },
      });

      // Two grouped queries for the whole screen rather than two per card. A
      // card-at-a-time version is 2N round trips and visibly slow at twenty
      // classes, which is an ordinary primary school.
      const [strengths, marks] = await Promise.all([
        tx.enrollment.groupBy({
          by: ['classLevelId'],
          where: { sessionId: context.sessionId, status: 'ENROLLED' },
          _count: { _all: true },
        }),
        tx.attendanceRecord.groupBy({
          by: ['classLevelId', 'status'],
          where: { date: new Date(date) },
          _count: { _all: true },
        }),
      ]);

      const strengthBy = new Map(strengths.map((row) => [row.classLevelId, row._count._all]));
      const markedAt = await tx.attendanceRecord.groupBy({
        by: ['classLevelId'],
        where: { date: new Date(date) },
        _max: { markedAt: true },
      });
      const markedBy = new Map(markedAt.map((row) => [row.classLevelId, row._max.markedAt]));

      return {
        date,
        day,
        classes: classes.map((entry) => {
          const counts = marks.filter((row) => row.classLevelId === entry.id);
          const total = (statuses: readonly string[]) =>
            counts
              .filter((row) => statuses.includes(row.status))
              .reduce((sum, row) => sum + row._count._all, 0);

          const stamp = markedBy.get(entry.id) ?? null;
          return {
            classLevelId: entry.id,
            className: entry.name,
            sectionId: null,
            sectionName: null,
            strength: strengthBy.get(entry.id) ?? 0,
            markedAt: stamp === null ? null : stamp.toISOString(),
            present: total(PRESENT_STATUSES),
            absent: total(['ABSENT']),
            leave: total(['LEAVE', 'EXCUSED']),
          };
        }),
      };
    });
  }

  /** One class on one day: who is in it, and what is already recorded. */
  async roster(classLevelId: string, query: RosterQuery, canUnlock: boolean): Promise<Roster> {
    return this.prisma.tenant(async (tx) => {
      const context = await this.loadContext(tx, query.sessionId);
      const day = describeDay(query.date, context.calendar);

      const classLevel = await tx.classLevel.findUnique({
        where: { id: classLevelId },
        select: { id: true, name: true },
      });
      if (classLevel === null) {
        throw new NotFoundError('That class does not exist.');
      }

      const enrolments = await tx.enrollment.findMany({
        where: {
          classLevelId,
          sessionId: context.sessionId,
          status: 'ENROLLED',
          ...(query.sectionId === undefined ? {} : { sectionId: query.sectionId }),
          // As it stood on that date. A child admitted after it is not in this
          // register at all, and so cannot collect an absence for it.
          ...enrolledOn(query.date),
        },
        orderBy: [{ rollNo: 'asc' }, { student: { firstName: 'asc' } }],
        select: {
          rollNo: true,
          sectionId: true,
          section: { select: { name: true } },
          student: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              grNo: true,
              status: true,
              guardians: {
                where: { guardian: { relation: 'FATHER' } },
                take: 1,
                select: { guardian: { select: { name: true } } },
              },
            },
          },
        },
      });

      const existing = await tx.attendanceRecord.findMany({
        where: { classLevelId, date: new Date(query.date) },
        select: { studentId: true, status: true, note: true, markedAt: true, markedBy: true },
      });
      const byStudent = new Map(existing.map((row) => [row.studentId, row]));

      const stamps = existing.map((row) => row.markedAt.getTime()).sort((a, b) => b - a);
      const markedAt = stamps[0];

      const marker =
        existing[0]?.markedBy === undefined || existing[0].markedBy === null
          ? null
          : await tx.user.findUnique({
              where: { id: existing[0].markedBy },
              select: { name: true },
            });

      const locked = lockReason(query.date, context.today, context.backdateDays, canUnlock);

      return {
        classLevelId: classLevel.id,
        className: classLevel.name,
        date: query.date,
        day,
        isEditable: day.isWorkingDay && locked === null,
        lockedReason: locked,
        markedAt: markedAt === undefined ? null : new Date(markedAt).toISOString(),
        markedByName: marker?.name ?? null,
        students: enrolments.map((enrolment) => {
          const mark = byStudent.get(enrolment.student.id);
          return {
            studentId: enrolment.student.id,
            name: `${enrolment.student.firstName} ${enrolment.student.lastName}`.trim(),
            grNo: enrolment.student.grNo,
            fatherName: enrolment.student.guardians[0]?.guardian.name ?? null,
            rollNo: enrolment.rollNo,
            sectionId: enrolment.sectionId,
            sectionName: enrolment.section?.name ?? null,
            status: mark?.status ?? null,
            note: mark?.note ?? null,
          };
        }),
      };
    });
  }

  // --- Writing --------------------------------------------------------------

  async mark(
    input: MarkAttendance,
    actorId: string | undefined,
    canUnlock: boolean,
  ): Promise<MarkResult> {
    return this.prisma.tenant(async (tx) => {
      const context = await this.loadContext(tx, undefined);
      const day = describeDay(input.date, context.calendar);

      if (!day.isWorkingDay) {
        throw new BusinessRuleError(
          day.reason === 'FUTURE' ? 'ATTENDANCE_WINDOW_CLOSED' : 'ATTENDANCE_NOT_A_WORKING_DAY',
          refusalFor(day.reason, day.holidayName),
        );
      }

      const locked = lockReason(input.date, context.today, context.backdateDays, canUnlock);
      if (locked !== null) {
        throw new BusinessRuleError('ATTENDANCE_WINDOW_CLOSED', locked);
      }

      // Only children actually enrolled in this class on that date. A request
      // naming somebody else is not an error to shout about — a stale tab is
      // the usual cause — but it must not write a row either.
      const enrolments = await tx.enrollment.findMany({
        where: {
          classLevelId: input.classLevelId,
          sessionId: context.sessionId,
          status: 'ENROLLED',
          studentId: { in: input.entries.map((entry) => entry.studentId) },
          ...enrolledOn(input.date),
        },
        select: { studentId: true, sectionId: true },
      });
      const eligible = new Map(enrolments.map((row) => [row.studentId, row.sectionId]));

      const writable = input.entries.filter((entry) => eligible.has(entry.studentId));
      if (writable.length === 0) {
        return { saved: 0, skipped: input.entries.length };
      }

      await upsertAttendance(tx, {
        entries: writable.map((entry) => ({
          studentId: entry.studentId,
          sectionId: eligible.get(entry.studentId) ?? null,
          status: entry.status,
          note: entry.note ?? null,
        })),
        classLevelId: input.classLevelId,
        sessionId: context.sessionId,
        date: input.date,
        markedBy: actorId ?? null,
      });

      return { saved: writable.length, skipped: input.entries.length - writable.length };
    });
  }

  // --- The monthly grid -----------------------------------------------------

  async monthlyReport(classLevelId: string, query: MonthlyReportQuery): Promise<MonthlyReport> {
    return this.prisma.tenant(async (tx) => {
      const context = await this.loadContext(tx, query.sessionId);
      const days = describeMonth(query.month, context.calendar);
      const dates = daysInMonth(query.month);
      const first = dates[0] ?? `${query.month}-01`;
      const last = dates.at(-1) ?? first;

      const classLevel = await tx.classLevel.findUnique({
        where: { id: classLevelId },
        select: { name: true },
      });
      if (classLevel === null) {
        throw new NotFoundError('That class does not exist.');
      }

      const enrolments = await tx.enrollment.findMany({
        where: {
          classLevelId,
          sessionId: context.sessionId,
          ...(query.sectionId === undefined ? {} : { sectionId: query.sectionId }),
          // Anybody enrolled at any point in the month, including a child who
          // left mid-month — their partial month still belongs in the register.
          OR: [{ endedOn: null }, { endedOn: { gte: new Date(first) } }],
          enrolledOn: { lte: new Date(last) },
          ...(query.q === undefined
            ? {}
            : {
                student: {
                  OR: [
                    { firstName: { contains: query.q, mode: 'insensitive' } },
                    { lastName: { contains: query.q, mode: 'insensitive' } },
                    { grNo: { contains: query.q, mode: 'insensitive' } },
                  ],
                },
              }),
        },
        orderBy: [{ rollNo: 'asc' }, { student: { firstName: 'asc' } }],
        select: {
          rollNo: true,
          enrolledOn: true,
          endedOn: true,
          student: { select: { id: true, firstName: true, lastName: true, grNo: true } },
        },
      });

      const records = await tx.attendanceRecord.findMany({
        where: {
          classLevelId,
          date: { gte: new Date(first), lte: new Date(last) },
          studentId: { in: enrolments.map((row) => row.student.id) },
        },
        select: { studentId: true, date: true, status: true },
      });

      const byStudent = new Map<string, Map<string, string>>();
      for (const record of records) {
        const key = record.studentId;
        const map = byStudent.get(key) ?? new Map<string, string>();
        map.set(String(record.date.getUTCDate()), record.status);
        byStudent.set(key, map);
      }

      return {
        month: query.month,
        title: classLevel.name,
        days,
        workingDays: days.filter((day) => day.isWorkingDay).length,
        rows: enrolments.map((enrolment) => {
          const marks = byStudent.get(enrolment.student.id) ?? new Map<string, string>();
          const values = [...marks.values()];

          const present = values.filter((status) =>
            (PRESENT_STATUSES as readonly string[]).includes(status),
          ).length;
          const expected = expectedDaysFor(
            days,
            isoOrNull(enrolment.enrolledOn),
            isoOrNull(enrolment.endedOn),
          );

          return {
            subjectId: enrolment.student.id,
            name: `${enrolment.student.firstName} ${enrolment.student.lastName}`.trim(),
            code: enrolment.student.grNo,
            days: Object.fromEntries(marks),
            present,
            absent: values.filter((status) => status === 'ABSENT').length,
            leave: values.filter((status) => status === 'LEAVE' || status === 'EXCUSED').length,
            expectedDays: expected,
            percentBasisPoints: attendanceBasisPoints(present, expected),
          };
        }),
      };
    });
  }

  // --- Shared ---------------------------------------------------------------

  /** The school's week, its holidays, and what day it is where the school is. */
  private async loadContext(
    tx: TransactionClient,
    sessionId: string | undefined,
  ): Promise<AttendanceContext> {
    const school = await tx.school.findFirstOrThrow({
      select: {
        timezone: true,
        workingDays: true,
        attendanceBackdateDays: true,
      },
    });

    const session =
      sessionId === undefined
        ? await tx.academicSession.findFirst({
            where: { isCurrent: true },
            select: { id: true },
          })
        : await tx.academicSession.findUnique({ where: { id: sessionId }, select: { id: true } });

    if (session === null) {
      throw new BusinessRuleError(
        'BUSINESS_RULE_VIOLATION',
        'No academic session is current. Set one under Academics before marking attendance.',
      );
    }

    const holidays = await tx.holiday.findMany({
      where: { sessionId: session.id },
      select: { name: true, startDate: true, endDate: true, appliesTo: true },
    });

    // Today where the school is, not where the server is. A register opened at
    // half past midnight in Karachi is the new day's, and a UTC clock would
    // still be showing yesterday.
    const today = todayIn(school.timezone, systemClock.now());

    return {
      sessionId: session.id,
      today,
      backdateDays: school.attendanceBackdateDays,
      calendar: {
        workingDays: school.workingDays,
        holidays: holidays.map((holiday): HolidaySpan => ({
          name: holiday.name,
          startDate: isoDate(holiday.startDate),
          endDate: isoDate(holiday.endDate),
          appliesTo: holiday.appliesTo,
        })),
        today,
        audience: 'STUDENTS',
      },
    };
  }
}

interface AttendanceContext {
  readonly sessionId: string;
  readonly today: string;
  readonly backdateDays: number;
  readonly calendar: CalendarConfig;
}

/**
 * The register, in one statement.
 *
 * `ON CONFLICT DO UPDATE` against `(school_id, student_id, date, period)`, which
 * is what makes a second submit an update rather than a duplicate — docs §8
 * lists "duplicate submission creates no duplicate rows" as a release gate.
 *
 * Raw SQL because Prisma has no `upsertMany`, and a loop of forty upserts is
 * forty round trips for something a teacher is waiting on. `current_school_id()`
 * supplies the tenant: RLS still applies, and no `schoolId` is passed as a
 * parameter (CLAUDE.md R2).
 */
async function upsertAttendance(
  tx: TransactionClient,
  input: {
    entries: readonly {
      studentId: string;
      sectionId: string | null;
      status: string;
      note: string | null;
    }[];
    classLevelId: string;
    sessionId: string;
    date: string;
    markedBy: string | null;
  },
): Promise<void> {
  const values: unknown[] = [input.classLevelId, input.sessionId, input.date, input.markedBy];
  const tuples: string[] = [];

  for (const entry of input.entries) {
    const base = values.length;
    values.push(entry.studentId, entry.sectionId, entry.status, entry.note);
    tuples.push(
      `(current_school_id(), $${String(base + 1)}::uuid, $2::uuid, $1::uuid, $${String(base + 2)}::uuid, ` +
        `$3::date, 0, $${String(base + 3)}::"attendance_status", $${String(base + 4)}::text, $4::uuid, now(), now())`,
    );
  }

  await tx.$executeRawUnsafe(
    `INSERT INTO attendance_records
       (school_id, student_id, session_id, class_level_id, section_id,
        date, period, status, note, marked_by, marked_at, updated_at)
     VALUES ${tuples.join(', ')}
     ON CONFLICT (school_id, student_id, date, period) DO UPDATE SET
       status      = EXCLUDED.status,
       note        = EXCLUDED.note,
       section_id  = EXCLUDED.section_id,
       marked_by   = EXCLUDED.marked_by,
       marked_at   = now(),
       updated_at  = now()`,
    ...values,
  );
}

/**
 * Enrolled on a given date.
 *
 * `enrolledOn` may be null on a record imported without one; treating that as
 * "always enrolled" is the forgiving reading, and the alternative would hide a
 * child from their own register.
 */
function enrolledOn(date: string): Record<string, unknown> {
  return {
    OR: [{ enrolledOn: null }, { enrolledOn: { lte: new Date(date) } }],
    AND: [{ OR: [{ endedOn: null }, { endedOn: { gte: new Date(date) } }] }],
  };
}

function refusalFor(reason: string | null, holidayName: string | null): string {
  switch (reason) {
    case 'FUTURE':
      return 'That day has not happened yet.';
    case 'HOLIDAY':
      return `${holidayName ?? 'That day'} is a holiday, so there is no register to mark.`;
    case 'WEEKEND':
      return 'The school does not run on that day. Change the working days under Settings if that is wrong.';
    default:
      return 'Attendance cannot be marked for that day.';
  }
}

/** `Date` → `YYYY-MM-DD`, in UTC, because a `date` column carries no zone. */
function isoDate(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function isoOrNull(value: Date | null): string | null {
  return value === null ? null : isoDate(value);
}
