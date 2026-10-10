'use client';

import type { LucideIcon } from 'lucide-react';
import { Fragment, type ReactNode } from 'react';

import { SortIcon } from '../icons';
import { cn } from '../lib/cn';

import { Card, CardContent, CardHeader, CardTitle } from './card';
import { TableSkeleton } from './skeleton';
import { EmptyState, ErrorState, NoResultsState } from './states';

export type CardTableSortDirection = 'asc' | 'desc';

export type CardTableColumn<TRow> = {
  readonly key: string;
  readonly label: string;
  readonly icon?: LucideIcon;
  readonly render: (row: TRow) => ReactNode;
  readonly align?: 'start' | 'end';
  readonly sortable?: boolean;
  /** Tailwind width class on `<col>` — e.g. `w-[28%]`. */
  readonly width?: string;
  readonly hideOnMobile?: boolean;
};

export type CardTableProps<TRow> = {
  readonly title: string;
  /** Shown under the title in the card header. */
  readonly description?: string | undefined;
  /** Right side of the header — e.g. Edit or Add. */
  readonly headerAction?: ReactNode;
  readonly rows: readonly TRow[];
  readonly columns: readonly CardTableColumn<TRow>[];
  readonly rowKey: (row: TRow) => string;
  readonly caption?: string;
  readonly minWidthClass?: string;

  readonly isLoading?: boolean;
  readonly error?: string | undefined;
  readonly onRetry?: (() => void) | undefined;

  readonly empty: { title: string; description?: string; action?: ReactNode };
  readonly isFiltered?: boolean;
  readonly onClearFilters?: (() => void) | undefined;

  readonly sort?: {
    readonly key: string;
    readonly direction: CardTableSortDirection;
    readonly onToggle: (columnKey: string) => void;
  };

  readonly renderMobileRow?: (row: TRow) => ReactNode;
  readonly onRowClick?: ((row: TRow) => void) | undefined;
};

