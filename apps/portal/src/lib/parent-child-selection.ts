/**
 * Which of a parent's children the parent pages are showing.
 *
 * Kept in a cookie rather than the address so the choice made in the header
 * follows the parent from page to page — the dashboard, fee vouchers,
 * timetables and requests all read it — and survives a reload. Not in a client
 * file, so server pages can read it too.
 *
 * The cookie only ever holds an id, and only as a *preference*: every reader
 * matches it against the children the API returned for the signed-in guardian,
 * so an id that is not theirs (another parent on the same browser, a child no
 * longer linked) is simply "all children".
 */
export const PARENT_CHILD_COOKIE = 'ilm_parent_child';

/** One year, path-wide, like the theme. Undefined clears it: "all children". */
export function parentChildCookieValue(childId: string | undefined): string {
  if (childId === undefined) {
    return `${PARENT_CHILD_COOKIE}=; path=/; max-age=0; SameSite=Lax`;
  }
  const maxAge = 60 * 60 * 24 * 365;
  return `${PARENT_CHILD_COOKIE}=${encodeURIComponent(childId)}; path=/; max-age=${String(maxAge)}; SameSite=Lax`;
}

/** The chosen child, if the cookie names one of these children; otherwise undefined. */
export function selectedChildFromCookie<T extends { id: string }>(
  jar: { get: (name: string) => { value: string } | undefined },
  kids: readonly T[],
): T | undefined {
  const id = jar.get(PARENT_CHILD_COOKIE)?.value;
  return id === undefined || id === '' ? undefined : kids.find((child) => child.id === id);
}
