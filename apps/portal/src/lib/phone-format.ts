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
