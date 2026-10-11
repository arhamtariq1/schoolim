/**
 * Shared list-screen URL parsing — paging, sort, and order stay on the server.
 */
export const DEFAULT_LIST_PAGE_SIZE = 20;

export function parseSortOrder(raw: string | string[] | undefined): 'asc' | 'desc' {
  return raw === 'desc' ? 'desc' : 'asc';
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
