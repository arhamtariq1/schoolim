/**
 * Reading a list screen's filters out of the URL.
 *
 * Every list in the portal keeps its filters and paging in the query string, so
 * every one of them needs the same two things: a string that tolerates a
 * repeated parameter, and an integer that tolerates nonsense.
 *
 * They live here rather than in each page because a mangled URL should behave
 * the same way everywhere. Four private copies of `clampInt` are four chances
 * for one screen to answer 500 to a link somebody pasted wrongly into chat.
 */

/**
 * One filter value.
 *
 * `?q=a&q=b` gives an array, which is not a filter anybody meant — so it reads
 * as absent rather than as `"a,b"` or a crash.
 */
export function readParam(
  params: Record<string, string | string[] | undefined>,
  key: string,
): string {
  const value = params[key];
  return typeof value === 'string' ? value : '';
}

/**
 * A paging number, forced into range.
 *
 * A hand-edited `?limit=99999` becomes the maximum rather than an attempt to
 * serialise the whole school, and `?offset=abc` becomes the first page rather
 * than `NaN` reaching SQL.
 */
export function clampInt(
  raw: string | string[] | undefined,
  fallback: number,
  min: number,
  max: number,
): number {
  const value = typeof raw === 'string' ? Number.parseInt(raw, 10) : Number.NaN;
  if (!Number.isFinite(value)) {
    return fallback;
  }
  return Math.min(max, Math.max(min, value));
}
