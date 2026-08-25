import type { ReactNode } from 'react';

import { cn } from '../lib/cn';

import { TableSkeleton } from './skeleton';
import { EmptyState, ErrorState, NoResultsState } from './states';

/**
 * The one table.
 *
 * docs/16 §9: **every list in this product is one `<DataTable>`** with column
 * definitions. Building a bespoke table is a review rejection — not for
 * tidiness, but because sorting, empty states, sticky headers, the mobile card
 * fallback and keyboard behaviour then have to be got right ~40 times instead
 * of once.
 *
 * The states are not optional decoration. A list has four resting states —
 * loading, first-use empty, no-results empty, error — and the previous portal's
 * single most common gap was handling only the happy path. They are parameters
 * here so a call site cannot silently omit one.
 */

export interface Column<TRow> {
  /** Stable key, also used for the sort parameter. */
  readonly key: string;
  readonly header: string;
  readonly render: (row: TRow) => ReactNode;
  /** Right-align money and counts so columns line up on the decimal point. */
  readonly align?: 'start' | 'end';
  /** Hidden below `md`, where the row becomes a card. */
  readonly hideOnMobile?: boolean;
  readonly sortable?: boolean;
}

export interface DataTableProps<TRow> {
  readonly rows: readonly TRow[];
  readonly columns: readonly Column<TRow>[];
  readonly rowKey: (row: TRow) => string;

  readonly isLoading?: boolean;
  readonly error?: string | undefined;
  readonly onRetry?: (() => void) | undefined;

  /** Shown when the school has no data at all. Must offer the filling action. */
  readonly empty: { title: string; description?: string; action?: ReactNode };
  /** True when filters are active, so "no results" replaces "first use". */
  readonly isFiltered?: boolean;
  readonly onClearFilters?: (() => void) | undefined;

  /** Row click opens the detail. It never mutates (docs/16 §9). */
  readonly onRowClick?: ((row: TRow) => void) | undefined;

  readonly caption?: string;
}

export function DataTable<TRow>({
  rows,
  columns,
  rowKey,
  isLoading = false,
  error,
  onRetry,
  empty,
  isFiltered = false,
  onClearFilters,
  onRowClick,
  caption,
}: DataTableProps<TRow>) {
  if (error !== undefined) {
    return <ErrorState description={error} {...(onRetry === undefined ? {} : { onRetry })} />;
  }

  if (isLoading) {
    // A skeleton shaped like the real table, never a centred spinner: it lets
    // someone start reading before the data lands and stops the layout jumping.
    return <TableSkeleton columns={columns.length} />;
  }

  if (rows.length === 0) {
    return isFiltered ? (
      <NoResultsState {...(onClearFilters === undefined ? {} : { onClearFilters })} />
    ) : (
      <EmptyState
        title={empty.title}
        {...(empty.description === undefined ? {} : { description: empty.description })}
        {...(empty.action === undefined ? {} : { action: empty.action })}
      />
    );
  }

  return (
    <>
      {/* Desktop. Scrolls INSIDE its own container so the page body never
          scrolls sideways (docs/16 §9). */}
      <div className="hidden overflow-x-auto rounded-xl border border-border md:block">
        <table className="w-full border-collapse text-sm">
          {caption === undefined ? null : <caption className="sr-only">{caption}</caption>}
          <thead className="sticky top-0 bg-muted/50">
            <tr>
              {columns.map((column) => (
                <th
                  key={column.key}
                  scope="col"
                  className={cn(
                    'px-3 py-2 text-xs font-medium whitespace-nowrap text-muted-foreground',
                    column.align === 'end' ? 'text-end' : 'text-start',
                  )}
                >
                  {column.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr
                key={rowKey(row)}
                onClick={
                  onRowClick === undefined
                    ? undefined
                    : () => {
                        onRowClick(row);
                      }
                }
                className={cn(
                  'border-t border-border',
                  onRowClick === undefined ? '' : 'cursor-pointer hover:bg-muted/50',
                )}
              >
                {columns.map((column) => (
                  <td
                    key={column.key}
                    className={cn('px-3 py-2', column.align === 'end' ? 'text-end' : 'text-start')}
                  >
                    {column.render(row)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile: cards, not a horizontally-scrolling table (docs/16 §9). */}
      <ul className="space-y-2 md:hidden">
        {rows.map((row) => (
          <li key={rowKey(row)}>
            <button
              type="button"
              onClick={
                onRowClick === undefined
                  ? undefined
                  : () => {
                      onRowClick(row);
                    }
              }
              disabled={onRowClick === undefined}
              className="w-full rounded-xl border border-border p-3 text-start disabled:cursor-default"
            >
              <dl className="space-y-1">
                {columns
                  .filter((column) => column.hideOnMobile !== true)
                  .map((column) => (
                    <div key={column.key} className="flex items-baseline justify-between gap-3">
                      <dt className="text-xs text-muted-foreground">{column.header}</dt>
                      <dd className="text-sm">{column.render(row)}</dd>
                    </div>
                  ))}
              </dl>
            </button>
          </li>
        ))}
      </ul>
    </>
  );
}
