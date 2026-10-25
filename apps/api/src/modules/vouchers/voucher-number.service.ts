import {
  formatGrNo,
  parseGrStart,
  ROUTES,
  updateVoucherNumberSettingsSchema,
  type VoucherNumberSettings,
} from '@ilm/contracts';
import { Body, Controller, Get, Injectable, Put } from '@nestjs/common';

import { type TransactionClient } from '../../prisma';
import { PrismaService } from '../../prisma/prisma.service';
import { BusinessRuleError } from '../../shared/errors/domain-error';
import { RequirePermission } from '../../shared/rbac/rbac.guard';

/**
 * Where a school's fee voucher numbering starts.
 *
 * Mirrors the GR number settings, with the same shape and the same guarantees:
 * the counter is the `number_sequences` row of kind `voucher`, voucher
 * generation refuses to run when there is no row (rather than quietly starting
 * at 1), and a new start has to be higher than every number already issued.
 *
 * Existing schools keep working. Their counter row already exists, and the
 * migration gave it the `FV-` prefix and six digits that every voucher so far
 * has been printed with.
 */
@Injectable()
export class VoucherNumberService {
  constructor(private readonly prisma: PrismaService) {}

  async get(): Promise<VoucherNumberSettings> {
    return this.prisma.tenant(async (tx) => this.read(tx));
  }

  async update(input: string): Promise<VoucherNumberSettings> {
    const start = parseGrStart(input);
    if (start === undefined) {
      throw new BusinessRuleError(
        'VALIDATION_FAILED',
        'Enter a number that ends in digits — for example 1001, FV-000001 or ITGS-F-001.',
      );
    }

    return this.prisma.tenant(async (tx) => {
      // The lock generation takes, so a run cannot slip a number in between the
      // check below and the write.
      await tx.$queryRawUnsafe(
        `SELECT 1 FROM number_sequences WHERE kind = 'voucher' AND school_id = current_school_id() FOR UPDATE`,
      );

      const highest = await highestIssued(tx);
      if (highest !== null && start.number <= highest) {
        throw new BusinessRuleError(
          'BUSINESS_RULE_VIOLATION',
          `Voucher ${String(highest)} has already been issued, so the number has to be ${String(highest + 1)} or higher.`,
        );
      }

      await tx.$queryRawUnsafe(
        `INSERT INTO number_sequences (id, school_id, kind, next_value, prefix, pad, updated_at)
         VALUES (gen_random_uuid(), current_school_id(), 'voucher', $1, $2, $3, now())
         ON CONFLICT (school_id, kind)
         DO UPDATE SET next_value = EXCLUDED.next_value, prefix = EXCLUDED.prefix,
                       pad = EXCLUDED.pad, updated_at = now()`,
        start.number,
        start.prefix,
        start.width,
      );

      return this.read(tx);
    });
  }

  private async read(tx: TransactionClient): Promise<VoucherNumberSettings> {
    const rows = await tx.$queryRawUnsafe<{ next_value: number; prefix: string; pad: number }[]>(
      `SELECT next_value, prefix, pad FROM number_sequences WHERE kind = 'voucher' AND school_id = current_school_id()`,
    );
    const row = rows[0];

    return {
      configured: row !== undefined,
      prefix: row?.prefix ?? '',
      nextNumber: row?.next_value ?? null,
      nextVoucherNo: row === undefined ? null : formatGrNo(row.prefix, row.next_value, row.pad),
      highestIssued: await highestIssued(tx),
    };
  }
}

/** Highest numeric part of any voucher number in this school. */
async function highestIssued(tx: TransactionClient): Promise<number | null> {
  const rows = await tx.$queryRawUnsafe<{ highest: string | null }[]>(
    `SELECT max(substring(voucher_no from '([0-9]{1,9})$')::bigint)::text AS highest FROM fee_vouchers`,
  );
  const highest = rows[0]?.highest;
  return highest === null || highest === undefined ? null : Number(highest);
}

@Controller()
export class VoucherNumberController {
  constructor(private readonly numbers: VoucherNumberService) {}

  @Get(ROUTES.school.voucherNumber)
  @RequirePermission('fees.voucher.read')
  async get(): Promise<{ data: VoucherNumberSettings }> {
    return { data: await this.numbers.get() };
  }

  @Put(ROUTES.school.voucherNumber)
  @RequirePermission('settings.school.configure')
  async update(@Body() body: unknown): Promise<{ data: VoucherNumberSettings }> {
    const input = updateVoucherNumberSettingsSchema.parse(body);
    return { data: await this.numbers.update(input.startingNumber) };
  }
}
