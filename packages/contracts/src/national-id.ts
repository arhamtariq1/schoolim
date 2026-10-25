import { z } from 'zod';

/**
 * Format typed digits as a Pakistani CNIC or B-Form number, `XXXXX-XXXXXXX-X`.
 *
 * Non-digits are dropped and anything past 13 digits is ignored, so it can run
 * on every keystroke and on a pasted value alike.
 */
export function formatCnic(input: string): string {
  const digits = input.replace(/\D/g, '').slice(0, 13);
  if (digits.length <= 5) {
    return digits;
  }
  if (digits.length <= 12) {
    return `${digits.slice(0, 5)}-${digits.slice(5)}`;
  }
  return `${digits.slice(0, 5)}-${digits.slice(5, 12)}-${digits.slice(12)}`;
}

/**
 * Exactly 13 digits. Hyphens are normalised, so `3520212345671` is accepted and
 * stored as `35202-1234567-1`.
 */
export function nationalIdSchema(label: string) {
  return z
    .string()
    .trim()
    .transform(formatCnic)
    .refine((value) => /^\d{5}-\d{7}-\d$/.test(value), {
      message: `${label} must be 13 digits, like 35202-1234567-1.`,
    });
}
