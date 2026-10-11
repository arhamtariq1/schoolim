'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * Local search box state that commits to the URL (or parent fetch) after a quiet
 * period — standard for list screens.
 */
export function useDebouncedSearch(
  queryFromUrl: string,
  onApply: (value: string) => void,
  delayMs = 400,
): { searchQuery: string; onSearchQueryChange: (value: string) => void } {
  const [searchQuery, setSearchQuery] = useState(queryFromUrl);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    setSearchQuery(queryFromUrl);
  }, [queryFromUrl]);

  useEffect(() => {
    return () => {
      if (timer.current !== undefined) {
        clearTimeout(timer.current);
      }
    };
  }, []);

  function onSearchQueryChange(value: string) {
    setSearchQuery(value);
    if (timer.current !== undefined) {
      clearTimeout(timer.current);
    }
    timer.current = setTimeout(() => {
      onApply(value);
    }, delayMs);
  }

  return { searchQuery, onSearchQueryChange };
}
