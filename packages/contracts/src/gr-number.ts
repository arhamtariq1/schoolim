import { z } from 'zod';

/**
 * GR number settings — where a school's General Register numbering starts.
 *
 * ## Why nothing is generated until this is set
 *
 * The GR number is the entry in a register a school is legally bound to keep,
 * and every school already has one running: a school moving onto the product in
 * its ninth year is on GR 4,213, not GR 1. A default of 1 would quietly issue
 * numbers that collide with children already in the paper register, and nobody
 * would notice until two of them were looked up. So the first admission is
 * refused until the administrator has said where the numbering starts.
 *
 * ## Letters
 *
 * Schools print registers like `A-1001` or `GR/0457`, so the starting number
 * may carry a prefix of letters. The prefix is fixed and the number after it
 * counts up. The **roll number is the numeric part** — one number per child — so
 * the digits, not the letters, are what must never repeat.
 */

/** Large enough for any real register, small enough to be safe as a Postgres int. */
export const MAX_GR_NUMBER = 99_999_999;

/** Longest prefix accepted. A limit on length only — what the prefix says is the school's business. */
const MAX_PREFIX_LENGTH = 30;

/**
 * Split what an administrator typed into its prefix and its number.
 *
 * **Any pattern**: the number is the run of digits at the very end, and
 * everything before it — letters, hyphens, slashes, spaces, more digits — is the
 * prefix, kept exactly as typed. `ITGS-F-001` is prefix `ITGS-F-` and number 1,
 * written with three digits; `2026/A-17` is prefix `2026/A-`. The only
 * requirement is that it ends in digits, because that is the part that counts
 * up.
 */
export function parseGrStart(
  input: string,
): { prefix: string; number: number; width: number } | undefined {
  const text = input.trim();
  const match = /(\d+)$/.exec(text);
  if (match === null) {
    return undefined;
  }

  const digits = match[1] ?? '';
  const prefix = text.slice(0, match.index);
  const number = Number(digits);
  if (digits.length > 8 || number < 1 || number > MAX_GR_NUMBER || prefix.length > MAX_PREFIX_LENGTH) {
    return undefined;
  }

  return { prefix, number, width: digits.length };
}

/** A number as printed: the prefix, then the digits padded to `pad` (four unless told). */
export function formatGrNo(prefix: string, number: number, pad = 4): string {
  return `${prefix}${String(number).padStart(pad, '0')}`;
}

/** The numeric part of a stored GR number — which is also the roll number. */
export function grNumericPart(grNo: string): number | undefined {
  const match = /(\d+)$/.exec(grNo);
  return match === null ? undefined : Number(match[1]);
}

export const grNumberSettingsSchema = z.object({
  /** False until an administrator has chosen a starting number. */
  configured: z.boolean(),
  prefix: z.string(),
  /** The number the next admission will receive. Null while unconfigured. */
  nextNumber: z.int().nullable(),
  /** The next GR number as it will be printed, prefix included. */
  nextGrNo: z.string().nullable(),
  /** The highest numeric part already issued, or null if none. */
  highestIssued: z.int().nullable(),
});

export type GrNumberSettings = z.infer<typeof grNumberSettingsSchema>;

export const updateGrNumberSettingsSchema = z
  .object({
    startingNumber: z
      .string('Enter the starting GR number.')
      .trim()
      .refine((value) => parseGrStart(value) !== undefined, {
        message:
          'Enter a number that ends in digits — for example 1001, A-1001 or ITGS-F-001 (up to 8 digits at the end).',
      }),
  })
  .strict();

export type UpdateGrNumberSettings = z.infer<typeof updateGrNumberSettingsSchema>;
