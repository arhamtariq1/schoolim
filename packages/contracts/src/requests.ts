import { z } from 'zod';

import { assetRules, encodedCeiling, imageMimeTypeSchema } from './assets';
import { MAX_PAGE_LIMIT, sortOrderSchema } from './pagination';
import { idSchema, instantSchema } from './primitives';

/**
 * Requests and concerns — ADR-0016.
 *
 * A parent or a teacher has a question, a complaint or a concern; the office
 * answers it; the person can see what happened. A request is a conversation
 * with a status, not an approval workflow: nothing is "approved" and no
 * domain record changes. Configurable types and approval chains are a later
 * module, and these categories are what they will be seeded from.
 */

// --- Vocabulary --------------------------------------------------------------

export const REQUEST_CATEGORIES = [
  'LEAVE',
  'FEE',
  'ACADEMIC',
  'DOCUMENT',
  'TRANSPORT',
  'COMPLAINT',
  'CONCERN',
  'OTHER',
] as const;
export const requestCategorySchema = z.enum(REQUEST_CATEGORIES);
export type RequestCategory = z.infer<typeof requestCategorySchema>;

export const REQUEST_CATEGORY_LABELS: Readonly<Record<RequestCategory, string>> = {
  LEAVE: 'Leave',
  FEE: 'Fees & payments',
  ACADEMIC: 'Academics',
  DOCUMENT: 'Documents & certificates',
  TRANSPORT: 'Transport',
  COMPLAINT: 'Complaint',
  CONCERN: 'Concern (safety or wellbeing)',
  OTHER: 'Other',
};

export const REQUEST_PRIORITIES = ['LOW', 'NORMAL', 'HIGH', 'URGENT'] as const;
export const requestPrioritySchema = z.enum(REQUEST_PRIORITIES);
export type RequestPriority = z.infer<typeof requestPrioritySchema>;

export const REQUEST_PRIORITY_LABELS: Readonly<Record<RequestPriority, string>> = {
  LOW: 'Low',
  NORMAL: 'Normal',
  HIGH: 'High',
  URGENT: 'Urgent',
};

/** Sorting by priority sorts by this, not by the alphabet. */
export const REQUEST_PRIORITY_RANK: Readonly<Record<RequestPriority, number>> = {
  LOW: 0,
  NORMAL: 1,
  HIGH: 2,
  URGENT: 3,
};

export const REQUEST_STATUSES = [
  'PENDING',
  'IN_PROGRESS',
  'RESOLVED',
  'REJECTED',
  'REOPENED',
] as const;
export const requestStatusSchema = z.enum(REQUEST_STATUSES);
export type RequestStatus = z.infer<typeof requestStatusSchema>;

export const REQUEST_STATUS_LABELS: Readonly<Record<RequestStatus, string>> = {
  PENDING: 'Pending',
  IN_PROGRESS: 'In progress',
  RESOLVED: 'Resolved',
  REJECTED: 'Rejected',
  REOPENED: 'Reopened',
};

// --- The state machine -------------------------------------------------------

/**
 * Where a request may go from each status, for someone who manages requests.
 *
 * Written once, here, and read by both sides: the API refuses anything outside
 * it, and the portal shows exactly these as the buttons — so the two cannot
 * drift into a menu offering a move the server will reject.
 */
export const REQUEST_TRANSITIONS: Readonly<Record<RequestStatus, readonly RequestStatus[]>> = {
  PENDING: ['IN_PROGRESS', 'RESOLVED', 'REJECTED'],
  IN_PROGRESS: ['RESOLVED', 'REJECTED'],
  RESOLVED: ['REOPENED'],
  REJECTED: ['REOPENED'],
  REOPENED: ['IN_PROGRESS', 'RESOLVED', 'REJECTED'],
};

/** A finished request: only reopening moves it. */
export function isClosedRequest(status: RequestStatus): boolean {
  return status === 'RESOLVED' || status === 'REJECTED';
}

/**
 * The statuses a person may move a request to.
 *
 * The person who raised it may only **reopen** it, and only once it is closed:
 * telling the school "this is resolved" or "this is in progress" is the school's
 * call. A manager follows `REQUEST_TRANSITIONS` in full.
 */
