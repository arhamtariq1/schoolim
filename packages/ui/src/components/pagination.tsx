'use client';

import { ChevronLeftIcon, ChevronRightIcon } from '../icons';
import { cn } from '../lib/cn';

/**
 * Page navigation for a server-paged list.
 *
 * Every list in this product is paged **on the server** — the API caps a page
 * at 200 rows and defaults to 50 (docs/11 §5). That is not a nicety: a school
 * with 4,000 students and three years of history must never be able to ask one
 * screen for all of it, and "fetch everything and paginate in the browser" is
 * the shape that works in a demo and falls over on the first real customer.
 *
 * ## It navigates by changing the URL
 *
 * The current page lives in the query string, not in component state. A page
 * of results is then a link somebody can send, it survives a refresh, and the
 * back button does what it should. That is also why this component does not
 * fetch anything or hold a page number — it reports the offset that was asked
 * for, and the page it lives on decides what to do.
 */

export interface PaginationProps {
  /** Total matching rows, from the server. Not the number on this page. */
  readonly total: number;
  readonly limit: number;
  readonly offset: number;
  readonly onChange: (offset: number) => void;
  /** Describes what is being paged, for screen readers. */
  readonly label?: string;
  readonly className?: string;
}

/**
 * How many numbered pages to show around the current one.
 *
 * A school with 4,000 students has 80 pages, and rendering 80 buttons is worse
 * than useless — it pushes the row count off screen and gives 78 targets nobody
 * wants. Two either side plus the ends is enough to move quickly and still fits
 * on a phone.
 */
const WINDOW = 2;

export function Pagination({
  total,
  limit,
  offset,
  onChange,
  label = 'results',
  className,
}: PaginationProps) {
  const pageCount = Math.max(1, Math.ceil(total / Math.max(1, limit)));
  // Derived from the offset rather than tracked separately, so a URL somebody
  // typed by hand cannot put the control and the data out of step.
  const current = Math.min(pageCount, Math.floor(offset / Math.max(1, limit)) + 1);

  const first = total === 0 ? 0 : offset + 1;
  const last = Math.min(offset + limit, total);

  // One page of results needs no navigation, but the count is still worth
  // saying — "14 students" answers a question people actually have.
  const showControls = pageCount > 1;

  return (
    <div
      className={cn(
        'flex flex-wrap items-center justify-between gap-4 border-t border-border px-1 pt-4',
        className,
      )}
    >
      <p className="text-sm text-muted-foreground" aria-live="polite">
        {total === 0 ? (
          <>No {label}</>
        ) : (
          <>
            <span className="font-medium text-foreground">
              {first}–{last}
            </span>{' '}
            of <span className="font-medium text-foreground">{total}</span> {label}
          </>
        )}
      </p>

      {showControls ? (
        <nav aria-label="Pagination" className="flex items-center gap-1">
          <PageButton
            ariaLabel="Previous page"
            disabled={current === 1}
            onClick={() => {
              onChange(Math.max(0, offset - limit));
            }}
          >
            <ChevronLeftIcon className="size-4" aria-hidden="true" />
          </PageButton>

          {pagesToRender(current, pageCount).map((page, index) =>
            page === ELLIPSIS ? (
              // Keyed by position: the gaps are static and never reorder.
              <span
                key={`gap-${String(index)}`}
                className="px-1 text-sm text-muted-foreground"
                aria-hidden="true"
              >
                …
              </span>
            ) : (
              <PageButton
                key={page}
                ariaLabel={`Page ${String(page)}`}
                isCurrent={page === current}
                onClick={() => {
                  onChange((page - 1) * limit);
                }}
              >
                {page}
              </PageButton>
            ),
          )}

          <PageButton
            ariaLabel="Next page"
            disabled={current === pageCount}
            onClick={() => {
              onChange(offset + limit);
            }}
          >
            <ChevronRightIcon className="size-4" aria-hidden="true" />
          </PageButton>
        </nav>
      ) : null}
    </div>
  );
}

function PageButton({
  children,
  ariaLabel,
  isCurrent = false,
  disabled = false,
  onClick,
}: {
  children: React.ReactNode;
  ariaLabel: string;
  isCurrent?: boolean;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-label={ariaLabel}
      // Announced, not merely coloured — colour alone carries no meaning
      // (docs/16 §3).
      aria-current={isCurrent ? 'page' : undefined}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        // 36px, which stays a comfortable target on a phone without making a
        // ten-page row wrap.
        'inline-flex h-9 min-w-9 items-center justify-center rounded-md px-2 text-sm font-medium transition-colors',
        'focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
        isCurrent
          ? 'bg-primary text-primary-foreground'
          : 'text-muted-foreground hover:bg-muted hover:text-foreground',
        disabled && 'pointer-events-none opacity-40',
      )}
    >
      {children}
    </button>
  );
}

const ELLIPSIS = '…' as const;

/**
 * The page numbers to show: the ends, a window around the current page, and
 * gaps for the rest.
 *
 * Exported for its own test — off-by-one errors here are invisible until a
 * school has enough data to produce them, which is the worst time to find out.
 */
export function pagesToRender(current: number, pageCount: number): (number | typeof ELLIPSIS)[] {
  if (pageCount <= 7) {
    return Array.from({ length: pageCount }, (_, index) => index + 1);
  }

  const pages = new Set<number>([1, pageCount]);
  for (let page = current - WINDOW; page <= current + WINDOW; page += 1) {
    if (page >= 1 && page <= pageCount) {
      pages.add(page);
    }
  }

  const sorted = [...pages].sort((a, b) => a - b);
  const out: (number | typeof ELLIPSIS)[] = [];

  for (const [index, page] of sorted.entries()) {
    const previous = sorted[index - 1];
    // A gap of exactly one page renders as that page, never as an ellipsis
    // hiding a single number — "1 … 3" is silly where "1 2 3" fits.
    if (previous !== undefined && page - previous > 1) {
      out.push(page - previous === 2 ? page - 1 : ELLIPSIS);
    }
    out.push(page);
  }

  return out;
}
