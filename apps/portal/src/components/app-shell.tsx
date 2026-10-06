'use client';

import { ROUTES } from '@ilm/contracts';
import {
  ConfirmDialog,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Hint,
  TooltipProvider,
  cn,
  useToast,
} from '@ilm/ui';
import {
  AccountIcon,
  ChevronDownIcon,
  CloseIcon,
  ICON_SIZE,
  MenuIcon,
  MessagesIcon,
  NotificationsIcon,
  SchoolIcon,
  SearchIcon,
  SettingsIcon,
  SignOutIcon,
} from '@ilm/ui/icons';
import { BRAND } from '@ilm/utils';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useRef, useState, type ReactNode } from 'react';

import { BrandTheme } from '@/components/brand-theme';
import { NAV_ICONS } from '@/components/nav-icons';
import { ThemeToggle } from '@/components/theme-toggle';
import { VerifyEmailBanner } from '@/components/verify-email-banner';
import { NAV_ITEMS, visibleNavItems, type NavItem } from '@/lib/navigation';
import { useCanonicalPathname, useTenantHref } from '@/lib/use-tenant-href';

/**
 * Leaf destinations in the static nav.
 *
 * Used so a collection href like `/students` does not stay lit on a sibling
 * first-class page like `/students/new`. Detail routes (`/students/:id`) are
 * not leaves, so the collection item correctly stays active on them.
 */
const NAV_LEAF_HREFS: readonly string[] = (() => {
  const hrefs: string[] = [];
  const walk = (items: readonly NavItem[]): void => {
    for (const item of items) {
      if (item.children !== undefined && item.children.length > 0) {
        walk(item.children);
      } else {
        hrefs.push(item.href);
      }
    }
  };
  walk(NAV_ITEMS);
  return hrefs;
})();

/**
 * The application shell.
 *
 * The sidebar is **generated from the signed-in person's permissions**, capped
 * at eight items. This is the fix for the problem in the old portal: ~30 flat
 * destinations, identical for a teacher and an owner, ordered by database table
 * (docs/00 §6, docs/08 §1). A teacher sees five items here; an owner sees eight.
 *
 * Granting a permission reveals its item automatically, so navigation and
 * access cannot drift into a menu entry that leads to a 403. The UI hides;
 * **the API decides** — every route behind these is permission-checked on the
 * server regardless.
 *
 * Until `profileCompleted` is true, nav items stay visible but disabled; the
 * proxy sends incomplete profiles to `/profile/create` (not listed in the sidebar).
 */

export interface AppShellProps {
  user: { name: string; email?: string; roleLabel: string };
  school: { name: string };
  permissions: readonly string[];
  /**
   * False until the first-login profile form is saved. Disables sidebar nav
   * until onboarding is done; `/profile/create` is reached via login/proxy only.
   */
  profileCompleted?: boolean;
  /**
   * The signed-in person's address, when they have not confirmed it yet.
   *
   * Passed as "the thing that is wrong" rather than as an `emailVerified`
   * boolean plus a separate email, because the banner needs both and a shell
   * that takes two related props can be given a contradictory pair. Undefined
   * means verified, or nobody is signed in — either way, no banner. ADR-0012.
   */
  unverifiedEmail?: string | undefined;
  /**
   * The school's own colour, or undefined for the product's.
   *
   * Comes down with the session rather than being fetched here. A value that
   * changes about once in a school's life must not cost a request on every
   * page, and the shell already has the session in its hands.
   */
  brandColor?: string | undefined;
  /** Setup-style pages: no max-width column — content aligns with the shell edge. */
  contentWidth?: 'default' | 'full';
  children: ReactNode;
}

/** Header icon buttons that are visible but not interactive yet. */
const HEADER_ICON_DISABLED =
  'inline-flex size-9 cursor-not-allowed items-center justify-center rounded-md text-muted-foreground opacity-50';

