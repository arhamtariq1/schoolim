import { z } from 'zod';

import { emailSchema, phoneSchema, schoolSlugSchema, textSchema, timeZoneSchema } from './primitives';
import { uploadSchoolLogoSchema } from './school-logo';

/**
 * The signed-in person's own profile, plus school fields while onboarding.
 *
 * Completing the first-login form sets `profileCompletedAt` on the user and
 * `onboardedAt` on the school, which unlocks the rest of the portal.
 */

export const userProfileSchema = z.object({
  name: z.string(),
  email: emailSchema,
  phone: z.string().nullable(),
  designation: z.string().nullable(),
  avatarUrl: z.string().nullable(),
  profileCompleted: z.boolean(),
  completedAt: z.iso.datetime().nullable(),
  school: z.object({
    name: z.string(),
    slug: z.string(),
    city: z.string().nullable(),
    phone: z.string().nullable(),
    email: z.string().nullable(),
    /** False until the owner finishes the first-login school form. */
    onboarded: z.boolean(),
  }),
});

export type UserProfile = z.infer<typeof userProfileSchema>;

/** Lightweight personal update after onboarding (edit profile). */
export const upsertUserProfileSchema = z
  .object({
    name: textSchema(120),
    phone: phoneSchema,
    designation: textSchema(80).optional(),
    avatarUrl: z.string().url().max(2048).optional().nullable(),
  })
  .strict();

export type UpsertUserProfile = z.infer<typeof upsertUserProfileSchema>;

/**
 * First-login setup: school details + owner profile in one save.
 *
 * Slug may change only while the school is not yet onboarded.
 */
export const completeOnboardingSchema = z
  .object({
    person: z
      .object({
        name: textSchema(120),
        phone: phoneSchema,
        designation: textSchema(80).optional(),
      })
      .strict(),
    school: z
      .object({
        name: textSchema(160),
        slug: schoolSlugSchema,
        city: textSchema(80),
        phone: phoneSchema,
        email: emailSchema,
        timezone: timeZoneSchema.default('Asia/Karachi'),
        locale: z.enum(['en', 'ur']).default('en'),
      })
      .strict(),
    logo: uploadSchoolLogoSchema.optional(),
  })
  .strict();

export type CompleteOnboarding = z.infer<typeof completeOnboardingSchema>;
