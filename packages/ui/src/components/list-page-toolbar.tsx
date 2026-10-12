'use client';

import type { ReactNode } from 'react';

import { SearchIcon } from '../icons';
import { cn } from '../lib/cn';

export interface ListPageToolbarProps {
  searchQuery: string;
  onSearchQueryChange: (value: string) => void;
  searchPlaceholder: string;
  searchAriaLabel: string;
  filters?: ReactNode;
  /** Override max width of the search field (e.g. narrow toolbar beside many filters). */
  searchClassName?: string;
}

/** Search on the left, filters on the right — shared list screens. */
export function ListPageToolbar({
  searchQuery,
  onSearchQueryChange,
  searchPlaceholder,
  searchAriaLabel,
  filters,
  searchClassName,
}: ListPageToolbarProps) {
  return (
    <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
      <div
        className={cn(
          'relative min-w-0 w-full shrink-0 md:max-w-md lg:max-w-xl',
          searchClassName,
        )}
      >
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
        <div className="flex min-w-0 flex-nowrap items-center gap-2 overflow-x-auto md:ms-auto md:justify-end md:overflow-visible [&>*]:shrink-0">
          {filters}
        </div>
      )}
    </div>
  );
}
