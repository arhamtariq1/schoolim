import {
  applyFeeIncrementSchema,
  feeIncrementListQuerySchema,
  ROUTES,
  type FeeHistory,
  type FeeIncrementList,
  type FeeIncrementResult,
} from '@ilm/contracts';
import { Body, Controller, Delete, Get, Param, Post, Query } from '@nestjs/common';

import { RequirePermission } from '../../shared/rbac/rbac.guard';

import { FeeIncrementsService } from './fee-increments.service';

/**
 * Raising and lowering fees.
 *
 * Maps and delegates; the rules live in the service (R6), and no method takes a
 * `schoolId` — tenant scope is ambient (R2).
 *
 * ## Two permissions, deliberately
 *
 * Reading the list is `fees.plan.read`: it is the same information the fee
 * catalogue shows, per child. Changing an amount is `fees.increment.generate`,
 * which is an owner-and-principal act — a receptionist who may look up what a
 * family pays is not someone who may raise it for four hundred of them.
 *
 * Deleting a row from a timeline is guarded by the *change* permission rather
 * than a delete one, because that is what it is: correcting a fee decision.
 */
@Controller()
export class FeeIncrementsController {
  constructor(private readonly increments: FeeIncrementsService) {}

  @Get(ROUTES.feeIncrements.list)
  @RequirePermission('fees.plan.read')
  async list(@Query() query: unknown): Promise<{ data: FeeIncrementList }> {
    return { data: await this.increments.list(feeIncrementListQuerySchema.parse(query)) };
  }

  @Post(ROUTES.feeIncrements.apply)
  @RequirePermission('fees.increment.generate')
  async apply(@Body() body: unknown): Promise<{ data: FeeIncrementResult }> {
    return { data: await this.increments.apply(applyFeeIncrementSchema.parse(body)) };
  }

  @Get('/api/v1/students/:id/fee-history')
  @RequirePermission('fees.plan.read')
  async history(@Param('id') id: string): Promise<{ data: FeeHistory }> {
    return { data: await this.increments.history(id) };
  }

  @Delete('/api/v1/fees/student-fees/:id')
  @RequirePermission('fees.increment.generate')
  async removeHistoryEntry(@Param('id') id: string): Promise<{ data: { removed: true } }> {
    await this.increments.removeHistoryEntry(id);
    return { data: { removed: true } };
  }
}
