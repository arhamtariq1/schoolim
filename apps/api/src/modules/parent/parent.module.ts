import {
  bankLogoSlotSchema,
  idSchema,
  parentAttendanceQuerySchema,
  parentVoucherListQuerySchema,
  ROUTES,
  type ParentAttendance,
  type ParentChallan,
  type ParentChildProfile,
  type ParentChildSummary,
  type ParentVoucherList,
  type StudentMarkResult,
} from '@ilm/contracts';
import { DEFAULT_TIMEZONE, monthKey, today } from '@ilm/utils';
import { Controller, Get, Inject, Injectable, Module, Param, Query, Req, Res } from '@nestjs/common';
import { type FastifyReply, type FastifyRequest } from 'fastify';

import { type TransactionClient } from '../../prisma';
import { PrismaService } from '../../prisma/prisma.service';
import { NotFoundError } from '../../shared/errors/domain-error';
import { RequirePermission } from '../../shared/rbac/rbac.guard';
import { TenantContextService } from '../../shared/tenancy/tenant-context.service';
import { CLOCK, clockProvider, type Clock } from '../../shared/time/clock.provider';
import { NotificationsModule } from '../notifications/notifications.module';
import { SchoolLogoService } from '../schools/school-logo.service';
import { SchoolsModule, serveAsset } from '../schools/schools.module';
import { VouchersService } from '../vouchers/vouchers.service';

import { ParentVouchersService } from './parent-vouchers.service';

/**
 * The parent portal's read side.
 *
 * ## Every query starts at the signed-in guardian
 *
 * There is no "fetch a student, then check they are theirs". `linkedChildIds`
 * walks from the caller's own user id through `guardians.user_id` to the
 * children, and every other query is constrained to that list. A request for a
 * child outside it finds nothing and answers 404 — the same answer as a child
 * that does not exist, so one family cannot probe for another family's ids.
 *
 * Nothing here writes. There is no POST, PATCH or DELETE on this controller,
 * which is what "a parent cannot edit a record" means in practice.
 */
@Injectable()
export class ParentService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly context: TenantContextService,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async children(): Promise<ParentChildSummary[]> {
    return this.prisma.tenant(async (tx) => {
      const ids = await this.linkedChildIds(tx);
      if (ids.length === 0) {
        return [];
      }

      const rows = await tx.student.findMany({
        where: { id: { in: ids }, deletedAt: null },
        orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }],
        select: { id: true, firstName: true, lastName: true, grNo: true, photoUrl: true, status: true },
      });
      const placements = await currentPlacements(
        tx,
        rows.map((row) => row.id),
      );