export function AppShell({
  user,
  school,
  permissions,
  profileCompleted = true,
  unverifiedEmail,
  brandColor,
  contentWidth = 'default',
  children,
}: AppShellProps) {
  const items = visibleNavItems(permissions);
  const pathname = usePathname();
  const canonicalPath = useCanonicalPathname();
  /** Lock nav only on the setup gate; after redirect home, links work even if RSC session props lag. */
  const navLocked = !profileCompleted && canonicalPath === '/profile/create';

  const [drawerOpen, setDrawerOpen] = useState(false);
  const scrollport = useRef<HTMLElement>(null);

  useEffect(() => {
    setDrawerOpen(false);

    // Next resets the *document's* scroll on navigation, and the document no
    // longer scrolls — `main` does. Without this, opening a nav item from
    // halfway down a long list lands on the next page already scrolled halfway
    // down it, showing the middle of a screen the person has never seen.
    scrollport.current?.scrollTo({ top: 0 });
  }, [pathname]);

  return (
    <TooltipProvider delayDuration={300}>
      <BrandTheme color={brandColor} />
      {/*
        Taken out of flow, deliberately.

        `h-dvh overflow-hidden` alone was not enough, and the symptom is the one
        already documented on `AuthScrollLock`: on Windows the document paints
        its own scrollport anyway, so the page carried **two** scrollbars and the
        whole shell — sidebar, header and all — slid up by the height of a
        horizontal scrollbar. A shell that scrolls is not a shell.

        `fixed` fixes it at the root rather than papering over it: an
        out-of-flow box contributes nothing to the document's height, so there
        is no second scrollport for anything to scroll. `main` below is then the
        only thing on the page that moves, which is what the layout always
        claimed to do.

        `inset-x-0 top-0 h-dvh` rather than `inset-0`, which is what
        `auth-layout` uses: `inset-0` resolves against the *layout* viewport, so
        on a phone the bottom tab bar would sit behind the browser's URL bar.
        Auth has nothing anchored to the bottom and does not care; this does.
      */}
      <div className="fixed inset-x-0 top-0 flex h-dvh overflow-hidden bg-background">
        <Sidebar
          className="hidden md:flex"
          items={items}
          school={school}
          navLocked={navLocked}
        />

        {drawerOpen ? (
          <div className="fixed inset-0 z-50 md:hidden">
            <button
              type="button"
              aria-label="Close menu"
              onClick={() => {
                setDrawerOpen(false);
              }}
              className="absolute inset-0 animate-in bg-foreground/40 fade-in-0"
            />
            <Sidebar
              className="relative flex h-full animate-in fade-in-0 slide-in-from-left-2"
              items={items}
              school={school}
              navLocked={navLocked}
              onClose={() => {
                setDrawerOpen(false);
              }}
            />
          </div>
        ) : null}

        <div className="flex min-w-0 flex-1 flex-col">
          <AppHeader
            schoolName={school.name}
            user={user}
            settingsEnabled={!navLocked}
            onOpenMenu={() => {
              setDrawerOpen(true);
            }}
          />

          <main
            ref={scrollport}
            className="scrollbar-hidden min-w-0 flex-1 overflow-y-auto overscroll-y-contain bg-muted/30"
          >
            <div
              className={
                contentWidth === 'full'
                  ? 'w-full pb-24 md:pb-6'
                  : 'mx-auto w-full max-w-6xl space-y-6 p-4 pb-24 md:p-5 md:pb-6 lg:px-6 lg:py-6 xl:max-w-7xl 2xl:max-w-[84rem]'
              }
            >
              {unverifiedEmail === undefined ? null : <VerifyEmailBanner email={unverifiedEmail} />}
              {children}
            </div>
          </main>

          <nav
            aria-label="Main"
            className="flex shrink-0 items-center justify-around border-t border-border bg-card pb-[env(safe-area-inset-bottom)] md:hidden"
          >
            {items.slice(0, 5).map((item) => (
              <NavLink key={item.href} item={firstLeaf(item)} compact disabled={navLocked} />
            ))}
          </nav>
        </div>
      </div>
    </TooltipProvider>
  );
}

function AppHeader({
  schoolName,
  user,
  settingsEnabled = false,
  onOpenMenu,
}: {
  schoolName: string;
  user: { name: string; email?: string; roleLabel: string };
  settingsEnabled?: boolean;
  onOpenMenu: () => void;
}) {
  const tenantHref = useTenantHref();
  return (
    <header className="flex h-16 shrink-0 items-center gap-3 border-b border-border bg-card px-3 md:gap-4 md:px-5">
      <button
        type="button"
        aria-label="Open menu"
        onClick={onOpenMenu}
        className="-ms-1 inline-flex size-9 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none md:hidden"
      >
        <MenuIcon className={ICON_SIZE.nav} aria-hidden="true" />
      </button>

      <span className="truncate text-sm font-semibold md:hidden">{schoolName}</span>

      <div className="hidden min-w-0 flex-1 md:block md:max-w-xl">
        <button
          type="button"
          disabled
          aria-label="Search"
          className={cn(
            HEADER_ICON_DISABLED,
            'flex h-10 w-full items-center gap-2 rounded-xl border-0 bg-muted/60 px-3.5 text-sm',
          )}
        >
          <SearchIcon className="size-4 shrink-0" aria-hidden="true" />
          <span className="truncate">Search pages, students…</span>
          <kbd className="ms-auto hidden rounded-md border border-border bg-background px-1.5 font-mono text-xs text-muted-foreground lg:inline">
            ⌘K
          </kbd>
        </button>
      </div>

      <div className="ms-auto flex items-center gap-1 md:gap-2">
        <ThemeToggle />

        <Hint label="Messages (coming soon)">
          <button type="button" disabled aria-label="Messages" className={HEADER_ICON_DISABLED}>
            <MessagesIcon className="size-4" aria-hidden="true" />
          </button>
        </Hint>

        <Hint label="Notifications (coming soon)">
          <button type="button" disabled aria-label="Notifications" className={HEADER_ICON_DISABLED}>
            <NotificationsIcon className="size-4" aria-hidden="true" />
          </button>
        </Hint>

        {settingsEnabled ? (
          <Hint label="Settings">
            <Link
              href={tenantHref('/settings')}
              aria-label="Settings"
              className="inline-flex size-9 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
            >
              <SettingsIcon className="size-4" aria-hidden="true" />
            </Link>
          </Hint>
        ) : (
          <Hint label="Complete setup to open settings">
            <button type="button" disabled aria-label="Settings" className={HEADER_ICON_DISABLED}>
              <SettingsIcon className="size-4" aria-hidden="true" />
            </button>
          </Hint>
        )}

        <span aria-hidden="true" className="mx-1 hidden h-8 w-px bg-border sm:block" />

        <div className="hidden min-w-0 text-end sm:block">
          <span className="block truncate text-sm font-medium text-foreground">{user.name}</span>
          <span className="block truncate text-xs text-muted-foreground">{user.roleLabel}</span>
        </div>

        <ProfileMenu user={user} />
      </div>
    </header>
  );
}

