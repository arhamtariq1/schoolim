import { ROUTES, type ParentChildSummary } from '@ilm/contracts';
import { cookies } from 'next/headers';
import { cache } from 'react';

import { apiFetch } from '@/lib/api';
import { selectedChildFromCookie } from '@/lib/parent-child-selection';

export interface ParentChildren {
  /** Every child linked to the signed-in guardian; empty when the list failed. */
  kids: ParentChildSummary[];
  /**
   * The one child the parent pages are narrowed to, or undefined for "all".
   * A parent with a single child always has that child selected.
   */
  selected: ParentChildSummary | undefined;
  /** The API's message when the list could not be read. */
  error?: string;
}

/**
 * The signed-in parent's children and the one the header filter has chosen.
 *
 * Cached per request, so the shell and the page under it share one call.
 */
export const loadParentChildren = cache(async (): Promise<ParentChildren> => {
  const list = await apiFetch<{ data: ParentChildSummary[] }>(ROUTES.parent.children);
  if (!list.ok) {
    return { kids: [], selected: undefined, error: list.message };
  }
  const kids = list.data.data;
  const selected = kids.length === 1 ? kids[0] : selectedChildFromCookie(await cookies(), kids);
  return { kids, selected };
});
