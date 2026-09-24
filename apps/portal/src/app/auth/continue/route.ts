import { COOKIES, ROUTES } from '@ilm/contracts';
import { schoolSlugFromHost } from '@ilm/utils';
import { type NextRequest } from 'next/server';

import { TENANT_MODE, tenantSlugFromPathname } from '@/lib/tenant-mode';

/**
 * The second half of an apex sign-in — ADR-0009.
 *
 * The apex verified the password and handed the browser a link to
 * `{slug}.<domain>/auth/continue?t=…`. This is that link. It redeems the token
 * with the API **on this hostname**, so the session cookies the API sets are
 * host-only cookies for this school and no other.
 *
 * ## Why the token is in the query string
 *
 * A GET with a secret in the URL is normally a smell: it lands in history, in
 * referrer headers and in access logs. Three things make it acceptable here and
 * the alternatives worse.
 *
 * - The token is **single-use and lives two minutes**. A URL recovered from
 *   history tomorrow redeems nothing.
 * - The only alternative that keeps the secret out of the URL is a cross-origin
 *   POST from the apex to the school host, which needs CORS with credentials
 *   and `SameSite=None` — the two settings that turn a session cookie into a
 *   cross-site liability. Trading a two-minute URL for that is a bad trade.
 * - The response redirects immediately and sets `Referrer-Policy: no-referrer`,
 *   so the token does not travel onward.
 */

const API_BASE = process.env['API_URL'] ?? 'http://localhost:4000';
const APP_DOMAIN = process.env['APP_DOMAIN'] ?? 'localhost';

export async function GET(request: NextRequest): Promise<Response> {
  const token = request.nextUrl.searchParams.get('t') ?? '';

  // Under `PORTAL_TENANT_MODE=path` the school is in the address as
  // `/beacon/auth/continue` rather than as a subdomain. Note this route is
  // reached *before* the cookie exists — it is what writes it — so the path is
  // the only place the school can come from here.
  const slug =
    TENANT_MODE === 'path'
      ? tenantSlugFromPathname(request.nextUrl.pathname)
      : schoolSlugFromHost(request.headers.get('host') ?? undefined, APP_DOMAIN);

  // No school in the address means there is nothing to redeem the token
  // against. The API would refuse it anyway; failing here saves a round trip
  // and, more importantly, keeps the reason legible.
  if (token === '' || slug === undefined) {
    return redirectTo('/login?expired=1');
  }

  let upstream: Response;
  try {
    upstream = await fetch(`${API_BASE}${ROUTES.auth.continue}`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        // Node's fetch strips a `Host` header, so the tenant is named
        // explicitly — the same hint the proxy sets, derived the same way, from
        // the host the browser actually used rather than anything it sent.
        'x-school-slug': slug,
        'x-forwarded-for': request.headers.get('x-forwarded-for') ?? '',
        'user-agent': request.headers.get('user-agent') ?? '',
      },
      body: JSON.stringify({ token }),
      cache: 'no-store',
    });
  } catch {
    return redirectTo('/login?unreachable=1');
  }

  if (!upstream.ok) {
    // Expired, already used, wrong school, disabled account: one answer. The
    // person needs to sign in again, and which of those it was is not
    // information they can act on — or that we should confirm.
    return redirectTo('/login?expired=1');
  }

  // Optional safe relative path from the minting side (e.g. `/profile` after
  // signup). Absolute URLs and protocol-relative forms are refused so a forged
  // handoff link cannot bounce the browser off-site with a live session cookie.
  const next = safeInternalPath(request.nextUrl.searchParams.get('next'));
  const destination =
    TENANT_MODE === 'path' ? `/${slug}${next}` : next;

  const headers = new Headers({
    location: destination,
    'cache-control': 'no-store',
    // The token is still in this request's URL. Without this it would be sent
    // as the referrer of whatever the next page loads.
    'referrer-policy': 'no-referrer',
  });

  // `getSetCookie`, not `get`: sign-in sets two cookies, and joining them into
  // one header value silently loses the second — which is the refresh token,
  // so the session would work for fifteen minutes and then end.
  for (const cookie of upstream.headers.getSetCookie()) {
    headers.append('set-cookie', cookie);
  }

  // In path mode the host names no school, so the API proxy has nowhere else to
  // learn which one every later call is for. Written here because this is the
  // moment the session is established, and cleared on sign-out.
  //
  // `Lax` and `httpOnly`: it is read on the server by the API proxy and never
  // by page script, and no cross-site request needs to carry it.
  if (TENANT_MODE === 'path') {
    headers.append(
      'set-cookie',
      `${COOKIES.school}=${slug}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${60 * 60 * 24 * 400}${
        request.nextUrl.protocol === 'https:' ? '; Secure' : ''
      }`,
    );
  }

  // 303, so the browser follows with a GET and the token URL is not repeated.
  return new Response(null, { status: 303, headers });
}

function redirectTo(path: string): Response {
  return new Response(null, {
    status: 303,
    headers: { location: path, 'cache-control': 'no-store', 'referrer-policy': 'no-referrer' },
  });
}

/** Only same-origin relative paths — never `//evil` or `https:…`. */
function safeInternalPath(raw: string | null): string {
  if (raw === null || raw === '' || raw === '/') {
    return '/';
  }
  if (!raw.startsWith('/') || raw.startsWith('//') || raw.includes('\\') || raw.includes('://')) {
    return '/';
  }
  return raw;
}

/** Nothing here is static, and a cached handoff would be a shared session. */
export const dynamic = 'force-dynamic';
