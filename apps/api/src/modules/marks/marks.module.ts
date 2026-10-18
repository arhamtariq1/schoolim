import {
  assessmentListQuerySchema,
  assignToClassSchema,
  setSubjectTeacherSchema,
  createAssessmentSchema,
  idSchema,
  namedItemSchema,
  ROUTES,
  updateAssessmentSchema,
  type AssessmentDetail,
  type AssessmentListItem,
  type AssessmentTypeItem,
  type ClassMarksSummary,
  type MarksRoster,
  type StudentMarkResult,
  type SubjectItem,
} from '@ilm/contracts';
import {
  Body,
  Controller,
  Delete,
  Get,
  Module,
  Param,
  Patch,
  Post,
  Put,
  Query,
} from '@nestjs/common';

import { RequirePermission, RequireUnscopedPermission } from '../../shared/rbac/rbac.guard';
import { clockProvider } from '../../shared/time/clock.provider';

import { MarksService } from './marks.service';

/**
 * Marks endpoints.
 *
 * Reads are `exams.result.read` and writes `exams.mark.create`; both are held
 * by a teacher **scoped to their classes**, which the service applies as a
 * query clause. The controller only maps (docs/12 R6).
 *
 * `/marks/subjects`, `/marks/roster` and `/marks/students/:id` are declared
 * before `/marks/assessments/:id`; none of them can be read as an id.
 */
@Controller()
export class MarksController {
  constructor(private readonly marks: MarksService) {}

  @Get(ROUTES.marks.subjects)
  @RequirePermission('exams.result.read')
  async subjects(): Promise<{ data: SubjectItem[] }> {
    return { data: await this.marks.listSubjects() };
  }

  @Post(ROUTES.marks.subjects)
  @RequirePermission('exams.setup.manage')
  async createSubject(@Body() body: unknown): Promise<{ data: SubjectItem }> {
    return { data: await this.marks.createSubject(namedItemSchema.parse(body)) };
  }

  @Patch('/api/v1/marks/subjects/:id')
  @RequirePermission('exams.setup.manage')
  async renameSubject(@Param('id') id: string, @Body() body: unknown): Promise<{ data: SubjectItem }> {
    return { data: await this.marks.renameSubject(idSchema.parse(id), namedItemSchema.parse(body)) };
  }

  @Delete('/api/v1/marks/subjects/:id')
  @RequirePermission('exams.setup.manage')
  async deleteSubject(@Param('id') id: string): Promise<{ data: { ok: true } }> {
    await this.marks.deleteSubject(idSchema.parse(id));
    return { data: { ok: true } };
  }

  @Get(ROUTES.marks.assessmentTypes)
  @RequirePermission('exams.result.read')
  async assessmentTypes(): Promise<{ data: AssessmentTypeItem[] }> {
    return { data: await this.marks.listAssessmentTypes() };
  }

  @Post(ROUTES.marks.assessmentTypes)
  @RequirePermission('exams.setup.manage')
  async createAssessmentType(@Body() body: unknown): Promise<{ data: AssessmentTypeItem }> {
    return { data: await this.marks.createAssessmentType(namedItemSchema.parse(body)) };
  }

  @Patch('/api/v1/marks/assessment-types/:id')
  @RequirePermission('exams.setup.manage')
  async renameAssessmentType(
    @Param('id') id: string,
    @Body() body: unknown,
  ): Promise<{ data: AssessmentTypeItem }> {
    return {
      data: await this.marks.renameAssessmentType(idSchema.parse(id), namedItemSchema.parse(body)),
    };
  }

  @Delete('/api/v1/marks/assessment-types/:id')
  @RequirePermission('exams.setup.manage')
  async deleteAssessmentType(@Param('id') id: string): Promise<{ data: { ok: true } }> {
    await this.marks.deleteAssessmentType(idSchema.parse(id));
    return { data: { ok: true } };
  }

  @Get(ROUTES.marks.roster)
  @RequirePermission('exams.mark.create')
  async roster(@Query('classLevelId') classLevelId: unknown): Promise<{ data: MarksRoster }> {
    return { data: await this.marks.roster(idSchema.parse(classLevelId)) };
  }

  @Get('/api/v1/marks/classes/:classLevelId/summary')
  @RequirePermission('exams.result.read')
  async classSummary(
    @Param('classLevelId') classLevelId: string,
    @Query('sessionId') sessionId: string | undefined,
  ): Promise<{ data: ClassMarksSummary }> {
    return {
      data: await this.marks.classSummary(
        idSchema.parse(classLevelId),
        sessionId === undefined || sessionId === '' ? undefined : idSchema.parse(sessionId),
      ),
    };
  }

