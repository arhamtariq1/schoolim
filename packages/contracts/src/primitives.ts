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

export const minorUnitsSchema = z
  .int('Enter an amount.')
  .min(MIN_MINOR_UNITS, 'That amount is too large.')
  .max(MAX_MINOR_UNITS, 'That amount is too large.');

/** Money that can never be negative: a fee, a payment, a balance owed. */
export const positiveMinorUnitsSchema = z
  .int('Enter an amount, for example 6000.')
  .min(0, 'This cannot be negative.')
  .max(MAX_MINOR_UNITS, 'That amount is too large.');

/**
 * Money that must actually be an amount — strictly greater than zero.
 *
 * `positiveMinorUnitsSchema` above permits zero, which is right for a balance
 * or a total but wrong for anything a person types into an amount box: a
 * zero-rupee deposit, refund or fee increase is not a small transaction, it is
 * a mistake. The database says `CHECK (amount > 0)` for exactly those columns,
 * so without this the request passes validation and fails at the constraint —
 * a 500 for what is plainly a 400.
 */
export const nonZeroMinorUnitsSchema = positiveMinorUnitsSchema.min(
  1,
  'Enter an amount greater than zero.',
);

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
/**
 * Messages are written for the person reading them, never left to the library.
 *
 * Zod's default for an empty required field is "Too small: expected string to
 * have >=1 characters", and it reached a receptionist's screen under a form
 * input. Every message below is what someone should actually be told, and
 * because these primitives are shared, fixing them here fixes every form
 * (docs/11 §4: `detail` is written for a school accountant, not a developer).
 */
export const nonEmptyString = z.string().trim().min(1, 'This cannot be empty.');

/** Free-text a person typed: trimmed, length-capped, never unbounded. */
export function textSchema(max: number) {
  return z
    .string()
    .trim()
    .min(1, 'This is required.')
    .max(max, `Keep this under ${String(max)} characters.`);
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

/**
 * Hostnames a school must never be able to claim as its subdomain.
 *
 * This is not cosmetic. `api.<domain>` and `admin.<domain>` are real hosts in
 * this product, and a school that claimed one would shadow them. The rest are
 * the marketing and account routes that live on the apex, plus the usual mail
 * and infrastructure names — a school called "mail" would quietly break its own
 * password-reset delivery for the whole platform.
 *
 * It lives in `@ilm/contracts` rather than in the API because **three** callers
 * need the identical answer: the signup form checking as someone types, the
 * signup endpoint checking before it writes, and the platform console creating
 * a school by hand. Two copies of this list is one copy that drifts.
 */
export const RESERVED_SLUGS: ReadonlySet<string> = new Set([
  // Infrastructure hosts that already exist or will.
  'api',
  'admin',
  'app',
  'cdn',
  'static',
  'assets',
  'mail',
  'smtp',
  'imap',
  'ftp',
  'ns1',
  'ns2',
  'mx',
  'status',
  'internal',
  'test',
  'staging',
  'dev',
  'preview',
  // Apex routes: marketing, sign-up and account.
  'www',
  'welcome',
  'home',
  'signup',
  'signin',
  'login',
  'logout',
  'register',
  'pricing',
  'plans',
  'packages',
  'about',
  'contact',
  'demo',
  'blog',
  'docs',
  'help',
  'support',
  'legal',
  'terms',
  'privacy',
  'security',
  'billing',
  'account',
  'accounts',
  'dashboard',
  'auth',
  'go',
]);

/**
 * A slug that is actually usable as a school's address.
 *
 * `slugSchema` says the characters are legal. This says the name is available
 * *in principle* — the uniqueness check is a database question and stays on the
 * server, but "reserved" is a fixed list and can be answered at the edge, which
 * is what lets the signup form say so before the person has finished typing.
 */
export const schoolSlugSchema = slugSchema.refine((value) => !RESERVED_SLUGS.has(value), {
  message: 'That short name is reserved. Try another.',
});
