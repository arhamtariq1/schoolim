import { COOKIES, ROUTES } from '@ilm/contracts';

/**
 * Exchange a refresh token for a new session, server-to-server.
 *
 * Shared by the two places that can legitimately do it — the proxy (before a
 * page renders) and the API route handler (when a fetch comes back 401) —
 * because both need identical behaviour and a second copy is a second thing to
 * get subtly wrong.
 *
 * ## Why this exists at all
 *
 * The access token lives fifteen minutes; the session lives thirty days. Until
 * something spends the refresh token, the gap between those two numbers is
 * exactly how long a person can work before being thrown out. Nothing did, so
 * everyone was signed out mid-afternoon.
 *
 * ## Why not in `apiFetch`
 *
 * A React Server Component cannot set a cookie — Next.js only permits that in a
 * route handler, a server action, or the proxy. So the component that discovers
 * the expiry is the one place that cannot fix it, and refresh has to happen
 * before rendering starts or on a path that owns the response.
 */

export interface RefreshOutcome {
  readonly ok: boolean;
  /**
   * The session is definitively gone — the API answered and said no, or there
   * was no token to offer it.
   *
   * Distinct from `!ok`, which also covers an API that could not be reached,
   * and the distinction decides whether a caller may sign somebody out. Failing
   * closed on an unreachable API would turn every deploy and every restart into
   * a mass sign-out, which is a worse version of the bug this file exists to
   * fix.
   */
  readonly rejected: boolean;
  /** `set-cookie` lines to replay to the browser, verbatim. */
  readonly setCookies: readonly string[];
  /** The new access token, for reusing on the request already in flight. */
  readonly accessToken?: string | undefined;
}

/** The API said no, or there was nothing to ask with. The session is over. */
const REJECTED: RefreshOutcome = { ok: false, rejected: true, setCookies: [] };

/** The API could not answer. Says nothing about the session; change nothing. */
const UNREACHABLE: RefreshOutcome = { ok: false, rejected: false, setCookies: [] };

export async function refreshSession(
  apiBase: string,
  slug: string,
  cookieHeader: string,
): Promise<RefreshOutcome> {
  // No refresh token means there is nothing to try, and asking anyway turns
  // every signed-out visitor into a pointless round trip to the API.
  if (!cookieHeader.includes(`${COOKIES.refreshToken}=`)) {
    return REJECTED;
  }

  let response: Response;
  try {
    response = await fetch(`${apiBase}${ROUTES.auth.refresh}`, {
      method: 'POST',
      headers: {
        cookie: cookieHeader,
        // Node's fetch strips `Host`, so the tenant is named explicitly — the
        // same hint the proxy sets, derived from the host the browser used.
        'x-school-slug': slug,
      },
      cache: 'no-store',
    });
  } catch {
    // The API being unreachable is not an expired session. Failing closed here
    // would sign people out every time the API restarts.
    return UNREACHABLE;
  }

  if (!response.ok) {
    // A 5xx is the API having a bad time, not a verdict on this session. Only
    // a 4xx — 401 from reuse detection, an expired or revoked token — means the
    // session is actually over.
    return response.status >= 500 ? UNREACHABLE : REJECTED;
  }

  const setCookies = response.headers.getSetCookie();

  return {
    ok: true,
    rejected: false,
    setCookies,
    accessToken: readCookieValue(setCookies, COOKIES.accessToken),
  };
}

/**
 * Is this access token past its expiry, or close enough that it will be by the
 * time the request lands?
 *
 * **Reads the `exp` claim; it does not verify the signature.** That is
 * deliberate and safe: the answer is only used to decide whether to *attempt* a
 * refresh. A forged token cannot gain anything — the API verifies properly on
 * every call, and the worst a lie achieves is one wasted refresh that then
 * fails on its own merits.
 *
 * Checking the cookie's mere presence is what this replaces, and that was the
 * bug: the access cookie carries no `expires`, so the browser keeps it long
 * after the fifteen-minute token inside it has died. "Cookie present" was true
 * exactly when renewal was most needed.
 */
export function isAccessTokenExpired(token: string | undefined): boolean {
  if (token === undefined || token === '') {
    return true;
  }

  const payload = token.split('.')[1];
  if (payload === undefined) {
    // Not a JWT shape at all. Treat as expired: a refresh either fixes it or
    // fails cleanly, and either beats rendering a signed-out page.
    return true;
  }

  try {
    const claims = JSON.parse(Buffer.from(payload, 'base64url').toString()) as { exp?: unknown };
    if (typeof claims.exp !== 'number') {
      return true;
    }

    // A margin, because the token has to survive the round trip it is about to
    // be used for — and because the browser's clock and the server's are not
    // the same clock. Renewing a few seconds early costs nothing; renewing a
    // few seconds late costs a signed-out screen.
    return claims.exp * 1000 <= Date.now() + EXPIRY_SKEW_MS;
  } catch {
    return true;
  }
}

/** Renew this long before the stated expiry. */
const EXPIRY_SKEW_MS = 30_000;

/**
 * Pull one cookie's value out of a `set-cookie` list.
 *
 * **Last match, and never an empty one.** One response may legitimately carry
 * the same cookie name twice — a deletion at one path alongside a real value at
 * another, which is exactly what sign-in emits while it retires the old
 * narrow-path refresh cookie. Taking the first match there hands back the empty
 * string from the deletion, and everything downstream then behaves as though
 * there were no token at all.
 *
 * A browser resolves this by path and ends up with the real one; this walks
 * backwards to reach the same answer.
 */
function readCookieValue(setCookies: readonly string[], name: string): string | undefined {
  for (let index = setCookies.length - 1; index >= 0; index -= 1) {
    const [pair] = (setCookies[index] ?? '').split(';');
    if (pair === undefined) {
      continue;
    }
    const separator = pair.indexOf('=');
    if (separator <= 0 || pair.slice(0, separator).trim() !== name) {
      continue;
    }
    const value = pair.slice(separator + 1);
    if (value !== '') {
      return value;
    }
  }
  return undefined;
}

/**
 * Replace one cookie's value inside a `cookie` header.
 *
 * The refreshed access token has to reach the render that is *already
 * happening*, not just the browser — otherwise the page that triggered the
 * refresh still renders signed-out, and the person sees the session-ended
 * screen once before everything starts working.
 */
export function withCookie(cookieHeader: string, name: string, value: string): string {
  const parts = cookieHeader
    .split(';')
    .map((part) => part.trim())
    .filter((part) => part !== '' && !part.startsWith(`${name}=`));

  parts.push(`${name}=${value}`);
  return parts.join('; ');
}
