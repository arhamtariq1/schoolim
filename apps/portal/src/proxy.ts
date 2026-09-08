import { COOKIES } from '@ilm/contracts';
import { schoolSlugFromHost } from '@ilm/utils';
import { NextResponse, type NextRequest } from 'next/server';

import { isAccessTokenExpired, refreshSession, withCookie } from '@/lib/refresh';

/**
 * One deployment, two websites.
 *
 * Next 16 renamed `middleware.ts` to `proxy.ts`; this is that file, and it is not
 * the same thing as `app/api/v1/[...path]/route.ts`, which the comments there
 * also call a proxy. This one decides *which site* a request is for. That one
 * forwards API calls to NestJS.
 *
 * The portal now answers on two kinds of address, and they are not variations
 * of each other — they are different products sharing a process:
 *
 * - **The apex** (`<domain>`) is the public site. A landing page, packages,
 *   signup, and a sign-in form that works without knowing which school you are.
 *   It has no tenant and must never render anything that assumes one.
 * - **A school's hostname** (`{slug}.<domain>`) is the school's portal. It has
 *   a tenant in the address, and it is not a marketing site.
 *
 * Splitting them here rather than inside each page is what keeps that
 * distinction honest. A page that has to ask "am I on the apex?" is a page that
 * will one day forget to, and forgetting means either rendering a school's
 * shell with no school, or serving a signup form on a school's own address.
 *
 * ## Why the marketing home is `/welcome` and not `/`
 *
 * `/` is the school's workspace and both hosts want the same path, so one of
 * them has to be a rewrite. Making the apex the rewritten one means the school
 * portal — the thing people use every day — keeps the plain route, and the URL
 * bar on the marketing site still reads as the bare domain.
 */

const APP_DOMAIN = process.env['APP_DOMAIN'] ?? 'localhost';

/** Paths the public site owns. Everything else on the apex is not a page. */
const PUBLIC_PATHS = new Set(['/welcome', '/signup', '/login']);

/**
 * The only paths on a school's own address that a signed-out person may reach.
 *
 * `/auth/continue` and `/verify-email` are route handlers arriving from an
 * email or from the apex, and both are reached *without* a session by
 * definition — they are how one starts. Redirecting them to `/login` would
 * break the two flows that exist to get somebody signed in.
 */
const SCHOOL_ANONYMOUS_PATHS = new Set(['/login', '/auth/continue', '/verify-email']);

export async function proxy(request: NextRequest): Promise<NextResponse> {
  const { pathname } = request.nextUrl;
  const slug = schoolSlugFromHost(request.headers.get('host') ?? undefined, APP_DOMAIN);

  // The API proxy is host-agnostic on purpose: at the apex it forwards sign-in
  // with no tenant hint, which is exactly what makes global sign-in work
  // (ADR-0009). Never rewrite or redirect it.
  if (pathname.startsWith('/api/')) {
    return NextResponse.next();
  }

  if (slug === undefined) {
    if (pathname === '/') {
      return NextResponse.rewrite(new URL('/welcome', request.url));
    }

    if (PUBLIC_PATHS.has(pathname)) {
      return NextResponse.next();
    }

    // A school route reached with no school in the address. This is the case
    // that used to render a sign-in form and then answer "that password is not
    // correct" for a correct password, because the API had no school to look
    // the account up in. Send them to the front door instead.
    return NextResponse.redirect(new URL('/', request.url));
  }

  // On a school's own address, the marketing site does not exist. Somebody
  // following a signup link from an email while already inside their portal
  // should land in their portal, not on a form offering them a second school.
  if (pathname === '/welcome' || pathname === '/signup') {
    return NextResponse.redirect(new URL('/', request.url));
  }

  return renewIfExpired(request, slug);
}