export function CardTable<TRow>({
  title,
  description,
  headerAction,
  rows,
  columns,
  rowKey,
  caption,
  minWidthClass = 'min-w-[48rem]',
  isLoading = false,
  error,
  onRetry,
  empty,
  isFiltered = false,
  onClearFilters,
  sort,
  renderMobileRow,
  onRowClick,
}: CardTableProps<TRow>) {
  if (error !== undefined) {
    return <ErrorState description={error} {...(onRetry === undefined ? {} : { onRetry })} />;
  }

  if (isLoading) {
    return (
      <Card className="w-full overflow-hidden rounded-lg shadow-raised">
        <CardHeader className="bg-card px-4 pt-4 sm:px-6">
          <CardTitle className="text-base font-semibold text-foreground">{title}</CardTitle>
        </CardHeader>
        <CardContent className="p-4 sm:p-6">
          <TableSkeleton columns={columns.length} />
        </CardContent>
      </Card>
    );
  }

  const hasData = rows.length > 0;

  return (
    <Card className="w-full overflow-hidden rounded-lg shadow-raised">
      <CardHeader className="flex flex-row items-start justify-between gap-3 bg-card px-4 pb-2 pt-4 sm:px-6">
        <div className="min-w-0 space-y-1">
          <CardTitle className="text-base font-semibold text-foreground">{title}</CardTitle>
          {description === undefined ? null : (
            <p className="text-sm text-muted-foreground">{description}</p>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {headerAction}
          {isFiltered && onClearFilters !== undefined ? (
            <button
              type="button"
              className="text-xs font-medium text-primary hover:underline"
              onClick={onClearFilters}
            >
              Clear filters
            </button>
          ) : null}
        </div>
      </CardHeader>
      <CardContent className="p-0">
        {!hasData ? (
          isFiltered ? (
            <NoResultsState
              {...(onClearFilters === undefined ? {} : { onClearFilters })}
              className="border-0 shadow-none"
            />
          ) : (
            <EmptyState
              title={empty.title}
              {...(empty.description === undefined ? {} : { description: empty.description })}
              {...(empty.action === undefined ? {} : { action: empty.action })}
              className="border-0 shadow-none"
            />
          )
        ) : (
          <>
            <div className="hidden overflow-x-auto md:block">
              <table
                className={cn('w-full table-fixed border-collapse text-sm', minWidthClass)}
              >
                {caption === undefined ? null : (
                  <caption className="sr-only">{caption}</caption>
                )}
                <colgroup>
                  {columns.map((column) => (
                    <col
                      key={column.key}
                      className={column.width ?? undefined}
                    />
                  ))}
                </colgroup>
                <thead>
                  <tr className="border-b border-border bg-muted/30">
                    {columns.map((column) =>
                      column.sortable && sort !== undefined ? (
                        <CardTableSortHeader
                          key={column.key}
                          label={column.label}
                          icon={column.icon}
                          active={sort.key === column.key}
                          direction={sort.direction}
                          align={column.align}
                          onSort={() => {
                            sort.onToggle(column.key);
                          }}
                        />
                      ) : (
                        <CardTableHeaderCell
                          key={column.key}
                          label={column.label}
                          icon={column.icon}
                          align={column.align}
                        />
                      ),
                    )}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr
                      key={rowKey(row)}
                      onClick={
                        onRowClick === undefined
                          ? undefined
                          : (event) => {
                            if (
                              (event.target as HTMLElement | null)?.closest(
                                '[data-stop-row-click]',
                              ) !== null
                            ) {
                              return;
                            }
                            onRowClick(row);
                          }
                      }
                      className={cn(
                        'border-b border-border last:border-0 hover:bg-muted/30',
                        onRowClick === undefined ? undefined : 'cursor-pointer',
                      )}
                    >
                      {columns.map((column) => (
                        <td
                          key={column.key}
                          className={cn(
                            'px-4 py-3 align-middle',
                            column.align === 'end' ? 'text-end' : undefined,
                          )}
                        >
                          {column.render(row)}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {renderMobileRow === undefined ? (
              <ul className="divide-y divide-border md:hidden">
                {rows.map((row) => (
                  <li key={rowKey(row)} className="space-y-2 px-4 py-3">
                    {columns
                      .filter((column) => column.hideOnMobile !== true)
                      .map((column) => (
                        <Fragment key={column.key}>
                          <div className="text-xs font-medium text-muted-foreground">
                            {column.label}
                          </div>
                          <div className="text-sm text-foreground">{column.render(row)}</div>
                        </Fragment>
                      ))}
                  </li>
                ))}
              </ul>
            ) : (
              <ul className="divide-y divide-border md:hidden">
                {rows.map((row) => (
                  <li key={rowKey(row)}>{renderMobileRow(row)}</li>
                ))}
              </ul>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

function CardTableHeaderCell({
  label,
  icon: Icon,
  align,
}: {
  label: string;
  icon?: LucideIcon;
  align?: 'start' | 'end';
}) {
  return (
    <th
      scope="col"
      className={cn(
        'px-4 py-3 align-middle text-xs font-medium whitespace-nowrap text-muted-foreground',
        align === 'end' ? 'text-end' : undefined,
      )}
    >
      <span
        className={cn(
          'inline-flex w-full items-center gap-2',
          align === 'end' ? 'justify-end' : undefined,
        )}
      >
        {Icon === undefined ? null : (
          <Icon className="size-4 shrink-0 opacity-80" aria-hidden="true" />
        )}
        <span>{label}</span>
      </span>
    </th>
  );
}

function CardTableSortHeader({
  label,
  icon: Icon,
  active,
  direction,
  align,
  onSort,
}: {
  label: string;
  icon?: LucideIcon;
  active: boolean;
  direction: CardTableSortDirection;
  align?: 'start' | 'end';
  onSort: () => void;
}) {
  return (
    <th scope="col" className={cn('p-0 align-middle', align === 'end' ? 'text-end' : undefined)}>
      <button
        type="button"
        onClick={onSort}
        className={cn(
          'flex w-full items-center gap-2 px-4 py-3 text-xs font-medium whitespace-nowrap text-muted-foreground hover:bg-muted/40',
          align === 'end' ? 'justify-end' : 'justify-start',
          active ? 'text-foreground' : undefined,
        )}
      >
        {Icon === undefined ? null : (
          <Icon className="size-4 shrink-0 opacity-80" aria-hidden="true" />
        )}
        <span>{label}</span>
        <SortIcon
          className={cn(
            'size-3.5 shrink-0',
            active ? 'opacity-100' : 'opacity-60',
            active && direction === 'desc' ? 'rotate-180' : undefined,
          )}
          aria-hidden="true"
        />
      </button>
    </th>
  );
}

/** Primary + secondary line inside a table cell — matches dashboard fee-payment rows. */
export function TwoLineCell({
  primary,
  secondary,
  secondaryMono = false,
}: {
  primary: ReactNode;
  secondary: ReactNode;
  secondaryMono?: boolean;
}) {
  return (
    <div className="min-w-0">
      <p className="truncate text-sm font-normal text-foreground">{primary}</p>
      <p
        className={cn(
          'truncate text-xs text-muted-foreground',
          secondaryMono ? 'font-mono tabular-nums' : undefined,
        )}
      >
        {secondary}
      </p>
    </div>
  );
}
