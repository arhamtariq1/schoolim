import { z } from 'zod';

import { pageMetaSchema } from './pagination';

/**
 * The response envelope every successful response uses (docs/11 section 3).
 *
 * Lists carry an envelope specifically so `meta.aggregates` can travel with the
 * rows: the total outstanding across the *filtered* set is needed on the same
 * screen as the rows it summarises, and fetching it separately is both slower
 * and racy — the two requests can see different data.
 */

export const responseMetaSchema = z.object({
  requestId: z.string(),
});

/** `{ data, meta }` for a single resource. */
export function dataEnvelope<TSchema extends z.ZodType>(schema: TSchema) {
  return z.object({
    data: schema,
    meta: responseMetaSchema,
  });
}

/** `{ data[], meta: { page } }` for a list that needs no summary figures. */
export function listEnvelope<TSchema extends z.ZodType>(schema: TSchema) {
  return z.object({
    data: z.array(schema),
    meta: responseMetaSchema.extend({ page: pageMetaSchema }),
  });
}

/**
 * `{ data[], meta: { page, aggregates } }` for a list that summarises itself.
 *
 * Separate from `listEnvelope` rather than an optional second argument, so the
 * aggregate shape survives into the inferred type. An optional parameter would
 * widen `meta.aggregates` to `unknown` and push the cast onto every caller.
 *
 * @param aggregates figures summarising the **filtered** set, for example
 *                   `{ totalOutstandingMinor: minorUnitsSchema }`. Aggregated
 *                   money is minor units like everything else on the wire.
 */
export function listEnvelopeWithAggregates<
  TSchema extends z.ZodType,
  TAggregates extends z.ZodRawShape,
>(schema: TSchema, aggregates: TAggregates) {
  return z.object({
    data: z.array(schema),
    meta: responseMetaSchema.extend({
      page: pageMetaSchema,
      aggregates: z.object(aggregates),
    }),
  });
}

/**
 * The per-item result of a bulk operation.
 *
 * docs/11 section 7: bulk endpoints return a per-item outcome rather than
 * failing all-or-nothing, unless the operation is genuinely atomic. Importing
 * 500 students must not be undone by two bad rows.
 */
export const bulkItemResultSchema = z.object({
  id: z.string(),
  ok: z.boolean(),
  code: z.string().optional(),
  message: z.string().optional(),
});

export type BulkItemResult = z.infer<typeof bulkItemResultSchema>;

export const bulkResultSchema = z.object({
  succeeded: z.int().min(0),
  failed: z.int().min(0),
  results: z.array(bulkItemResultSchema),
});

export type BulkResult = z.infer<typeof bulkResultSchema>;
