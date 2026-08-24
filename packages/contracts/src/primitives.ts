import { z } from 'zod';

/**
 * Primitive schemas shared by every contract in this package.
 *
 * docs/12 R7: validation happens at every boundary using the *same* schema, so
 * a rule such as "money is an integer" is written once here rather than
 * re-derived in each endpoint.
 */

/** Identifiers are UUIDv7 in the database; the contract only asserts the shape. */
export const idSchema = z.uuid();

/**
 * Money on the wire.
 *
 * ADR-0007: integer minor units, never a float, never a preformatted string.
 * The bounds mirror `numeric(14,2)` so an out-of-range amount is rejected at
 * the edge rather than by the database three layers in.
 */
export const MAX_MINOR_UNITS = 99_999_999_999_999;
export const MIN_MINOR_UNITS = -99_999_999_999_999;

export const minorUnitsSchema = z.int().min(MIN_MINOR_UNITS).max(MAX_MINOR_UNITS);

/** Money that can never be negative: a fee, a payment, a balance owed. */
export const positiveMinorUnitsSchema = z.int().min(0).max(MAX_MINOR_UNITS);

/** A percentage in basis points. 10,000 bps is 100%; keeps floats off the wire. */
export const basisPointsSchema = z.int().min(0).max(10_000);

/** `YYYY-MM-DD`, no time, no timezone. See docs/03 section 8. */
export const calendarDateSchema = z.iso.date();

/** An instant, always serialised as UTC ISO-8601. */
export const instantSchema = z.iso.datetime();

/** `YYYY-MM`, the key naming a billing period and a monthly partition. */
export const monthKeySchema = z
  .string()
  .regex(/^\d{4}-(?:0[1-9]|1[0-2])$/, 'expected a YYYY-MM month key');

/**
 * Trim and lower-case *before* validating: `z.email().trim()` would register
 * the format check first and then reject "  head@school.pk  " for the
 * whitespace a person actually typed.
 */
export const emailSchema = z.string().trim().toLowerCase().pipe(z.email().max(254));

/**
 * Phone numbers are stored E.164 so a number is comparable across the SMS
 * provider, the WhatsApp provider and a guardian typing it at the front desk.
 * Normalisation from local formats happens in the service, not here.
 */
export const phoneSchema = z
  .string()
  .trim()
  .regex(/^\+[1-9]\d{7,14}$/, 'expected an E.164 phone number, for example +923001234567');

/** URL-safe identifier used for school subdomains. */
export const slugSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(2)
  .max(63)
  .regex(/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/, 'expected a lowercase alphanumeric slug');

/** A trimmed string that must actually contain something. */
export const nonEmptyString = z.string().trim().min(1);

/** Free-text a person typed: trimmed, length-capped, never unbounded. */
export function textSchema(max: number) {
  return z.string().trim().min(1).max(max);
}

/** A reason string attached to an audited or irreversible action. */
export const reasonSchema = z.string().trim().min(3).max(500);

/** IANA timezone. Schools operate in one; `Asia/Karachi` is the default. */
export const timeZoneSchema = nonEmptyString.max(64);

/**
 * A key that makes a non-idempotent POST safe to retry (docs/11 section 7).
 * Mandatory on payments, voucher generation, bulk sends and imports.
 */
export const idempotencyKeySchema = z.string().trim().min(16).max(255);
