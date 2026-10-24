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
import { Suspense, useEffect, useRef, useState, type CSSProperties } from 'react';

import { SESSION } from './preview/fixtures';
import { SCREENS } from './preview/screens';

import { NAV_ICONS } from '@/components/nav-icons';
import { SidebarBrandMark } from '@/components/sidebar-brand-mark';
import { visibleNavItems, type NavItem } from '@/lib/navigation';

/**
 * The admin portal in the hero — the product's own screens, on sample data.
 * ADR-0022.
 *
 * ## What is real and what is a copy
 *
 * The **pages** are real: each sidebar destination renders the same view
 * component the portal renders (`preview/screens.tsx`) with props built from
 * `preview/fixtures.ts`. When a screen changes in the product, it changes here.
 *
 * The **shell** is a copy of `AppShell`'s markup — same classes, same nav
 * items from `NAV_ITEMS` for the Admin role, same icons — because the real
 * shell navigates with the router, reads the session and talks to the API.
 * Here the sidebar only switches which screen is shown.
 *
 * ## Looking but not touching
 *
 * The page area is `inert`: no focus, no clicks. The real screens' buttons
 * would otherwise open dialogs, push routes and call the API from the public
 * landing page. The sidebar is the one live control.
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

function firstLeaf(item: NavItem): NavItem {
  const child = item.children?.[0];
  return child === undefined ? item : firstLeaf(child);
}

function contains(item: NavItem, href: string): boolean {
  return item.href === href || (item.children ?? []).some((child) => contains(child, href));
}

function depthPadding(depth: number): string {
  if (depth <= 0) {
    return 'ps-3';
  }
  if (depth === 1) {
    return 'ps-6';
  }
  return 'ps-9';
}

export function AdminDashboardMock() {
  const frameRef = useRef<HTMLDivElement | null>(null);
  const scrollRef = useRef<HTMLElement | null>(null);
  const [active, setActive] = useState('/');
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

  const choose = (href: string): void => {
    setActive(href);
    if (scrollRef.current !== null) {
      scrollRef.current.scrollTop = 0;
    }
  };

  const Screen = SCREENS[active];
  const label = labelFor(active);

  return (
    <div
      ref={frameRef}
      role="group"
      aria-label={`${BRAND.name} admin portal, sample data. Choose a page from the menu.`}
      className="h-128 overflow-hidden md:aspect-video md:h-auto"
    >
      <TooltipProvider delayDuration={300}>
        <div
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
            <nav
              aria-label="Preview pages"
              data-lenis-prevent
              className="scrollbar-hidden flex flex-1 flex-col gap-1 overflow-y-auto px-3 py-4"
            >
              {ITEMS.map((item) => (
                <Branch key={item.href} item={item} active={active} onChoose={choose} />
              ))}
            </nav>
          </aside>

          <div className="flex min-w-0 flex-1 flex-col">
            <Header />

            <main
              ref={scrollRef}
              className="relative min-w-0 flex-1 overflow-hidden bg-workspace-canvas"
            >
              <div className="w-full space-y-4 px-3 pt-3 pb-20 md:px-4 md:pt-4 md:pb-5">
                <div key={active} data-dash-page inert>
                  <Suspense fallback={null}>{Screen === undefined ? null : <Screen />}</Suspense>
                </div>
              </div>
              {/* The page runs on below the frame, blurred out rather than scrolled to. */}
              <div
                aria-hidden
                className="marketing-screen-veil pointer-events-none absolute inset-x-0 bottom-0 h-1/5"
              />
            </main>

            {/* Below `md` the real shell trades the sidebar for a tab bar. */}
            <nav
              aria-label="Preview pages"
              className="flex shrink-0 items-center justify-around border-t border-border bg-card md:hidden"
            >
              {ITEMS.slice(0, 5).map((item) => {
                const leaf = firstLeaf(item);
                return (
                  <Link
                    key={item.href}
                    item={leaf}
                    current={leaf.href === active}
                    onChoose={choose}
                    compact
                  />
                );
              })}
            </nav>
          </div>
        </div>
      </TooltipProvider>

      {/* Says which page arrived, rather than reading the whole page out. */}
      <p className="sr-only" aria-live="polite">
        {active === '/' ? '' : `Showing ${label}`}
      </p>
    </div>
  );
}

