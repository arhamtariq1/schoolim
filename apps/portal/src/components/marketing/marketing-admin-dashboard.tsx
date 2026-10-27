'use client';

import { StatusBadge, TooltipProvider, cn } from '@ilm/ui';
import {
  ChevronDownIcon,
  ChevronLeftIcon,
  DarkModeIcon,
  ICON_SIZE,
  NotificationsIcon,
  SearchIcon,
  SettingsIcon,
} from '@ilm/ui/icons';
import { BRAND } from '@ilm/utils';
import dynamic from 'next/dynamic';
import { useEffect, useRef, useState, type CSSProperties } from 'react';

import { DASHBOARD, SESSION } from './preview/fixtures';

import { NAV_ICONS } from '@/components/nav-icons';
import { SidebarBrandMark } from '@/components/sidebar-brand-mark';
import { visibleNavItems, type NavItem } from '@/lib/navigation';

/**
 * The admin portal in the hero — the product's own dashboard, on sample data.
 * ADR-0022.
 *
 * ## A picture, not a second app
 *
 * The **dashboard** is real: it is the portal's own `HomeDashboard`, rendered
 * with props from `preview/fixtures.ts`, so when the product's dashboard
 * changes, this changes. The **shell** around it is a copy of `AppShell`'s
 * markup — same classes, same nav items for the Admin role, same icons —
 * drawn rather than wired.
 *
 * Nothing in it can be clicked. The whole frame is `inert`: an earlier version
 * let the sidebar switch between the portal's real pages, which made the hero
 * slow to load and to scroll and invited visitors to wander off the landing
 * page into screens they cannot use yet. It is a screenshot that stays sharp.
 *
 * ## Scale
 *
 * The product is laid out for a desktop. Rather than reflowing it into the
 * hero's frame, the whole app is drawn at a desktop width and shrunk with CSS
 * `zoom`, the way a screenshot would be — so it reads as the product at a
 * glance, only smaller. The scale follows the frame's width.
 */

/** The width the app is laid out at before it is scaled into the frame. */
const DESIGN_WIDTH = 1680;
const MIN_SCALE = 0.5;

const ITEMS = visibleNavItems(SESSION.permissions);
const CURRENT = '/';

// Loaded on its own, so the landing page never downloads the other screens.
const HomeDashboard = dynamic(
  () => import('@/components/dashboard/home-dashboard').then((m) => m.HomeDashboard),
  { loading: () => <div className="h-96 rounded-2xl bg-muted/60" /> },
);

export function AdminDashboardMock() {
  const frameRef = useRef<HTMLDivElement | null>(null);
  const [size, setSize] = useState<{ width: number; height: number } | undefined>(undefined);

  // Measure the frame and fit the app into it. Until the first measurement the
  // app renders unscaled inside a clipped frame — the same picture, larger.
  useEffect(() => {
    const frame = frameRef.current;
    if (frame === null) {
      return;
    }
    const observer = new ResizeObserver(([entry]) => {
      if (entry !== undefined) {
        setSize({ width: entry.contentRect.width, height: entry.contentRect.height });
      }
    });
    observer.observe(frame);
    return () => {
      observer.disconnect();
    };
  }, []);

  const scale =
    size === undefined ? 1 : Math.min(1, Math.max(MIN_SCALE, size.width / DESIGN_WIDTH));
  const stage: CSSProperties | undefined =
    size === undefined
      ? undefined
      : { zoom: scale, width: size.width / scale, height: size.height / scale };

  return (
    <div
      ref={frameRef}
      role="img"
      aria-label={`${BRAND.name} admin dashboard, with sample data.`}
      className="h-128 overflow-hidden md:aspect-video md:h-auto"
    >
      <TooltipProvider delayDuration={300}>
        <div
          inert
          aria-hidden
          style={stage}
          className="marketing-app marketing-app-stage flex overflow-hidden bg-workspace-canvas"
        >
          <aside className="hidden w-56 shrink-0 flex-col border-e border-border/50 bg-sidebar md:flex">
            <div className="relative flex h-16 shrink-0 items-center justify-start border-b border-border/50 bg-sidebar px-3">
              <span className="inline-flex max-w-37 items-center justify-start rounded-md ps-3">
                <SidebarBrandMark
                  schoolLogo={{ present: false, mimeType: null, byteSize: null, version: null }}
                  profileCompleted
                />
              </span>
            </div>
            <ul className="flex flex-1 flex-col gap-1 overflow-hidden px-3 py-4">
              {ITEMS.map((item) => (
                <li key={item.href}>
                  <NavRow item={item} />
                </li>
              ))}
            </ul>
          </aside>

          <div className="flex min-w-0 flex-1 flex-col">
            <Header />

            <div className="relative min-w-0 flex-1 overflow-hidden bg-workspace-canvas">
              <div className="w-full space-y-4 px-3 pt-3 pb-20 md:px-4 md:pt-4 md:pb-5">
                <HomeDashboard
                  session={SESSION}
                  snapshot={DASHBOARD}
                  tenantSlug={undefined}
                  omitAttendanceRow
                />
              </div>
              {/* The page runs on below the frame, faded out rather than scrolled to. */}
              <div className="marketing-screen-veil pointer-events-none absolute inset-x-0 bottom-0 h-1/5" />
            </div>
          </div>
        </div>
      </TooltipProvider>
    </div>
  );
}

