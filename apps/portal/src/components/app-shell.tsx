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
  AttendanceIcon,
  CalendarIcon,
  ChevronDownIcon,
  CloseIcon,
  FeesIcon,
  FinanceIcon,
  ICON_SIZE,
  MenuIcon,
  NotificationsIcon,
  PrintIcon,
  SchoolIcon,
  SearchIcon,
  SettingsIcon,
  SignOutIcon,
  StudentsIcon,
  TrendUpIcon,
} from '@ilm/ui/icons';
import { BRAND } from '@ilm/utils';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useRef, useState, type ComponentType, type ReactNode } from 'react';

import { AppSearch } from '@/components/app-search';
import { BrandTheme } from '@/components/brand-theme';
import { NAV_ICONS } from '@/components/nav-icons';
import { ThemeToggle } from '@/components/theme-toggle';
import { VerifyEmailBanner } from '@/components/verify-email-banner';
import { NAV_ITEMS, visibleNavItems, visibleSettingsMenuItems, type NavItem } from '@/lib/navigation';
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
/**
 * The gutter every workspace screen sits in.
 *
 * `pb-24` on small screens clears the bottom tab bar; from `md` the bar is
 * gone and the padding is even on all four sides.
 */
const CONTENT_PADDING = "px-4 pt-4 pb-24 md:px-6 md:pt-6 md:pb-6";


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
  'inline-flex size-10 cursor-not-allowed items-center justify-center rounded-lg text-muted-foreground opacity-50';

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
            permissions={permissions}
            settingsEnabled={!navLocked}
            onOpenMenu={() => {
              setDrawerOpen(true);
            }}
          />

          <main
            ref={scrollport}
            className="scrollbar-hidden min-w-0 flex-1 overflow-y-auto overscroll-y-contain bg-muted/30"
          >
            {/* Padding is decided here and nowhere else.

                The two widths used to disagree about it: `default` padded and
                `full` did not, so every screen that asked for the full width
                sat flush against the sidebar and ran off the right edge — and
                the dashboard quietly grew its own padding to compensate, which
                is how one rule becomes two. The only difference between the
                branches now is the maximum width. */}
            <div
              className={
                contentWidth === 'full'
                  ? `w-full ${CONTENT_PADDING}`
                  : `mx-auto w-full max-w-6xl space-y-6 ${CONTENT_PADDING} xl:max-w-7xl 2xl:max-w-[84rem]`
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
  permissions,
  settingsEnabled = false,
  onOpenMenu,
}: {
  schoolName: string;
  user: { name: string; email?: string; roleLabel: string };
  permissions: readonly string[];
  settingsEnabled?: boolean;
  onOpenMenu: () => void;
}) {
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
        <AppSearch permissions={permissions}>
          {(openSearch) => (
            <button
              type="button"
              aria-label="Search pages and students"
              onClick={openSearch}
              className="flex h-10 w-full cursor-pointer items-center gap-2.5 rounded-xl border border-border bg-muted/40 px-3.5 text-sm text-muted-foreground transition-colors hover:bg-muted/70 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
            >
              <SearchIcon className="size-4 shrink-0 opacity-80" aria-hidden="true" />
              <span className="truncate text-start">Search pages, students…</span>
              <kbd className="ms-auto hidden rounded-md border border-border bg-background px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground lg:inline">
                ⌘K
              </kbd>
            </button>
          )}
        </AppSearch>
      </div>

      <div className="ms-auto flex items-center gap-1 md:gap-2">
        <ThemeToggle />

        <HeaderNotificationsMenu />

        <HeaderSettingsMenu permissions={permissions} disabled={!settingsEnabled} />

        <span aria-hidden="true" className="mx-1 hidden h-8 w-px bg-border sm:block" />

        <ProfileMenu user={user} />
      </div>
    </header>
  );
}

