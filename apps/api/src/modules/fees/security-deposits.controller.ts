import {
  recordSecurityDepositSchema,
  refundSecurityDepositSchema,
  ROUTES,
  securityDepositListQuerySchema,
  type SecurityDepositList,
} from '@ilm/contracts';
import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';

import { RequirePermission } from '../../shared/rbac/rbac.guard';

import { SecurityDepositsService } from './security-deposits.service';

/**
 * Deposits held, and refunds out of them.
 *
 * Refunding is a POST to a sub-collection, not a PATCH of a balance. The
 * distinction is the whole design: `POST …/refunds` appends a repayment that
 * records who, how much and why, while a PATCH would overwrite a number and
 * leave nothing behind to explain where the money went.
 *
 * `fees.deposit.update` guards both writes. Taking a deposit and returning one
 * are the same authority — handling the float — and neither belongs to whoever
 * can merely read the list.
 */
@Controller()
export class SecurityDepositsController {
  constructor(private readonly deposits: SecurityDepositsService) {}

  @Get(ROUTES.securityDeposits.list)
  @RequirePermission('fees.deposit.read')
  async list(@Query() query: unknown): Promise<{ data: SecurityDepositList }> {
    return { data: await this.deposits.list(securityDepositListQuerySchema.parse(query)) };
  }

  @Post(ROUTES.securityDeposits.create)
  @RequirePermission('fees.deposit.update')
  async create(@Body() body: unknown): Promise<{ data: { id: string } }> {
    return { data: await this.deposits.create(recordSecurityDepositSchema.parse(body)) };
  }

  @Post('/api/v1/fees/security-deposits/:id/refunds')
  @RequirePermission('fees.deposit.update')
  async refund(
    @Param('id') id: string,
    @Body() body: unknown,
  ): Promise<{ data: { id: string } }> {
    return { data: await this.deposits.refund(id, refundSecurityDepositSchema.parse(body)) };
  }
}
