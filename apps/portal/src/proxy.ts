import { COOKIES } from '@ilm/contracts';
import { schoolSlugFromHost } from '@ilm/utils';
import { NextResponse, type NextRequest } from 'next/server';

import { isAccessTokenExpired, refreshSession, withCookie } from '@/lib/refresh';
import {
  TENANT_MODE,
  isPublicPath,
  tenantSlugFromPathname,
  withoutTenantPrefix,
} from '@/lib/tenant-mode';

/**
 * One deployment, two websites.
 *
 * Next 16 renamed `middleware.ts` to `proxy.ts`; this is that file, and it is not
 * the same thing as `app/api/v1/[...path]/route.ts`, which the comments there
 * also call a proxy. This one decides *which site* a request is for. That one
 * forwards API calls to NestJS.
 *
 * The portal answers on two kinds of address, and they are not variations of
 * each other — they are different products sharing a process:
 *
 * - **The apex** (`<domain>`) is the public site. A landing page, packages,
 *   signup, and a sign-in form that works without knowing which school you are.
 *   It has no tenant and must never render anything that assumes one.
 * - **A school's portal**, which has a tenant in the address.
 *
 * Splitting them here rather than inside each page is what keeps that
 * distinction honest. A page that has to ask "am I on the apex?" is a page that
 * will one day forget to, and forgetting means either rendering a school's
 * shell with no school, or serving a signup form on a school's own address.
 *
 * ## Where the school comes from
 *
 * Normally the hostname: `beacon.<domain>`. Under `PORTAL_TENANT_MODE=path` —
 * a temporary mode for hosts that cannot give us wildcard subdomains — it is
 * the first path segment instead, and this file rewrites `/beacon/students`
 * onto the `/students` route so **the route tree never changes between modes**.
 * See `lib/tenant-mode.ts` and `docs/SINGLE-HOST-MODE.md`.
 *
 * ## Why the marketing home is `/welcome` and not `/`
 *
 * `/` is the school's workspace and both hosts want the same path, so one of
 * them has to be a rewrite. Making the apex the rewritten one means the school
 * portal — the thing people use every day — keeps the plain route, and the URL
 * bar on the marketing site still reads as the bare domain.
 */

const APP_DOMAIN = process.env['APP_DOMAIN'] ?? 'localhost';

/**
 * The school prefix, handed to Server Components.
 *
 * A Server Component cannot call `usePathname()`, so the handful that build
 * links read this from `headers()` rather than each re-deriving it. Empty in
 * subdomain mode.
 */
export const TENANT_PREFIX_HEADER = 'x-tenant-prefix';

/**
 * The only paths on a school's address that a signed-out person may reach.
 *
 * `/auth/continue` and `/verify-email` are route handlers arriving from an
 * email or from the apex, and both are reached *without* a session by
 * definition — they are how one starts. Redirecting them to `/login` would
 * break the two flows that exist to get somebody signed in.
 */
const SCHOOL_ANONYMOUS_PATHS = new Set([
  '/login',
  '/forgot-password',
  '/otp-verification',
  '/new-password',
  '/auth/continue',
  '/verify-email',
]);

/**
 * Paths a signed-in person may reach before finishing the first-login profile.
 *
 * Everything else redirects to `/profile/create`. Password change stays exempt
 * because it is an earlier gate than profile.
 */
const PROFILE_INCOMPLETE_ALLOWED = new Set([
  '/profile/create',
  '/settings/password',
  ...SCHOOL_ANONYMOUS_PATHS,
]);

