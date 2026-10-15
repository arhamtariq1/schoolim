import { z } from 'zod';

import { parseGrStart } from './gr-number';

/**
 * Voucher number settings — where a school's fee voucher numbering starts.
 *
 * The same reasoning as the GR number: a school that has been issuing vouchers
 * on paper is not on voucher 1, and a default would hand out numbers that are
 * already on challans in parents' hands. Nothing is generated until an
 * administrator says where it starts.
 *
 * The format is the one GR numbers use — any prefix, then digits at the end — and
 * the digits keep the width they were typed with, so `FV-000001` continues as
 * `FV-000002`, `ITGS-F-001` as `ITGS-F-002` and `1001` as `1002`.
 */

export const voucherNumberSettingsSchema = z.object({
  /** False until an administrator has chosen a starting number. */
  configured: z.boolean(),
  prefix: z.string(),
  nextNumber: z.int().nullable(),
  /** The next voucher number as it will be printed. */
  nextVoucherNo: z.string().nullable(),
  /** The highest numeric part already issued, or null if none. */
  highestIssued: z.int().nullable(),
});

export type VoucherNumberSettings = z.infer<typeof voucherNumberSettingsSchema>;

export const updateVoucherNumberSettingsSchema = z
  .object({
    startingNumber: z
      .string('Enter the starting voucher number.')
      .trim()
      .refine((value) => parseGrStart(value) !== undefined, {
        message:
          'Enter a number that ends in digits — for example 1001, FV-000001 or ITGS-F-001 (up to 8 digits at the end).',
      }),
  })
  .strict();

export type UpdateVoucherNumberSettings = z.infer<typeof updateVoucherNumberSettingsSchema>;
