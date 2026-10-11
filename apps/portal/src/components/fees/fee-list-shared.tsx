'use client';

import { StudentsIcon } from '@ilm/ui/icons';
import { useEffect, useRef, useState, type ReactNode } from 'react';

/** Shared table cell padding for Fees list screens (vouchers, defaulters, etc.). */
export const FEE_LIST_TABLE_CELL = {
  headerClassName: 'whitespace-nowrap px-3 py-2.5',
  cellClassName: 'whitespace-nowrap px-3 py-2.5',
} as const;

export type FeeListTableHeaderIcon = typeof StudentsIcon;

export function feeListTableHeader(
  label: string,
  Icon?: FeeListTableHeaderIcon,
  leading?: ReactNode,
): ReactNode {
  return (
    <div className="flex items-center gap-2">
      {leading}
      {Icon === undefined ? null : (
        <Icon className="size-4 shrink-0 opacity-80" aria-hidden />
      )}
      <span className="text-xs leading-none font-medium text-muted-foreground">{label}</span>
    </div>
  );
}

export function useDebouncedSearchFilter(
  queryFromUrl: string,
  onApply: (value: string) => void,
  delayMs = 350,
): { searchQuery: string; onSearchQueryChange: (value: string) => void } {
  const [searchQuery, setSearchQuery] = useState(queryFromUrl);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    setSearchQuery(queryFromUrl);
  }, [queryFromUrl]);

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

export function afterMenuAction(action: () => void): void {
  action();
  const swallow = (event: MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
  };
  document.addEventListener('click', swallow, true);
  window.setTimeout(() => {
    document.removeEventListener('click', swallow, true);
  }, 100);
}
