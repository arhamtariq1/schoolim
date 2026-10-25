import {
  revenueListQuerySchema,
  ROUTES,
  type RevenueRow,
  type RevenueTotals,
} from '@ilm/contracts';
import { Controller, Get, Query, Req } from '@nestjs/common';
import { type FastifyRequest } from 'fastify';

import { RequirePermission } from '../../shared/rbac/rbac.guard';

import { RevenueService } from './revenue.service';

/**
 * Finance › Revenue.
 *
 * `finance.revenue.read`, the one figure kept for the school's owner
 * (`roles.ts`): the principal and the office collect money every day, but the
 * school's earnings are not theirs to read.
 */
@Controller()
export class RevenueController {
  constructor(private readonly revenue: RevenueService) {}

  @Get(ROUTES.revenue.list)
  @RequirePermission('finance.revenue.read')
  async list(
    @Query() rawQuery: unknown,
    @Req() request: FastifyRequest,
  ): Promise<{
    data: RevenueRow[];
    meta: {
      requestId: string;
      page: { total: number; limit: number; offset: number };
      totals: RevenueTotals;
    };
  }> {
    const query = revenueListQuerySchema.parse(rawQuery);
    const { items, total, totals } = await this.revenue.list(query);
    return {
      data: items,
      meta: {
        requestId: request.id,
        page: { total, limit: query.limit, offset: query.offset },
        totals,
      },
    };
  }
}
