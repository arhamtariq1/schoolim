import { ROUTES, type SessionUser } from '@ilm/contracts';
import { cache } from 'react';

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
 *
 * ## Once per request, explicitly
 *
 * `cache()` de-duplicates this for the life of a single server render, so a
 * page that asks for the session *and* renders a shell that also asks for it
 * costs one round trip rather than two. Five pages do exactly that today.
 *
 * Next very likely memoises the underlying `fetch` anyway, and that is the
 * point: "very likely" is not something the hottest call on every page should
 * rest on. It is version-specific behaviour, it is invisible when it stops
 * happening, and the failure mode is a silent doubling of load on the one
 * endpoint every single render touches. Three lines make it a property of this
 * function instead of a property of the framework.
 *
 * It caches nothing across requests: `cache` is per-render, so two people never
 * share a session, and the same person's next page re-reads it.
 */
export const getSession = cache(async (): Promise<SessionUser | undefined> => {
  const result = await apiFetch<{ data: SessionUser }>(ROUTES.auth.session);
  return result.ok ? result.data.data : undefined;
});