export function allowedNextStatuses(
  status: RequestStatus,
  actor: 'manager' | 'requester',
): readonly RequestStatus[] {
  if (actor === 'manager') {
    return REQUEST_TRANSITIONS[status];
  }
  return isClosedRequest(status) ? ['REOPENED'] : [];
}

// MESSAGE is retired: a request is a ticket the school answers by phone or in
// person, not a conversation. The value stays because the database enum has it,
// but nothing writes it and the API never returns one.
export const REQUEST_EVENT_KINDS = ['CREATED', 'MESSAGE', 'STATUS_CHANGED', 'ASSIGNED'] as const;
export const requestEventKindSchema = z.enum(REQUEST_EVENT_KINDS);
export type RequestEventKind = z.infer<typeof requestEventKindSchema>;

// --- Limits ------------------------------------------------------------------

export const REQUEST_SUBJECT_MAX = 120;
export const REQUEST_TEXT_MAX = 4000;
export const REQUEST_NOTE_MAX = 1000;
/** Pictures on one submission or one reply. */
export const REQUEST_ATTACHMENTS_PER_EVENT = 3;
export const DEFAULT_REQUEST_PAGE_SIZE = 20;

// --- Writing -----------------------------------------------------------------

/**
 * Raising a request.
 *
 * `idempotencyKey` is made once per form, so a double-clicked Submit or a retry
 * after a dropped connection is one request rather than two.
 */
export const createRequestSchema = z
  .object({
    category: requestCategorySchema,
    priority: requestPrioritySchema.default('NORMAL'),
    subject: z
      .string()
      .trim()
      .min(3, 'Give it a short subject.')
      .max(REQUEST_SUBJECT_MAX, `Keep the subject under ${String(REQUEST_SUBJECT_MAX)} characters.`),
    description: z
      .string()
      .trim()
      .min(5, 'Tell us a little more.')
      .max(REQUEST_TEXT_MAX, `Keep it under ${String(REQUEST_TEXT_MAX)} characters.`),
    /** Only a child the person may raise a request about; the server checks. */
    studentId: idSchema.optional(),
    idempotencyKey: z.string().trim().min(16).max(80),
  })
  .strict();
export type CreateRequest = z.infer<typeof createRequestSchema>;

export const changeRequestStatusSchema = z
  .object({
    status: requestStatusSchema,
    note: z.string().trim().max(REQUEST_NOTE_MAX).optional(),
  })
  .strict()
  .refine((value) => value.status !== 'REJECTED' || (value.note ?? '').length >= 3, {
    // A rejection with no reason is a parent told "no" with nothing to answer.
    message: 'Say why it is being rejected.',
    path: ['note'],
  });
export type ChangeRequestStatus = z.infer<typeof changeRequestStatusSchema>;

export const assignRequestSchema = z
  .object({
    /** `null` takes the assignment away. */
    assigneeId: idSchema.nullable(),
  })
  .strict();
export type AssignRequest = z.infer<typeof assignRequestSchema>;

/**
 * One picture on a request.
 *
 * Uploaded one at a time after the request exists, so a failed picture never
 * costs somebody the text they wrote.
 */
export const uploadRequestAttachmentSchema = z
  .object({
    mimeType: imageMimeTypeSchema,
    dataBase64: z
      .string()
      .min(1, 'Choose a picture.')
      .max(encodedCeiling(assetRules('REQUEST_ATTACHMENT').maxBytes), 'That picture is too large.'),
    fileName: z.string().trim().min(1).max(120),
  })
  .strict();
export type UploadRequestAttachment = z.infer<typeof uploadRequestAttachmentSchema>;

// --- Reading -----------------------------------------------------------------

export const requestPersonSchema = z.object({
  id: idSchema,
  name: z.string(),
  /** What they are to the school — "Parent", "Teacher", "Principal". */
  roleLabel: z.string(),
});
export type RequestPerson = z.infer<typeof requestPersonSchema>;

export const requestStudentRefSchema = z.object({
  id: idSchema,
  name: z.string(),
  grNo: z.string().nullable(),
  className: z.string().nullable(),
});
export type RequestStudentRef = z.infer<typeof requestStudentRefSchema>;

