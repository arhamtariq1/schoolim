import { schoolSlugFromHost } from '@ilm/utils';
import { type FastifyRequest } from 'fastify';

/**
 * Which school is this request for?
 *
 * One function, used by both the tenant guard and sign-in, because the two
 * answering differently is exactly the bug that made a correct password look
 * wrong: the guard had learned to read `x-school-slug` and sign-in had not, so
 * a browser reached the API through the portal and no school could be found.
 *
 * Two sources, in order:
 *
 * 1. **`x-school-slug`**, set by whatever fronts the API on the school's own
 *    hostname — the portal's `/api/v1` handler in development, the ingress in
 *    production. It exists because the API is reached at `api.<domain>`, whose
 *    Host names no school, and because `Host` is a forbidden header that
 *    `fetch` strips outright.
 * 2. **The request Host**, for anything talking to the API directly.
 *
 * ## This header is not a privilege
 *
 * It selects a *namespace*, never an authorisation. On an authenticated route
 * `TenantGuard` resolves it and requires the result to equal the tenant claim
 * inside the session token, so it can only ever name the school the caller
 * already holds a valid token for. On sign-in there is no token yet, and it
 * chooses which school's accounts the credentials are checked against — which
 * grants nothing, since anyone can reach that school's hostname directly and
 * the answer to a wrong password is identical either way.
 *
 * The proxy in front of it drops any caller-supplied value and re-derives it
 * from the Host the browser actually used, so the two agree by construction.
 */
export function resolveTenantSlug(
  request: Pick<FastifyRequest, 'headers'>,
  appDomain: string,
): string | undefined {
  const hinted = request.headers['x-school-slug'];
  if (typeof hinted === 'string' && hinted.trim() !== '') {
    return hinted.trim().toLowerCase();
  }
  return schoolSlugFromHost(request.headers.host, appDomain);
}
