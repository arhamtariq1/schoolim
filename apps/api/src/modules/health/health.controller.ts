import { ROUTES } from '@ilm/contracts';
import { Controller, Get } from '@nestjs/common';

import { Public } from '../../shared/auth/auth.guard';
import { PrismaService } from '../../shared/prisma/prisma.service';

/**
 * Liveness and readiness.
 *
 * docs/13 section 5: uptime monitoring hits this from a Pakistani region, and
 * `docs/adr/0006` notes the external cron caller doubles as the keep-alive.
 *
 * It probes the database as the **application** role, deliberately: a health
 * check that passes as the owner while the application role is misconfigured
 * would report green during an outage.
 */
@Controller()
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  @Public()
  @Get(ROUTES.health)
  async health(): Promise<{ status: string; database: string }> {
    try {
      await this.prisma.ping();
      return { status: 'ok', database: 'ok' };
    } catch {
      // Reported, not thrown: a 200 with database:'down' is more useful to a
      // monitor than a 500 with no detail.
      return { status: 'degraded', database: 'down' };
    }
  }
}
