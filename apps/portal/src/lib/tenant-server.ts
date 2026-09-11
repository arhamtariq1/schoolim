import { headers } from 'next/headers';

import { TENANT_MODE, withTenantPrefix } from './tenant-mode';

import { TENANT_PREFIX_HEADER } from '@/proxy';


/**
 * The school prefix, for a Server Component.
 *
 * `usePathname()` is a client hook, so the handful of server-rendered pages
 * that build links cannot use `useTenantHref`. The proxy already knows the
 * school — it is what rewrote the request — so it passes it down as a request
 * header rather than every page re-deriving it from a URL it cannot see.
 *
 * Returns `''` in subdomain mode, and `''` on any path with no school (the
 * apex, sign-in), so callers never need to branch.
 */
export async function tenantPrefix(): Promise<string> {
  if (TENANT_MODE !== 'path') {
    return '';
  }
  return (await headers()).get(TENANT_PREFIX_HEADER) ?? '';
}

/** `tenantHref('/students')` → `/beacon/students`, from a Server Component. */
export async function tenantHref(path: string): Promise<string> {
  const prefix = await tenantPrefix();
  return prefix === '' ? path : withTenantPrefix(path, prefix.slice(1));
}