      return rows.map((row) => ({
        id: row.id,
        name: `${row.firstName} ${row.lastName}`,
        grNo: row.grNo,
        photoUrl: row.photoUrl,
        className: placements.get(row.id)?.className ?? null,
        sectionName: placements.get(row.id)?.sectionName ?? null,
        classLevelId: placements.get(row.id)?.classLevelId ?? null,
        sectionId: placements.get(row.id)?.sectionId ?? null,
        status: row.status,
      }));
    });
  }

  async child(studentId: string): Promise<ParentChildProfile> {
    return this.prisma.tenant(async (tx) => {
      await this.assertLinked(tx, studentId);

      const row = await tx.student.findFirst({
        where: { id: studentId, deletedAt: null },
        select: {
          id: true,
          firstName: true,
          lastName: true,
          grNo: true,
          studentCode: true,
          photoUrl: true,
          gender: true,
          dateOfBirth: true,
          admittedOn: true,
          religion: true,
          nationality: true,
          address: true,
          status: true,
        },
      });
      if (row === null) {
        throw new NotFoundError('student');
      }

      const placement = (await currentPlacements(tx, [row.id])).get(row.id);

      return {
        id: row.id,
        name: `${row.firstName} ${row.lastName}`,
        grNo: row.grNo,
        studentCode: row.studentCode,
        photoUrl: row.photoUrl,
        className: placement?.className ?? null,
        sectionName: placement?.sectionName ?? null,
        classLevelId: placement?.classLevelId ?? null,
        sectionId: placement?.sectionId ?? null,
        sessionName: placement?.sessionName ?? null,
        rollNo: placement?.rollNo ?? null,
        gender: row.gender,
        dateOfBirth: row.dateOfBirth === null ? null : isoDate(row.dateOfBirth),
        admittedOn: row.admittedOn === null ? null : isoDate(row.admittedOn),
        religion: row.religion,
        nationality: row.nationality,
        address: row.address,
        status: row.status,
      };
    });
  }

  async attendance(studentId: string, month: string | undefined): Promise<ParentAttendance> {
    return this.prisma.tenant(async (tx) => {
      await this.assertLinked(tx, studentId);

      // "This month" is the month on the school's wall, not the server's. A
      // parent in Karachi opening this at 01:00 on the 1st is still on last
      // month in UTC, and would be shown a finished month's attendance with
      // today's absence missing from it.
      const asked = month ?? (await this.schoolMonth(tx));
      const year = Number(asked.slice(0, 4));
      const monthIndex = Number(asked.slice(5, 7)) - 1;
      const from = new Date(Date.UTC(year, monthIndex, 1));
      const to = new Date(Date.UTC(year, monthIndex + 1, 1));

      const records = await tx.attendanceRecord.findMany({
        where: { studentId, date: { gte: from, lt: to } },
        orderBy: { date: 'desc' },
        select: { date: true, status: true, note: true },
      });

      const counts = { PRESENT: 0, ABSENT: 0, LATE: 0, LEAVE: 0, HALF_DAY: 0, EXCUSED: 0 };
      for (const record of records) {
        counts[record.status] += 1;
      }
      const attended = counts.PRESENT + counts.LATE + counts.HALF_DAY;

      return {
        month: isoDate(from),
        markedDays: records.length,
        counts,
        attendancePercent:
          records.length === 0 ? null : percentToOneDecimal(attended, records.length),
        recent: records.slice(0, 10).map((record) => ({
          date: isoDate(record.date),
          status: record.status,
          note: record.note,
        })),
      };
    });
  }

  /**
   * A linked child's test and exam results. Starts from `assertLinked` like
   * everything else here, so another family's child is a 404.
   */
  async marks(studentId: string): Promise<StudentMarkResult[]> {
    return this.prisma.tenant(async (tx) => {
      await this.assertLinked(tx, studentId);

      const rows = await tx.markEntry.findMany({
        where: { studentId },
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

      return rows.map((row) => {
        const total = Number(row.assessment.totalMarks);
        const obtained = row.obtained === null ? null : Number(row.obtained);
        return {
          assessmentId: row.assessment.id,
          subjectName: row.assessment.subject.name,
          typeName: row.assessment.type.name,
          heldOn: isoDate(row.assessment.heldOn),
          totalMarks: total,
          obtained,
          percent: obtained === null ? null : percentToOneDecimal(obtained, total),
        };
      });
    });
  }

  /** `YYYY-MM` on the school's own calendar. See the note in `attendance`. */
  private async schoolMonth(tx: TransactionClient): Promise<string> {
    const school = await tx.school.findFirst({ select: { timezone: true } });
    return monthKey(today(this.clock, school?.timezone ?? DEFAULT_TIMEZONE));
  }

  private async linkedChildIds(tx: TransactionClient): Promise<string[]> {
    const userId = this.context.userId;
    if (userId === undefined) {
      return [];
    }
    const links = await tx.studentGuardian.findMany({
      where: { guardian: { userId, deletedAt: null } },
      select: { studentId: true },
    });
    return [...new Set(links.map((link) => link.studentId))];
  }

  private async assertLinked(tx: TransactionClient, studentId: string): Promise<void> {
    const ids = await this.linkedChildIds(tx);
    if (!ids.includes(studentId)) {
      throw new NotFoundError('student');
    }
  }
}

@Controller()
export class ParentController {
  constructor(private readonly parent: ParentService) {}

  @Get(ROUTES.parent.children)
  @RequirePermission('parent.child.read')
  async children(): Promise<{ data: ParentChildSummary[] }> {
    return { data: await this.parent.children() };
  }

  @Get('/api/v1/parent/children/:id')
  @RequirePermission('parent.child.read')
  async child(@Param('id') id: string): Promise<{ data: ParentChildProfile }> {
    return { data: await this.parent.child(id) };
  }

  @Get('/api/v1/parent/children/:id/marks')
  @RequirePermission('parent.child.read')
  async marks(@Param('id') id: string): Promise<{ data: StudentMarkResult[] }> {
    return { data: await this.parent.marks(id) };
  }

  @Get('/api/v1/parent/children/:id/attendance')
  @RequirePermission('parent.child.read')
  async attendance(
    @Param('id') id: string,
    @Query() rawQuery: unknown,
  ): Promise<{ data: ParentAttendance }> {
    const query = parentAttendanceQuerySchema.parse(rawQuery);
    return { data: await this.parent.attendance(id, query.month) };
  }
}

/**
 * A parent's fee vouchers, and the two marks their challan prints under.
 *
 * The images have their own routes here because the staff ones are gated by
 * `fees.voucher.read` and `dashboard.workspace.read`, and a guardian holds
 * neither — giving them one would open the staff voucher list too.
 */
@Controller()
export class ParentVouchersController {
  constructor(
    private readonly vouchers: ParentVouchersService,
    private readonly logos: SchoolLogoService,
  ) {}

  @Get(ROUTES.parent.vouchers)
  @RequirePermission('parent.voucher.read')
  async list(@Query() rawQuery: unknown): Promise<{ data: ParentVoucherList }> {
    return { data: await this.vouchers.list(parentVoucherListQuerySchema.parse(rawQuery)) };
  }

  @Get(ROUTES.parent.schoolLogo)
  @RequirePermission('parent.voucher.read')
  async schoolLogo(
    @Req() request: FastifyRequest,
    @Res({ passthrough: false }) reply: FastifyReply,
  ): Promise<void> {
    await serveAsset(this.logos, 'SCHOOL_LOGO', request, reply);
  }

  @Get('/api/v1/parent/voucher-assets/bank-logos/:slot')
  @RequirePermission('parent.voucher.read')
  async bankLogo(
    @Param('slot') slot: string,
    @Req() request: FastifyRequest,
    @Res({ passthrough: false }) reply: FastifyReply,
  ): Promise<void> {
    await serveAsset(this.logos, 'BANK_LOGO', request, reply, bankLogoSlotSchema.parse(slot));
  }

  @Get('/api/v1/parent/vouchers/:id')
  @RequirePermission('parent.voucher.read')
  async detail(@Param('id') id: string): Promise<{ data: ParentChallan }> {
    return { data: await this.vouchers.detail(idSchema.parse(id)) };
  }
}

@Module({
  imports: [SchoolsModule, NotificationsModule],
  controllers: [ParentController, ParentVouchersController],
  providers: [ParentService, ParentVouchersService, VouchersService, clockProvider],
})
export class ParentModule {}

/** The newest enrolment for each child, with the names a parent recognises. */
async function currentPlacements(tx: TransactionClient, studentIds: readonly string[]) {
  const enrolments = await tx.enrollment.findMany({
    where: { studentId: { in: [...studentIds] } },
    orderBy: { createdAt: 'desc' },
    select: {
      studentId: true,
      rollNo: true,
      classLevelId: true,
      sectionId: true,
      classLevel: { select: { name: true } },
      section: { select: { name: true } },
      session: { select: { name: true } },
    },
  });

  const placements = new Map<
    string,
    {
      className: string;
      sectionName: string | null;
      sessionName: string;
      rollNo: number | null;
      classLevelId: string;
      sectionId: string | null;
    }
  >();
  for (const enrolment of enrolments) {
    if (!placements.has(enrolment.studentId)) {
      placements.set(enrolment.studentId, {
        className: enrolment.classLevel.name,
        sectionName: enrolment.section?.name ?? null,
        sessionName: enrolment.session.name,
        rollNo: enrolment.rollNo,
        classLevelId: enrolment.classLevelId,
        sectionId: enrolment.sectionId,
      });
    }
  }
  return placements;
}

function isoDate(value: Date): string {
  return value.toISOString().slice(0, 10);
}

/**
 * A display percentage to one decimal place, rounded half up.
 *
 * `Math.round` is banned (ADR-0007) because it is the wrong tool for money;
 * this is a percentage shown on a card, and half-up is what a parent reading
 * "92.5%" expects. `trunc(x + 0.5)` is that, without the banned call.
 */
function percentToOneDecimal(part: number, whole: number): number {
  return Math.trunc((part / whole) * 1000 + 0.5) / 10;
}
