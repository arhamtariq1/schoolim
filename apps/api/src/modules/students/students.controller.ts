import {
  changeStudentStatusSchema,
  createStudentSchema,
  deleteStudentSchema,
  linkGuardianSchema,
  studentListQuerySchema,
  updateStudentSchema,
  upsertGuardianSchema,
  type StudentListItem,
  type StudentProfile,
} from '@ilm/contracts';
import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Req } from '@nestjs/common';
import { type FastifyRequest } from 'fastify';

import { RequirePermission } from '../../shared/rbac/rbac.guard';

import { GuardiansService } from './guardians.service';
import { StudentsService } from './students.service';

/**
 * Student endpoints.
 *
 * The controller maps and delegates — it holds no rules (docs/12 R6). Note that
 * no method takes a `schoolId`: tenant scope comes from request context, and a
 * signature containing one is a review rejection (R2).
 *
 * `@RequirePermission` is the coarse capability check. Row-level scope — a
 * teacher seeing only their sections — is applied in the service as a query
 * clause, because a guard has not fetched anything yet and cannot know.
 */
@Controller()
export class StudentsController {
  constructor(
    private readonly students: StudentsService,
    private readonly guardians: GuardiansService,
  ) {}

  @Get('/api/v1/students')
  @RequirePermission('students.student.read')
  async list(
    @Query() rawQuery: unknown,
    @Req() request: FastifyRequest,
  ): Promise<{
    data: StudentListItem[];
    meta: {
      requestId: string;
      page: { total: number; limit: number; offset: number };
      aggregates: Record<string, number>;
    };
  }> {
    // Parsed with the shared schema, which is `.strict()` — an unknown filter
    // is rejected rather than ignored, so a typo cannot silently return an
    // unfiltered list (docs/11 §6).
    const query = studentListQuerySchema.parse(rawQuery);
    const { items, total, aggregates } = await this.students.list(query);

    return {
      data: items,
      meta: {
        requestId: request.id,
        page: { total, limit: query.limit, offset: query.offset },
        aggregates,
      },
    };
  }

  @Get('/api/v1/students/:id')
  @RequirePermission('students.student.read')
  async detail(
    @Param('id') id: string,
    @Req() request: FastifyRequest,
  ): Promise<{ data: StudentListItem; meta: { requestId: string } }> {
    return { data: await this.students.findOne(id), meta: { requestId: request.id } };
  }

  /**
   * The 360 page, in one response.
   *
   * Details, guardians and enrolment history together rather than three
   * endpoints: a page that fires three calls renders three spinners that finish
   * out of order, and the first thing a person sees is a page assembling
   * itself.
   */
  @Get('/api/v1/students/:id/profile')
  @RequirePermission('students.student.read')
  async profile(
    @Param('id') id: string,
    @Req() request: FastifyRequest,
  ): Promise<{ data: StudentProfile; meta: { requestId: string } }> {
    // `profile` proves the student is visible to this caller before anything
    // else runs, so the guardian read below needs no separate scope check.
    const [profile, guardians] = await Promise.all([
      this.students.profile(id),
      this.guardians.forStudent(id),
    ]);

    return { data: { ...profile, guardians }, meta: { requestId: request.id } };
  }

  /**
   * Guardians already on file, for linking a sibling.
   *
   * Behind `students.guardian.read` and never public: it is the school's parent
   * list, and a search endpoint that anyone can call is a contact-list export
   * with extra steps.
   */
  @Get('/api/v1/guardians')
  @RequirePermission('students.guardian.read')
  async searchGuardians(
    @Query('q') term: unknown,
  ): Promise<{ data: { id: string; name: string; phone: string | null; childCount: number }[] }> {
    return { data: await this.guardians.search(typeof term === 'string' ? term : '') };
  }

