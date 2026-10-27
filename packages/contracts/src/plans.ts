import { z } from 'zod';

import { idSchema, instantSchema, nonEmptyString } from './primitives';

/**
 * Subscription plans: what a school can buy.
 *
 * Plans are **data, not code** (docs/15 D2: pricing is undecided). The platform
 * console edits them, the public landing page reads them, and nothing in the
 * codebase hardcodes a price or a plan name. Money is integer minor units on
 * the wire; the database column is `numeric(14,2)`.
 */

/**
 * Paying for a year at once takes 10% off twelve monthly payments (decision D2,
 * 2026-10-27). In basis points, so the yearly price is computed with
 * `percentageOfMoney` and its documented rounding rather than a float.
 */
export const ANNUAL_DISCOUNT_BPS = 1000;

export const BILLING_CYCLES = ['MONTHLY', 'YEARLY'] as const;
export const billingCycleSchema = z.enum(BILLING_CYCLES);
export type BillingCycle = z.infer<typeof billingCycleSchema>;

/** Largest price accepted: Rs 100 million, far beyond any real plan and well inside numeric(14,2). */
export const MAX_PLAN_PRICE_MINOR = 10_000_000_000;
export const MAX_PLAN_FEATURES = 12;

/** Stable identifier used in URLs and by later subscriptions. Never edited. */
export const planCodeSchema = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-z][a-z0-9-]{1,30}$/, 'Use 2-31 lowercase letters, numbers or hyphens, starting with a letter.');

const featureSchema = nonEmptyString.max(120);

const planFields = {
  name: nonEmptyString.max(60),
  /** One line under the name: who the plan is for. */
  tagline: z.string().trim().max(120).default(''),
  priceMinor: z.int().min(0).max(MAX_PLAN_PRICE_MINOR),
  billingCycle: billingCycleSchema.default('MONTHLY'),
  /** Null means no limit. */
  studentCap: z.int().min(1).max(1_000_000).nullable().default(null),
  features: z
    .array(featureSchema)
    .max(MAX_PLAN_FEATURES)
    .default([])
    .transform((list) => [...new Set(list)]),
  /** Shown on the public landing page. */
  isPublic: z.boolean().default(true),
  /** Highlighted as the plan most schools pick. At most one plan holds this. */
  isRecommended: z.boolean().default(false),
  sortOrder: z.int().min(0).max(1000).default(0),
};

export const createPlanSchema = z.object({ code: planCodeSchema, ...planFields }).strict();
export type CreatePlan = z.infer<typeof createPlanSchema>;

/** The code cannot change: it is how a subscription will point at the plan. */
export const updatePlanSchema = z.object(planFields).strict();
export type UpdatePlan = z.infer<typeof updatePlanSchema>;

export const planSchema = z.object({
  id: idSchema,
  code: z.string(),
  name: z.string(),
  tagline: z.string(),
  priceMinor: z.int().min(0),
  billingCycle: billingCycleSchema,
  studentCap: z.int().nullable(),
  features: z.array(z.string()),
  isPublic: z.boolean(),
  isRecommended: z.boolean(),
  sortOrder: z.int(),
  archivedAt: instantSchema.nullable(),
  createdAt: instantSchema,
  updatedAt: instantSchema,
});
export type Plan = z.infer<typeof planSchema>;

/** What the landing page may see: no ids, no timestamps, no archived plans. */
export const publicPlanSchema = planSchema.pick({
  code: true,
  name: true,
  tagline: true,
  priceMinor: true,
  billingCycle: true,
  studentCap: true,
  features: true,
  isRecommended: true,
});
export type PublicPlan = z.infer<typeof publicPlanSchema>;
