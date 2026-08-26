import { Module } from '@nestjs/common';

import { clockProvider } from '../../shared/time/clock.provider';

import { StudentsController } from './students.controller';
import { StudentsRepository } from './students.repository';
import { StudentsService } from './students.service';

/**
 * `clockProvider` is registered here rather than assumed global: the service
 * stamps `leftOn` and derives the admission year, and an injected clock is what
 * makes both testable at a fixed date (docs/12 — no bare `new Date()`).
 */
@Module({
  controllers: [StudentsController],
  providers: [clockProvider, StudentsService, StudentsRepository],
  exports: [StudentsService],
})
export class StudentsModule {}
