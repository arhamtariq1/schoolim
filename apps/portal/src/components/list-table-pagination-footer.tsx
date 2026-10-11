'use client';

import { Pagination, SimpleSelect } from '@ilm/ui';
import { RowsPerPageIcon } from '@ilm/ui/icons';

const DEFAULT_PAGE_SIZES = [
  { value: '20', label: '20 per page' },
  { value: '50', label: '50 per page' },
  { value: '100', label: '100 per page' },
] as const;

export interface ListTablePaginationFooterProps {
  readonly total: number;
  readonly limit: number;
  readonly offset: number;
  /** Noun for “Showing … students/vouchers”. */
  readonly label: string;
  readonly onPageChange: (offset: number) => void;
  readonly onLimitChange: (limit: string) => void;
}

/** Matches Fee Vouchers: summary left, rows-per-page right. */
export function ListTablePaginationFooter({
  total,
  limit,
  offset,
  label,
  onPageChange,
  onLimitChange,
}: ListTablePaginationFooterProps) {
  if (total === 0) {
    return null;
  }

  return (
    <div className="flex flex-col gap-3 border-t border-border px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
      <Pagination
        total={total}
        limit={limit}
        offset={offset}
        label={label}
        className="border-0 pt-0"
        onChange={onPageChange}
      />
      <SimpleSelect
        className="w-full sm:w-36"
        ariaLabel="Rows per page"
        value={String(limit)}
        triggerIcon={RowsPerPageIcon}
        options={[...DEFAULT_PAGE_SIZES]}
        onValueChange={onLimitChange}
      />
    </div>
  );
}
