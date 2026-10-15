import { Module } from '@nestjs/common';

import { clockProvider } from '../../shared/time/clock.provider';

import { StaffModule } from '../staff/staff.module';

import { GrNumberController, GrNumberService } from './gr-number.service';
import { GuardiansService } from './guardians.service';
import { ParentInviteService } from './parent-invite.service';
import { StudentsController } from './students.controller';
import { StudentsRepository } from './students.repository';
import { StudentsService } from './students.service';

/**
 * `clockProvider` is registered here rather than assumed global: the service
 * stamps `leftOn` and derives the admission year, and an injected clock is what
 * makes both testable at a fixed date (docs/12 — no bare `new Date()`).
 */
@Module({
  imports: [StaffModule],
  controllers: [StudentsController, GrNumberController],
  providers: [
    clockProvider,
    StudentsService,
    StudentsRepository,
    GuardiansService,
    ParentInviteService,
    GrNumberService,
  ],
  exports: [StudentsService, GuardiansService],
})
export class StudentsModule {}
