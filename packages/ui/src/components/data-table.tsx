import { Fragment, type ReactNode } from 'react';

import { cn } from '../lib/cn';

import { Checkbox } from './checkbox';
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

  /**
   * Row selection, for the lists that carry a bulk action.
   *
   * docs/16 §9 asks for a bulk action on every list — anything a school does
   * for one student, they need for five hundred — so this lives here rather
   * than being rebuilt as a checkbox column per screen. Getting it wrong once
   * is a header checkbox that clears a selection the operator made three pages
   * ago.
   *
   * The header checkbox is deliberately **page-scoped**: it ticks the rows in
   * front of you and goes indeterminate when only some are ticked. Selecting
   * everything behind the filter is a different, more dangerous act, and §9
   * requires it to be stated in words with a count — so a screen that offers it
   * does so as its own control, not by overloading this one.
   */
  readonly selection?: {
    readonly selected: ReadonlySet<string>;
    readonly onChange: (next: ReadonlySet<string>) => void;
    /** Names the thing being selected, for the checkbox's accessible label. */
    readonly noun: string;
  };

  /**
   * Detail shown directly beneath a row, when it returns something.
   *
   * For the lists whose rows open rather than navigate — the overdue vouchers
   * behind a defaulter, the lines behind an invoice. Returning `undefined`
   * leaves the row closed, so the caller owns which rows are open and the table
   * owns where the panel goes.
   *
   * It belongs here rather than in the page because "below the whole table" is
   * the wrong place: on a list of fifty, a panel that opens four screens away
   * from the row that opened it is one nobody connects to what they clicked.
   */
  readonly renderExpanded?: ((row: TRow) => ReactNode) | undefined;

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
  selection,
  renderExpanded,
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

  // Page-scoped, so the header checkbox describes the rows actually on screen.
  const pageKeys = rows.map((row) => rowKey(row));
  const pickedOnPage = pageKeys.filter((key) => selection?.selected.has(key) === true).length;
  const allOnPagePicked = pageKeys.length > 0 && pickedOnPage === pageKeys.length;

  function togglePage(checked: boolean): void {
    if (selection === undefined) {
      return;
    }
    // Rows selected on other pages are left alone. Clearing them because the
    // filter moved would silently drop part of a batch the operator built up.
    const next = new Set(selection.selected);
    for (const key of pageKeys) {
      if (checked) {
        next.add(key);
      } else {
        next.delete(key);
      }
    }
    selection.onChange(next);
  }

  function toggleRow(key: string, checked: boolean): void {
    if (selection === undefined) {
      return;
    }
    const next = new Set(selection.selected);
    if (checked) {
      next.add(key);
    } else {
      next.delete(key);
    }
    selection.onChange(next);
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
              {selection === undefined ? null : (
                <th scope="col" className="w-10 px-3 py-2">
                  <Checkbox
                    checked={allOnPagePicked ? true : pickedOnPage > 0 ? 'indeterminate' : false}
                    aria-label={`Select every ${selection.noun} on this page`}
                    onCheckedChange={(checked) => {
                      togglePage(checked === true);
                    }}
                  />
                </th>
              )}
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
            {rows.map((row) => {
              const expandedContent = renderExpanded?.(row);
              return (
                <Fragment key={rowKey(row)}>
                  <tr
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
                      selection?.selected.has(rowKey(row)) === true ? 'bg-primary/5' : '',
                    )}
                  >
                    {selection === undefined ? null : (
                      <td
                        className="px-3 py-2"
                        // A row can both open a detail and be selected; ticking the
                        // box must not also navigate away from the list.
                        onClick={(event) => {
                          event.stopPropagation();
                        }}
                      >
                        <Checkbox
                          checked={selection.selected.has(rowKey(row))}
                          aria-label={`Select this ${selection.noun}`}
                          onCheckedChange={(checked) => {
                            toggleRow(rowKey(row), checked === true);
                          }}
                        />
                      </td>
                    )}
                    {columns.map((column) => (
                      <td
                        key={column.key}
                        className={cn(
                          'px-3 py-2',
                          column.align === 'end' ? 'text-end' : 'text-start',
                        )}
                      >
                        {column.render(row)}
                      </td>
                    ))}
                  </tr>
                  {expandedContent === undefined || expandedContent === null ? null : (
                    <tr className="border-t border-border bg-muted/20">
                      <td colSpan={columns.length + (selection === undefined ? 0 : 1)}>
                        {expandedContent}
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Mobile: cards, not a horizontally-scrolling table (docs/16 §9). */}
      <ul className="space-y-2 md:hidden">
        {rows.map((row) => (
          <li
            key={rowKey(row)}
            className={cn(
              'rounded-xl border border-border p-3',
              selection?.selected.has(rowKey(row)) === true ? 'bg-primary/5' : '',
            )}
          >
            <div className="flex items-start gap-3">
              {selection === undefined ? null : (
                // Outside the button rather than inside it: a control nested in a
                // button is not reachable by keyboard and toggles both at once.
                <Checkbox
                  className="mt-1"
                  checked={selection.selected.has(rowKey(row))}
                  aria-label={`Select this ${selection.noun}`}
                  onCheckedChange={(checked) => {
                    toggleRow(rowKey(row), checked === true);
                  }}
                />
              )}
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
                className="flex-1 text-start disabled:cursor-default"
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
            </div>
            {renderExpanded === undefined ? null : renderExpanded(row)}
          </li>
        ))}
      </ul>
    </>
  );
}
