import { z } from 'zod';

import { emailSchema, idSchema, nonEmptyString } from './primitives';
import { SCHOOL_ROLES } from './roles';

/**
 * Authentication contracts.
 *
 * docs/09 section 2 and ADR-0009: sign-in takes an email or phone plus a
 * password, and **never asks which school**. On a school's own hostname the
 * tenant is already in the address. On the apex there is no address to read, so
 * the school is resolved from the credentials — but only *after* the password
 * has been verified, which is why `LoginOutcome` is a union rather than a
 * session.
 *
 * The rule that shape enforces: nothing about which schools exist, or which
 * school an email belongs to, is observable before a correct password. A picker
 * offered *before* sign-in would hand the tenant list to anyone who loaded the
 * page; a picker offered *after* reveals only what the person just proved they
 * already had.
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
  /**
   * Has this person proved they can read mail at `email`? ADR-0012.
   *
   * A boolean here rather than the timestamp the database stores: the shell
   * needs to decide whether to show a banner, and the exact moment of
   * confirmation is an audit question, not a rendering one.
   */
  emailVerified: z.boolean(),
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

/**
 * One school a set of credentials just unlocked.
 *
 * `continueUrl` is absolute and points at the school's **own** hostname,
 * carrying a single-use handoff token. It has to be absolute: the session
 * cookie is host-only by design (docs/04, `COOKIE_DOMAIN` deliberately unset),
 * so the apex physically cannot set a cookie the school host will send. The
 * browser has to arrive there and be issued its own.
 */
export const schoolChoiceSchema = z.object({
  schoolId: idSchema,
  name: z.string(),
  slug: z.string(),
  continueUrl: z.url(),
});

export type SchoolChoice = z.infer<typeof schoolChoiceSchema>;

/**
 * What a correct password produces.
 *
 * Two shapes, because sign-in happens in two places:
 *
 * - **`session`** — on a school's hostname. The tenant was never in question,
 *   the cookies are already set on this origin, and the client just renders.
 * - **`handoff`** — on the apex. The school (or schools) came out of the
 *   credentials, and the browser must now be sent to the right hostname to be
 *   issued cookies there. One choice redirects; several render a picker.
 *
 * A failed sign-in is neither: it is the same generic error it has always been,
 * so nothing here is reachable without a verified password.
 */
export const loginOutcomeSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('session'), user: sessionUserSchema }),
  z.object({ kind: z.literal('handoff'), choices: z.array(schoolChoiceSchema).min(1) }),
]);

export type LoginOutcome = z.infer<typeof loginOutcomeSchema>;

/**
 * Redeem a handoff token for a real session, on the school's own hostname.
 *
 * Single-use and short-lived. The token names a user and a school; the endpoint
 * additionally requires the host it arrives on to *be* that school, so a token
 * minted for one school cannot be replayed against another's address.
 */
export const continueRequestSchema = z.object({ token: nonEmptyString.max(512) }).strict();

export type ContinueRequest = z.infer<typeof continueRequestSchema>;

/**
 * Confirm an email address — ADR-0012.
 *
 * Same shape as the handoff and for the same reasons: single-use, hashed,
 * scoped to the school whose hostname it arrives on. The differences are the
 * lifetime (a day, not two minutes — a person reads email on their own
 * schedule) and that following it does not sign anyone in.
 */
export const verifyEmailRequestSchema = z.object({ token: nonEmptyString.max(512) }).strict();

export type VerifyEmailRequest = z.infer<typeof verifyEmailRequestSchema>;

/**
 * The outcome of asking for another confirmation message.
 *
 * `retryAfterSeconds` rather than a bare failure: "wait 43 seconds" is
 * actionable and "could not send" invites a person to keep clicking.
 */
export const resendVerificationResultSchema = z.object({
  sent: z.boolean(),
  retryAfterSeconds: z.number().int().min(0).optional(),
});

export type ResendVerificationResult = z.infer<typeof resendVerificationResultSchema>;