function HeaderSettingsMenu({
  permissions,
  disabled,
}: {
  permissions: readonly string[];
  disabled: boolean;
}) {
  const tenantHref = useTenantHref();
  const items = visibleSettingsMenuItems(permissions);
  const hasItems = items.length > 0;

  if (disabled || !hasItems) {
    return (
      <Hint label={disabled ? 'Complete setup to open settings' : 'No settings available'}>
        <button type="button" disabled aria-label="Settings" className={HEADER_ICON_DISABLED}>
          <SettingsIcon className={HEADER_ICON_CLASS} aria-hidden="true" />
        </button>
      </Hint>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button type="button" aria-label="Settings" className={HEADER_ACTION_CLASS}>
          <SettingsIcon className={HEADER_ICON_CLASS} aria-hidden="true" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" sideOffset={6} className="min-w-44 p-1">
        {items.map((item) => {
          const Icon = NAV_ICONS[item.icon] ?? SettingsIcon;
          return (
            <DropdownMenuItem key={item.href} asChild className="rounded-md px-2.5 py-2">
              <Link href={tenantHref(item.href)} className="cursor-pointer">
                <Icon aria-hidden="true" className="text-muted-foreground" />
                {item.label}
              </Link>
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

const HEADER_ICON_CLASS = 'size-5 shrink-0';

const HEADER_ACTION_CLASS =
  'inline-flex size-10 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none';

type HeaderNotificationIcon = ComponentType<{ className?: string }>;

const STATIC_HEADER_NOTIFICATIONS: readonly {
  id: string;
  title: string;
  detail: string;
  time: string;
  unread: boolean;
  icon: HeaderNotificationIcon;
}[] = [
  {
    id: 'n1',
    title: 'Fee payment recorded',
    detail: 'GR 1042 — Rs 12,500 received at reception.',
    time: 'Today, 9:14 AM',
    unread: true,
    icon: FeesIcon,
  },
  {
    id: 'n2',
    title: 'New admission',
    detail: 'Ayesha Khan enrolled in Grade 1 · A.',
    time: 'Yesterday, 4:30 PM',
    unread: true,
    icon: StudentsIcon,
  },
  {
    id: 'n3',
    title: 'Attendance not marked',
    detail: '3 classes still unmarked for today.',
    time: 'Yesterday, 8:00 AM',
    unread: true,
    icon: AttendanceIcon,
  },
  {
    id: 'n4',
    title: 'Voucher batch ready',
    detail: 'October tuition vouchers are ready to print.',
    time: 'Mon, 6 Oct',
    unread: false,
    icon: PrintIcon,
  },
  {
    id: 'n5',
    title: 'Session calendar updated',
    detail: 'Mid-term break added to the academic calendar.',
    time: 'Fri, 3 Oct',
    unread: false,
    icon: CalendarIcon,
  },
];

function HeaderNotificationsMenu() {
  const unreadCount = STATIC_HEADER_NOTIFICATIONS.filter((entry) => entry.unread).length;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button type="button" aria-label="Notifications" className={cn(HEADER_ACTION_CLASS, 'relative')}>
          <NotificationsIcon className={HEADER_ICON_CLASS} aria-hidden="true" />
          {unreadCount === 0 ? null : (
            <span className="absolute end-0.5 top-0.5 flex size-5 items-center justify-center rounded-full bg-primary text-[10px] font-semibold tabular-nums leading-none text-primary-foreground ring-2 ring-card">
              {unreadCount > 9 ? '9+' : unreadCount}
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
          {unreadCount === 0 ? null : (
            <span className="rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-medium text-primary">
              {unreadCount} new
            </span>
          )}
        </div>
        <ul
          className="scrollbar-hidden max-h-[min(20rem,70vh)] divide-y divide-border overflow-y-auto overscroll-y-contain"
          aria-label="Recent notifications"
        >
          {STATIC_HEADER_NOTIFICATIONS.map((entry) => {
            const ItemIcon = entry.icon;
            return (
              <li key={entry.id}>
                <button
                  type="button"
                  className={cn(
                    'flex w-full gap-3 px-4 py-3 text-start transition-colors hover:bg-muted/50',
                    entry.unread ? 'bg-primary/[0.04]' : undefined,
                  )}
                >
                  <span
                    className={cn(
                      'relative flex size-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary',
                      entry.unread ? 'ring-2 ring-primary/20' : undefined,
                    )}
                  >
                    <ItemIcon className="size-4 shrink-0" aria-hidden="true" />
                    {entry.unread ? (
                      <span
                        aria-hidden="true"
                        className="absolute -end-0.5 -top-0.5 size-2 rounded-full bg-primary ring-2 ring-card"
                      />
                    ) : null}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-start justify-between gap-2">
                      <span className="text-sm font-medium text-foreground">{entry.title}</span>
                      <span className="shrink-0 text-[11px] whitespace-nowrap text-muted-foreground">
                        {entry.time}
                      </span>
                    </span>
                    <span className="mt-0.5 block text-xs leading-snug text-muted-foreground">
                      {entry.detail}
                    </span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
        <p className="border-t border-border bg-muted/20 px-4 py-2.5 text-center text-xs text-muted-foreground">
          Live feed coming soon
        </p>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function ProfileMenu({
  user,
}: {
  user: { name: string; email?: string; roleLabel: string };
}) {
  const tenantHref = useTenantHref();
  const [askingSignOut, setAskingSignOut] = useState(false);
  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            aria-label="Account menu"
            className="inline-flex max-w-[12rem] items-center gap-2 rounded-lg py-1 ps-0.5 pe-1 transition-colors hover:bg-muted/80 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none sm:max-w-xs"
          >
            <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
              {initials(user.name)}
            </span>
            <span className="hidden min-w-0 text-start sm:block">
              <span className="block truncate text-sm font-medium text-foreground">{user.name}</span>
              <span className="block truncate text-xs text-muted-foreground">{user.roleLabel}</span>
            </span>
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" sideOffset={6} className="min-w-52 p-1">
          <DropdownMenuLabel className="px-2.5 py-2 font-normal">
            <span className="flex items-center gap-3">
              <span
                aria-hidden="true"
                className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary"
              >
                {initials(user.name)}
              </span>
              <span className="min-w-0 flex-1 text-start">
                <span className="block truncate text-sm font-medium text-foreground">{user.name}</span>
                {user.email === undefined || user.email === '' ? null : (
                  <span className="block truncate text-xs text-muted-foreground">{user.email}</span>
                )}
              </span>
            </span>
          </DropdownMenuLabel>
          <DropdownMenuSeparator className="mx-0" />
          <DropdownMenuItem asChild className="rounded-md px-2.5 py-2">
            <Link href={tenantHref('/profile')} className="cursor-pointer">
              <AccountIcon aria-hidden="true" className="text-muted-foreground" />
              Profile
            </Link>
          </DropdownMenuItem>
          <DropdownMenuItem asChild className="rounded-md px-2.5 py-2">
            <Link href={tenantHref('/pricing')} className="cursor-pointer">
              <TrendUpIcon aria-hidden="true" className="text-muted-foreground" />
              Pricing
            </Link>
          </DropdownMenuItem>
          <DropdownMenuItem asChild className="rounded-md px-2.5 py-2">
            <Link href={tenantHref('/billing')} className="cursor-pointer">
              <FinanceIcon aria-hidden="true" className="text-muted-foreground" />
              Billing
            </Link>
          </DropdownMenuItem>
          <DropdownMenuSeparator className="mx-0" />
          <DropdownMenuItem
            destructive
            className="rounded-md px-2.5 py-2"
            onSelect={() => {
              setAskingSignOut(true);
            }}
          >
            <SignOutIcon aria-hidden="true" />
            Logout
          </DropdownMenuItem>
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
          ? 'bg-primary/10 text-primary'
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