function ProfileMenu({ user }: { user: { name: string; email?: string } }) {
  const tenantHref = useTenantHref();
  const [askingSignOut, setAskingSignOut] = useState(false);

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            aria-label="Account menu"
            className="ms-1 inline-flex size-9 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary transition-colors hover:bg-primary/15 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          >
            {initials(user.name)}
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-64 p-0">
          <DropdownMenuLabel className="px-3 py-3 font-normal">
            <span className="block truncate text-sm font-semibold text-foreground">{user.name}</span>
            {user.email === undefined || user.email === '' ? null : (
              <span className="mt-0.5 block truncate text-xs text-muted-foreground">{user.email}</span>
            )}
          </DropdownMenuLabel>
          <DropdownMenuSeparator className="mx-0 my-0" />
          <div className="p-1">
            <DropdownMenuItem asChild>
              <Link href={tenantHref('/profile')} className="cursor-pointer px-2 py-2.5">
                <AccountIcon aria-hidden="true" />
                Profile
              </Link>
            </DropdownMenuItem>
          </div>
          <DropdownMenuSeparator className="mx-0 my-0" />
          <div className="p-1">
            <DropdownMenuItem
              destructive
              className="px-2 py-2.5"
              onSelect={() => {
                setAskingSignOut(true);
              }}
            >
              <SignOutIcon aria-hidden="true" />
              Logout
            </DropdownMenuItem>
          </div>
        </DropdownMenuContent>
      </DropdownMenu>

      <SignOutConfirm open={askingSignOut} onOpenChange={setAskingSignOut} />
    </>
  );
}

function Sidebar({
  items,
  school,
  navLocked,
  className,
  onClose,
}: {
  items: readonly NavItem[];
  school: { name: string };
  navLocked: boolean;
  className?: string;
  onClose?: () => void;
}) {
  return (
    <aside
      className={cn(
        'flex w-60 shrink-0 flex-col border-e border-border bg-card md:flex',
        className,
      )}
    >
      <div className="flex h-16 shrink-0 items-center gap-3 border-b border-border px-4">
        <span
          aria-hidden="true"
          className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-raised"
        >
          <SchoolIcon className="size-5" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm leading-tight font-semibold" title={school.name}>
            {school.name}
          </span>
          <span className="block truncate text-xs leading-tight text-muted-foreground">
            {BRAND.name}
          </span>
        </span>
        {onClose === undefined ? null : (
          <button
            type="button"
            aria-label="Close menu"
            onClick={onClose}
            className="inline-flex size-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          >
            <CloseIcon className="size-4" aria-hidden="true" />
          </button>
        )}
      </div>

      <nav aria-label="Main" className="scrollbar-hidden flex-1 space-y-1 overflow-y-auto px-3 py-4">
        <p className="px-2 pb-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
          Menu
        </p>
        {items.map((item) => (
          <NavBranch key={item.href} item={item} disabled={navLocked} />
        ))}
      </nav>
    </aside>
  );
}

function SignOutConfirm({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const toast = useToast();

  async function signOut() {
    try {
      const response = await fetch(ROUTES.auth.logout, {
        method: 'POST',
        credentials: 'include',
      });

      if (!response.ok) {
        toast.error('Could not sign you out. Check your connection and try again.');
        return;
      }
    } catch {
      toast.error('Could not reach the server. You are still signed in.');
      return;
    }

    router.replace('/login');
    router.refresh();
  }

  return (
    <ConfirmDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Are you sure you want to log out?"
      description="You will need to sign in again to continue."
      confirmLabel="Logout"
      cancelLabel="Cancel"
      tone="primary"
      onConfirm={signOut}
    />
  );
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) {
    return '?';
  }
  const first = parts[0]?.[0] ?? '';
  const last = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? '') : '';
  return (first + last).toUpperCase();
}

