/** Keep digits only; `maxLength` caps the result when given. */
export function digitsOnly(value: string, maxLength?: number): string {
  const digits = value.replace(/\D/g, '');
  return maxLength === undefined ? digits : digits.slice(0, maxLength);
}

/**
 * Digits with at most one decimal point and `places` digits after it — for
 * amounts and marks. Everything else is dropped as you type.
 */
export function decimalOnly(value: string, places = 2): string {
  const cleaned = value.replace(/[^\d.]/g, '');
  const dot = cleaned.indexOf('.');
  if (dot === -1) {
    return cleaned;
  }
  const whole = cleaned.slice(0, dot);
  const fraction = cleaned.slice(dot + 1).replace(/\./g, '').slice(0, places);
  return `${whole}.${fraction}`;
}
