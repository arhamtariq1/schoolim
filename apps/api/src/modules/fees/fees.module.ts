import { Module } from '@nestjs/common';

import { FeeHeadsService } from './fee-heads.service';
import { FeesController } from './fees.controller';
import { StudentFeesService } from './student-fees.service';

/**
 * Fees — the first slice of the Phase 2 engine.
 *
 * `FeeHeadsService` is exported because admission needs the school's active
 * catalogue to fall back on when a request arrives with no fee lines. The
 * per-student write itself is *not* delegated: a student and their fees have to
 * land in one transaction, so `StudentsService` reuses the free functions in
 * `student-fees.service.ts` inside its own.
 */
@Module({
  controllers: [FeesController],
  providers: [FeeHeadsService, StudentFeesService],
  exports: [FeeHeadsService],
})
export class FeesModule {}
