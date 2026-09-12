import { defaulterListQuerySchema, ROUTES, type DefaulterList } from '@ilm/contracts';
import { Controller, Get, Query } from '@nestjs/common';

import { RequirePermission } from '../../shared/rbac/rbac.guard';

import { DefaultersService } from './defaulters.service';

/**
 * The overdue list.
 *
 * Read-only, deliberately. Chasing a default ends in a payment, a waiver or a
 * cancellation, and each of those already has its own endpoint with its own
 * permission and its own audit trail. A "mark as paid" here would be a fourth
 * way to move money, and the one nobody would remember to reconcile.
 */
@Controller()
export class DefaultersController {
  constructor(private readonly defaulters: DefaultersService) {}

  @Get(ROUTES.defaulters.list)
  @RequirePermission('fees.defaulter.read')
  async list(@Query() query: unknown): Promise<{ data: DefaulterList }> {
    return { data: await this.defaulters.list(defaulterListQuerySchema.parse(query)) };
  }
}
