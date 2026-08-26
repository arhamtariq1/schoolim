import { ERROR_STATUS, type ErrorCode, type FieldError } from '@ilm/contracts';

/**
 * The base class for every error the product raises deliberately.
 *
 * docs/12 section 3: an error carries a stable machine `code`, an HTTP status,
 * and a message written **for the person who will read it** — a school
 * accountant, not a developer. The frontend switches on `code`; `detail` may be
 * reworded at any time.
 *
 * Anything not derived from this class is unexpected by definition, and the
 * exception filter renders it as a bare 500 with no internals leaked.
 */
export abstract class DomainError extends Error {
  abstract readonly code: ErrorCode;

  /** Field-level problems, for validation failures. */
  readonly fieldErrors?: readonly FieldError[];

  constructor(message: string, fieldErrors?: readonly FieldError[]) {
    super(message);
    this.name = new.target.name;
    if (fieldErrors !== undefined) {
      this.fieldErrors = fieldErrors;
    }
    Error.captureStackTrace?.(this, new.target);
  }

  get status(): number {
    return ERROR_STATUS[this.code];
  }
}

/**
 * Not found — **or hidden by tenant scope**.
 *
 * docs/11 section 4: a cross-tenant read returns 404, never 403, because a 403
 * confirms the record exists. Callers must not distinguish the two cases, which
 * is why there is one class for both.
 */
export class NotFoundError extends DomainError {
  readonly code = 'NOT_FOUND' as const;

  constructor(entity: string) {
    super(`That ${entity} could not be found.`);
  }
}

export class PermissionDeniedError extends DomainError {
  readonly code = 'AUTH_PERMISSION_DENIED' as const;

  constructor(permission: string) {
    super(`You do not have permission to do this (${permission}).`);
  }
}

export class TenantMismatchError extends DomainError {
  readonly code = 'AUTH_TENANT_MISMATCH' as const;

  constructor() {
    // Deliberately vague. The caller learns nothing about which tenants exist.
    super('Your session is not valid for this school.');
  }
}

export class ValidationFailedError extends DomainError {
  readonly code = 'VALIDATION_FAILED' as const;

  constructor(fieldErrors: readonly FieldError[]) {
    super('Some of the information provided is not valid.', fieldErrors);
  }
}

export class BusinessRuleError extends DomainError {
  readonly code: ErrorCode;

  constructor(code: ErrorCode, message: string) {
    super(message);
    this.code = code;
  }
}

/**
 * The school is suspended, and this request would have changed something.
 *
 * Not 401: the session is perfectly valid and reading still works. Dunning
 * makes a school read-only, it never takes the data away (docs/19 §4), so the
 * message says what to do about it rather than implying the account is gone.
 */
export class SchoolSuspendedError extends DomainError {
  readonly code = 'SCHOOL_READ_ONLY' as const;

  constructor() {
    super(
      'This school is read-only while its subscription is on hold. ' +
        'Records can still be viewed. Settle the outstanding invoice to make changes again.',
    );
  }
}

/**
 * A uniqueness or state conflict the caller can resolve — a slug already taken,
 * an email already registered at that school.
 *
 * 409, not 422: nothing about the request was malformed. It was valid and lost
 * a race, or names something that already exists, and the fix is a different
 * value rather than a different shape.
 */
export class ConflictError extends DomainError {
  readonly code = 'CONFLICT' as const;
}