export async function proxy(request: NextRequest): Promise<NextResponse> {
  const { pathname } = request.nextUrl;

  // The API proxy is address-agnostic on purpose: at the apex it forwards
  // sign-in with no tenant hint, which is exactly what makes global sign-in
  // work (ADR-0009). Never rewrite or redirect it.
  if (pathname.startsWith('/api/')) {
    return NextResponse.next();
  }

  const slug =
    TENANT_MODE === 'path'
      ? tenantSlugFromPathname(pathname)
      : schoolSlugFromHost(request.headers.get('host') ?? undefined, APP_DOMAIN);

  // What the route tree sees. Identical to `pathname` in subdomain mode.
  const inner = TENANT_MODE === 'path' ? withoutTenantPrefix(pathname) : pathname;

  if (slug === undefined) {
    if (inner === '/') {
      return NextResponse.rewrite(new URL('/welcome', request.url));
    }

    if (isPublicPath(inner)) {
      return NextResponse.next();
    }

    // A school route reached with no school in the address. In path mode a
    // signed-in person landing here has almost certainly typed or bookmarked
    // the un-prefixed path, and their session already names their school — so
    // send them to the same page inside it rather than to the front door.
    if (TENANT_MODE === 'path') {
      const remembered = request.cookies.get(COOKIES.school)?.value;
      if (remembered !== undefined && remembered !== '') {
        const target = new URL(`/${remembered}${pathname}`, request.url);
        target.search = request.nextUrl.search;
        return NextResponse.redirect(target);
      }
    }

    // This is the case that used to render a sign-in form and then answer "that
    // password is not correct" for a correct password, because the API had no
    // school to look the account up in. Send them to the front door instead.
    return NextResponse.redirect(new URL('/', request.url));
  }

  // The address names one school and the session names another. Rather than
  // letting every API call come back 401 — which reads as "the app is broken"
  // — put them back where their session actually is. Switching schools is
  // signing out and in again, which clears the cookie.
  if (TENANT_MODE === 'path') {
    const remembered = request.cookies.get(COOKIES.school)?.value;
    if (
      remembered !== undefined &&
      remembered !== '' &&
      remembered !== slug &&
      !SCHOOL_ANONYMOUS_PATHS.has(inner)
    ) {
      const target = new URL(`/${remembered}${inner === '/' ? '' : inner}`, request.url);
      target.search = request.nextUrl.search;
      return NextResponse.redirect(target);
    }
  }

  // On a school's own address, the marketing site does not exist. Somebody
  // following a signup link from an email while already inside their portal
  // should land in their portal, not on a form offering them a second school.
  if (inner === '/welcome' || inner === '/signup' || inner === '/signup/school') {
    return NextResponse.redirect(new URL(prefixed('/', slug), request.url));
  }

  return renewIfExpired(request, slug, inner);
}

/** `/students` → `/beacon/students`, for redirect targets built here. */
function prefixed(path: string, slug: string): string {
  if (TENANT_MODE !== 'path') {
    return path;
  }
  return path === '/' ? `/${slug}` : `/${slug}${path}`;
}

/**
 * Carry on to the route, rewriting the school prefix away in path mode.
 *
 * Every "continue" in this file goes through here rather than calling
 * `NextResponse.next()` directly, because in path mode continuing means
 * rewriting and a plain `next()` would 404 on the prefixed path.
 */
function proceed(request: NextRequest, inner: string, headers: Headers): NextResponse {
  headers.set(TENANT_PREFIX_HEADER, tenantPrefixFor(request));

  if (TENANT_MODE !== 'path' || inner === request.nextUrl.pathname) {
    return NextResponse.next({ request: { headers } });
  }

  const target = new URL(inner, request.url);
  target.search = request.nextUrl.search;
  return NextResponse.rewrite(target, { request: { headers } });
}

