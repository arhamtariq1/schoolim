import { z } from 'zod';

import { listQuery } from './pagination';
import { emailSchema, idSchema, instantSchema, nonEmptyString, slugSchema } from './primitives';
import { PLATFORM_ROLES, type PlatformRole } from './roles';

/**
 * Platform console contracts.
 *
 * A separate namespace from the school portal in every sense that matters: its
 * own table (`platform_users`), its own cookies, its own token type and its own
 * roles. A tenant token can never satisfy a platform route and vice versa
 * (docs/04 §6), and keeping the contracts apart is the first half of that —
 * nothing here shares a schema with `auth.ts`, so the two cannot drift into
 * accidentally accepting each other's payloads.
 */

/** The roles themselves live in `roles.ts` alongside the school roles, so the
 *  two sets are visible together and cannot silently overlap. */
export const platformRoleSchema = z.enum(PLATFORM_ROLES);

/**
 * What each platform role may do.
 *
 * Narrow on purpose. SUPPORT exists to answer a school's question, not to
 * change what it is paying; BILLING exists to fix an invoice, not to rename a
 * school. Only SUPER_ADMIN creates or suspends a tenant.
 */
export const PLATFORM_CAPABILITIES = {
  SUPER_ADMIN: ['schools.read', 'schools.create', 'schools.update', 'schools.changeStatus'],
  SUPPORT: ['schools.read'],
  BILLING: ['schools.read', 'schools.changeStatus'],
} as const satisfies Record<PlatformRole, readonly string[]>;

export function platformCan(role: PlatformRole, capability: string): boolean {
  return (PLATFORM_CAPABILITIES[role] as readonly string[]).includes(capability);
}

export const platformLoginSchema = z
  .object({
    email: emailSchema,
    password: nonEmptyString.max(256),
  })
  .strict();

export type PlatformLogin = z.infer<typeof platformLoginSchema>;

/**
 * The signed-in platform user. No tokens, for the same reason as `SessionUser`.
 */
export const platformSessionSchema = z.object({
  id: idSchema,
  name: z.string(),
  email: emailSchema,
  role: platformRoleSchema,
  capabilities: z.array(z.string()),
});

export type PlatformSession = z.infer<typeof platformSessionSchema>;

export const SCHOOL_STATUSES = ['TRIAL', 'ACTIVE', 'PAST_DUE', 'SUSPENDED', 'CHURNED'] as const;

export const schoolStatusSchema = z.enum(SCHOOL_STATUSES);
export type SchoolStatus = z.infer<typeof schoolStatusSchema>;

export const schoolListItemSchema = z.object({
  id: idSchema,
  name: z.string(),
  slug: z.string(),
  city: z.string().nullable(),
  status: schoolStatusSchema,
  /** What the console is actually for: is anyone using this school yet? */
  studentCount: z.int().min(0),
  userCount: z.int().min(0),
  createdAt: instantSchema,
});

export type SchoolListItem = z.infer<typeof schoolListItemSchema>;

export const schoolListQuerySchema = listQuery(
  ['name', 'slug', 'createdAt', 'studentCount'] as const,
  { status: schoolStatusSchema.optional() },
  'createdAt',
);

export type SchoolListQuery = z.infer<typeof schoolListQuerySchema>;

/**
 * Creating a school.
 *
 * The slug is the tenant's address forever — `<slug>.<domain>` is printed on
 * letters, saved as a bookmark and typed from memory — so it is chosen
 * deliberately here rather than derived from the name, and it can never be
 * edited afterwards without breaking every link a school has handed out.
 *
 * The owner account is created in the same request. A school with no way in is
 * not a school anyone can use, and making it two steps is how a tenant ends up
 * provisioned and unreachable.
 */
export const createSchoolSchema = z
  .object({
    name: nonEmptyString.max(160),
    slug: slugSchema,
    city: nonEmptyString.max(80).optional(),
    /** Defaults suit Pakistan; both are overridable per school, not per code. */
    timezone: nonEmptyString.max(64).default('Asia/Karachi'),
    locale: nonEmptyString.max(16).default('en'),

    owner: z
      .object({
        name: nonEmptyString.max(120),
        email: emailSchema,
      })
      .strict(),
  })
  .strict();

export type CreateSchool = z.infer<typeof createSchoolSchema>;

/**
 * The result of creating a school.
 *
 * `temporaryPassword` is returned **once**, at creation, and never stored in
 * readable form or shown again. Until there is an outbound mail service this is
 * how an owner gets their first sign-in; the account is flagged
 * `mustChangePassword`, so it is single-use in practice.
 */
export const createSchoolResultSchema = z.object({
  school: schoolListItemSchema,
  loginUrl: z.string(),
  owner: z.object({
    email: emailSchema,
    temporaryPassword: z.string(),
  }),
});

export type CreateSchoolResult = z.infer<typeof createSchoolResultSchema>;

/**
 * A slug that is already taken, checked as the operator types.
 *
 * This is the one place a tenant's existence is deliberately disclosed, and it
 * is safe because the caller is already an authenticated platform user. It is
 * never exposed on a public route — that is what would hand over the customer
 * list.
 */
export const slugAvailabilitySchema = z.object({
  slug: z.string(),
  available: z.boolean(),
});

export const changeSchoolStatusSchema = z
  .object({
    status: schoolStatusSchema,
    reason: nonEmptyString.max(300),
  })
  .strict();

export type ChangeSchoolStatus = z.infer<typeof changeSchoolStatusSchema>;
