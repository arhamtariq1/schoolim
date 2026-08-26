import { ROUTES, type ClassLevelWithSections, type CurrentSession } from '@ilm/contracts';
import { Controller, Get, Req } from '@nestjs/common';
import { type FastifyRequest } from 'fastify';

import { RequirePermission } from '../../shared/rbac/rbac.guard';

import { AcademicsService } from './academics.service';

/**
 * Academic structure.
 *
 * One endpoint returning both the current session and the class tree, because
 * every caller needs both together — an admission form, a promotion screen, an
 * attendance register. Splitting them means two requests whose answers can
 * disagree if the session rolls over between them.
 *
 * Guarded by `academics.structure.read` rather than being open to any signed-in
 * user: the class structure tells you how big a school is and how it is
 * organised, which is not something a parent account needs.
 */
@Controller()
export class AcademicsController {
  constructor(private readonly academics: AcademicsService) {}

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
}
