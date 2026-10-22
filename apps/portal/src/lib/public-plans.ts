import { publicPlanSchema, ROUTES, type PublicPlan } from '@ilm/contracts';
import { z } from 'zod';

/**
 * The plans the landing page shows, read from the platform console's data.
 *
 * Prices and plan details are edited by an operator in the admin console, so
 * nothing here (or in the page) hardcodes one. The response is re-validated
 * with the shared schema, because this is a boundary: a malformed reply must
 * degrade to "no plans" rather than crash the public page.
 *
 * `revalidate` bounds how stale the page can be after an edit.
 */
export const PLANS_REVALIDATE_SECONDS = 30;

const responseSchema = z.object({ data: z.array(publicPlanSchema) });

/** Undefined when the plans could not be loaded, so the page can say so honestly. */
export async function getPublicPlans(): Promise<PublicPlan[] | undefined> {
  const base = process.env['API_URL'] ?? 'http://localhost:4000';

  try {
    const response = await fetch(`${base}${ROUTES.public.plans}`, {
      next: { revalidate: PLANS_REVALIDATE_SECONDS },
    });
    if (!response.ok) {
      return undefined;
    }
    const parsed = responseSchema.safeParse(await response.json());
    return parsed.success ? parsed.data.data : undefined;
  } catch {
    return undefined;
  }
}
