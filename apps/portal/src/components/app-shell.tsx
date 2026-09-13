'use client';

import { ROUTES } from '@ilm/contracts';
import { Button, ConfirmDialog, Separator, TooltipProvider, cn, useToast } from '@ilm/ui';
import {
  ChevronDownIcon,
  CloseIcon,
  ICON_SIZE,
  MenuIcon,
  SchoolIcon,
  SearchIcon,
  SignOutIcon,
} from '@ilm/ui/icons';
import { BRAND } from '@ilm/utils';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState, type ReactNode } from 'react';

import { AppSearch } from '@/components/app-search';
import { NAV_ICONS } from '@/components/nav-icons';
import { ThemeToggle } from '@/components/theme-toggle';
import { VerifyEmailBanner } from '@/components/verify-email-banner';
import { visibleNavItems, type NavItem } from '@/lib/navigation';
import { useCanonicalPathname, useTenantHref } from '@/lib/use-tenant-href';

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
 * ## Why the layout is `h-dvh` and not `min-h-dvh`
 *
 * With `min-h-dvh` the whole document scrolls, so the sidebar and the school
 * name scroll away with a long student list — on a 500-row table the navigation
 * is off-screen for most of the page. Pinning the frame to the viewport height
 * and giving **only the content column** its own scroll container is what keeps
 * navigation reachable at every scroll position, which is the behaviour every
 * admin product has and the one people expect without noticing.
 *
 * ## The three surfaces
 *
 * `--surface` for the chrome, `--card` for content, `--background` for the page
 * beneath both. Three tones rather than one flat white is most of what
 * separates a product from a wireframe; the tokens live in
 * `packages/config/tailwind/theme.css` and swap coherently in dark mode.
 */

export interface AppShellProps {
  user: { name: string; roleLabel: string };
  school: { name: string };
  permissions: readonly string[];
  /**
   * The signed-in person's address, when they have not confirmed it yet.
   *
   * Passed as "the thing that is wrong" rather than as an `emailVerified`
   * boolean plus a separate email, because the banner needs both and a shell
   * that takes two related props can be given a contradictory pair. Undefined
   * means verified, or nobody is signed in — either way, no banner. ADR-0012.
   */
  unverifiedEmail?: string | undefined;
  children: ReactNode;
}

export function AppShell({ user, school, permissions, unverifiedEmail, children }: AppShellProps) {
  const items = visibleNavItems(permissions);
  const pathname = usePathname();

  const [drawerOpen, setDrawerOpen] = useState(false);

  // A tap that navigates must also close the drawer, or the next screen arrives
  // underneath a menu that is still covering it.
  useEffect(() => {
    setDrawerOpen(false);
  }, [pathname]);

  return (
    <TooltipProvider delayDuration={300}>
      {/* `h-dvh` + `overflow-hidden`: the frame is the viewport, and scrolling
          happens inside the content column below. */}
      <div className="flex h-dvh overflow-hidden bg-background">
        {/* Hidden below md; the mobile pattern is a drawer plus a bottom bar,
            not a squeezed sidebar — a teacher marking attendance on a phone
            needs the screen. */}
        <Sidebar className="hidden md:flex" items={items} school={school} user={user} />

        {/* The same sidebar as a drawer, for the sections a five-slot bottom
            bar cannot reach. */}
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
              user={user}
              onClose={() => {
                setDrawerOpen(false);
              }}
            />
          </div>
        ) : null}

        <div className="flex min-w-0 flex-1 flex-col">
          <header className="flex h-14 shrink-0 items-center gap-3 border-b border-border bg-surface px-3 md:px-4">
            <button
              type="button"
              aria-label="Open menu"
              onClick={() => {
                setDrawerOpen(true);
              }}
              className="-ms-1 inline-flex size-9 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none md:hidden"
            >
              <MenuIcon className={ICON_SIZE.nav} aria-hidden="true" />
            </button>

            <span className="truncate text-sm font-semibold md:hidden">{school.name}</span>

            {/* ⌘K replaces the twenty-item menu (docs/00 §6). The palette owns
                its own open state and the keyboard shortcut; this is only the
                thing you click when you would rather not use the keyboard. */}
            <AppSearch permissions={permissions}>
              {(openSearch) => (
                <button
                  type="button"
                  onClick={openSearch}
                  className="hidden h-9 w-full max-w-sm items-center gap-2 rounded-lg border border-border bg-background px-3 text-sm text-muted-foreground transition-colors hover:border-input hover:bg-muted/50 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none md:flex"
                >
                  <SearchIcon className="size-4 shrink-0" aria-hidden="true" />
                  <span>Search pages, students…</span>
                  <kbd className="ms-auto rounded border border-border bg-muted px-1.5 font-mono text-xs text-muted-foreground">
                    ⌘K
                  </kbd>
                </button>
              )}
            </AppSearch>

            <div className="ms-auto flex items-center gap-1">
              <ThemeToggle />
              <span className="hidden text-xs text-muted-foreground lg:inline">{BRAND.name}</span>
              {/* Also in the header, because on mobile the sidebar — and with
                  it the only other way out — is not on screen at all. */}
              <div className="md:hidden">
                <SignOutButton compact />
              </div>
            </div>
          </header>

          {/* The one scroll container. */}
          <main className="min-w-0 flex-1 overflow-y-auto">
            {/* Capped rather than full-bleed: a table stretched across a 32in
                monitor puts the row's first and last cell a head-turn apart. */}
            <div className="mx-auto w-full max-w-7xl space-y-6 p-4 pb-24 md:p-6 md:pb-6">
              {/* Above the page content on every screen, not only the
                  dashboard: a person who lands deep in the app from a link must
                  still see it. */}
              {unverifiedEmail === undefined ? null : <VerifyEmailBanner email={unverifiedEmail} />}
              {children}
            </div>
          </main>

          {/* The mobile counterpart to the sidebar. */}
          <nav
            aria-label="Main"
            className="flex shrink-0 items-center justify-around border-t border-border bg-surface pb-[env(safe-area-inset-bottom)] md:hidden"
          >
            {/* Flat, and deliberately: a bottom bar has room for five icons and
                no room at all for a tree. A section with children links to its
                first child, so the tap still lands somewhere real. */}
            {items.slice(0, 5).map((item) => (
              <NavLink key={item.href} item={firstLeaf(item)} compact />
            ))}
          </nav>
        </div>
      </div>
    </TooltipProvider>
  );
}

