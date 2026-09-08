import { fromDecimalString, type MinorUnits } from '@ilm/utils';

/**
 * A rupee amount typed into a form, as integer paisa.
 *
 * `Math.round(Number(value) * 100)` is the obvious version and it is banned for
 * good reason (ADR-0007): it routes money through a float, so 4999.99 becomes
 * 499998.99999999994 and rounds back by luck rather than by rule. Under it,
 * some amounts are a paisa wrong and nobody finds out until a year-end total
 * does not reconcile.
 *
 * `fromDecimalString` parses the digits instead, with no float involved at any
 * point. It is strict, so this wraps it: a half-typed box is `undefined`, not
 * an exception thrown at whoever is typing.
 */
export function rupeesToMinor(value: string): MinorUnits | undefined {
  const trimmed = value.trim();
  if (trimmed === '') {
    return undefined;
  }

  try {
    return fromDecimalString(trimmed);
  } catch {
    // More than two decimal places, letters, a stray minus — all of which a
    // person can produce mid-keystroke.
    return undefined;
  }
}
