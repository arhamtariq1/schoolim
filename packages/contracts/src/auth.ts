import { z } from 'zod';

import { emailSchema, idSchema, nonEmptyString } from './primitives';
import { SCHOOL_ROLES } from './roles';

/**
 * Authentication contracts.
 *
 * docs/09 section 2: sign-in takes an email or phone plus a password, and the
 * **school is resolved from the subdomain** — never from a school picker, which
 * would leak the tenant list to anyone who loaded the page.
 */

export const loginRequestSchema = z
  .object({
    /** Email or phone. Normalised server-side; the shape is not asserted here
     *  because a person typing their phone number at a front desk should not be
     *  rejected by a regex before the password is even checked. */
    identifier: nonEmptyString.max(254),
    password: nonEmptyString.max(256),
    /** Extends the refresh token lifetime on a device the user trusts. */
    rememberDevice: z.boolean().default(false),
  })
  .strict();

export type LoginRequest = z.infer<typeof loginRequestSchema>;

/**
 * What a signed-in session looks like to the client.
 *
 * **No tokens appear here.** They travel in httpOnly cookies (docs/11 s8), so a
 * token readable by script is a token any XSS can exfiltrate.
 */
export const sessionUserSchema = z.object({
  id: idSchema,
  name: z.string(),
  email: emailSchema,
  roles: z.array(z.enum(SCHOOL_ROLES)),
  /** Every permission the held roles grant, so the UI can build navigation. */
  permissions: z.array(z.string()),
  mustChangePassword: z.boolean(),
  school: z.object({
    id: idSchema,
    name: z.string(),
    slug: z.string(),
    timezone: z.string(),
    locale: z.string(),
  }),
});

export type SessionUser = z.infer<typeof sessionUserSchema>;

export const forgotPasswordRequestSchema = z.object({ email: emailSchema }).strict();
export type ForgotPasswordRequest = z.infer<typeof forgotPasswordRequestSchema>;

/**
 * Password rules.
 *
 * Length first, composition rules deliberately absent. NIST 800-63B: forced
 * character classes push people toward `Password1!` and a rejected paste, and
 * both make passwords worse, not better.
 */
export const passwordSchema = z
  .string()
  .min(12, 'Use at least 12 characters — a short phrase is easier to remember and harder to guess.')
  .max(256);

export const resetPasswordRequestSchema = z
  .object({
    token: nonEmptyString,
    password: passwordSchema,
  })
  .strict();

export type ResetPasswordRequest = z.infer<typeof resetPasswordRequestSchema>;

export const acceptInviteRequestSchema = z
  .object({
    token: nonEmptyString,
    name: nonEmptyString.max(120),
    password: passwordSchema,
  })
  .strict();

export type AcceptInviteRequest = z.infer<typeof acceptInviteRequestSchema>;