function Sidebar({
  items,
  school,
  user,
  className,
  onClose,
}: {
  items: readonly NavItem[];
  school: { name: string };
  user: { name: string; roleLabel: string };
  className?: string;
  onClose?: () => void;
}) {
  return (
    <aside
      className={cn('w-64 shrink-0 flex-col border-e border-border bg-surface md:flex', className)}
    >
      <div className="flex h-14 shrink-0 items-center gap-2.5 border-b border-border px-3">
        <span
          aria-hidden="true"
          className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground"
        >
          <SchoolIcon className="size-4" />
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
            className="inline-flex size-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          >
            <CloseIcon className="size-4" aria-hidden="true" />
          </button>
        )}
      </div>

      {/* `overflow-y-auto` here and not on the aside, so the account block
          below stays pinned even when the nav itself is long. */}
      <nav aria-label="Main" className="flex-1 space-y-0.5 overflow-y-auto p-2">
        {items.map((item) => (
          <NavBranch key={item.href} item={item} />
        ))}
      </nav>

      <AccountBlock user={user} />
    </aside>
  );
}

/**
 * Who is signed in, and the way out.
 *
 * Pinned to the bottom of the sidebar rather than hidden behind an avatar menu:
 * this product is used on shared front-desk machines where signing out is a
 * frequent, deliberate act, not a rare one. Making it a discoverable button
 * beats making it tidy.
 */
function AccountBlock({ user }: { user: { name: string; roleLabel: string } }) {
  return (
    <div className="shrink-0 p-2">
      <Separator className="mb-2" />
      <div className="flex items-center gap-2.5 rounded-lg px-2 py-1.5">
        <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
          {initials(user.name)}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm leading-tight font-medium" title={user.name}>
            {user.name}
          </span>
          <span
            className="block truncate text-xs leading-tight text-muted-foreground"
            title={user.roleLabel}
          >
            {roleLabel(user.roleLabel)}
          </span>
        </span>
      </div>
      <div className="mt-1.5">
        <SignOutButton />
      </div>
    </div>
  );
}

/**
 * Sign out, behind a confirmation.
 *
 * The confirmation is not ceremony. On a shared machine the button sits a few
 * pixels from the navigation, and an accidental sign-out during fee collection
 * loses whatever was half-typed into the form — cheap to prevent, irritating to
 * suffer.
 */