  // Managing a class's own lists: the office, not teachers (they only read them).
  @Post('/api/v1/marks/classes/:classLevelId/subjects')
  @RequireUnscopedPermission('exams.setup.manage')
  async addClassSubject(
    @Param('classLevelId') classLevelId: string,
    @Body() body: unknown,
  ): Promise<{ data: ClassMarksSummary }> {
    return {
      data: await this.marks.addSubjectToClass(idSchema.parse(classLevelId), assignToClassSchema.parse(body)),
    };
  }

  @Delete('/api/v1/marks/classes/:classLevelId/subjects/:subjectId')
  @RequireUnscopedPermission('exams.setup.manage')
  async removeClassSubject(
    @Param('classLevelId') classLevelId: string,
    @Param('subjectId') subjectId: string,
  ): Promise<{ data: ClassMarksSummary }> {
    return {
      data: await this.marks.removeSubjectFromClass(idSchema.parse(classLevelId), idSchema.parse(subjectId)),
    };
  }

  @Put('/api/v1/marks/classes/:classLevelId/subjects/:subjectId/teacher')
  @RequireUnscopedPermission('exams.setup.manage')
  async setClassSubjectTeacher(
    @Param('classLevelId') classLevelId: string,
    @Param('subjectId') subjectId: string,
    @Body() body: unknown,
  ): Promise<{ data: ClassMarksSummary }> {
    return {
      data: await this.marks.setSubjectTeacher(
        idSchema.parse(classLevelId),
        idSchema.parse(subjectId),
        setSubjectTeacherSchema.parse(body),
      ),
    };
  }

  @Post('/api/v1/marks/classes/:classLevelId/assessment-types')
  @RequireUnscopedPermission('exams.setup.manage')
  async addClassAssessmentType(
    @Param('classLevelId') classLevelId: string,
    @Body() body: unknown,
  ): Promise<{ data: ClassMarksSummary }> {
    return {
      data: await this.marks.addAssessmentTypeToClass(
        idSchema.parse(classLevelId),
        assignToClassSchema.parse(body),
      ),
    };
  }

  @Delete('/api/v1/marks/classes/:classLevelId/assessment-types/:typeId')
  @RequireUnscopedPermission('exams.setup.manage')
  async removeClassAssessmentType(
    @Param('classLevelId') classLevelId: string,
    @Param('typeId') typeId: string,
  ): Promise<{ data: ClassMarksSummary }> {
    return {
      data: await this.marks.removeAssessmentTypeFromClass(
        idSchema.parse(classLevelId),
        idSchema.parse(typeId),
      ),
    };
  }

  @Get('/api/v1/marks/students/:studentId')
  @RequirePermission('exams.result.read')
  async forStudent(@Param('studentId') studentId: string): Promise<{ data: StudentMarkResult[] }> {
    return { data: await this.marks.forStudent(idSchema.parse(studentId)) };
  }

  @Get(ROUTES.marks.assessments)
  @RequirePermission('exams.result.read')
  async list(@Query() rawQuery: unknown): Promise<{ data: AssessmentListItem[] }> {
    return { data: await this.marks.list(assessmentListQuerySchema.parse(rawQuery)) };
  }

  @Post(ROUTES.marks.assessments)
  @RequirePermission('exams.mark.create')
  async create(@Body() body: unknown): Promise<{ data: AssessmentDetail }> {
    return { data: await this.marks.create(createAssessmentSchema.parse(body)) };
  }

  @Get('/api/v1/marks/assessments/:id')
  @RequirePermission('exams.result.read')
  async detail(@Param('id') id: string): Promise<{ data: AssessmentDetail }> {
    return { data: await this.marks.get(idSchema.parse(id)) };
  }

  @Put('/api/v1/marks/assessments/:id')
  @Patch('/api/v1/marks/assessments/:id')
  @RequirePermission('exams.mark.create')
  async update(@Param('id') id: string, @Body() body: unknown): Promise<{ data: AssessmentDetail }> {
    return { data: await this.marks.update(idSchema.parse(id), updateAssessmentSchema.parse(body)) };
  }
}

@Module({
  controllers: [MarksController],
  providers: [clockProvider, MarksService],
})
export class MarksModule {}
