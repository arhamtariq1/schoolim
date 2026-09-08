import {
  createClassLevelSchema,
  createHolidaySchema,
  createSectionSchema,
  createSessionSchema,
  ROUTES,
  updateClassLevelSchema,
  updateHolidaySchema,
  updateSectionSchema,
  updateSessionSchema,
  type AcademicSession,
  type ClassLevel,
  type ClassLevelWithSections,
  type CurrentSession,
  type Holiday,
  type Section,
} from '@ilm/contracts';
import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Req } from '@nestjs/common';
import { type FastifyRequest } from 'fastify';

import { RequirePermission } from '../../shared/rbac/rbac.guard';

import { AcademicsService } from './academics.service';
import { HolidaysService } from './holidays.service';
import { StructureService } from './structure.service';

/**
 * Academic structure — sessions, classes, sections and the calendar.
 *
 * Reads are `academics.structure.read`; every write is
 * `academics.structure.configure`. The split matters: a teacher needs to see
 * the class tree to take a register, and must not be able to rename a class.
 *
 * The controller maps and delegates — no rules live here (docs/12 R6), and no
 * method takes a `schoolId` (R2).
 */
@Controller()
export class AcademicsController {
  constructor(
    private readonly academics: AcademicsService,
    private readonly structure: StructureService,
    private readonly holidays: HolidaysService,
  ) {}

  /**
   * The current session and the class tree in one call.
   *
   * Every caller needs both together — an admission form, a promotion screen,
   * an attendance register. Splitting them means two requests whose answers can
   * disagree if the session rolls over between them.
   */
  @Get(ROUTES.academics.setup)
  @RequirePermission('academics.structure.read')
  async setup(@Req() request: FastifyRequest): Promise<{
    data: { session: CurrentSession | null; classes: ClassLevelWithSections[] };
    meta: { requestId: string };
  }> {
    const [session, classes] = await Promise.all([
      this.academics.currentSession(),
      this.academics.classes(),
    ]);

    return {
      // `null` rather than omitted: "there is no current session" is a real
      // answer the client must handle, and an absent key reads as a bug.
      data: { session: session ?? null, classes },
      meta: { requestId: request.id },
    };
  }

  // --- Sessions -------------------------------------------------------------

  @Get(ROUTES.academics.sessions)
  @RequirePermission('academics.structure.read')
  async listSessions(): Promise<{ data: AcademicSession[] }> {
    return { data: await this.structure.listSessions() };
  }

  @Post(ROUTES.academics.sessions)
  @RequirePermission('academics.structure.configure')
  async createSession(@Body() body: unknown): Promise<{ data: AcademicSession }> {
    return { data: await this.structure.createSession(createSessionSchema.parse(body)) };
  }

  @Patch('/api/v1/academics/sessions/:id')
  @RequirePermission('academics.structure.configure')
  async updateSession(
    @Param('id') id: string,
    @Body() body: unknown,
  ): Promise<{ data: AcademicSession }> {
    return { data: await this.structure.updateSession(id, updateSessionSchema.parse(body)) };
  }

  /**
   * A named action rather than a `PATCH` setting a flag.
   *
   * Making one session current necessarily un-currents another: one change on
   * the surface, two writes underneath, guarded by a partial unique index that
   * refuses the intermediate state where both are current. An action endpoint
   * holds them in one transaction and returns the whole list, so no screen can
   * render a moment with two current sessions or none.
   */
  @Post('/api/v1/academics/sessions/:id/make-current')
  @RequirePermission('academics.structure.configure')
  async makeSessionCurrent(@Param('id') id: string): Promise<{ data: AcademicSession[] }> {
    return { data: await this.structure.makeSessionCurrent(id) };
  }

  @Delete('/api/v1/academics/sessions/:id')
  @RequirePermission('academics.structure.configure')
  async deleteSession(@Param('id') id: string): Promise<{ data: { ok: true } }> {
    await this.structure.deleteSession(id);
    return { data: { ok: true } };
  }

  // --- Classes --------------------------------------------------------------

  @Get(ROUTES.academics.classes)
  @RequirePermission('academics.structure.read')
  async listClasses(@Query('sessionId') sessionId?: string): Promise<{ data: ClassLevel[] }> {
    return { data: await this.structure.listClasses(emptyToUndefined(sessionId)) };
  }

  @Post(ROUTES.academics.classes)
  @RequirePermission('academics.structure.configure')
  async createClass(@Body() body: unknown): Promise<{ data: ClassLevel }> {
    return { data: await this.structure.createClass(createClassLevelSchema.parse(body)) };
  }

  @Patch('/api/v1/academics/classes/:id')
  @RequirePermission('academics.structure.configure')
  async updateClass(@Param('id') id: string, @Body() body: unknown): Promise<{ data: ClassLevel }> {
    return { data: await this.structure.updateClass(id, updateClassLevelSchema.parse(body)) };
  }

  @Delete('/api/v1/academics/classes/:id')
  @RequirePermission('academics.structure.configure')
  async deleteClass(@Param('id') id: string): Promise<{ data: { ok: true } }> {
    await this.structure.deleteClass(id);
    return { data: { ok: true } };
  }

  // --- Sections -------------------------------------------------------------

  @Post(ROUTES.academics.sections)
  @RequirePermission('academics.structure.configure')
  async createSection(@Body() body: unknown): Promise<{ data: Section }> {
    return { data: await this.structure.createSection(createSectionSchema.parse(body)) };
  }

  @Patch('/api/v1/academics/sections/:id')
  @RequirePermission('academics.structure.configure')
  async updateSection(@Param('id') id: string, @Body() body: unknown): Promise<{ data: Section }> {
    return { data: await this.structure.updateSection(id, updateSectionSchema.parse(body)) };
  }

  @Delete('/api/v1/academics/sections/:id')
  @RequirePermission('academics.structure.configure')
  async deleteSection(@Param('id') id: string): Promise<{ data: { ok: true } }> {
    await this.structure.deleteSection(id);
    return { data: { ok: true } };
  }

  // --- Holidays -------------------------------------------------------------

  @Get(ROUTES.academics.holidays)
  @RequirePermission('academics.structure.read')
  async listHolidays(@Query('sessionId') sessionId?: string): Promise<{ data: Holiday[] }> {
    return { data: await this.holidays.list(emptyToUndefined(sessionId)) };
  }

  @Post(ROUTES.academics.holidays)
  @RequirePermission('academics.structure.configure')
  async createHoliday(@Body() body: unknown): Promise<{ data: Holiday }> {
    return { data: await this.holidays.create(createHolidaySchema.parse(body)) };
  }

  @Patch('/api/v1/academics/holidays/:id')
  @RequirePermission('academics.structure.configure')
  async updateHoliday(@Param('id') id: string, @Body() body: unknown): Promise<{ data: Holiday }> {
    return { data: await this.holidays.update(id, updateHolidaySchema.parse(body)) };
  }

  @Delete('/api/v1/academics/holidays/:id')
  @RequirePermission('academics.structure.configure')
  async removeHoliday(@Param('id') id: string): Promise<{ data: { ok: true } }> {
    await this.holidays.remove(id);
    return { data: { ok: true } };
  }
}

/**
 * A query string carries an omitted filter as an empty string, not as absent.
 *
 * Passing that straight through would filter for a session whose id is the
 * empty string, match nothing, and read on screen as "this school has no
 * classes" — a wrong answer that looks like a real one.
 */
function emptyToUndefined(value: string | undefined): string | undefined {
  return value === undefined || value.trim() === '' ? undefined : value;
}