export const requestListItemSchema = z.object({
  id: idSchema,
  requestNo: z.string(),
  subject: z.string(),
  category: requestCategorySchema,
  priority: requestPrioritySchema,
  status: requestStatusSchema,
  requester: requestPersonSchema,
  student: requestStudentRefSchema.nullable(),
  assignee: requestPersonSchema.nullable(),
  createdAt: instantSchema,
  lastActivityAt: instantSchema,
});
export type RequestListItem = z.infer<typeof requestListItemSchema>;

export const REQUEST_SORT_FIELDS = [
  'lastActivityAt',
  'createdAt',
  'requestNo',
  'subject',
  'priority',
  'status',
] as const;

/**
 * The list query. Strict, so a misspelt filter is a 400 and not an unfiltered
 * list. Twenty to a page, because that is what the screen shows.
 */
export const requestListQuerySchema = z
  .object({
    limit: z.coerce.number().int().min(1).max(MAX_PAGE_LIMIT).default(DEFAULT_REQUEST_PAGE_SIZE),
    offset: z.coerce.number().int().min(0).default(0),
    sort: z.enum(REQUEST_SORT_FIELDS).default('lastActivityAt'),
    order: sortOrderSchema.default('desc'),
    /** Subject, request number, the requester's or the child's name. */
    q: z.string().trim().min(1).max(120).optional(),
    status: requestStatusSchema.optional(),
    category: requestCategorySchema.optional(),
    priority: requestPrioritySchema.optional(),
    /** `me`, `unassigned`, or a user id. Meaningful to managers only. */
    assignee: z.union([z.enum(['me', 'unassigned']), idSchema]).optional(),
  })
  .strict();
export type RequestListQuery = z.infer<typeof requestListQuerySchema>;

/** Counts over what the caller may see — their own, or the whole school's. */
export const requestSummarySchema = z.object({
  total: z.int().min(0),
  pending: z.int().min(0),
  inProgress: z.int().min(0),
  resolved: z.int().min(0),
  rejected: z.int().min(0),
  reopened: z.int().min(0),
});
export type RequestSummary = z.infer<typeof requestSummarySchema>;

export const requestAttachmentSchema = z.object({
  id: idSchema,
  fileName: z.string(),
  mimeType: imageMimeTypeSchema,
  byteSize: z.int().min(0),
});
export type RequestAttachment = z.infer<typeof requestAttachmentSchema>;

export const requestEventSchema = z.object({
  id: idSchema,
  kind: requestEventKindSchema,
  actor: requestPersonSchema,
  /** The message, or the note that went with a status change. */
  body: z.string().nullable(),
  fromStatus: requestStatusSchema.nullable(),
  toStatus: requestStatusSchema.nullable(),
  /** For an assignment: who it now belongs to, or `null` for nobody. */
  assignee: requestPersonSchema.nullable(),
  attachments: z.array(requestAttachmentSchema),
  createdAt: instantSchema,
});
export type RequestEvent = z.infer<typeof requestEventSchema>;

export const requestDetailSchema = requestListItemSchema.extend({
  description: z.string(),
  resolvedAt: instantSchema.nullable(),
  /** Oldest first, starting with the request being raised. */
  events: z.array(requestEventSchema),
  /** What the caller may move it to; empty when nothing. */
  allowedStatuses: z.array(requestStatusSchema),
  canAssign: z.boolean(),
  /** Whether the caller is looking at it as the person who raised it. */
  isRequester: z.boolean(),
  /**
   * How the school can reach the person who raised it — sent only to someone who
   * manages requests. The school answers by phone or in person, not in the app.
   */
  requesterContact: z.object({ phone: z.string().nullable(), email: z.string().nullable() }).nullable(),
});
export type RequestDetail = z.infer<typeof requestDetailSchema>;

export type RequestStudentOption = RequestStudentRef;

export type RequestAssigneeOption = RequestPerson;

export const requestStudentQuerySchema = z
  .object({ q: z.string().trim().min(1).max(80).optional() })
  .strict();

