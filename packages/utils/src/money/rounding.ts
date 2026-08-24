import { invariant } from '../assert';

/**
 * Integer division with banker's rounding (round-half-to-even).
 *
 * ADR-0007 requires that every proportional split round in one documented
 * direction. Half-to-even is chosen over half-up because repeated half-up
 * rounding biases totals upward — across 500 students and twelve months that
 * bias is real money.
 *
 * The intermediate product of two money-scale integers overflows
 * `Number.MAX_SAFE_INTEGER`, so the arithmetic is done in `bigint` and only the
 * result — which is always within money range — returns to `number`.
 *
 * Rounding is symmetric about zero: -2.5 and 2.5 both round to the even
 * neighbour of equal magnitude. A reversing entry (docs/12 R4) therefore rounds
 * to the exact negation of the entry it reverses.
 */
export function divideRoundHalfToEven(numerator: bigint, denominator: bigint): bigint {
  invariant(denominator !== 0n, 'division by zero');

  // Normalise so the denominator is positive; the sign moves to the numerator.
  const positiveDenominator = denominator < 0n ? -denominator : denominator;
  const signedNumerator = denominator < 0n ? -numerator : numerator;

  const isNegative = signedNumerator < 0n;
  const magnitude = isNegative ? -signedNumerator : signedNumerator;

  const quotient = magnitude / positiveDenominator;
  const twiceRemainder = (magnitude % positiveDenominator) * 2n;

  let rounded: bigint;
  if (twiceRemainder > positiveDenominator) {
    rounded = quotient + 1n;
  } else if (twiceRemainder < positiveDenominator) {
    rounded = quotient;
  } else {
    // Exactly halfway: take the even neighbour.
    rounded = quotient % 2n === 0n ? quotient : quotient + 1n;
  }

  return isNegative ? -rounded : rounded;
}
