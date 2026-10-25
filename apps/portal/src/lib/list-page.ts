/**
 * Shared list-screen URL parsing — paging, sort, and order stay on the server.
 */
export const DEFAULT_LIST_PAGE_SIZE = 20;

export function parseSortOrder(raw: string | string[] | undefined): 'asc' | 'desc' {
  return raw === 'desc' ? 'desc' : 'asc';
}

/**
 * Order for a list that opens newest-first.
 *
 * With no `sort` and no `order` in the address the person has chosen nothing, so
 * the default applies: a school looks at what just happened — the vouchers
 * issued this morning, the child admitted yesterday — not at the oldest row on
 * page one. Once they click a column the order is in the URL and is respected.
 */
export function parseNewestFirstOrder(params: {
  readonly [key: string]: string | string[] | undefined;
}): 'asc' | 'desc' {
  return params['order'] === undefined && params['sort'] === undefined
    ? 'desc'
    : parseSortOrder(params['order']);
}

export function parseSortField<T extends string>(
  raw: string | string[] | undefined,
  allowed: readonly T[],
  fallback: T,
): T {
  const value = typeof raw === 'string' ? raw : '';
  return (allowed as readonly string[]).includes(value) ? (value as T) : fallback;
}

/** Next sort params when a column header is toggled. */
export function nextSortParams(
  currentKey: string,
  currentOrder: 'asc' | 'desc',
  toggledKey: string,
): { sort: string; order: 'asc' | 'desc' } {
  if (currentKey === toggledKey) {
    return { sort: toggledKey, order: currentOrder === 'asc' ? 'desc' : 'asc' };
  }
  return { sort: toggledKey, order: 'asc' };
}
