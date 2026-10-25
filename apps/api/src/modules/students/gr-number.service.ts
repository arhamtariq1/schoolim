import {
  formatGrNo,
  grNumericPart,
  parseGrStart,
  ROUTES,
  updateGrNumberSettingsSchema,
  type GrNumberSettings,
} from '@ilm/contracts';
import { Body, Controller, Get, Injectable, Put } from '@nestjs/common';

import { type TransactionClient } from '../../prisma';
import { PrismaService } from '../../prisma/prisma.service';
import { BusinessRuleError } from '../../shared/errors/domain-error';
import { RequirePermission } from '../../shared/rbac/rbac.guard';

/**
 * Where a school's GR numbering starts, and what the next admission receives.
 *
 * The counter is the `number_sequences` row of kind `gr`, the same one
 * admission has always taken numbers from. What changed is that **the row is no
 * longer created by the first admission**: it exists only once an administrator
 * has chosen a starting number, and an admission with no row is refused. See
 * `grNumberSettingsSchema` for why a default of 1 would be wrong.
 *
 * Existing schools are unaffected. They already have the row, with an empty
 * prefix, so they are "configured" from the day this ships at whatever number
 * they had reached.
 */
@Injectable()
export class GrNumberService {
  constructor(private readonly prisma: PrismaService) {}

  async get(): Promise<GrNumberSettings> {
    return this.prisma.tenant(async (tx) => this.read(tx));
  }

  /**
   * Choose where numbering starts (or move it forward).
   *
   * The new number has to be **higher than every GR already issued** — including
   * for children who have since left, because a register number is never
   * reused. Only the numeric part is compared, whatever the prefix: the roll
   * number is that part, and two children must not share one. That rule is what
   * makes a duplicate impossible from this screen, and it is checked under the
   * same lock admission takes, so an admission racing the save cannot slip a
   * number in between.
   */
  async update(input: string): Promise<GrNumberSettings> {
    const start = parseGrStart(input);
    if (start === undefined) {
      throw new BusinessRuleError(
        'VALIDATION_FAILED',
        'Enter a number that ends in digits — for example 1001, A-1001 or ITGS-F-001.',
      );
    }

    return this.prisma.tenant(async (tx) => {
      // Take the counter's row lock first (a no-op when there is no row yet).
      await tx.$queryRawUnsafe(
        `SELECT 1 FROM number_sequences WHERE kind = 'gr' AND school_id = current_school_id() FOR UPDATE`,
      );

      const highest = await highestIssued(tx);
      if (highest !== null && start.number <= highest) {
        throw new BusinessRuleError(
          'BUSINESS_RULE_VIOLATION',
          `GR ${String(highest)} has already been issued, so the number has to be ${String(highest + 1)} or higher.`,
        );
      }

      await tx.$queryRawUnsafe(
        `INSERT INTO number_sequences (id, school_id, kind, next_value, prefix, pad, updated_at)
         VALUES (gen_random_uuid(), current_school_id(), 'gr', $1, $2, $3, now())
         ON CONFLICT (school_id, kind)
         DO UPDATE SET next_value = EXCLUDED.next_value, prefix = EXCLUDED.prefix,
                       pad = EXCLUDED.pad, updated_at = now()`,
        start.number,
        start.prefix,
        // The width it was typed with: 001 carries on as 002, 1001 as 1002.
        start.width,
      );

      return this.read(tx);
    });
  }

  private async read(tx: TransactionClient): Promise<GrNumberSettings> {
    const rows = await tx.$queryRawUnsafe<{ next_value: number; prefix: string; pad: number }[]>(
      `SELECT next_value, prefix, pad FROM number_sequences WHERE kind = 'gr' AND school_id = current_school_id()`,
    );
    const row = rows[0];

    return {
      configured: row !== undefined,
      prefix: row?.prefix ?? '',
      nextNumber: row?.next_value ?? null,
      nextGrNo: row === undefined ? null : formatGrNo(row.prefix, row.next_value, row.pad),
      highestIssued: await highestIssued(tx),
    };
  }
}

/** Highest numeric part of any GR in this school, deleted students included. */
async function highestIssued(tx: TransactionClient): Promise<number | null> {
  const rows = await tx.$queryRawUnsafe<{ gr_no: string }[]>(
    `SELECT gr_no FROM students WHERE gr_no ~ '[0-9]+$'`,
  );

  let highest: number | null = null;
  for (const row of rows) {
    const value = grNumericPart(row.gr_no);
    if (value !== undefined && (highest === null || value > highest)) {
      highest = value;
    }
  }
  return highest;
}

@Controller()
export class GrNumberController {
  constructor(private readonly grNumbers: GrNumberService) {}

  // Readable by whoever admits students, because the admission form has to know
  // whether numbering is set up; only the administrator may change it.
  @Get(ROUTES.school.grNumber)
  @RequirePermission('students.student.create')
  async get(): Promise<{ data: GrNumberSettings }> {
    return { data: await this.grNumbers.get() };
  }

  @Put(ROUTES.school.grNumber)
  @RequirePermission('settings.school.configure')
  async update(@Body() body: unknown): Promise<{ data: GrNumberSettings }> {
    const input = updateGrNumberSettingsSchema.parse(body);
    return { data: await this.grNumbers.update(input.startingNumber) };
  }
}
