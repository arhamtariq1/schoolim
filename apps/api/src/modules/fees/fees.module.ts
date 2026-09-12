import { Module } from '@nestjs/common';

import { DefaultersController } from './defaulters.controller';
import { DefaultersService } from './defaulters.service';
import { FeeHeadsService } from './fee-heads.service';
import { FeeIncrementsController } from './fee-increments.controller';
import { FeeIncrementsService } from './fee-increments.service';
import { FeesController } from './fees.controller';
import { SecurityDepositsController } from './security-deposits.controller';
import { SecurityDepositsService } from './security-deposits.service';
import { StudentFeesService } from './student-fees.service';

/**
 * Fees — the first slice of the Phase 2 engine.
 *
 * `FeeHeadsService` is exported because admission needs the school's active
 * catalogue to fall back on when a request arrives with no fee lines. The
 * per-student write itself is *not* delegated: a student and their fees have to
 * land in one transaction, so `StudentsService` reuses the free functions in
 * `student-fees.service.ts` inside its own.
 *
 * Defaulters and security deposits live here rather than in a module of their
 * own: both are questions about the fee ledger — who has not paid it, and what
 * of it the school does not actually own — and neither has anything the rest of
 * the application needs to import.
 */
@Module({
  controllers: [
    FeesController,
    FeeIncrementsController,
    DefaultersController,
    SecurityDepositsController,
  ],
  providers: [
    FeeHeadsService,
    StudentFeesService,
    FeeIncrementsService,
    DefaultersService,
    SecurityDepositsService,
  ],
  exports: [FeeHeadsService],
})
export class FeesModule {}
