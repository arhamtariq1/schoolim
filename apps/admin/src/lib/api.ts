import { ROUTES, type PlatformSession } from '@ilm/contracts';
import { cookies as nextCookies } from 'next/headers';

/**
 * Call the platform API from a server component.
 *
 * Simpler than the portal's equivalent, and the difference is the point: there
 * is no tenant to resolve, no `x-school-slug`, no host to forward. The console
 * belongs to no school, so nothing here can accidentally act as one.
 *
 * The access token stays an httpOnly cookie that this process passes along.
 * Nothing decodes it; the API is the only thing that decides whether a session
 * is valid.
 */

export type ApiResult<T> =
  | { readonly ok: true; readonly data: T }
  | { readonly ok: false; readonly status: number; readonly message: string };

export async function apiFetch<T>(path: string): Promise<ApiResult<T>> {
  const jar = await nextCookies();
  const cookie = jar
    .getAll()
    .map((entry) => `${entry.name}=${entry.value}`)
    .join('; ');

  const base = process.env['API_URL'] ?? 'http://localhost:4000';

  try {
    const response = await fetch(`${base}${path}`, {
      headers: { cookie },
      cache: 'no-store',
    });

    if (!response.ok) {
      const problem = (await response.json().catch(() => ({}))) as { detail?: string };
      return {
        ok: false,
        status: response.status,
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

/** The signed-in operator, or undefined. */
export async function getPlatformSession(): Promise<PlatformSession | undefined> {
  const result = await apiFetch<{ data: PlatformSession }>(ROUTES.platform.auth.session);
  return result.ok ? result.data.data : undefined;
}
