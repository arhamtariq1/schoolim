import {
  type MarkResult,
  type MarkStaffAttendance,
  type MonthlyReport,
  type MonthlyReportQuery,
  type StaffRoster,
} from '@ilm/contracts';
import { systemClock } from '@ilm/utils';
import { Injectable } from '@nestjs/common';

import { type TransactionClient } from '../../prisma';
import { PrismaService } from '../../prisma/prisma.service';
import { BusinessRuleError } from '../../shared/errors/domain-error';

import {
  attendanceBasisPoints,
  daysInMonth,
  describeDay,
  describeMonth,
  expectedDaysFor,
  lockReason,
  todayIn,
  type CalendarConfig,
} from './school-calendar';

/**
 * Staff attendance — docs §4, "the same engine, a different subject".
 *
 * The differences from the student side are real rather than cosmetic, which is
 * why this is its own service rather than a flag:
 *
 * - **Different statuses.** Sick and casual leave are drawn against the
 *   allowances already on the staff record; a student has neither.
 * - **A different calendar audience.** A staff training day closes the school
 *   for children and is a working day for teachers, and `holidays.applies_to`
 *   already carries that distinction.
 * - **No enrolment.** Membership is `joinedOn`/`leftOn` on the staff row, which
 *   is what keeps somebody who started in September off August's register.
 */
@Injectable()
export class StaffAttendanceService {
  constructor(private readonly prisma: PrismaService) {}

  async roster(date: string | undefined, canUnlock: boolean): Promise<StaffRoster> {
    return this.prisma.tenant(async (tx) => {
      const context = await this.loadContext(tx);
      const on = date ?? context.today;
      const day = describeDay(on, context.calendar);

      const staff = await tx.staff.findMany({
        where: {
          status: 'ACTIVE',
          OR: [{ joinedOn: null }, { joinedOn: { lte: new Date(on) } }],
          AND: [{ OR: [{ leftOn: null }, { leftOn: { gte: new Date(on) } }] }],
        },
        orderBy: [{ role: 'asc' }, { name: 'asc' }],
        select: { id: true, employeeNo: true, name: true, email: true, role: true },
      });

      const existing = await tx.staffAttendanceRecord.findMany({
        where: { date: new Date(on) },
        select: { staffId: true, status: true, note: true, markedAt: true },
      });
      const byStaff = new Map(existing.map((row) => [row.staffId, row]));
      const markedAt = existing.map((row) => row.markedAt.getTime()).sort((a, b) => b - a)[0];

      const locked = lockReason(on, context.today, context.backdateDays, canUnlock);

      return {
        date: on,
        day,
        isEditable: day.isWorkingDay && locked === null,
        lockedReason: locked,
        markedAt: markedAt === undefined ? null : new Date(markedAt).toISOString(),
        staff: staff.map((member) => {
          const mark = byStaff.get(member.id);
          return {
            staffId: member.id,
            employeeNo: member.employeeNo,
            name: member.name,
            email: member.email,
            role: member.role,
            status: mark?.status ?? null,
            note: mark?.note ?? null,
          };
        }),
      };
    });
  }

  async mark(
    input: MarkStaffAttendance,
    actorId: string | undefined,
    canUnlock: boolean,
  ): Promise<MarkResult> {
    return this.prisma.tenant(async (tx) => {
      const context = await this.loadContext(tx);
      const day = describeDay(input.date, context.calendar);

      if (!day.isWorkingDay) {
        throw new BusinessRuleError(
          day.reason === 'FUTURE' ? 'ATTENDANCE_WINDOW_CLOSED' : 'ATTENDANCE_NOT_A_WORKING_DAY',
          day.reason === 'FUTURE'
            ? 'That day has not happened yet.'
            : `${day.holidayName ?? 'That day'} is not a working day for staff.`,
        );
      }

      const locked = lockReason(input.date, context.today, context.backdateDays, canUnlock);
      if (locked !== null) {
        throw new BusinessRuleError('ATTENDANCE_WINDOW_CLOSED', locked);
      }

      const employed = await tx.staff.findMany({
        where: {
          id: { in: input.entries.map((entry) => entry.staffId) },
          status: 'ACTIVE',
          OR: [{ joinedOn: null }, { joinedOn: { lte: new Date(input.date) } }],
          AND: [{ OR: [{ leftOn: null }, { leftOn: { gte: new Date(input.date) } }] }],
        },
        select: { id: true },
      });
      const eligible = new Set(employed.map((row) => row.id));
      const writable = input.entries.filter((entry) => eligible.has(entry.staffId));

      if (writable.length === 0) {
        return { saved: 0, skipped: input.entries.length };
      }

      // One statement, ON CONFLICT DO UPDATE — same reasoning as the student
      // register: submitting twice must produce one row, not two.
      const values: unknown[] = [input.date, actorId ?? null];
      const tuples: string[] = [];
      for (const entry of writable) {
        const base = values.length;
        values.push(entry.staffId, entry.status, entry.note ?? null);
        tuples.push(
          `(gen_random_uuid(), current_school_id(), $${String(base + 1)}::uuid, $1::date, ` +
            `$${String(base + 2)}::"staff_attendance_status", $${String(base + 3)}::text, $2::uuid, now(), now())`,
        );
      }

      await tx.$executeRawUnsafe(
        `INSERT INTO staff_attendance_records
           (id, school_id, staff_id, date, status, note, marked_by, marked_at, updated_at)
         VALUES ${tuples.join(', ')}
         ON CONFLICT (school_id, staff_id, date) DO UPDATE SET
           status     = EXCLUDED.status,
           note       = EXCLUDED.note,
           marked_by  = EXCLUDED.marked_by,
           marked_at  = now(),
           updated_at = now()`,
        ...values,
      );

      return { saved: writable.length, skipped: input.entries.length - writable.length };
    });
  }

