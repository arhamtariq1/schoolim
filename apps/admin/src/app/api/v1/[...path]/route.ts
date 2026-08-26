import { API_PREFIX } from '@ilm/contracts';
import { type NextRequest } from 'next/server';

/**
 * The API, served on the console's own hostname.
 *
 * Same shape as the portal's handler and the same reasoning — first-party
 * cookies, no CORS — with one deliberate difference: **no tenant hint is ever
 * derived or forwarded here.** The console is not a school, and a request that
 * arrived at the console must not be able to present itself to the API as
 * belonging to one.
 *
 * The path is also pinned to the platform namespace. This proxy cannot be used
 * to reach a school's data even if the browser asks it to; the only thing on
 * the other side is `/api/v1/platform/*`, which rejects anything but a live
 * platform token.
 */

const API_BASE = process.env['API_URL'] ?? 'http://localhost:4000';

const FORWARD_REQUEST_HEADERS = [
  'accept',
  'accept-language',
  'content-type',
  'cookie',
  'idempotency-key',
  'user-agent',
] as const;

const FORWARD_RESPONSE_HEADERS = ['content-type', 'x-request-id'] as const;

interface RouteContext {
  readonly params: Promise<{ path?: string[] }>;
}

async function proxy(request: NextRequest, context: RouteContext): Promise<Response> {
  const { path } = await context.params;
  const segments = path ?? [];

  // Anything outside the platform namespace is refused here rather than
  // forwarded and refused there. A console that can be pointed at a tenant
  // endpoint is a console someone will eventually point at one.
  if (segments[0] !== 'platform') {
    return Response.json(
      {
        type: 'about:blank',
        title: 'Not found',
        status: 404,
        code: 'NOT_FOUND',
        detail: 'That endpoint does not exist.',
      },
      { status: 404, headers: { 'content-type': 'application/problem+json' } },
    );
  }

  const target = `${API_BASE}${API_PREFIX}/${segments.map(encodeURIComponent).join('/')}${request.nextUrl.search}`;

  const headers = new Headers();
  for (const name of FORWARD_REQUEST_HEADERS) {
    const value = request.headers.get(name);
    if (value !== null) {
      headers.set(name, value);
    }
  }

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
    // Says which process is missing, in development only. "Try again in a
    // moment" suggests waiting, and waiting never starts a server.
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

  // `getSetCookie`, not `get`: sign-in sets two, and joining them loses one.
  for (const cookie of upstream.headers.getSetCookie()) {
    responseHeaders.append('set-cookie', cookie);
  }

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

export const dynamic = 'force-dynamic';
