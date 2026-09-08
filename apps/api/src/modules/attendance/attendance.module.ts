import {
  classOverviewQuerySchema,
  markAttendanceSchema,
  markStaffAttendanceSchema,
  monthlyReportQuerySchema,
  grantFor,
  ROUTES,
  rosterQuerySchema,
  type ClassOverview,
  type MarkResult,
  type MonthlyReport,
  type Roster,
  type SchoolRole,
  type StaffRoster,
} from '@ilm/contracts';
import { Body, Controller, Get, Module, Param, Post, Query, Req } from '@nestjs/common';
import { type FastifyRequest } from 'fastify';

import { RequirePermission } from '../../shared/rbac/rbac.guard';
import { TenantContextService } from '../../shared/tenancy/tenant-context.service';

import { AttendanceService } from './attendance.service';
import { StaffAttendanceService } from './staff-attendance.service';

/**
 * Attendance endpoints.
 *
 * ## Route order
 *
 * `/attendance/staff` and `/attendance/reports/...` are declared before
 * `/attendance/classes/:id`, and `/attendance/mark` before anything that could
 * capture it. Fastify matches in registration order.
 *
 * ## Where the unlock permission is read
 *
 * `attendance.record.unlock` is not a guard on these routes — it changes what
 * the answer is rather than whether there is one. Somebody without it still
 * reads an old register; they simply cannot edit it, and the response says so
 * in `lockedReason` instead of returning 403 to a screen that only wanted to
 * show last month.
 */
@Controller()
export class AttendanceController {
  constructor(
    private readonly attendance: AttendanceService,
    private readonly staff: StaffAttendanceService,
    private readonly context: TenantContextService,
  ) {}

  /**
   * Whether this caller may edit a register older than the school's window.
   *
   * Read from the roles in CLS through the same grant table the guard uses,
   * rather than from a permissions array on the token — one source of truth for
   * what a role can do, so the two cannot drift.
   */
  private canUnlock(): boolean {
    return (
      grantFor(this.context.roles as readonly SchoolRole[], 'attendance.record.unlock') !==
      undefined
    );
  }

  @Get(ROUTES.attendance.classes)
  @RequirePermission('attendance.record.read')
  async classes(@Query() rawQuery: unknown): Promise<{ data: ClassOverview }> {
    return { data: await this.attendance.classOverview(classOverviewQuerySchema.parse(rawQuery)) };
  }

  @Get(ROUTES.attendance.staffRoster)
  @RequirePermission('attendance.record.read')
  async staffRoster(@Query('date') date: string | undefined): Promise<{ data: StaffRoster }> {
    return { data: await this.staff.roster(date, this.canUnlock()) };
  }

  @Post(ROUTES.attendance.markStaff)
  @RequirePermission('attendance.record.create')
  async markStaff(
    @Body() body: unknown,
    @Req() request: FastifyRequest,
  ): Promise<{ data: MarkResult }> {
    const input = markStaffAttendanceSchema.parse(body);
    return { data: await this.staff.mark(input, request.claims?.sub, this.canUnlock()) };
  }

  @Get(ROUTES.attendance.staffReport)
  @RequirePermission('attendance.report.read')
  async staffReport(@Query() rawQuery: unknown): Promise<{ data: MonthlyReport }> {
    return { data: await this.staff.monthlyReport(monthlyReportQuerySchema.parse(rawQuery)) };
  }

  @Get('/api/v1/attendance/reports/classes/:classLevelId')
  @RequirePermission('attendance.report.read')
  async studentReport(
    @Param('classLevelId') classLevelId: string,
    @Query() rawQuery: unknown,
  ): Promise<{ data: MonthlyReport }> {
    return {
      data: await this.attendance.monthlyReport(
        classLevelId,
        monthlyReportQuerySchema.parse(rawQuery),
      ),
    };
  }

  @Post(ROUTES.attendance.mark)
  @RequirePermission('attendance.record.create')
  async mark(@Body() body: unknown, @Req() request: FastifyRequest): Promise<{ data: MarkResult }> {
    const input = markAttendanceSchema.parse(body);
    return { data: await this.attendance.mark(input, request.claims?.sub, this.canUnlock()) };
  }

  @Get('/api/v1/attendance/classes/:classLevelId')
  @RequirePermission('attendance.record.read')
  async roster(
    @Param('classLevelId') classLevelId: string,
    @Query() rawQuery: unknown,
  ): Promise<{ data: Roster }> {
    const query = rosterQuerySchema.parse(rawQuery);
    return { data: await this.attendance.roster(classLevelId, query, this.canUnlock()) };
  }
}

@Module({
  controllers: [AttendanceController],
  providers: [AttendanceService, StaffAttendanceService],
})
export class AttendanceModule {}
