'use client';

import {
  ROUTES,
  type NotificationItem,
  type NotificationList,
} from '@ilm/contracts';
import {
  Button,
  cn,
  DateDisplay,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '@ilm/ui';
import {
  AttendanceIcon,
  CalendarIcon,
  ExpenseIcon,
  FeesIcon,
  HolidayIcon,
  NotificationsIcon,
  RequestsIcon,
  SalaryIcon,
  StudentsIcon,
  SubjectIcon,
} from '@ilm/ui/icons';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';

import { fetchJson, mutate } from '@/lib/mutate';
import { currentPushState, enablePush, onForegroundPush, syncPushToken, type PushState } from '@/lib/push';
import { useTenantHref } from '@/lib/use-tenant-href';

/** How often the bell looks for something new while the page is open. */
const POLL_MS = 60_000;

/** One icon per kind of thing, so the list reads at a glance. */
function iconFor(item: NotificationItem) {
  if (item.kind === 'attendance.absent') return AttendanceIcon;
  switch (item.entityType) {
    case 'student':
      return StudentsIcon;
    case 'staff':
      return SalaryIcon;
    case 'voucher':
      return FeesIcon;
    case 'assessment':
      return SubjectIcon;
    case 'timetable':
      return CalendarIcon;
    case 'expense':
      return ExpenseIcon;
    case 'holiday':
      return HolidayIcon;
    default:
      return RequestsIcon;
  }
}

/** Same size and focus ring as the other header buttons, which this sits among. */
const HEADER_ICON_CLASS = 'size-5 shrink-0';
const HEADER_ACTION_CLASS =
  'inline-flex size-10 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none';

/**
 * The header bell: the signed-in person's own notifications.
 *
 * It looks when the page loads, again every minute, and whenever it is opened —
 * so a reply that arrived while the tab was in the background is there by the
 * time anyone clicks. Opening a notification marks it read and goes to the thing
 * it is about; "Mark all read" clears the rest.
 *
 * A failed read shows nothing wrong: a bell that cannot reach the server is a
 * bell with nothing new, and it tries again in a minute.
 */
export function NotificationsMenu() {
  const router = useRouter();
  const tenantHref = useTenantHref();
  const [list, setList] = useState<NotificationList>({ items: [], unreadCount: 0, nextCursor: null });
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [isLoaded, setIsLoaded] = useState(false);
  const pushState = useRef<PushState>('unconfigured');
  // "/beacon" in path mode, "" otherwise — the service worker needs it to route a click.
  const tenantBase = tenantHref('/').replace(/\/+$/, '');

  const load = useCallback(async () => {
    const result = await fetchJson<{ data: NotificationList }>(ROUTES.notifications.list);
    if (result.ok) {
      const fresh = result.data.data;
      // The newest page replaces what it covers and leaves older pages the
      // person has already scrolled to, so the minute poll never throws away
      // their place.
      setList((previous) => {
        const freshIds = new Set(fresh.items.map((item) => item.id));
        const oldest = fresh.items[fresh.items.length - 1];
        const older = previous.items.filter(
          (item) => !freshIds.has(item.id) && (oldest === undefined || item.createdAt <= oldest.createdAt),
        );
        return {
          items: [...fresh.items, ...older],
          unreadCount: fresh.unreadCount,
          nextCursor: older.length > 0 ? previous.nextCursor : fresh.nextCursor,
        };
      });
    }
    setIsLoaded(true);
  }, []);

  const loadMore = useCallback(async () => {
    if (list.nextCursor === null || isLoadingMore) return;
    setIsLoadingMore(true);
    const result = await fetchJson<{ data: NotificationList }>(
      `${ROUTES.notifications.list}?cursor=${encodeURIComponent(list.nextCursor)}`,
    );
    if (result.ok) {
      const page = result.data.data;
      setList((previous) => {
        const known = new Set(previous.items.map((item) => item.id));
        return {
          items: [...previous.items, ...page.items.filter((item) => !known.has(item.id))],
          unreadCount: page.unreadCount,
          nextCursor: page.nextCursor,
        };
      });
    }
    setIsLoadingMore(false);
  }, [list.nextCursor, isLoadingMore]);

  useEffect(() => {
    void load();
    const timer = window.setInterval(() => {
      void load();
    }, POLL_MS);
    return () => {
      window.clearInterval(timer);
    };
  }, [load]);

  // A browser that already said yes just refreshes its token (they rotate, and a
  // different person may have signed in on it). One that has not is asked once,
  // the first time the bell is opened — a click, which is what browsers require
  // of a permission prompt; one that fires out of nowhere is refused.
  useEffect(() => {
    let cancelled = false;
    void currentPushState().then(async (state) => {
      if (cancelled) return;
      pushState.current =
        state === 'on' ? await syncPushToken(tenantBase).catch(() => 'off' as const) : state;
    });
    const stop = onForegroundPush(() => {
      void load();
    });
    return () => {
      cancelled = true;
      stop();
    };
  }, [load, tenantBase]);

  function askForPushOnce(): void {
    if (pushState.current !== 'off') return;
    // Set first so a second open while the prompt is showing does not ask again.
    pushState.current = 'blocked';
    void enablePush(tenantBase)
      .then((state) => {
        pushState.current = state;
      })
      .catch(() => {
        pushState.current = 'unsupported';
      });
  }

  async function markRead(ids?: readonly string[]): Promise<void> {
    const result = await mutate<{ data: { unreadCount: number } }>(
      ROUTES.notifications.read,
      'POST',
      ids === undefined ? {} : { ids },
    );
    if (result.ok) {
      // Updated in place rather than refetched: a refetch would only bring back
      // the newest page, and older ones the person has scrolled to would keep
      // showing as unread.
      setList((previous) => ({
        ...previous,
        unreadCount: result.data.data.unreadCount,
        items: previous.items.map((item) =>
          item.readAt === null && (ids === undefined || ids.includes(item.id))
            // Only the null check reads this; the real time is on the server.
            ? { ...item, readAt: item.createdAt }
            : item,
        ),
      }));
    }
  }

  function open(item: NotificationItem): void {
    if (item.readAt === null) {
      void markRead([item.id]);
    }
    if (item.entityId !== null) {
      if (item.entityType === 'request') {
        router.push(tenantHref(`/requests/${item.entityId}`));
      } else if (item.entityType === 'timetable') {
        router.push(tenantHref(`/timetables/${item.entityId}`));
      } else if (item.kind === 'voucher.payment_recorded') {
        // Staff, not the family: the office's voucher list, not the parent page.
        router.push(tenantHref('/fees/vouchers'));
      } else if (item.entityType === 'voucher') {
        router.push(tenantHref(`/parent/vouchers?open=${item.entityId}`));
      } else if (item.entityType === 'student') {
        router.push(tenantHref(`/students/${item.entityId}`));
      } else if (item.entityType === 'staff') {
        // Your own pay is on your profile; a new colleague is on the staff page.
        router.push(tenantHref(item.kind === 'salary.paid' ? '/profile' : `/staff/${item.entityId}`));
      } else if (item.entityType === 'assessment') {
        router.push(tenantHref(`/marks/${item.entityId}`));
      } else if (item.entityType === 'expense') {
        router.push(tenantHref('/finance/expenses'));
      } else if (item.entityType === 'holiday') {
        router.push(tenantHref('/academics/holidays'));
      }
    }
  }

  const unread = list.unreadCount;

  return (
    <DropdownMenu
      onOpenChange={(isOpen) => {
        if (isOpen) {
          askForPushOnce();
          void load();
        }
      }}
    >
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label={unread === 0 ? 'Notifications' : `Notifications, ${String(unread)} unread`}
          className={cn(HEADER_ACTION_CLASS, 'relative')}
        >
          <NotificationsIcon className={HEADER_ICON_CLASS} aria-hidden="true" />
          {unread === 0 ? null : (
            <span className="absolute end-0.5 top-0.5 flex size-5 items-center justify-center rounded-full bg-primary text-[10px] leading-none font-semibold text-primary-foreground tabular-nums ring-2 ring-card">
              {unread > 9 ? '9+' : unread}
            </span>
          )}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        className="w-[min(100vw-2rem,24rem)] overflow-hidden rounded-xl border border-border p-0 shadow-raised"
      >
        <div className="flex items-center justify-between gap-2 border-b border-border bg-muted/30 px-4 py-3">
          <span className="text-sm font-semibold text-foreground">Notifications</span>
          {unread === 0 ? null : (
            <Button
              type="button"
              tone="ghost"
              size="sm"
              onClick={() => {
                void markRead();
              }}
            >
              Mark all read
            </Button>
          )}
        </div>

        {list.items.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-muted-foreground">
            {isLoaded ? 'Nothing new. We will tell you here.' : 'Loading…'}
          </p>
        ) : (
          <ul
            onScroll={(event) => {
              const el = event.currentTarget;
              // Within a screen of the bottom: fetch the next page before they hit it.
              if (el.scrollHeight - el.scrollTop - el.clientHeight < 80) {
                void loadMore();
              }
            }}
            className="scrollbar-hidden max-h-[min(24rem,70vh)] divide-y divide-border overflow-y-auto overscroll-y-contain"
            aria-label="Recent notifications"
          >
            {list.items.map((item) => {
              const isUnread = item.readAt === null;
              const ItemIcon = iconFor(item);
              return (
                <li key={item.id}>
                  <button
                    type="button"
                    onClick={() => {
                      open(item);
                    }}
                    className={cn(
                      'flex w-full gap-3 px-4 py-3 text-start transition-colors hover:bg-muted/50 focus-visible:bg-muted/50 focus-visible:outline-none',
                      isUnread ? 'bg-primary/[0.04]' : undefined,
                    )}
                  >
                    <span className="relative flex size-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                      <ItemIcon className="size-4 shrink-0" aria-hidden="true" />
                      {isUnread ? (
                        <span
                          aria-hidden="true"
                          className="absolute -end-0.5 -top-0.5 size-2 rounded-full bg-primary ring-2 ring-card"
                        />
                      ) : null}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-start justify-between gap-2">
                        <span className={cn('text-sm text-foreground', isUnread ? 'font-semibold' : 'font-medium')}>
                          {item.title}
                        </span>
                        <span className="shrink-0 text-[11px] whitespace-nowrap text-muted-foreground">
                          <DateDisplay value={item.createdAt} precision="datetime" />
                        </span>
                      </span>
                      {item.body === null ? null : (
                        <span className="mt-0.5 line-clamp-2 block text-xs leading-snug text-muted-foreground">
                          {item.body}
                        </span>
                      )}
                    </span>
                  </button>
                </li>
              );
            })}
            {list.nextCursor === null ? null : (
              <li className="px-4 py-3 text-center text-xs text-muted-foreground" aria-live="polite">
                {isLoadingMore ? 'Loading more…' : 'Scroll for more'}
              </li>
            )}
          </ul>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