function tenantPrefixFor(request: NextRequest): string {
  if (TENANT_MODE !== 'path') {
    return '';
  }
  const slug = tenantSlugFromPathname(request.nextUrl.pathname);
  return slug === undefined ? '' : `/${slug}`;
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
async function renewIfExpired(
  request: NextRequest,
  slug: string,
  inner: string,
): Promise<NextResponse> {
  // **A working session renders, and nothing else is asked.**
  //
  // This test comes first, and the order is the fix for a real bug: the refresh
  // check below used to run ahead of it, so a browser holding a perfectly valid
  // access token but no *visible* refresh cookie was bounced to the sign-in
  // page mid-session — losing whatever had been typed. That is exactly the
  // browser the legacy narrow-path cookie produced, which is the state the
  // refresh check was added to rescue. It over-corrected.
  //
  // Reordering costs nothing: this is a local JWT decode, no round trip. An
  // anonymous visitor has no token at all, and `isAccessTokenExpired` reports
  // an absent one as expired, so they fall through to the checks below.
  //
  // Note it asks whether the token has **expired**, not whether the cookie
  // exists. The access cookie carries no `expires`, so a browser holds it for
  // the rest of the session while the token inside dies after fifteen minutes.
  // Testing for presence meant renewal was skipped in precisely the state that
  // needed it, and the next page render said "your session has ended" — with
  // the mutation that preceded it having returned 200.
  if (!isAccessTokenExpired(request.cookies.get(COOKIES.accessToken)?.value)) {
    return gateProfile(request, slug, inner, request.cookies.get(COOKIES.accessToken)?.value);
  }

  // The access token is gone or stale, so renewal is the only way forward.
  //
  // No refresh token means there is nothing to renew *with*: either a
  // signed-out visitor, or a browser still holding one at the old narrow path
  // where it is not sent on a page request. Asking the API anyway would add a
  // round trip to every anonymous hit and could not succeed.
  if (!request.cookies.has(COOKIES.refreshToken)) {
    return signedOut(request, inner);
  }

  const apiBase = process.env['API_URL'] ?? 'http://localhost:4000';
  const cookieHeader = request.headers.get('cookie') ?? '';
  const renewed = await refreshSession(apiBase, slug, cookieHeader);

  if (!renewed.ok) {
    // `rejected`, not `!ok`. A revoked or expired session is over and the
    // person should be told; an API that could not be reached is a blip, and
    // bouncing everyone to the sign-in page on a restart would be a worse bug
    // than the one this function fixes. That case renders as it would have.
    return renewed.rejected
      ? signedOut(request, inner)
      : proceed(request, inner, new Headers(request.headers));
  }

  const headers = new Headers(request.headers);
  if (renewed.accessToken !== undefined) {
    headers.set('cookie', withCookie(cookieHeader, COOKIES.accessToken, renewed.accessToken));
  }

  const response = gateProfile(request, slug, inner, renewed.accessToken ?? undefined, headers);
  for (const cookie of renewed.setCookies) {
    response.headers.append('set-cookie', cookie);
  }

  return response;
}

/**
 * Keep incomplete profiles on `/profile/create` (and password change).
 *
 * Reads the access-token `pc` claim the same way expiry is read — without
 * verifying the signature. A forged claim gains nothing: the API re-checks from
 * the database, and the worst a lie achieves is one wasted redirect.
 *
 * Missing `pc` (tokens issued before this shipped) is treated as complete so
 * existing sessions are not bounced to a form they never asked for.
 */
function gateProfile(
  request: NextRequest,
  slug: string,
  inner: string,
  accessToken: string | undefined,
  headers: Headers = new Headers(request.headers),
): NextResponse {
  const incomplete = isProfileIncomplete(accessToken);

  if (incomplete && !PROFILE_INCOMPLETE_ALLOWED.has(inner)) {
    return NextResponse.redirect(new URL(prefixed('/profile/create', slug), request.url));
  }

  if (!incomplete && inner === '/profile/create') {
    return NextResponse.redirect(new URL(prefixed('/profile', slug), request.url));
  }

  return proceed(request, inner, headers);
}

/** `pc === false` only — absent or true means the portal is unlocked. */
function isProfileIncomplete(token: string | undefined): boolean {
  if (token === undefined || token === '') {
    return false;
  }

  const payload = token.split('.')[1];
  if (payload === undefined) {
    return false;
  }

  try {
    const claims = JSON.parse(Buffer.from(payload, 'base64url').toString()) as { pc?: unknown };
    return claims.pc === false;
  } catch {
    return false;
  }
}

/**
 * There is no session and no way to get one. Send them to sign in.
 */
function signedOut(request: NextRequest, inner: string): NextResponse {
  if (SCHOOL_ANONYMOUS_PATHS.has(inner)) {
    return proceed(request, inner, new Headers(request.headers));
  }

  // Unprefixed in both modes: sign-in belongs to nobody, and in path mode a
  // prefixed /login would need the answer in order to find the question.
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
