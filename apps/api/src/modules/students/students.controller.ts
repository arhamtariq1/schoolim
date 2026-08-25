import { createStudentSchema, studentListQuerySchema, type StudentListItem } from '@ilm/contracts';
import { Body, Controller, Get, Param, Post, Query, Req } from '@nestjs/common';
import { type FastifyRequest } from 'fastify';

import { RequirePermission } from '../../shared/rbac/rbac.guard';

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
  constructor(private readonly students: StudentsService) {}

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

  @Post('/api/v1/students')
  @RequirePermission('students.student.create')
  async create(
    @Body() body: unknown,
    @Req() request: FastifyRequest,
  ): Promise<{ data: { id: string; admissionNo: string }; meta: { requestId: string } }> {
    const input = createStudentSchema.parse(body);
    return { data: await this.students.create(input), meta: { requestId: request.id } };
  }
}
