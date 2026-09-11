'use client';

import { usePathname } from 'next/navigation';
import { useCallback } from 'react';

import {
  TENANT_MODE,
  tenantSlugFromPathname,
  withTenantPrefix,
  withoutTenantPrefix,
} from './tenant-mode';

/**
 * Turn an internal path into a link that works in the current tenant mode.
 *
 * In subdomain mode this is the identity function and every call site is
 * unchanged — which is the point. Screens write the canonical path they always
 * wrote (`/students`, `/fees/vouchers`) and this puts the school in front of it
 * only when the deployment needs it there.
 *
 * ## Why the school comes from the URL and not from a context
 *
 * The proxy rewrites `/beacon/students` onto the `/students` route, and a
 * rewrite is invisible to the client router — the browser's address bar, and
 * therefore `usePathname()`, still reads `/beacon/students`. So the URL already
 * carries the answer on every render, including after a client-side navigation,
 * with nothing to thread through the tree and nothing to go stale.
 *
 * ## Use it for `router.push` too
 *
 * A `push('/students')` in path mode navigates to the unprefixed path. The
 * proxy notices the missing school, finds the `ilm_school` cookie and redirects
 * — so it recovers rather than breaking, but at the cost of a round trip and a
 * visible URL flicker. Prefixing is the difference between working and working
 * properly.
 */
export function useTenantHref(): (path: string) => string {
  const pathname = usePathname();

  return useCallback(
    (path: string) => {
      if (TENANT_MODE !== 'path') {
        return path;
      }
      return withTenantPrefix(path, tenantSlugFromPathname(pathname));
    },
    [pathname],
  );
}

/**
 * The current school, as the address names it. `undefined` in subdomain mode,
 * where the host names it and no component needs to know.
 */
export function useTenantSlug(): string | undefined {
  return tenantSlugFromPathname(usePathname());
}

/**
 * The current path with any school prefix removed.
 *
 * What "am I on this page?" checks must compare against: the nav is written in
 * canonical paths, and `usePathname()` in path mode returns the prefixed one,
 * so comparing them directly would light up nothing.
 */
export function useCanonicalPathname(): string {
  return withoutTenantPrefix(usePathname());
}
