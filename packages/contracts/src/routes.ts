/**
 * API route constants.
 *
 * docs/11 section 1: the version lives in the path, resources are plural
 * kebab-case nouns, and a state change is an explicit action endpoint rather
 * than a `PATCH { status }` — because `POST /vouchers/:id/cancel` can require a
 * reason, check invariants and write a meaningful audit entry, and a generic
 * status patch can do none of those.
 *
 * Declared here so the API and both apps cannot drift on a path string.
 */

export const API_VERSION = 'v1';
export const API_PREFIX = `/api/${API_VERSION}` as const;

/** Platform routes are namespaced; a tenant token never satisfies them. */
export const PLATFORM_PREFIX = `${API_PREFIX}/platform` as const;

export const ROUTES = {
  auth: {
    login: `${API_PREFIX}/auth/login`,
    logout: `${API_PREFIX}/auth/logout`,
    refresh: `${API_PREFIX}/auth/refresh`,
    session: `${API_PREFIX}/auth/session`,
    forgotPassword: `${API_PREFIX}/auth/forgot-password`,
    resetPassword: `${API_PREFIX}/auth/reset-password`,
    acceptInvite: `${API_PREFIX}/auth/accept-invite`,
  },
  health: `${API_PREFIX}/health`,
} as const;

/**
 * Cookie names.
 *
 * docs/11 section 8: browser clients use httpOnly cookies, never
 * `localStorage`. The `ilm_` prefix is one of the four places the placeholder
 * brand is permitted (D4 containment rule, docs/15 Part C) — renaming the
 * product changes these constants and nothing else.
 */
export const COOKIES = {
  /** School portal access token. */
  accessToken: 'ilm_at',
  /** School portal refresh token; opaque, rotated, stored hashed. */
  refreshToken: 'ilm_rt',
  /** Double-submit CSRF token, readable by script by design. */
  csrf: 'ilm_csrf',
  /** Platform console tokens. Separate names so the two can never be confused. */
  platformAccessToken: 'ilm_pat',
  platformRefreshToken: 'ilm_prt',
} as const;

export const HEADERS = {
  requestId: 'x-request-id',
  idempotencyKey: 'idempotency-key',
  csrf: 'x-csrf-token',
} as const;
