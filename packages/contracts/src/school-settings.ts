import { z } from 'zod';

import { emailSchema, phoneSchema, textSchema, timeZoneSchema } from './primitives';

/**
 * The school's own details — what it is called, where it is, how to reach it.
 *
 * These are set once during first-login onboarding and then never again, which
 * was the gap: a school that mistyped its name, moved premises, changed its
 * landline or registered a legal entity had no way to say so. Everything here
 * is printed on a challan, a receipt or a report header, so a wrong value is
 * wrong on paper that leaves the building.
 *
 * ## What is deliberately not editable
 *
 * - **The web address (slug).** Signup calls it permanent and means it: it is
 *   the hostname every member of staff signs in on, and session cookies are
 *   host-only (ADR-0009), so changing it signs out the entire school mid-day
 *   and invalidates every bookmark and every link in every email already sent.
 *   It is returned here to be *shown*, not to be edited.
 * - **Currency and country.** Every amount already recorded was recorded in the
 *   school's currency. Changing the label afterwards does not convert anything;
 *   it silently restates the meaning of every historical voucher and payment.
 * - **Status and plan.** Those belong to the platform console — a school
 *   suspended for non-payment must not be able to unsuspend itself.
 *
 * The logo is its own endpoint (`ROUTES.schoolLogo`) because it is bytes rather
 * than JSON, but it is edited on the same screen.
 */

/** What the settings screen renders. Includes fields it shows but cannot change. */
export const schoolSettingsSchema = z.object({
  name: z.string(),
  legalName: z.string().nullable(),
  /** Read-only. Shown so a school can see the address it signs in on. */
  slug: z.string(),
  address: z.string().nullable(),
  city: z.string().nullable(),
  phone: z.string().nullable(),
  email: z.string().nullable(),
  timezone: z.string(),
  locale: z.string(),
  /** Read-only. See the note above on why money's unit cannot be relabelled. */
  currency: z.string(),
  country: z.string(),
});

export type SchoolSettings = z.infer<typeof schoolSettingsSchema>;

/**
 * The editable half.
 *
 * `name`, `city`, `phone` and `email` are required because onboarding already
 * demanded them and they appear on every challan — letting them be cleared
 * later would mean a school could quietly print a challan with no way to
 * contact it. `legalName` and `address` are optional because a single-campus
 * school with no registered entity genuinely has neither, and an empty string
 * is stored as `null` rather than as a blank that sorts and prints differently.
 */
export const updateSchoolSettingsSchema = z
  .object({
    name: textSchema(160),
    /** The registered entity, when it differs from the trading name. */
    legalName: optionalTextSchema(200),
    /** Street address. Multi-line — it goes on letterhead as typed. */
    address: optionalTextSchema(240),
    city: textSchema(80),
    phone: phoneSchema,
    email: emailSchema,
    timezone: timeZoneSchema,
    locale: z.enum(['en', 'ur']),
  })
  .strict();

export type UpdateSchoolSettings = z.infer<typeof updateSchoolSettingsSchema>;

/**
 * Text a person may legitimately leave blank.
 *
 * `textSchema(n).nullable()` would be wrong here: clearing an input sends `""`,
 * not `null`, and that would be rejected with "This is required." beside a
 * field the form itself calls optional. Both spellings of "nothing" collapse to
 * `null` so the column has one representation of absent rather than two that
 * sort, compare and print differently.
 */
function optionalTextSchema(max: number) {
  return z
    .string()
    .trim()
    .max(max, `Keep this under ${String(max)} characters.`)
    .nullable()
    .transform((value) => (value === null || value === '' ? null : value));
}
