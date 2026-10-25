import { phoneSchema } from '@ilm/contracts';
import type { ZodError } from 'zod';

import { phoneInputError, toE164 } from '@/lib/phone-format';

export {
  FORM_VALIDATION_TOAST,
  NETWORK_ERROR_TOAST,
  showApiErrorToast,
  showFormValidationToast,
  showNetworkErrorToast,
} from '@ilm/ui';

/** Maps Zod paths from reset-password schema to form field names. */
export function fieldErrorsFromResetPassword(error: ZodError): Record<string, string> {
  const next = fieldErrorsFromZod(error);
  if (next.confirmPassword !== undefined) {
    next.confirm = next.confirmPassword;
    delete next.confirmPassword;
  }
  return next;
}

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

/**
 * Namespace a flat set of field errors, e.g. `phone` → `school.phone`.
 *
 * Two forms on one screen can own a field of the same name — a person has a
 * phone and so does their school — and the settings API answers with the flat
 * key its own schema uses. Without a prefix the school's phone field fell back
 * to reading the bare `phone`, so leaving your *own* number blank printed "This
 * is required" under the school's contact number as well.
 */
export function prefixFieldErrors(
  errors: Record<string, string>,
  prefix: string,
): Record<string, string> {
  const next: Record<string, string> = {};
  for (const [key, message] of Object.entries(errors)) {
    next[key.startsWith(`${prefix}.`) ? key : `${prefix}.${key}`] = message;
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
  const inputError = phoneInputError(trimmed);
  if (inputError !== undefined) {
    return inputError;
  }
  const e164 = toE164(trimmed);
  if (!phoneSchema.safeParse(e164).success) {
    return 'Enter a valid phone number, for example 03001234567.';
  }
  return undefined;
}

function humanizeValidationMessage(path: string, message: string): string {
  if (
    message === 'This cannot be empty.' ||
    message === 'This field is required.' ||
    message === 'This is required.'
  ) {
    return 'This field is required.';
  }
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
