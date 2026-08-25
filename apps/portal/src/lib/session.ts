import { ROUTES, type SessionUser } from '@ilm/contracts';

import { apiFetch } from './api';

/**
 * Read the current session on the server.
 *
 * The access token is an httpOnly cookie, so it is only reachable here — never
 * from client JavaScript (docs/11 §8). This asks the API rather than decoding
 * the token locally: the API is the one place that decides whether a session is
 * valid, and a second decoder in the frontend is a second thing to get wrong.
 *
 * It goes through `apiFetch` so the **Host header is forwarded**. The API
 * resolves the tenant from that header, so a call without it is rejected as a
 * tenant mismatch — which surfaces as "your session has ended" on a perfectly
 * good session, and is a genuinely confusing way to lose an afternoon.
 */
export async function getSession(): Promise<SessionUser | undefined> {
  const result = await apiFetch<{ data: SessionUser }>(ROUTES.auth.session);
  return result.ok ? result.data.data : undefined;
}