function SignOutButton({ compact = false }: { compact?: boolean }) {
  const router = useRouter();
  const toast = useToast();
  const [asking, setAsking] = useState(false);

  async function signOut() {
    try {
      const response = await fetch(ROUTES.auth.logout, {
        method: 'POST',
        credentials: 'include',
      });

      if (!response.ok) {
        // The cookies are cleared by the server on success only, so a failure
        // here genuinely means still signed in. Saying so is better than
        // sending someone to a login page that bounces them back.
        toast.error('Could not sign you out. Check your connection and try again.');
        return;
      }
    } catch {
      toast.error('Could not reach the server. You are still signed in.');
      return;
    }

    // `replace`, not `push`: Back must not return to a page that now has no
    // session behind it.
    router.replace('/login');
    router.refresh();
  }

  return (
    <>
      <Button
        type="button"
        tone={compact ? 'ghost' : 'outline'}
        size={compact ? 'sm' : 'default'}
        className={compact ? undefined : 'w-full'}
        onClick={() => {
          setAsking(true);
        }}
      >
        <SignOutIcon className="size-4" aria-hidden="true" />
        Sign out
      </Button>

      <ConfirmDialog
        open={asking}
        onOpenChange={setAsking}
        title="Sign out?"
        description="Anything you have typed and not saved will be lost."
        confirmLabel="Sign out"
        tone="primary"
        onConfirm={signOut}
      />
    </>
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

/** `OWNER, PRINCIPAL` reads better as `Owner · Principal` in 11px type. */
function roleLabel(raw: string): string {
  return raw
    .split(',')
    .map((role) => role.trim())
    .filter(Boolean)
    .map((role) => role.charAt(0) + role.slice(1).toLowerCase().replace('_', ' '))
    .join(' · ');
}

function NavLink({ item, compact = false }: { item: NavItem; compact?: boolean }) {
  // Canonical, not raw: `navigation.ts` is written in unprefixed paths, and in
  // path mode `usePathname()` returns `/beacon/students`. Comparing those two
  // directly would light up nothing at all.
  const pathname = useCanonicalPathname();
  const tenantHref = useTenantHref();
  const isActive = isCurrent(item.href, pathname);
  const Icon = NAV_ICONS[item.icon];

  return (
    <Link
      href={tenantHref(item.href)}
      // Announced to assistive technology, not inferred from styling alone.
      aria-current={isActive ? 'page' : undefined}
      className={cn(
        'group relative flex items-center gap-3 rounded-lg text-sm font-medium transition-colors duration-150',
        // 44px minimum touch target on the mobile bar (docs/16 §5).
        compact ? 'min-h-12 flex-1 flex-col justify-center gap-1 py-2 text-xs' : 'px-3 py-2',
        isActive
          ? 'bg-primary/10 text-primary'
          : 'text-muted-foreground hover:bg-muted hover:text-foreground',
      )}
    >
      {/* A rail rather than only a tint. On a tinted row the eye has to compare
          two near-identical backgrounds to find where it is; a hard edge is
          read instantly, and it survives being printed or colour-blind. */}
      {isActive && !compact ? (
        <span
          aria-hidden="true"
          className="absolute inset-y-1.5 start-0 w-0.5 rounded-full bg-primary"
        />
      ) : null}
      {Icon === undefined ? null : <Icon className={'size-5 shrink-0'} />}
      <span className={compact ? 'truncate' : undefined}>{item.label}</span>
    </Link>
  );
}

/**
 * One branch of the sidebar.
 *
 * ## Open because you are in it, not because you clicked
 *
 * A section containing the current page starts expanded, so arriving by link or
 * by refresh shows you where you are rather than making you find it again. The
 * toggle then overrides that for as long as the page lives — collapsing a
 * section you are inside is a legitimate thing to want, and a component that
 * silently re-opens it is fighting the person using it.
 *
 * ## Why this is not a generic tree
 *
 * Two levels, and the recursion stops there. A menu deep enough to need a
 * generic renderer is a menu nobody can navigate, and building one invites
 * exactly that.
 */
function NavBranch({ item, depth = 0 }: { item: NavItem; depth?: number }) {
  const pathname = useCanonicalPathname();
  const children = item.children ?? [];
  const containsCurrent = children.some((child) => isWithin(child, pathname));

  const [overridden, setOverridden] = useState<boolean | undefined>(undefined);
  const isOpen = overridden ?? containsCurrent;

  if (children.length === 0) {
    return <NavLink item={item} />;
  }

  const Icon = NAV_ICONS[item.icon];

  return (
    <div>
      <button
        type="button"
        aria-expanded={isOpen}
        onClick={() => {
          setOverridden(!isOpen);
        }}
        className={cn(
          'flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors duration-150',
          containsCurrent
            ? 'text-foreground'
            : 'text-muted-foreground hover:bg-muted hover:text-foreground',
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

      {isOpen ? (
        // A rail down the side, so a child two levels in still reads as
        // belonging to something rather than floating.
        <div
          className={cn(
            'mt-0.5 space-y-0.5 border-s border-border',
            depth === 0 ? 'ms-5 ps-2' : 'ms-3 ps-2',
          )}
        >
          {children.map((child) => (
            <NavBranch key={child.href} item={child} depth={depth + 1} />
          ))}
        </div>
      ) : null}
    </div>
  );
}

/** Is this exact item the page being viewed? */
function isCurrent(href: string, pathname: string): boolean {
  if (href === '/') {
    return pathname === '/';
  }
  // Segment-aware: `/fees` must not light up for `/fees-archive`.
  return pathname === href || pathname.startsWith(`${href}/`);
}

/** Does this item, or anything under it, cover the current page? */
function isWithin(item: NavItem, pathname: string): boolean {
  return (
    isCurrent(item.href, pathname) ||
    (item.children ?? []).some((child) => isWithin(child, pathname))
  );
}

/**
 * The first real page under a section.
 *
 * Used by the mobile bar, where there is no room to expand anything: tapping
 * "Attendance" has to land on marking students rather than on a container route
 * that only redirects.
 */
function firstLeaf(item: NavItem): NavItem {
  const child = item.children?.[0];
  return child === undefined ? item : firstLeaf(child);
}
