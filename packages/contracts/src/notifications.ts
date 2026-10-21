import { z } from 'zod';

import { idSchema, instantSchema } from './primitives';

/**
 * The header bell.
 *
 * A notification is a pointer, not a record: a title, a line of text and the
 * thing it is about. The thing itself — a request today, a result or a voucher
 * tomorrow — is the source of truth, which is why `entityType` is a closed list
 * the portal maps to a page rather than a stored URL that would rot when a
 * route moves.
 */
export const NOTIFICATION_KINDS = [
  'request.submitted',
  'request.assigned',
  'request.replied',
  'request.status_changed',
  'timetable.published',
  'timetable.updated',
  'voucher.generated',
  'voucher.payment_received',
  'voucher.cancelled',
  'voucher.updated',
  'voucher.payment_recorded',
  'attendance.absent',
  'student.admitted',
  'student.status_changed',
  'staff.added',
  'salary.paid',
  'assessment.recorded',
  'expense.recorded',
  'holiday.announced',
] as const;
export const notificationKindSchema = z.enum(NOTIFICATION_KINDS);
export type NotificationKind = z.infer<typeof notificationKindSchema>;

export const NOTIFICATION_ENTITY_TYPES = [
  'request',
  'timetable',
  'voucher',
  'student',
  'staff',
  'assessment',
  'expense',
  'holiday',
] as const;
export const notificationEntityTypeSchema = z.enum(NOTIFICATION_ENTITY_TYPES);
export type NotificationEntityType = z.infer<typeof notificationEntityTypeSchema>;

export const notificationItemSchema = z.object({
  id: idSchema,
  kind: notificationKindSchema,
  title: z.string(),
  body: z.string().nullable(),
  entityType: notificationEntityTypeSchema.nullable(),
  entityId: idSchema.nullable(),
  readAt: instantSchema.nullable(),
  createdAt: instantSchema,
});
export type NotificationItem = z.infer<typeof notificationItemSchema>;

export const notificationListSchema = z.object({
  /** The newest few, read and unread. The bell is a glance, not an inbox. */
  items: z.array(notificationItemSchema),
  /** Over everything unread, not just the items returned. */
  unreadCount: z.int().min(0),
  /** Pass back as `cursor` for the next, older page; null when there is none. */
  nextCursor: z.string().nullable(),
});
export type NotificationList = z.infer<typeof notificationListSchema>;

/**
 * One page of the bell, newest first. The cursor is opaque to callers: it names
 * the last item they were given, so a notification arriving mid-scroll never
 * shifts a page the way an offset would.
 */
export const notificationListQuerySchema = z
  .object({ cursor: z.string().min(1).max(100).optional() })
  .strict();
export type NotificationListQuery = z.infer<typeof notificationListQuerySchema>;

/** Leave `ids` out to mark everything read. */
export const markNotificationsReadSchema = z
  .object({ ids: z.array(idSchema).min(1).max(100).optional() })
  .strict();
export type MarkNotificationsRead = z.infer<typeof markNotificationsReadSchema>;

/** How many the bell fetches. */
export const NOTIFICATION_PAGE_SIZE = 20;

/**
 * Push notifications.
 *
 * A browser that agreed to be pushed to hands the API the token Firebase gave
 * it. The token is a credential to push to that device, so it only ever travels
 * this way: browser to API. Nothing returns it.
 */
export const DEVICE_PLATFORMS = ['web', 'android', 'ios'] as const;

export const registerDeviceSchema = z
  .object({
    token: z.string().min(20).max(4096),
    platform: z.enum(DEVICE_PLATFORMS).default('web'),
  })
  .strict();
export type RegisterDevice = z.infer<typeof registerDeviceSchema>;

export const unregisterDeviceSchema = z.object({ token: z.string().min(20).max(4096) }).strict();
export type UnregisterDevice = z.infer<typeof unregisterDeviceSchema>;
