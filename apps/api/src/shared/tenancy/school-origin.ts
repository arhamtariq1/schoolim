/**
 * The absolute origin a school is reached at.
 *
 * Tenants resolve from the hostname, so "where does this school live" is a
 * string built from the slug and the apex domain — and it is built in more than
 * one place: the platform console hands an operator a login URL, and sign-in at
 * the apex hands the browser a handoff URL. Two copies of this expression is
 * one copy that ends up pointing at the wrong port in development and the wrong
 * scheme in production.
 *
 * `localhost` is the only special case, and it is special twice: plain HTTP,
 * and the portal listens on a port the apex domain does not imply. The port is
 * read from `WEB_URL` rather than assumed to be 3000 — it was hard-coded here
 * until a machine with something else already on 3000 produced handoff links
 * that pointed at the wrong application.
 *
 * ## Path mode
 *
 * Under `PORTAL_TENANT_MODE=path` a school has no hostname of its own — the
 * whole product sits on one shared host, with the school in the first path
 * segment. Everything this function feeds appends a path to it (`/login`,
 * `/auth/continue`, `/verify-email`), so returning `WEB_URL` with the slug
 * already on the end keeps every one of those call sites unchanged.
 *
 * That mode is temporary; see `docs/SINGLE-HOST-MODE.md`.
 */
export type PortalTenantMode = 'subdomain' | 'path';

export function schoolOrigin(
  slug: string,
  appDomain: string,
  webUrl?: string,
  mode: PortalTenantMode = 'subdomain',
): string {
  if (mode === 'path') {
    // The portal's own address, with the school appended as a path segment.
    // Falls back rather than throwing: a missing WEB_URL must not take sign-in
    // down, and localhost:3000 is right for every ordinary local setup.
    const base = (webUrl ?? 'http://localhost:3000').replace(/\/+$/, '');
    return `${base}/${slug}`;
  }

  if (appDomain !== 'localhost') {
    return `https://${slug}.${appDomain}`;
  }

  let port = '3000';
  if (webUrl !== undefined) {
    try {
      const parsed = new URL(webUrl);
      port = parsed.port === '' ? (parsed.protocol === 'https:' ? '443' : '80') : parsed.port;
    } catch {
      // A malformed WEB_URL must not break sign-in. The default is right for
      // every ordinary local setup.
    }
  }

  return `http://${slug}.localhost:${port}`;
}
