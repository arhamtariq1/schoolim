import { phoneSchema } from '@ilm/contracts';
import type { ZodError } from 'zod';

import { toE164 } from '@/lib/phone-format';

/** Same copy as signup/login client validation (docs/16 §8). */
export const FORM_VALIDATION_TOAST = 'Check the highlighted fields below.';

export function fieldErrorsFromZod(error: ZodError): Record<string, string> {
  const next: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.join('.');
    if (key === '' || next[key] !== undefined) {
      continue;
    }
    next[key] = humanizeValidationMessage(key, issue.message);
  }
  return next;
}

export function humanizeFieldErrors(errors: Record<string, string>): Record<string, string> {
  const next: Record<string, string> = {};
  for (const [key, message] of Object.entries(errors)) {
    next[key] = humanizeValidationMessage(key, message);
  }
  return next;
}

export function withoutFieldErrors(
  errors: Record<string, string>,
  ...keys: string[]
): Record<string, string> {
  if (keys.every((key) => errors[key] === undefined)) {
    return errors;
  }
  const next = { ...errors };
  for (const key of keys) {
    delete next[key];
  }
  return next;
}

/** Validate a display phone before sending E.164 to the API schema. */
export function phoneDisplayError(display: string): string | undefined {
  const trimmed = display.trim();
  if (trimmed === '') {
    return 'This is required.';
  }
  const e164 = toE164(trimmed);
  if (!phoneSchema.safeParse(e164).success) {
    return 'Enter a valid phone number, for example 03001234567.';
  }
  return undefined;
}

function humanizeValidationMessage(path: string, message: string): string {
  if (
    path.endsWith('phone') ||
    message.includes('E.164') ||
    message.includes('+92300') ||
    message.toLowerCase().includes('phone number')
  ) {
    return 'Enter a valid phone number, for example 03001234567.';
  }
  return message;
}