/** `AppShell`'s `AppHeader`, drawn rather than wired. */
function Header() {
  const initials = SESSION.name
    .split(/\s+/)
    .map((part) => part[0] ?? '')
    .join('')
    .slice(0, 2)
    .toUpperCase();

  return (
    <header className="flex h-16 shrink-0 items-center gap-3 border-b border-border/50 bg-header px-3 md:gap-4 md:px-5">
      <span className="-ms-1 hidden size-9 shrink-0 items-center justify-center rounded-lg text-muted-foreground md:inline-flex">
        <ChevronLeftIcon className={ICON_SIZE.nav} aria-hidden />
      </span>
      <span className="truncate text-sm font-semibold md:hidden">{SESSION.school.name}</span>
      <div className="hidden min-w-0 flex-1 md:block md:max-w-xl">
        <span className="flex h-10 w-full items-center gap-2.5 rounded-xl border border-border bg-muted/40 px-3.5 text-sm text-muted-foreground">
          <SearchIcon className="size-4 shrink-0 opacity-80" aria-hidden />
          <span className="truncate text-start">Search pages, students…</span>
          <kbd className="ms-auto hidden rounded-md border border-border bg-background px-1.5 py-0.5 font-mono text-xs text-muted-foreground lg:inline">
            ⌘K
          </kbd>
        </span>
      </div>
      <div className="ms-auto flex items-center gap-1 md:gap-2">
        <StatusBadge tone="success" className="me-1 hidden shrink-0 md:inline-flex">
          Admin
        </StatusBadge>
        {[NotificationsIcon, SettingsIcon, DarkModeIcon].map((Icon, index) => (
          <span
            key={index}
            className="relative inline-flex size-10 items-center justify-center rounded-lg text-muted-foreground"
          >
            <Icon className="size-5 shrink-0" aria-hidden />
            {index === 0 ? (
              <span className="absolute end-2.5 top-2.5 size-2 rounded-full bg-primary" />
            ) : null}
          </span>
        ))}
        <span className="mx-1 hidden h-8 w-px bg-border sm:block" />
        <span className="inline-flex items-center gap-2.5 rounded-lg py-1 ps-0.5 pe-2">
          <span className="flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-full bg-primary/10 text-xs font-semibold text-primary">
            {initials}
          </span>
          <span className="hidden min-w-0 text-start md:block">
            <span className="block text-sm font-medium whitespace-nowrap text-foreground">
              {SESSION.name}
            </span>
            <span className="block text-xs whitespace-nowrap text-muted-foreground">
              {SESSION.email}
            </span>
          </span>
        </span>
      </div>
    </header>
  );
}

/**
 * One sidebar row as `AppShell` draws it: the dashboard current, every group
 * closed with its chevron, nothing interactive.
 */
function NavRow({ item }: { item: NavItem }) {
  const Icon = NAV_ICONS[item.icon];
  const current = item.href === CURRENT;
  const isGroup = (item.children ?? []).length > 0;
  return (
    <span
      className={cn(
        'flex w-full items-center gap-2.5 rounded-lg py-2 ps-3 pe-2 text-sm font-medium',
        current ? 'bg-primary/10 text-primary' : 'text-muted-foreground',
      )}
    >
      {Icon === undefined ? null : (
        <Icon
          className={cn('shrink-0', ICON_SIZE.nav, current ? 'text-primary' : 'opacity-80')}
          aria-hidden
        />
      )}
      <span className="flex-1 truncate text-start">{item.label}</span>
      {isGroup ? (
        <ChevronDownIcon className="size-4 shrink-0 -rotate-90 opacity-60" aria-hidden />
      ) : null}
    </span>
  );
}
