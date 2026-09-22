/**
 * How the portal learns which school a request is for.
 *
 * ## This is a temporary deployment mode, not a design change
 *
 * The product resolves the tenant from the **hostname**: `beacon.example.pk` is
 * Beacon's portal, and that is what gives every school its own origin — and so
 * its own cookie jar, which is why Beacon's browser physically never holds
 * Demo's session token.
 *
 * That needs a wildcard DNS record and a wildcard TLS certificate, which needs
 * a domain you own. `*.vercel.app` and `*.netlify.app` cannot provide either.
 * So `path` mode exists to put the product on a shared host until a domain is
 * available, by moving the school from the subdomain into the first path
 * segment:
 *
 *     subdomain   https://beacon.example.pk/students
 *     path        https://schoolim-portal.vercel.app/beacon/students
 *
 * **`subdomain` is the default and the intended production mode.** Switching
 * back is one environment variable — see `docs/SINGLE-HOST-MODE.md`.
 *
 * ## What path mode costs
 *
 * One origin means one cookie jar, so one session at a time: signing into a
 * second school in a second tab replaces the first. The isolation itself does
 * not weaken — `TenantGuard` still requires the resolved slug to equal the
 * `sid` claim in the session token, so a hand-edited URL is a 401, not a
 * crossing. What is lost is the structural guarantee that made that check
 * belt-and-braces rather than the only belt.
 */

export type TenantMode = 'subdomain' | 'path';

/**
 * Read from `NEXT_PUBLIC_` so client components see the same value the server
 * does. A mismatch between the two would produce links the proxy then rejects.
 *
 * Anything other than the literal `path` is `subdomain`: a typo must fail
 * toward the mode with the stronger isolation, never away from it.
 */
export const TENANT_MODE: TenantMode =
  process.env['NEXT_PUBLIC_PORTAL_TENANT_MODE'] === 'path' ? 'path' : 'subdomain';

/**
 * Paths the public site owns on the apex, where there is no school at all.
 *
 * `/` is in here and `UNPREFIXED_PATHS` below is not, and the difference is the
 * point: on the apex `/` is the landing page, but inside a school it is the
 * dashboard. So it is public *as an address* and still takes a prefix *as a
 * link*.
 */
const PUBLIC_PATHS: ReadonlySet<string> = new Set([
  '/',
  '/welcome',
  '/signup',
  '/signup/school',
  '/login',
  '/forgot-password',
  '/otp-verification',
  '/new-password',
]);

export function isPublicPath(pathname: string): boolean {
  return PUBLIC_PATHS.has(pathname);
}

/**
 * Paths that never take a school prefix, even when one is available.
 *
 * Sign-in is the one that matters: it is reached *before* a school is known,
 * which is the entire premise of the global sign-in in ADR-0009. Prefixing it
 * would mean needing to know your school in order to find out which schools you
 * belong to.
 */
const UNPREFIXED_PATHS: ReadonlySet<string> = new Set([
  '/welcome',
  '/signup',
  '/signup/school',
  '/login',
  '/forgot-password',
  '/otp-verification',
  '/new-password',
]);

/**
 * The first path segments the portal's own routes occupy.
 *
 * This list is what stops `/students` being read as a school called
 * "students". In subdomain mode there is no ambiguity — `students.example.pk`
 * is plainly a host — but in path mode the first segment is either a slug or a
 * route and something has to decide which.
 *
 * It deliberately does **not** reuse `RESERVED_SLUGS` from the contracts, even
 * though the two overlap. That list governs which names a school may register,
 * product-wide and permanently; this one is a routing detail of a temporary
 * deployment mode, and tying them together would leave a permanent restriction
 * behind after the mode is gone.
 *
 * Keep it in step with the top-level directories under `app/`.
 */
const APP_ROUTE_SEGMENTS: ReadonlySet<string> = new Set([
  'academics',
  'api',
  'attendance',
  'auth',
  'fees',
  'finance',
  'forgot-password',
  'login',
  'new-password',
  'otp-verification',
  'requests',
  'settings',
  'signup',
  'staff',
  'students',
  'verify-email',
  'welcome',
]);

/** A school slug is lowercase letters, digits and hyphens. */
const SLUG_PATTERN = /^[a-z0-9][a-z0-9-]*$/;

/**
 * The school named by a URL path, in path mode.
 *
 * Returns `undefined` in subdomain mode — there, the host names the school and
 * the path never does. Also `undefined` when the first segment is one of our
 * own routes, so `/students` is the register with no school selected rather
 * than a school called "students".
 */
export function tenantSlugFromPathname(pathname: string): string | undefined {
  if (TENANT_MODE !== 'path') {
    return undefined;
  }

  const first = pathname.split('/')[1] ?? '';
  if (first === '' || APP_ROUTE_SEGMENTS.has(first) || !SLUG_PATTERN.test(first)) {
    return undefined;
  }

  return first;
}

/**
 * The path with any school prefix removed — what the route tree actually
 * matches.
 *
 * The route files are unchanged by this mode: `app/students/page.tsx` still
 * serves `/students`. The proxy rewrites `/beacon/students` onto it. Keeping
 * the tree canonical is what makes switching back a configuration change
 * instead of a file move.
 */
export function withoutTenantPrefix(pathname: string): string {
  const slug = tenantSlugFromPathname(pathname);
  if (slug === undefined) {
    return pathname;
  }

  const rest = pathname.slice(`/${slug}`.length);
  return rest === '' ? '/' : rest;
}

/**
 * Add the school prefix to an internal link.
 *
 * Identity in subdomain mode, so every call site can use it unconditionally and
 * no screen has to know which mode it is running in.
 *
 * Query strings and fragments are preserved, because plenty of links here carry
 * one — `?date=2026-09-07` on the attendance screens especially.
 */
export function withTenantPrefix(path: string, slug: string | undefined): string {
  if (TENANT_MODE !== 'path' || slug === undefined || slug === '') {
    return path;
  }

  // Absolute URLs, mailto:, tel: and anchors are somebody else's business.
  if (!path.startsWith('/')) {
    return path;
  }

  const cut = path.search(/[?#]/);
  const pathname = cut === -1 ? path : path.slice(0, cut);
  const suffix = cut === -1 ? '' : path.slice(cut);

  if (UNPREFIXED_PATHS.has(pathname)) {
    return path;
  }

  // Already prefixed. Guards against a call site that prefixes and then passes
  // the result to something that prefixes again — which would produce
  // `/beacon/beacon/students` and a 404 rather than an obvious error.
  if (tenantSlugFromPathname(pathname) !== undefined) {
    return path;
  }

  const base = pathname === '/' ? '' : pathname;
  return `/${slug}${base}${suffix}`;
}
