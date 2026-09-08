import {
  createFeeHeadSchema,
  ROUTES,
  setStudentFeesSchema,
  updateFeeHeadSchema,
  type FeeHead,
  type FeeTotals,
  type StudentFee,
} from '@ilm/contracts';
import { Body, Controller, Delete, Get, Param, Patch, Post, Put } from '@nestjs/common';

import { RequirePermission } from '../../shared/rbac/rbac.guard';

import { FeeHeadsService } from './fee-heads.service';
import { StudentFeesService } from './student-fees.service';

/**
 * Fee endpoints — the catalogue, and one student's structure.
 *
 * Maps and delegates; the rules live in the services (docs/12 R6). No method
 * takes a `schoolId` — tenant scope is ambient (R2).
 *
 * ## Why two permissions and not one
 *
 * `fees.plan.configure` guards the catalogue: changing what a school charges is
 * an owner-and-principal decision. `fees.discount.create` guards a student's
 * structure, because agreeing a discount for one family is a different act with
 * a different blast radius, and the roles that may do one are not the roles that
 * may do the other (docs/08). Collapsing them would mean anyone who can admit a
 * student can also rewrite the school's price list.
 */
@Controller()
export class FeesController {
  constructor(
    private readonly heads: FeeHeadsService,
    private readonly studentFees: StudentFeesService,
  ) {}

  @Get(ROUTES.fees.heads)
  @RequirePermission('fees.plan.read')
  async listHeads(): Promise<{ data: FeeHead[] }> {
    return { data: await this.heads.list() };
  }

  @Post(ROUTES.fees.heads)
  @RequirePermission('fees.plan.configure')
  async createHead(@Body() body: unknown): Promise<{ data: FeeHead }> {
    return { data: await this.heads.create(createFeeHeadSchema.parse(body)) };
  }

  @Patch('/api/v1/fees/heads/:id')
  @RequirePermission('fees.plan.configure')
  async updateHead(@Param('id') id: string, @Body() body: unknown): Promise<{ data: FeeHead }> {
    return { data: await this.heads.update(id, updateFeeHeadSchema.parse(body)) };
  }

  @Delete('/api/v1/fees/heads/:id')
  @RequirePermission('fees.plan.configure')
  async removeHead(
    @Param('id') id: string,
  ): Promise<{ data: { ok: true; removedStudentCharges: number } }> {
    const { removedStudentCharges } = await this.heads.remove(id);
    return { data: { ok: true, removedStudentCharges } };
  }

  @Get('/api/v1/students/:studentId/fees')
  @RequirePermission('students.student.read')
  async listStudentFees(
    @Param('studentId') studentId: string,
  ): Promise<{ data: { fees: StudentFee[]; totals: FeeTotals } }> {
    return { data: await this.studentFees.forStudent(studentId) };
  }

  /**
   * Replace a student's fee structure.
   *
   * A whole-structure PUT rather than per-line PATCHes: the thing a person
   * changes is "this child's fees", they change two lines as often as one, and
   * a partial update leaves no single audit row saying what the structure
   * became.
   */
  @Put('/api/v1/students/:studentId/fees')
  @RequirePermission('fees.discount.create')
  async setStudentFees(
    @Param('studentId') studentId: string,
    @Body() body: unknown,
  ): Promise<{ data: { fees: StudentFee[]; totals: FeeTotals } }> {
    const input = setStudentFeesSchema.parse(body);
    return { data: await this.studentFees.replace(studentId, input.lines) };
  }
}
