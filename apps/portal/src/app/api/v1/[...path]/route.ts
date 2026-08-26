import { API_PREFIX } from '@ilm/contracts';
import { schoolSlugFromHost } from '@ilm/utils';
import { type NextRequest } from 'next/server';

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
  'user-agent',
  'x-csrf-token',
] as const;

/** Response headers the browser is allowed to see. `set-cookie` is separate. */
const FORWARD_RESPONSE_HEADERS = ['content-type', 'cache-control', 'x-request-id'] as const;

interface RouteContext {
  readonly params: Promise<{ path?: string[] }>;
}

async function proxy(request: NextRequest, context: RouteContext): Promise<Response> {
  const { path } = await context.params;
  const segments = path ?? [];

  const target = `${API_BASE}${API_PREFIX}/${segments.map(encodeURIComponent).join('/')}${request.nextUrl.search}`;

  const headers = new Headers();
  for (const name of FORWARD_REQUEST_HEADERS) {
    const value = request.headers.get(name);
    if (value !== null) {
      headers.set(name, value);
    }
  }

  // The tenant hint is derived here from the Host the browser actually used,
  // never copied from the request. In production the API sits at `api.<domain>`
  // where the Host names no school, so it cannot resolve the tenant itself.
  const slug = schoolSlugFromHost(request.headers.get('host') ?? undefined, APP_DOMAIN);
  if (slug !== undefined) {
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

  let upstream: Response;
  try {
    upstream = await fetch(target, {
      method,
      headers,
      ...(hasBody ? { body: await request.arrayBuffer() } : {}),
      redirect: 'manual',
      cache: 'no-store',
    });
  } catch {
    // The API being down must not render as a Next stack trace. Same shape as
    // every other error the client already knows how to read (RFC 9457).
    return Response.json(
      {
        type: 'about:blank',
        title: 'Service unavailable',
        status: 502,
        code: 'UPSTREAM_UNAVAILABLE',
        detail: 'Could not reach the server. Try again in a moment.',
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

  // `getSetCookie` rather than `get`: a login sets two cookies, and joining
  // them into one header value silently loses the second one.
  for (const cookie of upstream.headers.getSetCookie()) {
    responseHeaders.append('set-cookie', cookie);
  }

  // A tenant-scoped response must never sit in a shared cache.
  responseHeaders.set('cache-control', 'no-store');

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
