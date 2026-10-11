'use client';

import { useDebouncedSearch } from '@ilm/ui';
import { StudentsIcon } from '@ilm/ui/icons';
import type { ReactNode } from 'react';

/** Shared table cell padding for Fees list screens (vouchers, defaulters, etc.). */
export const FEE_LIST_TABLE_CELL = {
  headerClassName: 'whitespace-nowrap px-3 py-2.5',
  cellClassName: 'whitespace-nowrap px-3 py-2.5',
} as const;

/** Checkbox column — same padding in header and body so controls line up. */
export const FEE_LIST_SELECT_COLUMN = {
  headerClassName: 'whitespace-nowrap ps-4 pe-5 py-2.5',
  cellClassName: 'whitespace-nowrap ps-4 pe-5 py-2.5',
} as const;

/** Fixed-size box so header and row checkboxes share one vertical axis. */
export function feeListSelectCheckboxWrap(
  checkbox: ReactNode,
  options?: { readonly stopRowClick?: boolean },
): ReactNode {
  return (
    <span
      className="inline-flex size-4 shrink-0 items-center justify-center"
      {...(options?.stopRowClick === true ? { 'data-stop-row-click': true } : {})}
    >
      {checkbox}
    </span>
  );
}

const CLASS_BADGE_TONES = ['success', 'info', 'warning', 'danger', 'neutral'] as const;

export type ClassBadgeTone = (typeof CLASS_BADGE_TONES)[number];

/** Stable accent per class name for list tables. */
export function classBadgeTone(className: string | null | undefined): ClassBadgeTone {
  if (className === null || className === undefined || className.trim() === '') {
    return 'neutral';
  }
  let hash = 0;
  for (const char of className) {
    hash = (hash + char.charCodeAt(0)) % CLASS_BADGE_TONES.length;
  }
  return CLASS_BADGE_TONES[hash] ?? 'neutral';
}

export function splitStudentDisplayName(fullName: string): { firstName: string; lastName: string } {
  const parts = fullName.trim().split(/\s+/).filter((part) => part !== '');
  if (parts.length === 0) {
    return { firstName: '', lastName: '' };
  }
  if (parts.length === 1) {
    return { firstName: parts[0] ?? '', lastName: '' };
  }
  return { firstName: parts[0] ?? '', lastName: parts.slice(1).join(' ') };
}

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

/** @deprecated Import {@link useDebouncedSearch} from `@ilm/ui` instead. */
export function useDebouncedSearchFilter(
  queryFromUrl: string,
  onApply: (value: string) => void,
  delayMs = 400,
): ReturnType<typeof useDebouncedSearch> {
  return useDebouncedSearch(queryFromUrl, onApply, delayMs);
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