function NavLink({
  item,
  compact = false,
  disabled = false,
}: {
  item: NavItem;
  compact?: boolean;
  disabled?: boolean;
}) {
  const pathname = useCanonicalPathname();
  const tenantHref = useTenantHref();
  const isActive = isCurrent(item.href, pathname);
  const Icon = NAV_ICONS[item.icon];

  if (disabled) {
    return (
      <span
        aria-disabled="true"
        title="Complete your profile to unlock this"
        className={cn(
          'group relative flex cursor-not-allowed items-center gap-3 rounded-xl text-sm font-medium text-muted-foreground/50',
          compact ? 'min-h-12 flex-1 flex-col justify-center gap-1 py-2 text-xs' : 'px-3 py-2.5',
        )}
      >
        {Icon === undefined ? null : <Icon className="size-5 shrink-0" />}
        <span className={compact ? 'truncate' : undefined}>{item.label}</span>
      </span>
    );
  }

  return (
    <Link
      href={tenantHref(item.href)}
      aria-current={isActive ? 'page' : undefined}
      className={cn(
        'flex items-center gap-3 rounded-xl text-sm font-medium transition-colors duration-150',
        compact ? 'min-h-12 flex-1 flex-col justify-center gap-1 py-2 text-xs' : 'px-3 py-2.5',
        isActive
          ? 'bg-primary/10 text-primary shadow-sm'
          : 'text-muted-foreground hover:bg-muted/80 hover:text-foreground',
      )}
    >
      {Icon === undefined ? null : <Icon className="size-5 shrink-0" />}
      <span className={compact ? 'truncate' : undefined}>{item.label}</span>
    </Link>
  );
}

function NavBranch({
  item,
  depth = 0,
  disabled = false,
}: {
  item: NavItem;
  depth?: number;
  disabled?: boolean;
}) {
  const pathname = useCanonicalPathname();
  const children = item.children ?? [];
  const containsCurrent = children.some((child) => isWithin(child, pathname));

  const [overridden, setOverridden] = useState<boolean | undefined>(undefined);
  const isOpen = overridden ?? containsCurrent;

  if (children.length === 0) {
    return <NavLink item={item} disabled={disabled} />;
  }

  const Icon = NAV_ICONS[item.icon];

  return (
    <div>
      <button
        type="button"
        aria-expanded={isOpen}
        disabled={disabled}
        onClick={() => {
          setOverridden(!isOpen);
        }}
        className={cn(
          'flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors duration-150',
          disabled
            ? 'cursor-not-allowed text-muted-foreground/50'
            : containsCurrent
              ? 'bg-muted/60 text-foreground'
              : 'text-muted-foreground hover:bg-muted/80 hover:text-foreground',
        )}
      >
        {Icon === undefined ? null : <Icon className="size-5 shrink-0" />}
        <span className="flex-1 text-start">{item.label}</span>
        <ChevronDownIcon
          className={cn(
            'size-4 shrink-0 transition-transform duration-150',
            isOpen ? '' : '-rotate-90',
          )}
          aria-hidden="true"
        />
      </button>

      {isOpen && !disabled ? (
        <div
          className={cn(
            'mt-1 space-y-0.5 border-s-2 border-primary/15',
            depth === 0 ? 'ms-4 ps-2.5' : 'ms-3 ps-2',
          )}
        >
          {children.map((child) => (
            <NavBranch key={child.href} item={child} depth={depth + 1} disabled={disabled} />
          ))}
        </div>
      ) : null}
    </div>
  );
}

function isCurrent(href: string, pathname: string): boolean {
  if (href === '/') {
    return pathname === '/';
  }
  if (pathname === href) {
    return true;
  }
  if (!pathname.startsWith(`${href}/`)) {
    return false;
  }
  // A more specific leaf owns this path (e.g. `/students/new` beside
  // `/students`). Detail routes are not leaves, so the collection stays lit.
  return !NAV_LEAF_HREFS.some(
    (other) => other !== href && (pathname === other || pathname.startsWith(`${other}/`)),
  );
}

function isWithin(item: NavItem, pathname: string): boolean {
  return (
    isCurrent(item.href, pathname) ||
    (item.children ?? []).some((child) => isWithin(child, pathname))
  );
}

function firstLeaf(item: NavItem): NavItem {
  const child = item.children?.[0];
  return child === undefined ? item : firstLeaf(child);
}
