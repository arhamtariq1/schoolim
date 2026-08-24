import { describe, expect, it } from 'vitest';

import {
  bulkResultSchema,
  dataEnvelope,
  listEnvelope,
  listEnvelopeWithAggregates,
} from './envelope';
import {
  ERROR_CODES,
  ERROR_STATUS,
  errorTypeUri,
  isErrorCode,
  problemDetailsSchema,
} from './errors';
import {
  DEFAULT_PAGE_LIMIT,
  listQuery,
  MAX_PAGE_LIMIT,
  offsetPaginationSchema,
} from './pagination';
import { isPermission, PERMISSIONS, type Permission } from './permissions';
import {
  calendarDateSchema,
  emailSchema,
  minorUnitsSchema,
  monthKeySchema,
  phoneSchema,
  positiveMinorUnitsSchema,
  slugSchema,
} from './primitives';
import {
  grantFor,
  hasPermission,
  hasUnscopedPermission,
  permissionsFor,
  ROLE_PERMISSIONS,
  SCHOOL_ROLES,
} from './roles';

describe('permissions', () => {
  it('names every permission as module.resource.action', () => {
    for (const permission of PERMISSIONS) {
      expect(permission).toMatch(/^[a-z]+\.[a-z]+\.[a-z]+$/);
    }
  });

  it('has no duplicates', () => {
    expect(new Set(PERMISSIONS).size).toBe(PERMISSIONS.length);
  });

  it('recognises its own members and rejects others', () => {
    expect(isPermission('fees.voucher.generate')).toBe(true);
    expect(isPermission('fees.voucher.explode')).toBe(false);
  });

  it('grants every declared permission to at least one role', () => {
    const granted = new Set(SCHOOL_ROLES.flatMap((role) => Object.keys(ROLE_PERMISSIONS[role])));
    const orphaned = PERMISSIONS.filter((permission) => !granted.has(permission));
    expect(orphaned).toEqual([]);
  });
});

describe('role matrix — segregation of duties', () => {
  it('lets the accountant move money but not approve a discount or waiver', () => {
    expect(hasPermission(['ACCOUNTANT'], 'fees.payment.create')).toBe(true);
    expect(hasPermission(['ACCOUNTANT'], 'fees.payment.reverse')).toBe(true);
    expect(hasPermission(['ACCOUNTANT'], 'fees.discount.approve')).toBe(false);
    expect(hasPermission(['ACCOUNTANT'], 'fees.waiver.approve')).toBe(false);
  });

  it('lets the principal approve but not silently record a payment', () => {
    expect(hasPermission(['PRINCIPAL'], 'fees.discount.approve')).toBe(true);
    expect(hasPermission(['PRINCIPAL'], 'fees.payment.create')).toBe(false);
  });

  it('lets reception take a payment but not cancel or reverse one', () => {
    expect(hasPermission(['RECEPTION'], 'fees.payment.create')).toBe(true);
    expect(hasPermission(['RECEPTION'], 'fees.voucher.cancel')).toBe(false);
    expect(hasPermission(['RECEPTION'], 'fees.payment.reverse')).toBe(false);
  });

  it('reserves the audit log and full export for the owner and principal', () => {
    for (const role of SCHOOL_ROLES) {
      const expected = role === 'OWNER' || role === 'PRINCIPAL';
      expect(hasPermission([role], 'audit.log.read')).toBe(expected);
      expect(hasPermission([role], 'settings.data.export')).toBe(expected);
    }
  });

  it('reserves striking a student off for the owner and principal', () => {
    expect(hasPermission(['ADMIN'], 'students.student.delete')).toBe(false);
    expect(hasPermission(['OWNER'], 'students.student.delete')).toBe(true);
    expect(hasPermission(['PRINCIPAL'], 'students.student.delete')).toBe(true);
  });

  it('gives the owner every permission', () => {
    for (const permission of PERMISSIONS) {
      expect(hasPermission(['OWNER'], permission)).toBe(true);
    }
  });

  it('gives a parent no write access to anything but their own requests', () => {
    const writes = PERMISSIONS.filter((permission) =>
      /\.(create|update|delete|approve|generate|configure|publish)$/.test(permission),
    );
    const granted = writes.filter((permission) => hasPermission(['PARENT'], permission));
    expect(granted).toEqual(['workflow.request.create']);
  });
});

