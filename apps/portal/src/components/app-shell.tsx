'use client';

import { ROUTES, type SchoolLogoInfo } from '@ilm/contracts';
import {
  ConfirmDialog,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Hint,
  StatusBadge,
  TooltipProvider,
  cn,
  useToast,
} from '@ilm/ui';
import {
  AccountIcon,
  ChevronDownIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  CloseIcon,
  FinanceIcon,
  ICON_SIZE,
  MenuIcon,
  SearchIcon,
  SettingsIcon,
  SignOutIcon,
  TrendUpIcon,
} from '@ilm/ui/icons';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { Suspense, useEffect, useRef, useState, type ReactNode } from 'react';

import { AppSearch } from '@/components/app-search';
import { BrandTheme } from '@/components/brand-theme';
import { FEE_SETTINGS_ITEMS } from '@/components/fee-settings-nav';
import { NAV_ICONS } from '@/components/nav-icons';
import { NotificationsMenu } from '@/components/notifications-menu';
import { ParentChildFilter } from '@/components/parent-child-filter';
import { SidebarBrandMark } from '@/components/sidebar-brand-mark';
import { ThemeToggle } from '@/components/theme-toggle';
import { VerifyEmailBanner } from '@/components/verify-email-banner';
import {
  NAV_ITEMS,
  visibleNavItems,
  visibleSettingsMenuItems,
  type NavItem,
} from '@/lib/navigation';
import { disablePush } from '@/lib/push';
import { SCHOOL_COLOUR_UPDATED_EVENT, SCHOOL_LOGO_UPDATED_EVENT } from '@/lib/school-logo-shell';
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
const SIDEBAR_COLLAPSED_KEY = 'ilm:sidebar-collapsed';

const CONTENT_PADDING = 'px-3 pt-3 pb-20 md:px-4 md:pt-4 md:pb-5';

export interface ParentChildrenProp {
  kids: readonly { id: string; name: string }[];
  selectedId: string | undefined;
}

