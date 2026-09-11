import { ROUTES } from '@ilm/contracts';
import { schoolSlugFromHost } from '@ilm/utils';
import { type NextRequest } from 'next/server';

import { TENANT_MODE, tenantSlugFromPathname, withTenantPrefix } from '@/lib/tenant-mode';

/**
 * The link in the confirmation email — ADR-0012.
 *
 * Shaped like `/auth/continue` and for the same reasons: a GET carrying a
 * single-use token, redeemed against the API on this school's own hostname,
 * then a 303 so the token URL is not repeated or re-entered by a refresh.
 *
 * Two things differ from the sign-in handoff, and both are deliberate:
 *
 * - **It signs nobody in.** Proving you can read an inbox is not proving you
 *   know a password, and a link that did both would turn "someone left their
 *   email open" into a session. Whoever follows it lands on the portal in
 *   whatever state their browser was already in.
 * - **It survives being followed by a stranger's browser.** The token is the
 *   only credential, so this works on a phone that has never seen the site —
 *   which is where most people read their email.
 */

const API_BASE = process.env['API_URL'] ?? 'http://localhost:4000';
const APP_DOMAIN = process.env['APP_DOMAIN'] ?? 'localhost';

export async function GET(request: NextRequest): Promise<Response> {
  const token = request.nextUrl.searchParams.get('t') ?? '';

  // In path mode the confirmation link the API mailed is
  // `${WEB_URL}/beacon/verify-email?t=…`, so the school is in the path. This
  // route is reachable with no session at all — days later, on a phone, in a
  // different browser — so the `ilm_school` cookie cannot be relied on here.
  const slug =
    TENANT_MODE === 'path'
      ? tenantSlugFromPathname(request.nextUrl.pathname)
      : schoolSlugFromHost(request.headers.get('host') ?? undefined, APP_DOMAIN);

  if (token === '' || slug === undefined) {
    return redirectTo(withTenantPrefix('/?verify=failed', slug));
  }

  let upstream: Response;
  try {
    upstream = await fetch(`${API_BASE}${ROUTES.auth.verifyEmail}`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        // Node's fetch strips `Host`, so the tenant is named explicitly —
        // derived from the host the browser used, never copied from the request.
        'x-school-slug': slug,
        'x-forwarded-for': request.headers.get('x-forwarded-for') ?? '',
        'user-agent': request.headers.get('user-agent') ?? '',
      },
      body: JSON.stringify({ token }),
      cache: 'no-store',
    });
  } catch {
    return redirectTo(withTenantPrefix('/?verify=unreachable', slug));
  }

  // Expired, already used, wrong school, address since changed: one outcome.
  // The person's next step is the same in every case — ask for a new link from
  // the banner — so distinguishing them only invites them to wonder why.
  return redirectTo(withTenantPrefix(upstream.ok ? '/?verify=ok' : '/?verify=failed', slug));
}

function redirectTo(path: string): Response {
  return new Response(null, {
    status: 303,
    headers: {
      location: path,
      'cache-control': 'no-store',
      // The token is still in this request's URL; without this it would be sent
      // as the referrer of whatever the next page loads.
      'referrer-policy': 'no-referrer',
    },
  });
}

/** Nothing here is static, and a cached confirmation would be meaningless. */
export const dynamic = 'force-dynamic';
