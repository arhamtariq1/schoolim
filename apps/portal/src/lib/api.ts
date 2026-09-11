import { COOKIES } from '@ilm/contracts';
import { schoolSlugFromHost } from '@ilm/utils';
import { headers as nextHeaders, cookies as nextCookies } from 'next/headers';

import { TENANT_MODE } from './tenant-mode';

/**
 * Call the API from a server component, forwarding the caller's session.
 *
 * Two things this centralises, because getting either wrong on one page is a
 * real bug rather than an inconsistency:
 *
 * 1. **The cookie is forwarded, never the token extracted.** The access token
 *    stays an httpOnly cookie value that this process passes along; nothing
 *    parses or re-signs it, and it never reaches the browser bundle.
 * 2. **The tenant is named explicitly** via `x-school-slug`. The API resolves
 *    the tenant from the request host for a browser, but a server-to-server
 *    call cannot use that: in production the API lives at `api.<domain>`, whose
 *    host names no school, and Node's fetch strips a `Host` header outright
 *    because it is forbidden by the Fetch spec.
 *
 *    The header is a hint, not an authority. The API resolves it and requires
 *    it to match the tenant claim inside the session token, so it can only ever
 *    select the school the caller already holds a valid token for.
 *
 *    Where the slug comes from depends on the deployment. Normally the request
 *    host. Under `PORTAL_TENANT_MODE=path` the host names no school, so it
 *    comes from the `ilm_school` cookie the handoff wrote — the same source the
 *    browser-facing API proxy uses, so the two cannot disagree.
 *
 *    **This is not optional.** Without it every server-rendered page fetches
 *    with no tenant, the API refuses, and the screen renders its signed-out
 *    state — a shell with an empty sidebar on a page you are signed in to.
 */

export type ApiResult<T> =
  | { readonly ok: true; readonly data: T }
  | { readonly ok: false; readonly status: number; readonly message: string };

export async function apiFetch<T>(path: string): Promise<ApiResult<T>> {
  const [jar, incoming] = await Promise.all([nextCookies(), nextHeaders()]);

  const cookie = jar
    .getAll()
    .map((entry) => `${entry.name}=${entry.value}`)
    .join('; ');

  const base = process.env['API_URL'] ?? 'http://localhost:4000';
  const appDomain = process.env['APP_DOMAIN'] ?? 'localhost';
  const slug =
    TENANT_MODE === 'path'
      ? (jar.get(COOKIES.school)?.value ?? undefined)
      : schoolSlugFromHost(incoming.get('host') ?? undefined, appDomain);

  try {
    const response = await fetch(`${base}${path}`, {
      headers: {
        cookie,
        ...(slug === undefined || slug === '' ? {} : { 'x-school-slug': slug }),
      },
      // A tenant-scoped list must never be served from a shared cache.
      cache: 'no-store',
    });

    if (!response.ok) {
      const problem = (await response.json().catch(() => ({}))) as { detail?: string };
      return {
        ok: false,
        status: response.status,
        // The API writes `detail` for the person reading it, so it is safe to
        // surface. Anything unexpected falls back to something non-technical.
        message: problem.detail ?? 'That did not load. Trying again usually works.',
      };
    }

    return { ok: true, data: (await response.json()) as T };
  } catch {
    return {
      ok: false,
      status: 0,
      message: 'Could not reach the server. Check your connection and try again.',
    };
  }
}
