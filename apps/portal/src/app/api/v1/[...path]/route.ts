import { API_PREFIX, COOKIES, ROUTES } from '@ilm/contracts';
import { schoolSlugFromHost } from '@ilm/utils';
import { type NextRequest } from 'next/server';

import { refreshSession, withCookie } from '@/lib/refresh';
import { TENANT_MODE } from '@/lib/tenant-mode';

/**
 * The API, served on the school's own hostname.
 *
 * The browser calls `https://demo.<domain>/api/v1/...` and this forwards it to
 * the API service. In production the ingress does the same thing and this
 * handler never runs; in development it *is* the ingress. Either way the
 * browser only ever talks to one origin.
 *
 * That is not a convenience. It is what makes the session cookie work:
 *
 * - **First-party cookies.** The cookie is set and sent on the school's own
 *   host, so it needs neither `SameSite=None` nor CORS with credentials — the
 *   two settings that turn a session cookie into a cross-site liability.
 * - **The Host header names the school.** Tenant resolution for browser traffic
 *   is then the design in docs/09 §2 with nothing bolted on.
 *
 * Before this existed the sign-in form posted to a relative path that resolved
 * to the portal itself, and Next answered 404 — a correct password looked like
 * a broken login. `verify-browser.mjs` now drives this exact path.
 *
 * ## Why an allow-list
 *
 * Only named headers cross in either direction. A deny-list would let the
 * browser set `x-school-slug` itself, and while the tenant guard would still
 * reject a slug that disagrees with the token, a proxy that forwards
 * caller-controlled trust hints is a bad shape to leave lying around.
 */

const API_BASE = process.env['API_URL'] ?? 'http://localhost:4000';
const APP_DOMAIN = process.env['APP_DOMAIN'] ?? 'localhost';

/** Request headers the API is allowed to see. Everything else is dropped. */
const FORWARD_REQUEST_HEADERS = [
  'accept',
  'accept-language',
  'content-type',
  'cookie',
  'idempotency-key',
  // Without this a conditional request is not conditional: the API can never
  // answer 304, so an image the browser already holds is downloaded again on
  // every navigation that shows it.
  'if-none-match',
  'user-agent',
  'x-csrf-token',
] as const;

/** Response headers the browser is allowed to see. `set-cookie` is separate. */
const FORWARD_RESPONSE_HEADERS = [
  'content-type',
  'cache-control',
  // The other half of `if-none-match`. A validator the browser never receives
  // is a validator it can never send back.
  'etag',
  // Matters most on the one endpoint that answers with bytes a school
  // uploaded. The API sets it; dropping it here would mean the protection
  // exists on a path no browser actually takes.
  'x-content-type-options',
  'x-request-id',
] as const;

interface RouteContext {
  readonly params: Promise<{ path?: string[] }>;
}

