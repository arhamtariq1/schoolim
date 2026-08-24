/**
 * Resolving a tenant from the request host.
 *
 * docs/09 section 2: the school is resolved from the subdomain, never from a
 * school picker at login — a picker would leak the list of tenants to anyone
 * who loaded the page.
 */

/** Subdomains that are never a school. */
const RESERVED_SUBDOMAINS = new Set([
  'www',
  'api',
  'admin',
  'app',
  'status',
  'docs',
  'mail',
  'static',
  'assets',
]);

/**
 * Extract the school slug from a request host.
 *
 * Returns `undefined` when the host is the apex domain, a reserved subdomain,
 * or does not belong to the configured domain at all. Callers must treat
 * `undefined` as "no tenant", never as "any tenant".
 *
 * @param host       the `Host` header, possibly with a port
 * @param appDomain  the apex domain, e.g. `example.pk`
 */
export function schoolSlugFromHost(
  host: string | undefined,
  appDomain: string,
): string | undefined {
  if (host === undefined || host === '') {
    return undefined;
  }

  // Strip the port, and any IPv6 brackets.
  const hostname = host
    .split(':')[0]
    ?.replace(/^\[|\]$/g, '')
    .toLowerCase();
  if (hostname === undefined || hostname === '') {
    return undefined;
  }

  const domain = appDomain.toLowerCase();
  if (hostname === domain) {
    return undefined;
  }

  const suffix = `.${domain}`;
  if (!hostname.endsWith(suffix)) {
    return undefined;
  }

  const label = hostname.slice(0, -suffix.length);

  // Only a single label is a tenant. `a.b.example.pk` is not `a`, it is nothing —
  // treating it as a tenant would let a wildcard certificate holder pick any
  // school by prefixing labels.
  if (label === '' || label.includes('.')) {
    return undefined;
  }

  if (RESERVED_SUBDOMAINS.has(label)) {
    return undefined;
  }

  return label;
}
