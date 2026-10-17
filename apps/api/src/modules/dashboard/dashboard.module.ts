import { ROUTES, type DashboardPayload } from '@ilm/contracts';
import { Controller, Get, Module } from '@nestjs/common';

import { RequirePermission } from '../../shared/rbac/rbac.guard';
import { clockProvider } from '../../shared/time/clock.provider';

import { DashboardService } from './dashboard.service';

/**
 * The home screen's data.
 *
 * `dashboard.workspace.read` is held by every role that has a workspace; what
 * comes back depends on the caller's grants, section by section, inside the
 * service. A teacher gets their own classes and nothing school-wide.
 */
@Controller()
export class DashboardController {
  constructor(private readonly dashboard: DashboardService) {}

  @Get(ROUTES.dashboard.summary)
  @RequirePermission('dashboard.workspace.read')
  async summary(): Promise<{ data: DashboardPayload }> {
    return { data: await this.dashboard.summary() };
  }
}

@Module({
  controllers: [DashboardController],
  providers: [clockProvider, DashboardService],
})
export class DashboardModule {}