/**
 * Spend the refresh token before a page renders, when the access token is gone.
 *
 * This is the fix for being signed out mid-afternoon. The access token lives
 * fifteen minutes and the session thirty days; nothing ever spent the refresh
 * token, so the gap between those numbers was exactly how long a person could
 * work before the next page said "your session has ended".
 *
 * It has to happen **here** rather than in the page. A React Server Component
 * cannot set a cookie, so the component that discovers the expiry is the one
 * place that cannot fix it.
 *
 * Two things are updated on the way through, and both are necessary:
 *
 * - the **response** carries the new cookies, so the browser stores them;
 * - the **request** carries the new access token, so the render that is already
 *   under way uses it. Without that second step the person still sees the
 *   session-ended screen once, and only the page after it works.
 */
async function renewIfExpired(request: NextRequest, slug: string): Promise<NextResponse> {
  const hasRefresh = request.cookies.has(COOKIES.refreshToken);

  // No refresh token: either a signed-out visitor, or — the case that produced
  // the reported bug — a browser still holding one at the old narrow path,
  // where it is not sent on a page request. Asking the API anyway would add a
  // round trip to every anonymous hit, and there is nothing to ask *with*.
  if (!hasRefresh) {
    return signedOut(request);
  }

  // Whether the token has **expired**, not whether the cookie exists.
  //
  // That distinction is the whole bug this function was written for and then
  // got wrong: the access cookie carries no `expires`, so a browser holds it
  // for the rest of the session while the token inside dies after fifteen
  // minutes. Testing for presence meant renewal was skipped in precisely the
  // state that needed it, and the next page render said "your session has
  // ended" — with the mutation that preceded it having returned 200.
  if (!isAccessTokenExpired(request.cookies.get(COOKIES.accessToken)?.value)) {
    return NextResponse.next();
  }

  const apiBase = process.env['API_URL'] ?? 'http://localhost:4000';
  const cookieHeader = request.headers.get('cookie') ?? '';
  const renewed = await refreshSession(apiBase, slug, cookieHeader);

  if (!renewed.ok) {
    // `rejected`, not `!ok`. A revoked or expired session is over and the
    // person should be told; an API that could not be reached is a blip, and
    // bouncing everyone to the sign-in page on a restart would be a worse bug
    // than the one this function fixes. That case renders as it would have.
    return renewed.rejected ? signedOut(request) : NextResponse.next();
  }

  const headers = new Headers(request.headers);
  if (renewed.accessToken !== undefined) {
    headers.set('cookie', withCookie(cookieHeader, COOKIES.accessToken, renewed.accessToken));
  }

  const response = NextResponse.next({ request: { headers } });
  for (const cookie of renewed.setCookies) {
    response.headers.append('set-cookie', cookie);
  }

  return response;
}

/**
 * There is no session and no way to get one. Send them to sign in.
 *
 * The alternative is what the bug report showed: the shell renders with an
 * empty sidebar, a grey "N" where the avatar goes, and a red box quoting the
 * API's own words back at the person — "Your session has expired." That is a
 * broken-looking page, and it hides the one thing they can do about it.
 *
 * Anonymous paths are left alone, and that exemption is what stops this from
 * being a redirect loop: `/login` is reached without a session by definition.
 */
function signedOut(request: NextRequest): NextResponse {
  if (SCHOOL_ANONYMOUS_PATHS.has(request.nextUrl.pathname)) {
    return NextResponse.next();
  }

  const target = new URL('/login', request.url);
  // Distinct from `?expired`, which `/auth/continue` sets for a dead handoff
  // link. Same outcome, different sentence — "that link has expired" is a
  // confusing thing to read when you did not follow a link.
  target.searchParams.set('session', 'expired');
  return NextResponse.redirect(target);
}

export const config = {
  /**
   * Everything except Next's own assets. The matcher is an exclusion list
   * rather than an inclusion one so that a route added later is covered by
   * default — the failure mode of forgetting to add a path here is a school
   * page served on the apex, and defaults should fail toward the safe side.
   */
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)',
  ],
};
