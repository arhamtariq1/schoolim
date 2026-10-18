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
  'request.status_changed',
  'timetable.published',
  'timetable.updated',
  'voucher.generated',
] as const;
export const notificationKindSchema = z.enum(NOTIFICATION_KINDS);
export type NotificationKind = z.infer<typeof notificationKindSchema>;

export const NOTIFICATION_ENTITY_TYPES = ['request', 'timetable', 'voucher'] as const;
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
});
export type NotificationList = z.infer<typeof notificationListSchema>;

/** Leave `ids` out to mark everything read. */
export const markNotificationsReadSchema = z
  .object({ ids: z.array(idSchema).min(1).max(100).optional() })
  .strict();
export type MarkNotificationsRead = z.infer<typeof markNotificationsReadSchema>;

/** How many the bell fetches. */
export const NOTIFICATION_PAGE_SIZE = 20;
