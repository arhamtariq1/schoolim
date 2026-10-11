'use client';

import type { ReactNode } from 'react';

import { SearchIcon } from '../icons';

export interface ListPageToolbarProps {
  searchQuery: string;
  onSearchQueryChange: (value: string) => void;
  searchPlaceholder: string;
  searchAriaLabel: string;
  filters?: ReactNode;
}

/** Search on the left, filters on the right — shared list screens. */
export function ListPageToolbar({
  searchQuery,
  onSearchQueryChange,
  searchPlaceholder,
  searchAriaLabel,
  filters,
}: ListPageToolbarProps) {
  return (
    <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
      <div className="relative min-w-0 w-full lg:max-w-sm">
        <SearchIcon
          className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
          aria-hidden="true"
        />
        <input
          type="search"
          value={searchQuery}
          onChange={(event) => {
            onSearchQueryChange(event.target.value);
          }}
          placeholder={searchPlaceholder}
          aria-label={searchAriaLabel}
          className="h-10 w-full rounded-md border border-border bg-background ps-9 pe-3 text-sm focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        />
      </div>
      {filters === undefined ? null : (
        <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-end lg:shrink-0 xl:flex-nowrap">
          {filters}
        </div>
      )}
    </div>
  );
}
