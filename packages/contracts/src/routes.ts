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
    /**
     * Redeem a handoff token for cookies, on the school's own hostname.
     *
     * Only ever called on `{slug}.<domain>`, because that is the entire point:
     * the apex verified the password, this host issues the session (ADR-0009).
     */
    continue: `${API_PREFIX}/auth/continue`,
    /**
     * Confirm an email address (ADR-0012). Public, because the link in the
     * message is followed by someone who may not be signed in — on a phone,
     * days later, in a different browser.
     */
    verifyEmail: `${API_PREFIX}/auth/verify-email`,
    /** Send another confirmation. Requires a session; you can only mail yourself. */
    resendVerification: `${API_PREFIX}/auth/resend-verification`,
  },

  /**
   * Unauthenticated, apex-only, and rate limited.
   *
   * Kept under its own prefix so the shape of the surface is legible from the
   * path alone. Nothing here has a tenant, nothing here has a session, and
   * everything here is reachable by anyone on the internet — which is exactly
   * why it is three endpoints and not a module that grows.
   */
  public: {
    signup: `${API_PREFIX}/public/signup`,
    slugAvailable: `${API_PREFIX}/public/slug-available`,
  },
  students: {
    list: `${API_PREFIX}/students`,
    create: `${API_PREFIX}/students`,
    detail: (id: string) => `${API_PREFIX}/students/${id}`,
    update: (id: string) => `${API_PREFIX}/students/${id}`,
    /** A state change, not a PATCH: it can require a reason and be audited. */
    changeStatus: (id: string) => `${API_PREFIX}/students/${id}/status`,
    /** Soft delete. The register keeps the row; the retention job erases it. */
    remove: (id: string) => `${API_PREFIX}/students/${id}`,
    /** The 360 page: details, guardians and enrolment history in one call. */
    profile: (id: string) => `${API_PREFIX}/students/${id}/profile`,
    guardians: (id: string) => `${API_PREFIX}/students/${id}/guardians`,
    /** Search existing guardians, so a sibling links rather than duplicates. */
    guardianSearch: `${API_PREFIX}/guardians`,
    guardianLink: (id: string) => `${API_PREFIX}/students/${id}/guardians/link`,
    guardianDetach: (id: string, guardianId: string) =>
      `${API_PREFIX}/students/${id}/guardians/${guardianId}`,
  },
  /**
   * Fees. `heads` is the catalogue (Settings › Fees); the per-student
   * structure hangs off the student, because that is what it belongs to.
   */
  fees: {
    heads: `${API_PREFIX}/fees/heads`,
    head: (id: string) => `${API_PREFIX}/fees/heads/${id}`,
    /** Deactivate rather than delete, once a head is in use. */
    studentFees: (studentId: string) => `${API_PREFIX}/students/${studentId}/fees`,
  },
  /**
   * Vouchers.
   *
   * `preview` and `generate` take the same body and run the same code path;
   * the only difference is that one writes. That is deliberate — a preview
   * computed a second way is a preview that eventually disagrees with reality.
   */
  vouchers: {
    list: `${API_PREFIX}/fee-vouchers`,
    detail: (id: string) => `${API_PREFIX}/fee-vouchers/${id}`,
    preview: `${API_PREFIX}/fee-vouchers/preview`,
    generate: `${API_PREFIX}/fee-vouchers/generate`,
    cancel: (id: string) => `${API_PREFIX}/fee-vouchers/${id}/cancel`,
    pay: (id: string) => `${API_PREFIX}/fee-vouchers/${id}/payments`,
    waive: (id: string) => `${API_PREFIX}/fee-vouchers/${id}/waive`,
    /** The GR-number / name typeahead on the generate screen. */
    studentLookup: `${API_PREFIX}/fee-vouchers/student-lookup`,
  },
  /**
   * Attendance.
   *
   * Marking and reporting are separate routes rather than one endpoint with a
   * mode flag: they carry different permissions, and a teacher who may mark
   * their own class is not always someone who may read the whole school.
   */
  attendance: {
    /** The class cards, with the day's counts already on them. */
    classes: `${API_PREFIX}/attendance/classes`,
    roster: (classLevelId: string) => `${API_PREFIX}/attendance/classes/${classLevelId}`,
    mark: `${API_PREFIX}/attendance/mark`,
    staffRoster: `${API_PREFIX}/attendance/staff`,
    markStaff: `${API_PREFIX}/attendance/staff/mark`,
    studentReport: (classLevelId: string) =>
      `${API_PREFIX}/attendance/reports/classes/${classLevelId}`,
    staffReport: `${API_PREFIX}/attendance/reports/staff`,
  },
  academics: {
    /** Classes with their current-session sections, and the session itself. */
    setup: `${API_PREFIX}/academics/setup`,
    sessions: `${API_PREFIX}/academics/sessions`,
    session: (id: string) => `${API_PREFIX}/academics/sessions/${id}`,
    /** Making one session current necessarily un-currents the other. */
    makeSessionCurrent: (id: string) => `${API_PREFIX}/academics/sessions/${id}/make-current`,
    classes: `${API_PREFIX}/academics/classes`,
    class: (id: string) => `${API_PREFIX}/academics/classes/${id}`,
    sections: `${API_PREFIX}/academics/sections`,
    section: (id: string) => `${API_PREFIX}/academics/sections/${id}`,
    holidays: `${API_PREFIX}/academics/holidays`,
    holiday: (id: string) => `${API_PREFIX}/academics/holidays/${id}`,
  },
  expenses: {
    list: `${API_PREFIX}/expenses`,
    create: `${API_PREFIX}/expenses`,
    detail: (id: string) => `${API_PREFIX}/expenses/${id}`,
    categories: `${API_PREFIX}/expenses/categories`,
    category: (id: string) => `${API_PREFIX}/expenses/categories/${id}`,
  },
  staff: {
    list: `${API_PREFIX}/staff`,
    create: `${API_PREFIX}/staff`,
    detail: (id: string) => `${API_PREFIX}/staff/${id}`,
    update: (id: string) => `${API_PREFIX}/staff/${id}`,
    remove: (id: string) => `${API_PREFIX}/staff/${id}`,
  },
  health: `${API_PREFIX}/health`,

  /**
   * The platform console.
   *
   * Namespaced under its own prefix so the guard chain can tell the two apart
   * from the path alone: everything here rejects a tenant token, and nothing
   * outside it accepts a platform one.
   */
  platform: {
    auth: {
      login: `${PLATFORM_PREFIX}/auth/login`,
      logout: `${PLATFORM_PREFIX}/auth/logout`,
      session: `${PLATFORM_PREFIX}/auth/session`,
    },
    schools: {
      list: `${PLATFORM_PREFIX}/schools`,
      create: `${PLATFORM_PREFIX}/schools`,
      slugAvailable: `${PLATFORM_PREFIX}/schools/slug-available`,
      changeStatus: (id: string) => `${PLATFORM_PREFIX}/schools/${id}/status`,
    },
  },
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
