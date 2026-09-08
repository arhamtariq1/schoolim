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
 */
export function schoolOrigin(slug: string, appDomain: string, webUrl?: string): string {
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
