import { z } from 'zod';

/**
 * Pagination, sorting and the list-query base.
 *
 * docs/11 section 5: offset where users need page numbers, cursor for large or
 * streaming sets. `limit` defaults to 50 and is capped at 200 — and asking for
 * more is a 400 rather than a silent clamp, because a silent clamp makes a
 * client believe it fetched everything.
 */

export const DEFAULT_PAGE_LIMIT = 50;
export const MAX_PAGE_LIMIT = 200;

export const limitSchema = z.coerce
  .number()
  .int()
  .min(1)
  .max(MAX_PAGE_LIMIT)
  .default(DEFAULT_PAGE_LIMIT);

export const sortOrderSchema = z.enum(['asc', 'desc']);
export type SortOrder = z.infer<typeof sortOrderSchema>;

/**
 * Offset pagination, for admin lists where a person expects page numbers.
 *
 * `.strict()` is applied by `listQuery` below, not here, so that a module can
 * extend this base before the unknown-key rejection is sealed.
 */
export const offsetPaginationSchema = z.object({
  limit: limitSchema,
  offset: z.coerce.number().int().min(0).default(0),
});

export type OffsetPagination = z.infer<typeof offsetPaginationSchema>;

/** Cursor pagination, for attendance history, audit logs and exports. */
export const cursorPaginationSchema = z.object({
  limit: limitSchema,
  cursor: z.string().min(1).optional(),
});

export type CursorPagination = z.infer<typeof cursorPaginationSchema>;

/**
 * Build a list query from a module's own filters.
 *
 * Sorting is an **allow-list per endpoint** — the sortable field names are
 * passed in, never interpolated from client input into SQL.
 *
 * The result is `.strict()`, so an unknown query parameter is rejected. A typo
 * in a filter name then fails loudly instead of silently returning an
 * unfiltered list, which is the bug that leaks a whole table into a report
 * (docs/11 section 6).
 */
export function listQuery<
  TSortable extends readonly [string, ...string[]],
  TFilters extends z.ZodRawShape,
>(sortableFields: TSortable, filters: TFilters, defaultSort: TSortable[number]) {
  return z
    .object({
      ...offsetPaginationSchema.shape,
      sort: z.enum(sortableFields).default(defaultSort),
      order: sortOrderSchema.default('asc'),
      /** Free-text search. Meaning is per-endpoint and documented there. */
      q: z.string().trim().min(1).max(120).optional(),
      ...filters,
    })
    .strict();
}

/** Page metadata returned alongside a list. */
export const pageMetaSchema = z.object({
  total: z.int().min(0),
  limit: z.int().min(1),
  offset: z.int().min(0),
  nextCursor: z.string().nullable().optional(),
});

export type PageMeta = z.infer<typeof pageMetaSchema>;
