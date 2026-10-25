import { describe, expect, it } from 'vitest';

import {
  allowedNextStatuses,
  assignRequestSchema,
  changeRequestStatusSchema,
  createRequestSchema,
  isClosedRequest,
  REQUEST_STATUSES,
  REQUEST_TRANSITIONS,
  requestListQuerySchema,
} from './requests';
import { hasPermission } from './roles';

/**
 * What a request may become, and who may say so.
 *
 * The state machine is the one place this is written; the API enforces it and
 * the portal draws its buttons from it. These pin the rules that matter to a
 * person: a closed request only reopens, and the requester can never close
 * their own.
 */

const KEY = '0123456789abcdef0123';

describe('the status flow', () => {
  it('runs Pending → In progress → Resolved, with Rejected and Reopened beside it', () => {
    expect(REQUEST_TRANSITIONS.PENDING).toEqual(['IN_PROGRESS', 'RESOLVED', 'REJECTED']);
    expect(REQUEST_TRANSITIONS.IN_PROGRESS).toEqual(['RESOLVED', 'REJECTED']);
    expect(REQUEST_TRANSITIONS.REOPENED).toEqual(['IN_PROGRESS', 'RESOLVED', 'REJECTED']);
  });

  it('lets a finished request do one thing: be reopened', () => {
    expect(REQUEST_TRANSITIONS.RESOLVED).toEqual(['REOPENED']);
    expect(REQUEST_TRANSITIONS.REJECTED).toEqual(['REOPENED']);
  });

  it('never moves a request back to Pending, or to where it already is', () => {
    for (const status of REQUEST_STATUSES) {
      expect(REQUEST_TRANSITIONS[status]).not.toContain('PENDING');
      expect(REQUEST_TRANSITIONS[status]).not.toContain(status);
    }
  });

  it('knows which statuses are finished', () => {
    expect(REQUEST_STATUSES.filter(isClosedRequest)).toEqual(['RESOLVED', 'REJECTED']);
  });
});

describe('who may move it', () => {
  it('gives a manager the whole table', () => {
    for (const status of REQUEST_STATUSES) {
      expect(allowedNextStatuses(status, 'manager')).toEqual(REQUEST_TRANSITIONS[status]);
    }
  });

  it('lets the requester reopen a closed request, and nothing else', () => {
    expect(allowedNextStatuses('RESOLVED', 'requester')).toEqual(['REOPENED']);
    expect(allowedNextStatuses('REJECTED', 'requester')).toEqual(['REOPENED']);
    for (const open of ['PENDING', 'IN_PROGRESS', 'REOPENED'] as const) {
      expect(allowedNextStatuses(open, 'requester')).toEqual([]);
    }
  });
});

describe('who may manage requests', () => {
  it('is the Admin, Principal, Admin role and Office Staff — and nobody who raises them', () => {
    for (const role of ['OWNER', 'PRINCIPAL', 'ADMIN', 'RECEPTION'] as const) {
      expect(hasPermission([role], 'workflow.request.manage')).toBe(true);
    }
    for (const role of ['TEACHER', 'COORDINATOR', 'ACCOUNTANT', 'STUDENT', 'PARENT'] as const) {
      expect(hasPermission([role], 'workflow.request.manage')).toBe(false);
    }
  });

  it('lets every role raise one', () => {
    for (const role of [
      'OWNER',
      'PRINCIPAL',
      'ADMIN',
      'ACCOUNTANT',
      'RECEPTION',
      'TEACHER',
      'COORDINATOR',
      'STUDENT',
      'PARENT',
    ] as const) {
      expect(hasPermission([role], 'workflow.request.create')).toBe(true);
    }
  });
});

describe('raising a request', () => {
  const valid = {
    category: 'FEE',
    subject: 'Fee voucher shows the wrong month',
    description: 'The October voucher is billed for September as well.',
    idempotencyKey: KEY,
  };

  it('accepts a request, defaulting the priority', () => {
    const parsed = createRequestSchema.parse(valid);
    expect(parsed.priority).toBe('NORMAL');
  });

  it('wants a subject and a description of some substance', () => {
    expect(createRequestSchema.safeParse({ ...valid, subject: 'Hi' }).success).toBe(false);
    expect(createRequestSchema.safeParse({ ...valid, description: 'Help' }).success).toBe(false);
  });

  it('trims what it is given, so "   " is not a subject', () => {
    expect(createRequestSchema.safeParse({ ...valid, subject: '     ' }).success).toBe(false);
  });

  it('refuses a category it does not know, and unknown fields', () => {
    expect(createRequestSchema.safeParse({ ...valid, category: 'LUNCH' }).success).toBe(false);
    expect(createRequestSchema.safeParse({ ...valid, status: 'RESOLVED' }).success).toBe(false);
  });

  it('cannot be used to set its own status or assignee', () => {
    // `.strict()`: a request is raised Pending and unassigned, whatever the
    // body claims.
    expect(createRequestSchema.safeParse({ ...valid, assigneeId: KEY }).success).toBe(false);
  });
});

describe('changing the status', () => {
  it('requires a reason to reject', () => {
    expect(changeRequestStatusSchema.safeParse({ status: 'REJECTED' }).success).toBe(false);
    expect(changeRequestStatusSchema.safeParse({ status: 'REJECTED', note: ' ' }).success).toBe(
      false,
    );
    expect(
      changeRequestStatusSchema.safeParse({ status: 'REJECTED', note: 'Outside school policy.' })
        .success,
    ).toBe(true);
  });

  it('does not need one to resolve or reopen', () => {
    expect(changeRequestStatusSchema.safeParse({ status: 'RESOLVED' }).success).toBe(true);
    expect(changeRequestStatusSchema.safeParse({ status: 'REOPENED' }).success).toBe(true);
  });
});

describe('assigning', () => {
  it('takes a user, or null to unassign', () => {
    expect(
      assignRequestSchema.safeParse({ assigneeId: '11111111-1111-4111-8111-111111111111' }).success,
    ).toBe(true);
    expect(assignRequestSchema.safeParse({ assigneeId: null }).success).toBe(true);
    expect(assignRequestSchema.safeParse({ assigneeId: 'someone' }).success).toBe(false);
  });
});

describe('the list query', () => {
  it('pages by twenty, newest activity first', () => {
    const parsed = requestListQuerySchema.parse({});
    expect(parsed.limit).toBe(20);
    expect(parsed.offset).toBe(0);
    expect(parsed.sort).toBe('lastActivityAt');
    expect(parsed.order).toBe('desc');
  });

  it('rejects a misspelt filter instead of returning everything', () => {
    expect(requestListQuerySchema.safeParse({ statuss: 'PENDING' }).success).toBe(false);
  });

  it('only sorts by a field on the allow-list', () => {
    expect(requestListQuerySchema.safeParse({ sort: 'requesterPassword' }).success).toBe(false);
  });

  it('takes me, unassigned or a user id as the assignee filter', () => {
    expect(requestListQuerySchema.safeParse({ assignee: 'me' }).success).toBe(true);
    expect(requestListQuerySchema.safeParse({ assignee: 'unassigned' }).success).toBe(true);
    expect(
      requestListQuerySchema.safeParse({ assignee: '11111111-1111-4111-8111-111111111111' }).success,
    ).toBe(true);
    expect(requestListQuerySchema.safeParse({ assignee: 'everyone' }).success).toBe(false);
  });
});