export interface AppShellProps {
  user: { name: string; email?: string; roleLabel: string; avatarUrl?: string | null };
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
  /** Latest school logo metadata — loaded with the shell, updated in place on upload. */
  schoolLogo?: SchoolLogoInfo | undefined;
  /**
   * A parent's linked children and the one the header filter has chosen
   * (undefined: all). Undefined for anybody who is not a parent, and the filter
   * is not drawn.
   */
  parentChildren?: ParentChildrenProp | undefined;
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
  brandColor: serverBrandColor,
  schoolLogo: initialSchoolLogo,
  parentChildren,
  children,
}: AppShellProps) {
  const items = visibleNavItems(permissions);
  const pathname = usePathname();
  const canonicalPath = useCanonicalPathname();
  /** Lock nav only on the setup gate; after redirect home, links work even if RSC session props lag. */
  const navLocked = !profileCompleted && canonicalPath === '/profile/create';

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  // Fee settings has a menu of its own beside the page, so the main sidebar steps aside
  // there: folded on arrival, and the arrow opens it for this visit. Leaving the area
  // forgets that, and the person's own remembered choice applies again everywhere else.
  const inFeeSettings = FEE_SETTINGS_ITEMS.some((item) => item.href === canonicalPath);
  const [openInFeeSettings, setOpenInFeeSettings] = useState(false);
  useEffect(() => {
    if (!inFeeSettings) {
      setOpenInFeeSettings(false);
    }
  }, [inFeeSettings]);

  // Remembered per browser. Read after mount so the server and first client
  // render agree; storage can be blocked, so every access is guarded.
  useEffect(() => {
    try {
      setCollapsed(window.localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === '1');
    } catch {
      // Private mode or blocked storage: start expanded.
    }
  }, []);

  function toggleSidebar(): void {
    if (inFeeSettings) {
      setOpenInFeeSettings((current) => !current);
      return;
    }
    setCollapsed((current) => {
      const next = !current;
      try {
        window.localStorage.setItem(SIDEBAR_COLLAPSED_KEY, next ? '1' : '0');
      } catch {
        // Not persisted; still works for this visit.
      }
      return next;
    });
  }
  const sidebarCollapsed = inFeeSettings ? !openInFeeSettings : collapsed;
  const [schoolLogo, setSchoolLogo] = useState(initialSchoolLogo);
  const scrollport = useRef<HTMLElement>(null);

  const [brandColor, setBrandColor] = useState(serverBrandColor);

  useEffect(() => {
    setBrandColor(serverBrandColor);
  }, [serverBrandColor]);

  useEffect(() => {
    function onColourUpdated(event: Event): void {
      const detail = (event as CustomEvent<string | null>).detail;
      setBrandColor(detail ?? undefined);
    }
    window.addEventListener(SCHOOL_COLOUR_UPDATED_EVENT, onColourUpdated);
    return () => {
      window.removeEventListener(SCHOOL_COLOUR_UPDATED_EVENT, onColourUpdated);
    };
  }, []);

  useEffect(() => {
    setSchoolLogo(initialSchoolLogo);
  }, [initialSchoolLogo]);

  useEffect(() => {
    function onLogoUpdated(event: Event): void {
      const detail = (event as CustomEvent<SchoolLogoInfo>).detail;
      if (detail !== undefined) {
        setSchoolLogo(detail);
      }
    }
    window.addEventListener(SCHOOL_LOGO_UPDATED_EVENT, onLogoUpdated);
    return () => {
      window.removeEventListener(SCHOOL_LOGO_UPDATED_EVENT, onLogoUpdated);
    };
  }, []);

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
      <div className="fixed inset-x-0 top-0 flex h-dvh overflow-hidden bg-workspace-canvas">
        <Sidebar
          className="hidden md:flex"
          collapsed={sidebarCollapsed}
          items={items}
          schoolLogo={schoolLogo}
          profileCompleted={profileCompleted}
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
              schoolLogo={schoolLogo}
              profileCompleted={profileCompleted}
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
            parentChildren={parentChildren}
            sidebarCollapsed={sidebarCollapsed}
            onToggleSidebar={toggleSidebar}
            onOpenMenu={() => {
              setDrawerOpen(true);
            }}
          />

          <main
            ref={scrollport}
            className="scrollbar-hidden min-w-0 flex-1 overflow-y-auto overscroll-y-contain bg-workspace-canvas"
          >
            {/* Padding is decided here and nowhere else. Workspace pages use the
                full width beside the sidebar — tables and dashboards need the
                room on large monitors, and a centred max-width column left half
                the canvas empty. */}
            <div className={`w-full space-y-4 ${CONTENT_PADDING}`}>
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
  parentChildren,
  sidebarCollapsed,
  onToggleSidebar,
  onOpenMenu,
}: {
  schoolName: string;
  user: { name: string; email?: string; roleLabel: string; avatarUrl?: string | null };
  permissions: readonly string[];
  settingsEnabled?: boolean;
  parentChildren?: ParentChildrenProp | undefined;
  sidebarCollapsed: boolean;
  onToggleSidebar: () => void;
  onOpenMenu: () => void;
}) {
  const ToggleIcon = sidebarCollapsed ? ChevronRightIcon : ChevronLeftIcon;
  return (
    <header className="flex h-16 shrink-0 items-center gap-3 border-b border-border/50 bg-header px-3 md:gap-4 md:px-5">
      <button
        type="button"
        aria-label="Open menu"
        onClick={onOpenMenu}
        className="-ms-1 inline-flex size-9 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none md:hidden"
      >
        <MenuIcon className={ICON_SIZE.nav} aria-hidden="true" />
      </button>

      <button
        type="button"
        aria-label={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        aria-pressed={sidebarCollapsed}
        title={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        onClick={onToggleSidebar}
        className="-ms-1 hidden size-9 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none md:inline-flex"
      >
        <ToggleIcon className={ICON_SIZE.nav} aria-hidden="true" />
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
        {parentChildren === undefined ? null : (
          <Suspense fallback={null}>
            <ParentChildFilter
              kids={parentChildren.kids}
              selectedId={parentChildren.selectedId}
              className="me-1"
            />
          </Suspense>
        )}

        <StatusBadge tone="success" className="me-1 hidden shrink-0 md:inline-flex">
          {user.roleLabel}
        </StatusBadge>

        <NotificationsMenu />

        <HeaderSettingsMenu permissions={permissions} disabled={!settingsEnabled} />

        <ThemeToggle />

        <span aria-hidden="true" className="mx-1 hidden h-8 w-px bg-border sm:block" />

        <ProfileMenu user={user} canManagePlan={permissions.includes('settings.billing.manage')} />
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

  // Nothing to configure, nothing to show: a parent or a teacher has no settings, and a
  // greyed-out gear would only ask what it is for.
  if (!hasItems) {
    return null;
  }

  if (disabled) {
    return (
      <Hint label="Complete setup to open settings">
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

/** The signed-in person's photo, or their initials until they add one. */
function HeaderAvatar({
  user,
  className,
}: {
  user: { name: string; avatarUrl?: string | null };
  className?: string;
}) {
  const shown = user.avatarUrl !== undefined && user.avatarUrl !== null && user.avatarUrl !== '';
  return (
    <span
      aria-hidden="true"
      className={`flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-primary/10 text-xs font-semibold text-primary ${className ?? ''}`}
    >
      {shown ? (
        // eslint-disable-next-line @next/next/no-img-element -- may be a data URL
        <img src={user.avatarUrl ?? ''} alt="" className="size-full object-cover" />
      ) : (
        initials(user.name)
      )}
    </span>
  );
}

function ProfileMenu({
  user,
  canManagePlan,
}: {
  user: { name: string; email?: string; roleLabel: string; avatarUrl?: string | null };
  /** Pricing and Billing are the school's dealings with the platform: the Admin's alone. */
  canManagePlan: boolean;
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
            className="inline-flex items-center gap-2.5 rounded-lg py-1 ps-0.5 pe-2 transition-colors hover:bg-muted/80 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          >
            <HeaderAvatar user={user} className="size-10" />
            <span className="hidden min-w-0 text-start md:block">
              <span className="block text-sm font-medium whitespace-nowrap text-foreground">
                {user.name}
              </span>
              {user.email === undefined || user.email === '' ? null : (
                <span className="block text-xs whitespace-nowrap text-muted-foreground">
                  {user.email}
                </span>
              )}
            </span>
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" sideOffset={6} className="min-w-52 p-1">
          <DropdownMenuLabel className="px-2.5 py-2 font-normal">
            <span className="flex items-center gap-3">
              <HeaderAvatar user={user} className="size-9" />
              <span className="min-w-0 flex-1 text-start">
                <span className="block truncate text-sm font-medium text-foreground">
                  {user.name}
                </span>
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
          {canManagePlan ? (
            <>
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
            </>
          ) : null}
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
  schoolLogo,
  profileCompleted,
  navLocked,
  className,
  collapsed = false,
  onClose,
}: {
  collapsed?: boolean;
  items: readonly NavItem[];
  schoolLogo: SchoolLogoInfo | undefined;
  profileCompleted: boolean;
  navLocked: boolean;
  className?: string;
  onClose?: () => void;
}) {
  const tenantHref = useTenantHref();

  return (
    <aside
      className={cn(
        'flex shrink-0 flex-col border-e border-border/50 bg-sidebar transition-[width] duration-200 ease-in-out motion-reduce:transition-none md:flex',
        collapsed ? 'w-16' : 'w-56',
        className,
      )}
    >
      <div
        className={cn(
          'relative flex h-16 shrink-0 items-center border-b border-border/50 bg-sidebar px-3',
          collapsed ? 'justify-center' : 'justify-start',
        )}
      >
        <Link
          href={tenantHref('/')}
          className={cn(
            'inline-flex items-center rounded-md focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
            collapsed
              ? 'size-10 justify-center overflow-hidden'
              : 'max-w-[148px] justify-start ps-3',
          )}
          aria-label="Home"
        >
          <SidebarBrandMark
            schoolLogo={
              schoolLogo ?? {
                present: false,
                mimeType: null,
                byteSize: null,
                version: null,
              }
            }
            profileCompleted={profileCompleted}
            className={collapsed ? 'w-10' : undefined}
          />
        </Link>
        {onClose === undefined ? null : (
          <button
            type="button"
            aria-label="Close menu"
            onClick={onClose}
            className="absolute end-3 top-1/2 inline-flex size-8 -translate-y-1/2 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          >
            <CloseIcon className="size-4" aria-hidden="true" />
          </button>
        )}
      </div>

      <nav
        aria-label="Main"
        className={cn(
          'scrollbar-hidden flex flex-1 flex-col gap-1 overflow-y-auto py-4',
          collapsed ? 'items-center px-2' : 'px-3',
        )}
      >
        {items.map((item) => (
          <NavBranch key={item.href} item={item} disabled={navLocked} collapsed={collapsed} />
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
  const tenantHref = useTenantHref();

  async function signOut() {
    // Before the session ends, while the API can still tell who is asking.
    await disablePush(tenantHref('/').replace(/\/+$/, ''));
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
      toast.error('You are still signed in. Try again when you are back online.');
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

function navDepthPadding(depth: number): string {
  if (depth <= 0) {
    return 'ps-3';
  }
  if (depth === 1) {
    return 'ps-6';
  }
  return 'ps-9';
}

function NavLink({
  item,
  compact = false,
  disabled = false,
  depth = 0,
  collapsed = false,
  forceActive = false,
}: {
  collapsed?: boolean;
  /** A collapsed group stays lit while any of its pages is open. */
  forceActive?: boolean;
  item: NavItem;
  compact?: boolean;
  disabled?: boolean;
  depth?: number;
}) {
  const pathname = useCanonicalPathname();
  const tenantHref = useTenantHref();
  const isActive = forceActive || isCurrent(item.href, pathname);
  const Icon = NAV_ICONS[item.icon];
  const nested = depth > 0;

  if (disabled) {
    return (
      <span
        aria-disabled="true"
        title="Complete your profile to unlock this"
        className={cn(
          'group relative flex cursor-not-allowed items-center gap-2.5 rounded-lg text-sm font-medium text-muted-foreground/50',
          compact
            ? 'min-h-12 flex-1 flex-col justify-center gap-1 py-2 text-xs'
            : collapsed
              ? 'size-10 justify-center'
              : cn('py-2 pe-3', navDepthPadding(depth)),
        )}
      >
        {Icon === undefined ? null : (
          <Icon
            className={cn('shrink-0 opacity-60', nested ? 'size-4' : ICON_SIZE.nav)}
            aria-hidden
          />
        )}
        <span className={cn('truncate', nested ? 'text-xs' : undefined, collapsed && 'sr-only')}>
          {item.label}
        </span>
      </span>
    );
  }

  return (
    <Link
      href={tenantHref(item.href)}
      aria-current={isActive ? 'page' : undefined}
      title={collapsed ? item.label : undefined}
      className={cn(
        'relative flex items-center gap-2.5 rounded-lg text-sm transition-colors duration-150',
        compact
          ? 'min-h-12 flex-1 flex-col justify-center gap-1 py-2 text-xs'
          : collapsed
            ? 'size-10 justify-center'
            : cn('py-2 pe-3', navDepthPadding(depth)),
        nested ? 'font-normal' : 'font-medium',
        isActive
          ? 'bg-primary/10 text-primary'
          : 'text-muted-foreground hover:bg-card/70 hover:text-foreground',
      )}
    >
      {Icon === undefined ? null : (
        <Icon
          className={cn(
            'shrink-0',
            nested ? 'size-4' : ICON_SIZE.nav,
            isActive ? 'text-primary' : 'opacity-80',
          )}
          aria-hidden
        />
      )}
      <span
        className={cn(
          'truncate',
          nested ? 'text-xs' : undefined,
          isActive && 'text-primary',
          collapsed && 'sr-only',
        )}
      >
        {item.label}
      </span>
    </Link>
  );
}

function NavBranch({
  item,
  depth = 0,
  disabled = false,
  collapsed = false,
}: {
  item: NavItem;
  depth?: number;
  disabled?: boolean;
  collapsed?: boolean;
}) {
  const pathname = useCanonicalPathname();
  const children = item.children ?? [];
  const containsCurrent = children.some((child) => isWithin(child, pathname));

  const [overridden, setOverridden] = useState<boolean | undefined>(undefined);
  const isOpen = overridden ?? containsCurrent;

  if (children.length === 0) {
    return <NavLink item={item} disabled={disabled} depth={depth} collapsed={collapsed} />;
  }

  // Collapsed: a group is one icon that opens its first page, and stays lit
  // while any page inside it is the current one.
  if (collapsed) {
    return (
      <NavLink
        item={{ ...firstLeaf(item), label: item.label, icon: item.icon }}
        disabled={disabled}
        collapsed
        forceActive={containsCurrent}
      />
    );
  }

  const Icon = NAV_ICONS[item.icon];

  return (
    <div className="flex flex-col gap-0.5">
      <button
        type="button"
        aria-expanded={isOpen}
        disabled={disabled}
        onClick={() => {
          setOverridden(!isOpen);
        }}
        className={cn(
          'flex w-full items-center gap-2.5 rounded-lg py-2 pe-2 text-sm font-medium transition-colors duration-150',
          navDepthPadding(depth),
          disabled
            ? 'cursor-not-allowed text-muted-foreground/50'
            : containsCurrent
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
        <span
          className={cn(
            'flex-1 truncate text-start',
            containsCurrent && !disabled ? 'text-primary' : undefined,
          )}
        >
          {item.label}
        </span>
        <ChevronDownIcon
          className={cn(
            'size-4 shrink-0 opacity-60 transition-transform duration-150',
            isOpen ? '' : '-rotate-90',
          )}
          aria-hidden="true"
        />
      </button>

      {isOpen && !disabled ? (
        <div className="flex flex-col gap-0.5">
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
