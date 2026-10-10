import { Module } from '@nestjs/common';

import { AcademicsController } from './academics.controller';
import { AcademicsService } from './academics.service';
import { HolidaysService } from './holidays.service';
import { PromotionService } from './promotion.service';
import { SchoolLevelClassSyncService } from './school-level-class-sync.service';
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
  providers: [AcademicsService, StructureService, HolidaysService, PromotionService, SchoolLevelClassSyncService],
  exports: [AcademicsService, SchoolLevelClassSyncService],
})
export class AcademicsModule {}
