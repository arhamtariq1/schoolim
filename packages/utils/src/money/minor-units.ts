import { invariant } from '../assert';
import { type Brand } from '../types/brand';

import { divideRoundHalfToEven } from './rounding';

/**
 * An exact amount of money in **minor units** (paisa).
 *
 * ADR-0007: money is `numeric(14,2)` in PostgreSQL and an integer number of
 * paisa in application code. The brand makes a bare `number` unassignable, so a
 * rupee value cannot silently reach a paisa field.
 *
 * Every field holding one of these ends in `Minor` (docs/12 section 2).
 */
export type MinorUnits = Brand<number, 'MinorUnits'>;

/**
 * `numeric(14,2)` holds twelve digits before the decimal point, so the largest
 * representable amount is 999,999,999,999.99 — 99,999,999,999,999 paisa. That
 * is comfortably inside `Number.MAX_SAFE_INTEGER` (~9.007e15), which is the
 * reason minor units can be a `number` at all rather than a `bigint`.
 */
export const MAX_MINOR_UNITS = 99_999_999_999_999;
export const MIN_MINOR_UNITS = -99_999_999_999_999;

/** 100 paisa to the rupee. Named so the intent is never a bare literal. */
const MINOR_UNITS_PER_MAJOR = 100n;

/** One basis point is 0.01%; 10,000 bps is 100%. */
export const BASIS_POINTS_SCALE = 10_000n;

export const ZERO_MINOR = 0 as MinorUnits;

/**
 * Construct minor units from an integer, rejecting anything the database could
 * not store. This is the only sanctioned way into the type.
 */
export function minorUnits(value: number): MinorUnits {
  invariant(Number.isInteger(value), `money must be a whole number of paisa, received ${value}`);
  invariant(
    value >= MIN_MINOR_UNITS && value <= MAX_MINOR_UNITS,
    `money out of range for numeric(14,2): ${value}`,
  );
  return value as MinorUnits;
}

export function isMinorUnits(value: number): value is MinorUnits {
  return Number.isInteger(value) && value >= MIN_MINOR_UNITS && value <= MAX_MINOR_UNITS;
}

// --- Boundary conversion ----------------------------------------------------
// Prisma returns `numeric` as a Decimal. It is converted here, in the mapper
// layer, and never escapes the data layer as a Decimal (ADR-0007).

const DECIMAL_PATTERN = /^-?\d{1,12}(?:\.\d{1,2})?$/;

/**
 * Parse an exact decimal string, as PostgreSQL `numeric(14,2)` renders it, into
 * minor units. String parsing, never float division, so 0.1 stays 0.1.
 */
export function fromDecimalString(value: string): MinorUnits {
  const trimmed = value.trim();
  invariant(DECIMAL_PATTERN.test(trimmed), `not a numeric(14,2) value: "${value}"`);

  const isNegative = trimmed.startsWith('-');
  const unsigned = isNegative ? trimmed.slice(1) : trimmed;
  const [whole = '0', fraction = ''] = unsigned.split('.');
  const paisa = BigInt(whole) * MINOR_UNITS_PER_MAJOR + BigInt(fraction.padEnd(2, '0'));

  return minorUnits(Number(isNegative ? -paisa : paisa));
}

/**
 * Render minor units as an exact decimal string for writing to `numeric(14,2)`.
 * Built by string manipulation rather than division by 100, so no float is
 * involved at any point.
 */
export function toDecimalString(amount: MinorUnits): string {
  // Widened out of the brand: unary minus is not defined on a branded number.
  const value: number = amount;
  const isNegative = value < 0;
  const digits = (isNegative ? -value : value).toString().padStart(3, '0');
  const whole = digits.slice(0, -2);
  const fraction = digits.slice(-2);
  return `${isNegative ? '-' : ''}${whole}.${fraction}`;
}

// --- Arithmetic -------------------------------------------------------------
// Every operation re-validates through `minorUnits`, so an overflow surfaces at
// the operation that caused it rather than at the eventual database write.

export function addMoney(a: MinorUnits, b: MinorUnits): MinorUnits {
  return minorUnits(a + b);
}

export function subtractMoney(a: MinorUnits, b: MinorUnits): MinorUnits {
  return minorUnits(a - b);
}

export function negateMoney(amount: MinorUnits): MinorUnits {
  const value: number = amount;
  return minorUnits(-value);
}

export function sumMoney(amounts: readonly MinorUnits[]): MinorUnits {
  return minorUnits(amounts.reduce<number>((total, amount) => total + amount, 0));
}

export function absMoney(amount: MinorUnits): MinorUnits {
  const value: number = amount;
  return value < 0 ? minorUnits(-value) : amount;
}

/** Multiply by a whole number, e.g. a per-unit fee times a quantity. */
export function multiplyMoney(amount: MinorUnits, factor: number): MinorUnits {
  invariant(Number.isInteger(factor), `factor must be a whole number, received ${factor}`);
  return minorUnits(amount * factor);
}

/**
 * Scale by an exact ratio, rounding once, half-to-even.
 *
 * Used for pro-rata fees. Prefer `allocateMoney` whenever the parts must sum
 * back to a known whole — this function rounds each call independently.
 */
export function multiplyByRatio(
  amount: MinorUnits,
  numerator: number,
  denominator: number,
): MinorUnits {
  invariant(Number.isInteger(numerator), 'ratio numerator must be a whole number');
  invariant(Number.isInteger(denominator), 'ratio denominator must be a whole number');
  invariant(denominator !== 0, 'ratio denominator must not be zero');

  const scaled = divideRoundHalfToEven(BigInt(amount) * BigInt(numerator), BigInt(denominator));
  return minorUnits(Number(scaled));
}

/**
 * A percentage of an amount, expressed in **basis points** so the caller never
 * passes a float. 12.5% is 1250 bps.
 *
 * ADR-0007: a percentage discount rounds exactly once, and it rounds here.
 */
export function percentageOfMoney(amount: MinorUnits, basisPoints: number): MinorUnits {
  invariant(Number.isInteger(basisPoints), 'basis points must be a whole number');
  invariant(basisPoints >= 0, 'basis points must not be negative');

  const scaled = divideRoundHalfToEven(BigInt(amount) * BigInt(basisPoints), BASIS_POINTS_SCALE);
  return minorUnits(Number(scaled));
}

// --- Comparison -------------------------------------------------------------

export function isZeroMoney(amount: MinorUnits): boolean {
  return amount === 0;
}

export function isNegativeMoney(amount: MinorUnits): boolean {
  return amount < 0;
}

export function isPositiveMoney(amount: MinorUnits): boolean {
  return amount > 0;
}

/** Negative when `a` is smaller; suitable for `Array.prototype.sort`. */
export function compareMoney(a: MinorUnits, b: MinorUnits): number {
  return a - b;
}

export function maxMoney(a: MinorUnits, b: MinorUnits): MinorUnits {
  return a >= b ? a : b;
}

export function minMoney(a: MinorUnits, b: MinorUnits): MinorUnits {
  return a <= b ? a : b;
}

/** Clamp to zero. A balance must not go negative just because a payment overshot. */
export function clampToZero(amount: MinorUnits): MinorUnits {
  return amount < 0 ? ZERO_MINOR : amount;
}
