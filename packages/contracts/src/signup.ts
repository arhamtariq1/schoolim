import { z } from 'zod';

import { passwordSchema, schoolChoiceSchema } from './auth';
import { uploadSchoolLogoSchema } from './school-logo';
import {
  emailSchema,
  phoneSchema,
  schoolSlugSchema,
  textSchema,
  timeZoneSchema,
} from './primitives';

/**
 * Self-serve signup — ADR-0010.
 *
 * A school creates its own tenant from the marketing site and starts a trial,
 * with no operator in the loop. That is a business-model change as much as a
 * technical one (docs/19 §6 previously described a sales-led motion), and it
 * moves two obligations onto this request:
 *
 * 1. **Terms acceptance is recorded here or nowhere.** With an operator in the
 *    loop there was a person who could attest to it afterwards. There is not
 *    one now, so `acceptedTerms` is a literal `true` — not a boolean with a
 *    default — and the version is captured with it (docs/17 §3).
 * 2. **The subdomain is chosen by a stranger.** Hence `schoolSlugSchema`, which
 *    refuses the reserved names, and a uniqueness check on the server.
 *
 * Everything optional here is genuinely optional: a school signing up at 11pm
 * should not be blocked on its logo or its postal address. Those belong to the
 * onboarding checklist (docs/09 §2), which is a better place to ask.
 */

/** The version of the terms the signup form displayed. Bump on every change. */
export const CURRENT_TERMS_VERSION = '2026-09-01' as const;

/** How long a self-serve trial runs. "One month", stated as days so it is exact. */
export const TRIAL_DAYS = 30;

export const signupRequestSchema = z
  .object({
    school: z.object({
      name: textSchema(160),
      /** Becomes `{slug}.<domain>`. Permanent in practice — say so in the UI. */
      slug: schoolSlugSchema,
      /** Where the school is. One free-text line; not an address parser. */
      city: textSchema(80),
      phone: phoneSchema,
      /** The school's public address, not the owner's login. They often differ. */
      email: emailSchema,
      timezone: timeZoneSchema.default('Asia/Karachi'),
      locale: z.enum(['en', 'ur']).default('en'),
    }),
    owner: z.object({
      name: textSchema(120),
      email: emailSchema,
      password: passwordSchema,
    }),
    /**
     * Literal `true`. A checkbox that can be false is a checkbox that gets a
     * default, and a defaulted acceptance is not an acceptance.
     */
    acceptedTerms: z.literal(true),
    termsVersion: z.string().trim().min(1).max(32),

    /**
     * The school's logo, optional.
     *
     * It travels with signup rather than being uploaded afterwards because
     * there is nowhere to upload it to yet: this request is answered with a
     * handoff to the school's own hostname, so the apex never holds a session
     * that could authenticate a second call. The alternative is to make a
     * school pick their logo again on a settings page they have not seen, for
     * a file they already chose.
     *
     * Being optional is the point. A school that has no file to hand, or is
     * signing up from a phone, skips it and adds it later from Settings.
     */
    logo: uploadSchoolLogoSchema.optional(),
  })
  .strict();

export type SignupRequest = z.infer<typeof signupRequestSchema>;

/**
 * Signup returns a handoff, not a session.
 *
 * Same reason as sign-in on the apex: the school's cookies belong on the
 * school's hostname, and this request arrived on the marketing one. The person
 * lands signed in on their own address without typing the password again.
 */
export const signupResultSchema = z.object({
  school: z.object({ id: z.uuid(), name: z.string(), slug: z.string() }),
  trialEndsAt: z.iso.datetime(),
  continueTo: schoolChoiceSchema,
});

export type SignupResult = z.infer<typeof signupResultSchema>;

/** Live availability check behind the subdomain field. */
export const slugAvailabilitySchema = z.object({
  slug: z.string(),
  available: z.boolean(),
  /** Why not, when not — "reserved" and "taken" need different copy. */
  reason: z.enum(['taken', 'reserved', 'invalid']).optional(),
});

export type SlugAvailability = z.infer<typeof slugAvailabilitySchema>;