  @Post('/api/v1/students/:id/guardians')
  @RequirePermission('students.guardian.update')
  async addGuardian(
    @Param('id') id: string,
    @Body() body: unknown,
  ): Promise<{ data: { ok: true } }> {
    await this.students.findOne(id);
    await this.guardians.add(id, upsertGuardianSchema.parse(body));
    return { data: { ok: true } };
  }

  /** Attach a guardian who already exists. This is what makes siblings work. */
  @Post('/api/v1/students/:id/guardians/link')
  @RequirePermission('students.guardian.update')
  async linkGuardian(
    @Param('id') id: string,
    @Body() body: unknown,
  ): Promise<{ data: { ok: true } }> {
    await this.students.findOne(id);
    await this.guardians.link(id, linkGuardianSchema.parse(body));
    return { data: { ok: true } };
  }

  @Patch('/api/v1/students/:id/guardians/:guardianId')
  @RequirePermission('students.guardian.update')
  async updateGuardian(
    @Param('id') id: string,
    @Param('guardianId') guardianId: string,
    @Body() body: unknown,
  ): Promise<{ data: { ok: true } }> {
    await this.students.findOne(id);
    await this.guardians.update(id, guardianId, upsertGuardianSchema.parse(body));
    return { data: { ok: true } };
  }

  /**
   * Detach, not delete. The guardian is still the parent of their other
   * children, so removing one link must not remove the person.
   */
  @Delete('/api/v1/students/:id/guardians/:guardianId')
  @RequirePermission('students.guardian.update')
  async detachGuardian(
    @Param('id') id: string,
    @Param('guardianId') guardianId: string,
  ): Promise<{ data: { ok: true } }> {
    await this.students.findOne(id);
    await this.guardians.detach(id, guardianId);
    return { data: { ok: true } };
  }

  @Post('/api/v1/students')
  @RequirePermission('students.student.create')
  async create(
    @Body() body: unknown,
    @Req() request: FastifyRequest,
  ): Promise<{
    data: { id: string; grNo: string; studentCode: string };
    meta: { requestId: string };
  }> {
    const input = createStudentSchema.parse(body);
    return { data: await this.students.create(input), meta: { requestId: request.id } };
  }

  @Patch('/api/v1/students/:id')
  @RequirePermission('students.student.update')
  async update(
    @Param('id') id: string,
    @Body() body: unknown,
    @Req() request: FastifyRequest,
  ): Promise<{ data: StudentListItem; meta: { requestId: string } }> {
    const input = updateStudentSchema.parse(body);
    return { data: await this.students.update(id, input), meta: { requestId: request.id } };
  }

  /**
   * A state change, not a `PATCH { status }`.
   *
   * Its own endpoint because it can demand a reason, end the enrolment in the
   * same transaction, and write an audit entry that says what actually
   * happened. A generic patch can do none of that (docs/11 §7).
   */
  @Post('/api/v1/students/:id/status')
  @RequirePermission('students.student.update')
  async changeStatus(
    @Param('id') id: string,
    @Body() body: unknown,
    @Req() request: FastifyRequest,
  ): Promise<{ data: StudentListItem; meta: { requestId: string } }> {
    const input = changeStudentStatusSchema.parse(body);
    return { data: await this.students.changeStatus(id, input), meta: { requestId: request.id } };
  }

  /**
   * Soft delete, with a required reason.
   *
   * `DELETE` with a body is unusual but correct here: the reason is part of the
   * command, not a filter, and it must not sit in a URL that lands in an access
   * log. Deleting is for a record created in error — a student who has left is
   * a status change.
   */
  @Delete('/api/v1/students/:id')
  @RequirePermission('students.student.delete')
  async remove(
    @Param('id') id: string,
    @Body() body: unknown,
    @Req() request: FastifyRequest,
  ): Promise<{ data: { ok: true }; meta: { requestId: string } }> {
    const input = deleteStudentSchema.parse(body ?? {});
    await this.students.remove(id, input.reason);
    return { data: { ok: true }, meta: { requestId: request.id } };
  }
}