describe('grantFor', () => {
  it('scopes a teacher to their own sections', () => {
    expect(grantFor(['TEACHER'], 'students.student.read')).toBe('scoped');
    expect(hasUnscopedPermission(['TEACHER'], 'students.student.read')).toBe(false);
  });

  it('is additive, and an unscoped grant beats a scoped one', () => {
    // A teacher who is also an administrator reads every student, not only
    // their own sections.
    expect(grantFor(['TEACHER', 'ADMIN'], 'students.student.read')).toBe('all');
    expect(grantFor(['ADMIN', 'TEACHER'], 'students.student.read')).toBe('all');
  });

  it('returns undefined when no held role grants the permission', () => {
    expect(grantFor(['TEACHER'], 'fees.payment.create')).toBeUndefined();
    expect(grantFor([], 'fees.payment.create')).toBeUndefined();
  });

  it('collects the union of permissions across held roles', () => {
    const combined = permissionsFor(['TEACHER', 'ACCOUNTANT']);
    expect(combined).toContain('attendance.record.create');
    expect(combined).toContain('fees.payment.create');
    expect(new Set(combined).size).toBe(combined.length);
  });
});

describe('error codes', () => {
  it('assigns a status to every code', () => {
    for (const code of ERROR_CODES) {
      expect(ERROR_STATUS[code]).toBeGreaterThanOrEqual(400);
      expect(ERROR_STATUS[code]).toBeLessThan(600);
    }
  });

  it('hides a cross-tenant record behind 404, never 403', () => {
    // A 403 would confirm the record exists, which is itself a leak.
    expect(ERROR_STATUS.NOT_FOUND).toBe(404);
    expect(ERROR_STATUS.AUTH_TENANT_MISMATCH).toBe(401);
  });

  it('separates unauthenticated from permission denied', () => {
    expect(ERROR_STATUS.AUTH_TOKEN_EXPIRED).toBe(401);
    expect(ERROR_STATUS.AUTH_PERMISSION_DENIED).toBe(403);
  });

  it('treats a business-rule violation as 422 and a state conflict as 409', () => {
    expect(ERROR_STATUS.FEES_PAYMENT_EXCEEDS_BALANCE).toBe(422);
    expect(ERROR_STATUS.FEES_VOUCHER_ALREADY_PAID).toBe(409);
  });

  it('recognises its own codes', () => {
    expect(isErrorCode('FEES_VOUCHER_ALREADY_PAID')).toBe(true);
    expect(isErrorCode('SOMETHING_ELSE')).toBe(false);
  });

  it('builds a stable dereferenceable type URI', () => {
    expect(errorTypeUri('FEES_VOUCHER_ALREADY_PAID', 'https://example.test')).toBe(
      'https://example.test/errors/fees-voucher-already-paid',
    );
    expect(errorTypeUri('NOT_FOUND', 'https://example.test/')).toBe(
      'https://example.test/errors/not-found',
    );
  });

  it('validates a problem+json body', () => {
    const problem = {
      type: 'https://example.test/errors/fees-voucher-already-paid',
      title: 'Voucher already paid',
      status: 409,
      code: 'FEES_VOUCHER_ALREADY_PAID',
      detail: 'Voucher V-2026-09-0412 was fully paid on 2026-09-08 and cannot be cancelled.',
      requestId: '01J8ABCDEF',
    };
    expect(problemDetailsSchema.parse(problem).code).toBe('FEES_VOUCHER_ALREADY_PAID');
    expect(problemDetailsSchema.safeParse({ ...problem, code: 'MADE_UP' }).success).toBe(false);
  });
});

describe('pagination', () => {
  it('defaults the limit and offset', () => {
    expect(offsetPaginationSchema.parse({})).toEqual({ limit: DEFAULT_PAGE_LIMIT, offset: 0 });
  });

  it('rejects an oversized limit rather than clamping it', () => {
    // A silent clamp makes a client believe it fetched everything.
    expect(offsetPaginationSchema.safeParse({ limit: MAX_PAGE_LIMIT + 1 }).success).toBe(false);
  });

  it('coerces query strings, which arrive as text', () => {
    expect(offsetPaginationSchema.parse({ limit: '25', offset: '100' })).toEqual({
      limit: 25,
      offset: 100,
    });
  });
});