  async monthlyReport(query: MonthlyReportQuery): Promise<MonthlyReport> {
    return this.prisma.tenant(async (tx) => {
      const context = await this.loadContext(tx);
      const days = describeMonth(query.month, context.calendar);
      const dates = daysInMonth(query.month);
      const first = dates[0] ?? `${query.month}-01`;
      const last = dates.at(-1) ?? first;

      const staff = await tx.staff.findMany({
        where: {
          OR: [{ leftOn: null }, { leftOn: { gte: new Date(first) } }],
          AND: [{ OR: [{ joinedOn: null }, { joinedOn: { lte: new Date(last) } }] }],
          ...(query.q === undefined
            ? {}
            : {
                OR: [
                  { name: { contains: query.q, mode: 'insensitive' } },
                  { employeeNo: { contains: query.q, mode: 'insensitive' } },
                ],
              }),
        },
        orderBy: [{ role: 'asc' }, { name: 'asc' }],
        select: { id: true, name: true, employeeNo: true, joinedOn: true, leftOn: true },
      });

      const records = await tx.staffAttendanceRecord.findMany({
        where: {
          date: { gte: new Date(first), lte: new Date(last) },
          staffId: { in: staff.map((member) => member.id) },
        },
        select: { staffId: true, date: true, status: true },
      });

      const byStaff = new Map<string, Map<string, string>>();
      for (const record of records) {
        const map = byStaff.get(record.staffId) ?? new Map<string, string>();
        map.set(String(record.date.getUTCDate()), record.status);
        byStaff.set(record.staffId, map);
      }

      return {
        month: query.month,
        title: 'Staff',
        days,
        workingDays: days.filter((day) => day.isWorkingDay).length,
        rows: staff.map((member) => {
          const marks = byStaff.get(member.id) ?? new Map<string, string>();
          const values = [...marks.values()];
          const present = values.filter((status) =>
            ['PRESENT', 'LATE', 'HALF_DAY'].includes(status),
          ).length;
          const expected = expectedDaysFor(
            days,
            member.joinedOn === null ? null : isoDate(member.joinedOn),
            member.leftOn === null ? null : isoDate(member.leftOn),
          );

          return {
            subjectId: member.id,
            name: member.name,
            code: member.employeeNo,
            days: Object.fromEntries(marks),
            present,
            absent: values.filter((status) => status === 'ABSENT').length,
            leave: values.filter((status) => status === 'SICK_LEAVE' || status === 'CASUAL_LEAVE')
              .length,
            expectedDays: expected,
            percentBasisPoints: attendanceBasisPoints(present, expected),
          };
        }),
      };
    });
  }

  private async loadContext(tx: TransactionClient): Promise<{
    today: string;
    backdateDays: number;
    calendar: CalendarConfig;
  }> {
    const school = await tx.school.findFirstOrThrow({
      select: { timezone: true, workingDays: true, attendanceBackdateDays: true },
    });

    const session = await tx.academicSession.findFirst({
      where: { isCurrent: true },
      select: { id: true },
    });

    const holidays =
      session === null
        ? []
        : await tx.holiday.findMany({
            where: { sessionId: session.id },
            select: { name: true, startDate: true, endDate: true, appliesTo: true },
          });

    const today = todayIn(school.timezone, systemClock.now());

    return {
      today,
      backdateDays: school.attendanceBackdateDays,
      calendar: {
        workingDays: school.workingDays,
        holidays: holidays.map((holiday) => ({
          name: holiday.name,
          startDate: isoDate(holiday.startDate),
          endDate: isoDate(holiday.endDate),
          appliesTo: holiday.appliesTo,
        })),
        today,
        // A day closed for children can still be a working day for staff.
        audience: 'STAFF',
      },
    };
  }
}

function isoDate(value: Date): string {
  return value.toISOString().slice(0, 10);
}
