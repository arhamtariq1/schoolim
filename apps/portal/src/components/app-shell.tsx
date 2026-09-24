'use client';

import { ROUTES } from '@ilm/contracts';
import {
  Button,
  ConfirmDialog,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Hint,
  Separator,
  TooltipProvider,
  cn,
  useToast,
} from '@ilm/ui';
import {
  ChevronDownIcon,
  CloseIcon,
  EditIcon,
  ICON_SIZE,
  MenuIcon,
  MessagesIcon,
  NotificationsIcon,
  SchoolIcon,
  SearchIcon,
  SettingsIcon,
  SignOutIcon,
  ViewIcon,
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
 * Until `profileCompleted` is true, every nav item except Set up profile is
 * visually disabled and non-navigable; the proxy enforces the same gate on URLs.
 */

export interface AppShellProps {
  user: { name: string; email?: string; roleLabel: string };
  school: { name: string };
  permissions: readonly string[];
  /**
   * False until the first-login profile form is saved. Disables every nav item
   * except Set up profile and keeps the person on `/profile/create`.
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
  children: ReactNode;
}

const PROFILE_SETUP_ITEM: NavItem = {
  href: '/profile/create',
  label: 'Set up profile',
  icon: 'AccountIcon',
  // Permission is ignored while the profile is incomplete — the item is
  // injected explicitly so every role can finish onboarding.
  permission: 'dashboard.workspace.read',
};

export function AppShell({
  user,
  school,
  permissions,
  profileCompleted = true,
  unverifiedEmail,
  children,
}: AppShellProps) {
  const baseItems = visibleNavItems(permissions);
  const items = profileCompleted ? baseItems : [PROFILE_SETUP_ITEM, ...baseItems];
  const pathname = usePathname();

  const [drawerOpen, setDrawerOpen] = useState(false);

  useEffect(() => {
    setDrawerOpen(false);
  }, [pathname]);

  return (
    <TooltipProvider delayDuration={300}>
      <div className="flex h-dvh overflow-hidden bg-background">
        <Sidebar
          className="hidden md:flex"
          items={items}
          school={school}
          user={user}
          profileCompleted={profileCompleted}
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
              user={user}
              profileCompleted={profileCompleted}
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
            profileCompleted={profileCompleted}
            onOpenMenu={() => {
              setDrawerOpen(true);
            }}
          />

          <main className="min-w-0 flex-1 overflow-y-auto">
            <div className="mx-auto w-full max-w-7xl space-y-6 p-4 pb-24 md:p-6 md:pb-6">
              {unverifiedEmail === undefined ? null : <VerifyEmailBanner email={unverifiedEmail} />}
              {children}
            </div>
          </main>

          <nav
            aria-label="Main"
            className="flex shrink-0 items-center justify-around border-t border-border bg-surface pb-[env(safe-area-inset-bottom)] md:hidden"
          >
            {items.slice(0, 5).map((item) => (
              <NavLink
                key={item.href}
                item={firstLeaf(item)}
                compact
                disabled={!profileCompleted && item.href !== PROFILE_SETUP_ITEM.href}
              />
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
  profileCompleted,
  onOpenMenu,
}: {
  schoolName: string;
  user: { name: string; email?: string; roleLabel: string };
  permissions: readonly string[];
  profileCompleted: boolean;
  onOpenMenu: () => void;
}) {
  const tenantHref = useTenantHref();
  const toast = useToast();

  return (
    <header className="flex h-14 shrink-0 items-center gap-3 border-b border-border bg-surface px-3 md:px-4">
      <button
        type="button"
        aria-label="Open menu"
        onClick={onOpenMenu}
        className="-ms-1 inline-flex size-9 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none md:hidden"
      >
        <MenuIcon className={ICON_SIZE.nav} aria-hidden="true" />
      </button>

      <span className="truncate text-sm font-semibold md:hidden">{schoolName}</span>

      <AppSearch permissions={permissions}>
        {(openSearch) => (
          <button
            type="button"
            onClick={openSearch}
            disabled={!profileCompleted}
            className="hidden h-9 w-full max-w-sm items-center gap-2 rounded-lg border border-border bg-background px-3 text-sm text-muted-foreground transition-colors hover:border-input hover:bg-muted/50 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none disabled:pointer-events-none disabled:opacity-50 md:flex"
          >
            <SearchIcon className="size-4 shrink-0" aria-hidden="true" />
            <span>Search pages, students…</span>
            <kbd className="ms-auto rounded border border-border bg-muted px-1.5 font-mono text-xs text-muted-foreground">
              ⌘K
            </kbd>
          </button>
        )}
      </AppSearch>

      <div className="ms-auto flex items-center gap-0.5">
        <ThemeToggle />

        <Hint label="Messages">
          <button
            type="button"
            aria-label="Messages"
            onClick={() => {
              toast.warning('Messages', 'Coming soon.');
            }}
            className="inline-flex size-9 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          >
            <MessagesIcon className="size-4" aria-hidden="true" />
          </button>
        </Hint>

        <Hint label="Notifications">
          <button
            type="button"
            aria-label="Notifications"
            onClick={() => {
              toast.warning('Notifications', 'Coming soon.');
            }}
            className="inline-flex size-9 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          >
            <NotificationsIcon className="size-4" aria-hidden="true" />
          </button>
        </Hint>

        <Hint label="Settings">
          {profileCompleted ? (
            <Link
              href={tenantHref('/settings')}
              aria-label="Settings"
              className="inline-flex size-9 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
            >
              <SettingsIcon className="size-4" aria-hidden="true" />
            </Link>
          ) : (
            <button
              type="button"
              aria-label="Settings"
              disabled
              className="inline-flex size-9 items-center justify-center rounded-md text-muted-foreground opacity-50"
            >
              <SettingsIcon className="size-4" aria-hidden="true" />
            </button>
          )}
        </Hint>

        <ProfileMenu user={user} profileCompleted={profileCompleted} />
      </div>
    </header>
  );
}

function ProfileMenu({
  user,
  profileCompleted,
}: {
  user: { name: string; email?: string };
  profileCompleted: boolean;
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
            className="ms-1 inline-flex size-9 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary transition-colors hover:bg-primary/15 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          >
            {initials(user.name)}
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuLabel className="font-normal">
            <span className="block truncate text-sm font-medium text-foreground">{user.name}</span>
            {user.email === undefined || user.email === '' ? null : (
              <span className="block truncate text-xs text-muted-foreground">{user.email}</span>
            )}
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          {profileCompleted ? (
            <>
              <DropdownMenuItem asChild>
                <Link href={tenantHref('/profile')} className="cursor-pointer">
                  <ViewIcon className="size-4" aria-hidden="true" />
                  View Profile
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link href={tenantHref('/profile/edit')} className="cursor-pointer">
                  <EditIcon className="size-4" aria-hidden="true" />
                  Edit Profile
                </Link>
              </DropdownMenuItem>
            </>
          ) : (
            <DropdownMenuItem asChild>
              <Link href={tenantHref('/profile/create')} className="cursor-pointer">
                <EditIcon className="size-4" aria-hidden="true" />
                Set up profile
              </Link>
            </DropdownMenuItem>
          )}
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onSelect={() => {
              setAskingSignOut(true);
            }}
          >
            <SignOutIcon className="size-4" aria-hidden="true" />
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
  user,
  profileCompleted,
  className,
  onClose,
}: {
  items: readonly NavItem[];
  school: { name: string };
  user: { name: string; email?: string; roleLabel: string };
  profileCompleted: boolean;
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

      <nav aria-label="Main" className="flex-1 space-y-0.5 overflow-y-auto p-2">
        {items.map((item) => (
          <NavBranch
            key={item.href}
            item={item}
            disabled={!profileCompleted && item.href !== PROFILE_SETUP_ITEM.href}
          />
        ))}
      </nav>

      <AccountBlock user={user} />
    </aside>
  );
}

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

function SignOutButton({ compact = false }: { compact?: boolean }) {
  const [asking, setAsking] = useState(false);

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

      <SignOutConfirm open={asking} onOpenChange={setAsking} />
    </>
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
      title="Sign out?"
      description="Anything you have typed and not saved will be lost."
      confirmLabel="Sign out"
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

function roleLabel(raw: string): string {
  return raw
    .split(',')
    .map((role) => role.trim())
    .filter(Boolean)
    .map((role) => role.charAt(0) + role.slice(1).toLowerCase().replace('_', ' '))
    .join(' · ');
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
          'group relative flex cursor-not-allowed items-center gap-3 rounded-lg text-sm font-medium text-muted-foreground/50',
          compact ? 'min-h-12 flex-1 flex-col justify-center gap-1 py-2 text-xs' : 'px-3 py-2',
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
        'group relative flex items-center gap-3 rounded-lg text-sm font-medium transition-colors duration-150',
        compact ? 'min-h-12 flex-1 flex-col justify-center gap-1 py-2 text-xs' : 'px-3 py-2',
        isActive
          ? 'bg-primary/10 text-primary'
          : 'text-muted-foreground hover:bg-muted hover:text-foreground',
      )}
    >
      {isActive && !compact ? (
        <span
          aria-hidden="true"
          className="absolute inset-y-1.5 start-0 w-0.5 rounded-full bg-primary"
        />
      ) : null}
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
          'flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors duration-150',
          disabled
            ? 'cursor-not-allowed text-muted-foreground/50'
            : containsCurrent
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

      {isOpen && !disabled ? (
        <div
          className={cn(
            'mt-0.5 space-y-0.5 border-s border-border',
            depth === 0 ? 'ms-5 ps-2' : 'ms-3 ps-2',
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
  return pathname === href || pathname.startsWith(`${href}/`);
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
