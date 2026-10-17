'use client';

import { useCallback, useSyncExternalStore } from 'react';

/**
 * A list's row selection that survives moving between its pages.
 *
 * ## Why not `useState`
 *
 * A paginated list here is a server page whose page number is in the URL.
 * Changing `?offset=` re-renders the route segment, and the App Router keys a
 * page by its search params — so the client component under it remounts and
 * any `useState` selection is gone. "Select all 152" followed by "next page"
 * showed nothing ticked, which is the bug this exists for.
 *
 * So the selection lives in module state, outside the tree, for the life of
 * the tab.
 *
 * ## Scoped to the filters
 *
 * Each selection remembers the `scope` it was made under — the list's filters,
 * without paging or sort. Paging and re-sorting keep it: the same rows are
 * still matched, only shown differently. Changing a filter does not: ids picked
 * under "Class 1" are not a selection of "Class 2", and keeping them would
 * print, pay or delete rows the person can no longer see.
 */

interface Entry {
  readonly scope: string;
  readonly ids: ReadonlySet<string>;
}

const EMPTY: ReadonlySet<string> = new Set();
const entries = new Map<string, Entry>();
const listeners = new Set<() => void>();

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/**
 * @param name  Which list — one selection per list, so two tables never share.
 * @param scope What the selection was made under; a different scope reads as empty.
 */
export function useScopedSelection(
  name: string,
  scope: string,
): readonly [ReadonlySet<string>, (next: ReadonlySet<string>) => void] {
  const getSnapshot = useCallback(() => {
    const entry = entries.get(name);
    return entry !== undefined && entry.scope === scope ? entry.ids : EMPTY;
  }, [name, scope]);

  const selected = useSyncExternalStore(subscribe, getSnapshot, () => EMPTY);

  const setSelected = useCallback(
    (next: ReadonlySet<string>) => {
      entries.set(name, { scope, ids: next });
      for (const listener of listeners) {
        listener();
      }
    },
    [name, scope],
  );

  return [selected, setSelected] as const;
}

/** The part of a list's query string that decides which rows match — not paging, not order. */
export function selectionScope(params: URLSearchParams, ignore: readonly string[] = []): string {
  const skip = new Set(['offset', 'limit', 'sort', 'order', ...ignore]);
  return [...params.entries()]
    .filter(([key]) => !skip.has(key))
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${value}`)
    .join('&');
}
