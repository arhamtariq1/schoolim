import { z } from 'zod';

/**
 * Error codes and the RFC 9457 `application/problem+json` shape.
 *
 * docs/11 section 4: the frontend switches on `code`, never on `title` or
 * `detail`. `detail` is written for the person reading it — a school
 * accountant, not a developer — and so may be reworded at any time. `code` is a
 * stable machine constant and may not.
 */

export const ERROR_CODES = [
  // --- Authentication and authorisation -------------------------------------
  'AUTH_INVALID_CREDENTIALS',
  'AUTH_ACCOUNT_LOCKED',
  'AUTH_TOKEN_EXPIRED',
  'AUTH_TOKEN_INVALID',
  /** A consumed refresh token was replayed; the whole family is revoked (docs/11 section 8). */
  'AUTH_REFRESH_REUSE_DETECTED',
  'AUTH_MFA_REQUIRED',
  'AUTH_PERMISSION_DENIED',
  /** The JWT tenant claim and the request host disagree (docs/04 section 2). */
  'AUTH_TENANT_MISMATCH',

  // --- Request shape --------------------------------------------------------
  'VALIDATION_FAILED',
  'NOT_FOUND',
  'CONFLICT',
  'RATE_LIMITED',
  'IDEMPOTENCY_KEY_REQUIRED',
  /** Same key, different body — replaying it would hide a real second request. */
  'IDEMPOTENCY_KEY_REUSED',
  'PAYLOAD_TOO_LARGE',
  'UNSUPPORTED_MEDIA_TYPE',

  // --- Tenancy and subscription --------------------------------------------
  'SCHOOL_SUSPENDED',
  /** Dunning put the school in read-only mode; data is never deleted (docs/19 section 4). */
  'SCHOOL_READ_ONLY',
  'FEATURE_NOT_ENABLED',
  'PLAN_LIMIT_EXCEEDED',

  // --- Fees -----------------------------------------------------------------
  'FEES_VOUCHER_ALREADY_PAID',
  'FEES_VOUCHER_CANCELLED',
  'FEES_PAYMENT_EXCEEDS_BALANCE',
  'FEES_PAYMENT_ALREADY_REVERSED',
  'FEES_GENERATION_ALREADY_RUN',
  'FEES_GENERATION_IN_PROGRESS',
  'FEES_RUN_NOT_REVERSIBLE',
  'FEES_NO_FEE_PLAN',
  'FEES_PERIOD_CLOSED',

  // --- Attendance -----------------------------------------------------------
  'ATTENDANCE_ALREADY_MARKED',
  'ATTENDANCE_WINDOW_CLOSED',
  'ATTENDANCE_NOT_A_WORKING_DAY',

  // --- Domain-wide ----------------------------------------------------------
  'BUSINESS_RULE_VIOLATION',
  'IMMUTABLE_RECORD',
  'INTERNAL_ERROR',
] as const;

export type ErrorCode = (typeof ERROR_CODES)[number];

const ERROR_CODE_SET: ReadonlySet<string> = new Set<string>(ERROR_CODES);

export function isErrorCode(value: string): value is ErrorCode {
  return ERROR_CODE_SET.has(value);
}

/**
 * Status usage, fixed so that two endpoints never disagree (docs/11 section 4):
 * 400 validation · 401 unauthenticated · 403 permission denied · 404 not found
 * **or hidden by tenant scope** · 409 state conflict · 422 business rule ·
 * 429 rate limited · 500 unexpected.
 *
 * Cross-tenant access returns 404, never 403 — a 403 confirms the record
 * exists, which is itself a leak.
 */
export const ERROR_STATUS: Readonly<Record<ErrorCode, number>> = {
  AUTH_INVALID_CREDENTIALS: 401,
  AUTH_ACCOUNT_LOCKED: 401,
  AUTH_TOKEN_EXPIRED: 401,
  AUTH_TOKEN_INVALID: 401,
  AUTH_REFRESH_REUSE_DETECTED: 401,
  AUTH_MFA_REQUIRED: 401,
  AUTH_PERMISSION_DENIED: 403,
  AUTH_TENANT_MISMATCH: 401,

  VALIDATION_FAILED: 400,
  NOT_FOUND: 404,
  CONFLICT: 409,
  RATE_LIMITED: 429,
  IDEMPOTENCY_KEY_REQUIRED: 400,
  IDEMPOTENCY_KEY_REUSED: 409,
  PAYLOAD_TOO_LARGE: 413,
  UNSUPPORTED_MEDIA_TYPE: 415,

  SCHOOL_SUSPENDED: 403,
  SCHOOL_READ_ONLY: 403,
  FEATURE_NOT_ENABLED: 403,
  PLAN_LIMIT_EXCEEDED: 403,

  FEES_VOUCHER_ALREADY_PAID: 409,
  FEES_VOUCHER_CANCELLED: 409,
  FEES_PAYMENT_EXCEEDS_BALANCE: 422,
  FEES_PAYMENT_ALREADY_REVERSED: 409,
  FEES_GENERATION_ALREADY_RUN: 409,
  FEES_GENERATION_IN_PROGRESS: 409,
  FEES_RUN_NOT_REVERSIBLE: 422,
  FEES_NO_FEE_PLAN: 422,
  FEES_PERIOD_CLOSED: 422,

  ATTENDANCE_ALREADY_MARKED: 409,
  ATTENDANCE_WINDOW_CLOSED: 422,
  ATTENDANCE_NOT_A_WORKING_DAY: 422,

  BUSINESS_RULE_VIOLATION: 422,
  IMMUTABLE_RECORD: 409,
  INTERNAL_ERROR: 500,
};

/** A single field-level failure inside a validation problem. */
export const fieldErrorSchema = z.object({
  field: z.string(),
  code: z.string(),
  message: z.string(),
});

export type FieldError = z.infer<typeof fieldErrorSchema>;

/** RFC 9457 problem details, as every error response is shaped. */
export const problemDetailsSchema = z.object({
  type: z.string(),
  title: z.string(),
  status: z.int().min(100).max(599),
  code: z.enum(ERROR_CODES),
  detail: z.string(),
  instance: z.string().optional(),
  requestId: z.string(),
  errors: z.array(fieldErrorSchema).optional(),
});

export type ProblemDetails = z.infer<typeof problemDetailsSchema>;

/**
 * The `type` URI for an error code. A stable, dereferenceable documentation
 * link per RFC 9457; the host is supplied by the caller because the product
 * domain is decision D4 and still open.
 */
export function errorTypeUri(code: ErrorCode, baseUrl: string): string {
  const slug = code.toLowerCase().replaceAll('_', '-');
  return `${baseUrl.replace(/\/+$/, '')}/errors/${slug}`;
}