function labelFor(href: string): string {
  const walk = (items: readonly NavItem[]): string | undefined => {
    for (const item of items) {
      if (item.href === href) {
        return item.label;
      }
      const found = walk(item.children ?? []);
      if (found !== undefined) {
        return found;
      }
    }
    return undefined;
  };
  return walk(ITEMS) ?? 'Dashboard';
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
    <header
      inert
      className="flex h-16 shrink-0 items-center gap-3 border-b border-border/50 bg-header px-3 md:gap-4 md:px-5"
    >
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
              <span
                data-dash-pulse
                className="absolute end-2.5 top-2.5 size-2 rounded-full bg-primary"
              />
            ) : null}
          </span>
        ))}
        <span aria-hidden className="mx-1 hidden h-8 w-px bg-border sm:block" />
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

/** `AppShell`'s `NavBranch`: a group that opens, or a single link. */
function Branch({
  item,
  active,
  onChoose,
  depth = 0,
}: {
  item: NavItem;
  active: string;
  onChoose: (href: string) => void;
  depth?: number;
}) {
  const children = item.children ?? [];
  const containsCurrent = children.some((child) => contains(child, active));
  const [overridden, setOverridden] = useState<boolean | undefined>(undefined);
  const isOpen = overridden ?? containsCurrent;

  if (children.length === 0) {
    return <Link item={item} current={item.href === active} onChoose={onChoose} depth={depth} />;
  }

  const Icon = NAV_ICONS[item.icon];

  return (
    <div className="flex flex-col gap-0.5">
      <button
        type="button"
        aria-expanded={isOpen}
        onClick={() => {
          if (!isOpen && !containsCurrent) {
            // Opening a group also opens its first page, as clicking into a
            // section of the product would.
            onChoose(firstLeaf(item).href);
          }
          setOverridden(!isOpen);
        }}
        className={cn(
          'flex w-full items-center gap-2.5 rounded-lg py-2 pe-2 text-sm font-medium transition-colors duration-150',
          'focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
          depthPadding(depth),
          containsCurrent
            ? 'text-primary'
            : 'text-muted-foreground hover:bg-card/70 hover:text-foreground',
        )}
      >
        {Icon === undefined ? null : (
          <Icon
            className={cn(
              'shrink-0',
              depth > 0 ? 'size-4' : ICON_SIZE.nav,
              containsCurrent ? 'text-primary' : 'opacity-80',
            )}
            aria-hidden
          />
        )}
        <span className={cn('flex-1 truncate text-start', containsCurrent && 'text-primary')}>
          {item.label}
        </span>
        <ChevronDownIcon
          className={cn(
            'size-4 shrink-0 opacity-60 transition-transform duration-150',
            isOpen ? '' : '-rotate-90',
          )}
          aria-hidden
        />
      </button>
      {isOpen ? (
        <div className="flex flex-col gap-0.5">
          {children.map((child) => (
            <Branch
              key={child.href}
              item={child}
              active={active}
              onChoose={onChoose}
              depth={depth + 1}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}

/** `AppShell`'s `NavLink`, as a button that switches the preview's page. */
function Link({
  item,
  current,
  onChoose,
  depth = 0,
  compact = false,
}: {
  item: NavItem;
  current: boolean;
  onChoose: (href: string) => void;
  depth?: number;
  compact?: boolean;
}) {
  const Icon = NAV_ICONS[item.icon];
  const nested = depth > 0;
  return (
    <button
      type="button"
      aria-current={current ? 'page' : undefined}
      onClick={() => {
        onChoose(item.href);
      }}
      className={cn(
        'relative flex items-center gap-2.5 rounded-lg text-sm transition-colors duration-150',
        'focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
        compact
          ? 'min-h-12 flex-1 flex-col justify-center gap-1 py-2 text-xs'
          : cn('w-full py-2 pe-3 text-start', depthPadding(depth)),
        nested ? 'font-normal' : 'font-medium',
        current
          ? 'bg-primary/10 text-primary'
          : 'text-muted-foreground hover:bg-card/70 hover:text-foreground',
      )}
    >
      {Icon === undefined ? null : (
        <Icon
          className={cn(
            'shrink-0',
            nested ? 'size-4' : ICON_SIZE.nav,
            current ? 'text-primary' : 'opacity-80',
          )}
          aria-hidden
        />
      )}
      <span className={cn('truncate', nested ? 'text-xs' : undefined, current && 'text-primary')}>
        {item.label}
      </span>
    </button>
  );
}
