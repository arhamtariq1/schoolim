/** Show a stored E.164 number without the +92 prefix when it is a PK mobile. */
export function displayPhone(value: string): string {
  if (value.startsWith('+92') && value.length === 13) {
    return `0${value.slice(3)}`;
  }
  return value;
}

/** Digits, spaces, and an optional leading +. Letters are stripped as you type. */
export function phoneDigits(value: string): string {
  const cleaned = value.replace(/[^\d+\s]/g, '');
  const plus = cleaned.startsWith('+') ? '+' : '';
  const rest = cleaned.replace(/\+/g, '');
  return plus + rest;
}

/**
 * Pakistani numbers are written `0300 1234567` on forms; storage is E.164.
 * Local shapes (03…, 3XXXXXXXXX, 92…) are converted; +… is kept as typed.
 */
export function toE164(input: string): string {
  const trimmed = input.trim();
  if (trimmed === '') {
    return '';
  }

  const compact = trimmed.replace(/[\s()-]/g, '');
  if (compact.startsWith('+')) {
    return compact;
  }

  const digits = compact.replace(/\D/g, '');
  if (digits === '') {
    return trimmed;
  }

  if (digits.startsWith('0')) {
    return `+92${digits.slice(1)}`;
  }
  if (digits.startsWith('92')) {
    return `+${digits}`;
  }
  return `+92${digits}`;
}

/** Longest phone number a form accepts, in digits. */
export const PHONE_MAX_DIGITS = 13;

/** Digits only, capped at {@link PHONE_MAX_DIGITS}. Everything else is dropped as you type. */
export function sanitizePhoneInput(value: string): string {
  return value.replace(/\D/g, '').slice(0, PHONE_MAX_DIGITS);
}

/**
 * The one phone rule for every form: digits only, starts with 03 or 02, at most
 * 13 digits. Returns a message, or `undefined` when the value is fine. An empty
 * value is only an error when `required` is set.
 */
export function phoneInputError(
  value: string,
  { required = true }: { readonly required?: boolean } = {},
): string | undefined {
  const trimmed = value.trim();
  if (trimmed === '') {
    return required ? 'This field is required.' : undefined;
  }
  if (!/^\d+$/.test(trimmed)) {
    return 'Use digits only, for example 03001234567.';
  }
  if (trimmed.length === 1 ? trimmed !== '0' : !/^0[23]/.test(trimmed)) {
    return 'Phone number must start with 03 or 02.';
  }
  if (trimmed.length > PHONE_MAX_DIGITS) {
    return `Phone number can be at most ${String(PHONE_MAX_DIGITS)} digits.`;
  }
  if (trimmed.length < 10) {
    return 'Phone number is too short. Enter at least 10 digits.';
  }
  if (trimmed.startsWith('03') && trimmed.length !== 11) {
    return 'Mobile numbers have 11 digits, for example 03001234567.';
  }
  return undefined;
}

/**
 * Real-time variant: stays quiet while somebody is still typing a valid
 * prefix (too short is not an error yet), and speaks as soon as a character
 * makes the number unsalvageable.
 */
export function livePhoneError(value: string): string | undefined {
  const trimmed = value.trim();
  if (trimmed === '') {
    return undefined;
  }
  const error = phoneInputError(trimmed, { required: false });
  if (error === undefined) {
    return undefined;
  }
  const stillTyping = error.includes('too short') || error.startsWith('Mobile numbers');
  return stillTyping && trimmed.length < 11 ? undefined : error;
}
