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
 * Self-serve signup — ADR-0010, three steps.
 *
 * 1. **Credentials** — name, email, password. Terms accepted. An OTP is mailed.
 * 2. **OTP** — proves the address before a tenant exists.
 * 3. **School** — name, slug, city, phone, school email, optional logo. Creates
 *    the tenant and signs the owner in via handoff (ADR-0009).
 *
 * Progress is an opaque httpOnly cookie (`COOKIES.signupToken`), not a school
 * session: there is no school yet. The password is hashed on step 1 and never
 * returns to the browser.
 */

/** The version of the terms the signup form displayed. Bump on every change. */
export const CURRENT_TERMS_VERSION = '2026-09-01' as const;

/** How long a self-serve trial runs. "One month", stated as days so it is exact. */
export const TRIAL_DAYS = 30;

/** Six digits. Typed by a person reading their mail, not pasted from a URL. */
export const signupOtpSchema = z
  .string()
  .trim()
  .regex(/^\d{6}$/, 'Enter the 6-digit code from your email.');

/**
 * Step 1 — create the signup intent and send the OTP.
 *
 * `confirmPassword` is validated here so the browser and the API agree; only
 * `password` is stored (hashed). `acceptedTerms` is a literal `true` — a
 * defaulted tick is not an acceptance (docs/17 §3).
 */
export const signupStartRequestSchema = z
  .object({
    name: textSchema(120),
    email: emailSchema,
    password: passwordSchema,
    confirmPassword: z.string().min(1, 'Confirm your password.'),
    acceptedTerms: z.literal(true),
    termsVersion: z.string().trim().min(1).max(32),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.password !== value.confirmPassword) {
      ctx.addIssue({
        code: 'custom',
        path: ['confirmPassword'],
        message: 'Passwords do not match.',
      });
    }
  });

export type SignupStartRequest = z.infer<typeof signupStartRequestSchema>;

export const signupStartResultSchema = z.object({
  email: emailSchema,
  /** When the current OTP stops working. ISO datetime. */
  otpExpiresAt: z.iso.datetime(),
});

export type SignupStartResult = z.infer<typeof signupStartResultSchema>;

export const signupVerifyOtpRequestSchema = z
  .object({
    code: signupOtpSchema,
  })
  .strict();

export type SignupVerifyOtpRequest = z.infer<typeof signupVerifyOtpRequestSchema>;

export const signupVerifyOtpResultSchema = z.object({
  email: emailSchema,
  verified: z.literal(true),
});

export type SignupVerifyOtpResult = z.infer<typeof signupVerifyOtpResultSchema>;

export const signupResendOtpResultSchema = z.object({
  sent: z.boolean(),
  otpExpiresAt: z.iso.datetime().optional(),
  retryAfterSeconds: z.number().int().min(0).optional(),
});

export type SignupResendOtpResult = z.infer<typeof signupResendOtpResultSchema>;

/**
 * Step 3 — the school itself.
 *
 * Owner identity comes from the verified intent; it is not re-submitted.
 */
export const signupCompleteRequestSchema = z
  .object({
    school: z.object({
      name: textSchema(160),
      slug: schoolSlugSchema,
      city: textSchema(80),
      phone: phoneSchema,
      email: emailSchema,
      timezone: timeZoneSchema.default('Asia/Karachi'),
      locale: z.enum(['en', 'ur']).default('en'),
    }),
    logo: uploadSchoolLogoSchema.optional(),
  })
  .strict();

export type SignupCompleteRequest = z.infer<typeof signupCompleteRequestSchema>;

export const signupResultSchema = z.object({
  school: z.object({ id: z.uuid(), name: z.string(), slug: z.string() }),
  trialEndsAt: z.iso.datetime(),
  continueTo: schoolChoiceSchema,
});

export type SignupResult = z.infer<typeof signupResultSchema>;

/**
 * Where the browser should send someone who already holds a signup cookie.
 *
 * `otp` — email not yet confirmed. `school` — confirmed, school form next.
 */
export const signupStatusSchema = z.object({
  email: emailSchema,
  step: z.enum(['otp', 'school']),
});

export type SignupStatus = z.infer<typeof signupStatusSchema>;

/** Live availability check behind the subdomain field. */
export const slugAvailabilitySchema = z.object({
  slug: z.string(),
  available: z.boolean(),
  reason: z.enum(['taken', 'reserved', 'invalid']).optional(),
});

export type SlugAvailability = z.infer<typeof slugAvailabilitySchema>;

/**
 * @deprecated One-shot signup body. Kept only so older e2e helpers typecheck
 * during the cutover; the public route no longer accepts it.
 */
export const signupRequestSchema = z
  .object({
    school: z.object({
      name: textSchema(160),
      slug: schoolSlugSchema,
      city: textSchema(80),
      phone: phoneSchema,
      email: emailSchema,
      timezone: timeZoneSchema.default('Asia/Karachi'),
      locale: z.enum(['en', 'ur']).default('en'),
    }),
    owner: z.object({
      name: textSchema(120),
      email: emailSchema,
      password: passwordSchema,
    }),
    acceptedTerms: z.literal(true),
    termsVersion: z.string().trim().min(1).max(32),
    logo: uploadSchoolLogoSchema.optional(),
  })
  .strict();

export type SignupRequest = z.infer<typeof signupRequestSchema>;
