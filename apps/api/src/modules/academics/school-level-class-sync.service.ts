import {
  classesForSchoolLevels,
  type LevelClassNames,
  type SchoolLevelId,
  schoolLevelSchema,
} from '@ilm/contracts';
import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../prisma/prisma.service';

type TenantClient = Parameters<Parameters<PrismaService['tenant']>[0]>[0];

/**
 * Creates class levels implied by a school's selected levels.
 *
 * Idempotent by class name: existing rows are left alone, inactive rows are
 * reactivated, and nothing is removed when a level is deselected.
 */
@Injectable()
export class SchoolLevelClassSyncService {
  async syncInTransaction(
    tx: TenantClient,
    schoolLevels: readonly string[],
    names: LevelClassNames,
  ): Promise<number> {
    const levels = schoolLevels.filter(
      (entry): entry is SchoolLevelId => schoolLevelSchema.safeParse(entry).success,
    );
    const desired = classesForSchoolLevels(levels, names);

    const existing = await tx.classLevel.findMany({
      select: { id: true, name: true, isActive: true },
    });
    const byName = new Map(existing.map((row) => [row.name.toLowerCase(), row]));

    let created = 0;
    for (const cls of desired) {
      const found = byName.get(cls.name.toLowerCase());
      if (found === undefined) {
        await tx.classLevel.create({
          data: {
            name: cls.name,
            numericOrder: cls.numericOrder,
            isActive: true,
          } as never,
        });
        created += 1;
        continue;
      }
      if (!found.isActive) {
        await tx.classLevel.update({
          where: { id: found.id },
          data: { isActive: true },
        });
      }
    }

    return created;
  }
}
