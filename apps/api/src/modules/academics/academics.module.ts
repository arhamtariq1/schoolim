import { Module } from '@nestjs/common';

import { AcademicsController } from './academics.controller';
import { AcademicsService } from './academics.service';
import { HolidaysService } from './holidays.service';
import { StructureService } from './structure.service';

/**
 * Classes, sections and academic sessions.
 *
 * Its own module rather than a corner of students: attendance, exams, the
 * timetable and fee plans all hang off this structure, and every one of them
 * needs it without needing anything about students.
 */
@Module({
  controllers: [AcademicsController],
  providers: [AcademicsService, StructureService, HolidaysService],
  exports: [AcademicsService],
})
export class AcademicsModule {}