async function proxy(request: NextRequest, context: RouteContext): Promise<Response> {
  const { path } = await context.params;
  const segments = path ?? [];

  const target = `${API_BASE}${API_PREFIX}/${segments.map(encodeURIComponent).join('/')}${request.nextUrl.search}`;

  const cookieHeader = request.headers.get('cookie') ?? '';

  const headers = new Headers();
  for (const name of FORWARD_REQUEST_HEADERS) {
    const value = request.headers.get(name);
    if (value !== null) {
      headers.set(name, value);
    }
  }

  // The tenant hint is derived here, never copied from the request. In
  // production the API sits at `api.<domain>` where the Host names no school,
  // so it cannot resolve the tenant itself.
  //
  // Normally it comes from the Host the browser actually used. Under
  // `PORTAL_TENANT_MODE=path` there is one shared host that names no school, so
  // it comes from the `ilm_school` cookie the handoff wrote — which is a name,
  // not a credential: `TenantGuard` still requires it to equal the `sid` claim
  // in the signed token, so a tampered cookie is a 401 rather than a crossing.
  //
  // Either way it is derived server-side and the caller's own `x-school-slug`
  // header is dropped by the allow-list above.
  const slug =
    TENANT_MODE === 'path'
      ? (request.cookies.get(COOKIES.school)?.value ?? undefined)
      : schoolSlugFromHost(request.headers.get('host') ?? undefined, APP_DOMAIN);
  if (slug !== undefined && slug !== '') {
    headers.set('x-school-slug', slug);
  }

  // Without this every audit row and rate-limit bucket would record the Next
  // server's address instead of the person's. Fastify is started with
  // `trustProxy`, so it reads these.
  const forwardedFor = request.headers.get('x-forwarded-for');
  headers.set(
    'x-forwarded-for',
    forwardedFor === null ? (request.headers.get('x-real-ip') ?? '') : forwardedFor,
  );
  headers.set('x-forwarded-proto', request.nextUrl.protocol.replace(':', ''));

  const method = request.method;
  const hasBody = method !== 'GET' && method !== 'HEAD';

  // Read once: a body cannot be streamed twice, and the retry below needs it.
  const body = hasBody ? await request.arrayBuffer() : undefined;

  let upstream: Response;
  let renewedCookies: readonly string[] = [];

  try {
    upstream = await fetch(target, {
      method,
      headers,
      ...(body === undefined ? {} : { body }),
      redirect: 'manual',
      cache: 'no-store',
    });

    // The access token expired mid-session. Spend the refresh token and try the
    // same call again, exactly once.
    //
    // This is the counterpart to the renewal in `proxy.ts`: that one covers
    // page navigations, this one covers a fetch from a page that has been open
    // for a while — the receptionist who fills in an admission form for twenty
    // minutes and then presses Save.
    //
    // **Once, and never for the refresh endpoint itself.** A retry loop around
    // an endpoint whose failure means "sign in again" is an infinite loop, and
    // a 401 from `/auth/refresh` is the one answer that must be believed.
    const isRefreshCall = target.includes(ROUTES.auth.refresh);

    if (upstream.status === 401 && !isRefreshCall) {
      const slugForRenewal = slug ?? 'unknown';
      const renewed = await refreshSession(API_BASE, slugForRenewal, cookieHeader);

      if (renewed.ok && renewed.accessToken !== undefined) {
        renewedCookies = renewed.setCookies;

        const retryHeaders = new Headers(headers);
        retryHeaders.set(
          'cookie',
          withCookie(cookieHeader, COOKIES.accessToken, renewed.accessToken),
        );

        upstream = await fetch(target, {
          method,
          headers: retryHeaders,
          ...(body === undefined ? {} : { body }),
          redirect: 'manual',
          cache: 'no-store',
        });
      }
    }
  } catch {
    // The API being down must not render as a Next stack trace. Same shape as
    // every other error the client already knows how to read (RFC 9457).
    //
    // In development it says which process is missing. "Try again in a moment"
    // is the right thing for a parent to read and exactly the wrong thing for
    // whoever forgot to start the API — it suggests waiting, and waiting never
    // helps. Production keeps the calm wording, because the person reading it
    // there cannot start anything.
    return Response.json(
      {
        type: 'about:blank',
        title: 'Service unavailable',
        status: 502,
        code: 'UPSTREAM_UNAVAILABLE',
        detail:
          process.env.NODE_ENV === 'production'
            ? 'Could not reach the server. Try again in a moment.'
            : `The API is not running at ${API_BASE}. Start it with \`pnpm --filter @ilm/api dev\`, or run \`pnpm dev\` to start everything.`,
      },
      { status: 502, headers: { 'content-type': 'application/problem+json' } },
    );
  }

  const responseHeaders = new Headers();
  for (const name of FORWARD_RESPONSE_HEADERS) {
    const value = upstream.headers.get(name);
    if (value !== null) {
      responseHeaders.set(name, value);
    }
  }

  // Cookies minted by a mid-flight renewal go first, so that if the upstream
  // call also set some (a sign-in, a sign-out) the browser ends up with the
  // later, more authoritative pair.
  for (const cookie of renewedCookies) {
    responseHeaders.append('set-cookie', cookie);
  }

  // `getSetCookie` rather than `get`: a login sets two cookies, and joining
  // them into one header value silently loses the second one.
  for (const cookie of upstream.headers.getSetCookie()) {
    responseHeaders.append('set-cookie', cookie);
  }

  // Sign-out clears the API's cookies but knows nothing about this one, which
  // the portal wrote. Left behind, it would send the next visitor straight back
  // into the school they just left — and, worse, the proxy would bounce anyone
  // signing in as a different school back to the old one.
  if (TENANT_MODE === 'path' && target.includes(ROUTES.auth.logout) && upstream.ok) {
    responseHeaders.append(
      'set-cookie',
      `${COOKIES.school}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`,
    );
  }

  // A tenant-scoped response must never sit in a shared cache.
  //
  // `no-store` unless the API explicitly said `private`, which is a narrower
  // statement of the same rule — it already forbids a shared cache, and it
  // allows the browser's own. The one response that says it is the school's
  // logo, which appears on every page and changes about once a year; forcing
  // `no-store` there would re-download an image on every navigation to protect
  // it from a cache that `private` has already ruled out.
  const upstreamCaching = upstream.headers.get('cache-control');
  responseHeaders.set(
    'cache-control',
    upstreamCaching !== null && upstreamCaching.includes('private') ? upstreamCaching : 'no-store',
  );

  return new Response(upstream.body === null ? null : await upstream.arrayBuffer(), {
    status: upstream.status,
    headers: responseHeaders,
  });
}

export const GET = proxy;
export const POST = proxy;
export const PATCH = proxy;
export const PUT = proxy;
export const DELETE = proxy;

/** Nothing here is static; the session makes every response caller-specific. */
export const dynamic = 'force-dynamic';