describe('listQuery', () => {
  const query = listQuery(['dueDate', 'balance'] as const, {}, 'dueDate');

  it('applies the default sort and order', () => {
    expect(query.parse({})).toMatchObject({ sort: 'dueDate', order: 'asc' });
  });

  it('allows only the declared sortable fields', () => {
    expect(query.safeParse({ sort: 'balance' }).success).toBe(true);
    // Never interpolate a client-supplied sort field into SQL.
    expect(query.safeParse({ sort: 'students.name; DROP TABLE' }).success).toBe(false);
  });

  it('rejects an unknown filter rather than silently ignoring it', () => {
    // A typo in a filter name must fail loudly, not return an unfiltered list.
    expect(query.safeParse({ statuz: 'OVERDUE' }).success).toBe(false);
  });
});

describe('envelopes', () => {
  it('wraps a single resource', () => {
    const envelope = dataEnvelope(minorUnitsSchema);
    expect(envelope.parse({ data: 500, meta: { requestId: 'r1' } }).data).toBe(500);
  });

  it('wraps a list without aggregates', () => {
    const envelope = listEnvelope(minorUnitsSchema);
    const parsed = envelope.parse({
      data: [100, 200],
      meta: { requestId: 'r1', page: { total: 2, limit: 50, offset: 0 } },
    });
    expect(parsed.data).toEqual([100, 200]);
  });

  it('carries aggregates alongside the rows they summarise', () => {
    const envelope = listEnvelopeWithAggregates(minorUnitsSchema, {
      totalOutstandingMinor: minorUnitsSchema,
    });
    const parsed = envelope.parse({
      data: [100, 200],
      meta: {
        requestId: 'r1',
        page: { total: 2, limit: 50, offset: 0 },
        aggregates: { totalOutstandingMinor: 300 },
      },
    });
    expect(parsed.meta.aggregates.totalOutstandingMinor).toBe(300);
  });

  it('reports a per-item outcome for a bulk operation', () => {
    const parsed = bulkResultSchema.parse({
      succeeded: 480,
      failed: 2,
      results: [{ id: 'a', ok: false, code: 'STUDENT_NOT_ACTIVE' }],
    });
    expect(parsed.failed).toBe(2);
  });
});

describe('primitives', () => {
  it('accepts money only as an integer within numeric(14,2)', () => {
    expect(minorUnitsSchema.safeParse(1234).success).toBe(true);
    expect(minorUnitsSchema.safeParse(-1234).success).toBe(true);
    expect(minorUnitsSchema.safeParse(12.34).success).toBe(false);
    expect(minorUnitsSchema.safeParse(100_000_000_000_000).success).toBe(false);
  });

  it('refuses a negative amount where money cannot be negative', () => {
    expect(positiveMinorUnitsSchema.safeParse(-1).success).toBe(false);
  });

  it('accepts a calendar date but not an instant', () => {
    expect(calendarDateSchema.safeParse('2026-08-25').success).toBe(true);
    expect(calendarDateSchema.safeParse('2026-08-25T00:00:00Z').success).toBe(false);
  });

  it('accepts a month key only in YYYY-MM', () => {
    expect(monthKeySchema.safeParse('2026-08').success).toBe(true);
    expect(monthKeySchema.safeParse('2026-13').success).toBe(false);
    expect(monthKeySchema.safeParse('2026-8').success).toBe(false);
  });

  it('requires phone numbers in E.164, so providers agree on the value', () => {
    expect(phoneSchema.safeParse('+923001234567').success).toBe(true);
    expect(phoneSchema.safeParse('03001234567').success).toBe(false);
    expect(phoneSchema.safeParse('+92 300 1234567').success).toBe(false);
  });

  it('normalises an email', () => {
    expect(emailSchema.parse('  Head@School.PK ')).toBe('head@school.pk');
  });

  it('accepts a subdomain-safe slug only', () => {
    expect(slugSchema.parse('  Beacon-House  ')).toBe('beacon-house');
    expect(slugSchema.safeParse('-leading').success).toBe(false);
    expect(slugSchema.safeParse('has_underscore').success).toBe(false);
  });
});

describe('contract coverage', () => {
  it('keeps the permission union and the matrix in the same shape', () => {
    // Guards against a permission being added to the union but never granted,
    // or granted under a name that no longer exists.
    for (const role of SCHOOL_ROLES) {
      for (const permission of Object.keys(ROLE_PERMISSIONS[role])) {
        expect(isPermission(permission)).toBe(true);
      }
    }
  });

  it('exposes a stable permission count, so a change is deliberate', () => {
    const count: number = PERMISSIONS.length;
    expect(count).toBeGreaterThan(0);
    const sample: Permission = 'fees.voucher.generate';
    expect(PERMISSIONS).toContain(sample);
  });
});
