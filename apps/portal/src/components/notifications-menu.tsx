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
import { NotificationsIcon, RequestsIcon } from '@ilm/ui/icons';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';

import { fetchJson, mutate } from '@/lib/mutate';
import { useTenantHref } from '@/lib/use-tenant-href';

/** How often the bell looks for something new while the page is open. */
const POLL_MS = 60_000;

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
  const [list, setList] = useState<NotificationList>({ items: [], unreadCount: 0 });
  const [isLoaded, setIsLoaded] = useState(false);

  const load = useCallback(async () => {
    const result = await fetchJson<{ data: NotificationList }>(ROUTES.notifications.list);
    if (result.ok) {
      setList(result.data.data);
    }
    setIsLoaded(true);
  }, []);

  useEffect(() => {
    void load();
    const timer = window.setInterval(() => {
      void load();
    }, POLL_MS);
    return () => {
      window.clearInterval(timer);
    };
  }, [load]);

  async function markRead(ids?: readonly string[]): Promise<void> {
    const result = await mutate<{ unreadCount: number }>(
      ROUTES.notifications.read,
      'POST',
      ids === undefined ? {} : { ids },
    );
    if (result.ok) {
      await load();
    }
  }

  function open(item: NotificationItem): void {
    if (item.readAt === null) {
      void markRead([item.id]);
    }
    if (item.entityType === 'request' && item.entityId !== null) {
      router.push(tenantHref(`/requests/${item.entityId}`));
    }
  }

  const unread = list.unreadCount;

  return (
    <DropdownMenu
      onOpenChange={(isOpen) => {
        if (isOpen) {
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
            className="scrollbar-hidden max-h-[min(24rem,70vh)] divide-y divide-border overflow-y-auto overscroll-y-contain"
            aria-label="Recent notifications"
          >
            {list.items.map((item) => {
              const isUnread = item.readAt === null;
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
                      <RequestsIcon className="size-4 shrink-0" aria-hidden="true" />
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
          </ul>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
