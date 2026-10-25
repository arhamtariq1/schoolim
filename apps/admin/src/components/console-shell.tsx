'use client';

import { ROUTES, type PlatformSession } from '@ilm/contracts';
import {
  ConfirmDialog,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  TooltipProvider,
  cn,
  useToast,
} from '@ilm/ui';
import {
  AccountIcon,
  ChevronDownIcon,
  CloseIcon,
  DashboardIcon,
  ICON_SIZE,
  MenuIcon,
  SchoolIcon,
  SignOutIcon,
  TagIcon,
} from '@ilm/ui/icons';
import { BRAND } from '@ilm/utils';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useState, type ReactNode } from 'react';

import { ThemeToggle } from '@/components/theme-toggle';
import { isCurrent, visibleNavItems, type NavItem } from '@/lib/navigation';

const NAV_ICONS = { overview: DashboardIcon, schools: SchoolIcon, plans: TagIcon } as const;

const ROLE_LABEL: Record<PlatformSession['role'], string> = {
  SUPER_ADMIN: 'Super admin',
  SUPPORT: 'Support',
  BILLING: 'Billing',
};

/**
 * The console frame: sidebar, header, one scrolling `main`.
 *
 * Taken from the portal's shell so an operator moving between the two does not
 * relearn anything. The frame is `fixed` for the reason written on the portal's
 * `AppShell`: an out-of-flow box adds nothing to the document height, so the
 * page cannot grow a second scrollbar and `main` is the only thing that moves.
 */
export function ConsoleShell({
  session,
  children,
}: {
  session: PlatformSession;
  children: ReactNode;
}) {
  const items = visibleNavItems(session.capabilities);
  const [drawerOpen, setDrawerOpen] = useState(false);

  return (
    <TooltipProvider delayDuration={300}>
      <div className="fixed inset-x-0 top-0 flex h-dvh overflow-hidden bg-workspace-canvas">
        <Sidebar className="hidden md:flex" items={items} />

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
              onNavigate={() => {
                setDrawerOpen(false);
              }}
              onClose={() => {
                setDrawerOpen(false);
              }}
            />
          </div>
        ) : null}

        <div className="flex min-w-0 flex-1 flex-col">
          <Header
            session={session}
            onOpenMenu={() => {
              setDrawerOpen(true);
            }}
          />
          <main className="scrollbar-hidden min-w-0 flex-1 overflow-y-auto overscroll-y-contain bg-workspace-canvas">
            <div className="w-full space-y-4 px-3 pt-3 pb-5 md:px-4 md:pt-4">{children}</div>
          </main>
        </div>
      </div>
    </TooltipProvider>
  );
}

function Sidebar({
  items,
  className,
  onClose,
  onNavigate,
}: {
  items: readonly NavItem[];
  className?: string;
  onClose?: () => void;
  onNavigate?: () => void;
}) {
  const pathname = usePathname();

  return (
    <aside
      className={cn(
        'w-56 shrink-0 flex-col border-e border-border/50 bg-sidebar md:flex',
        className,
      )}
    >
      <div className="relative flex h-16 shrink-0 items-center border-b border-border/50 px-5">
        <Link
          href="/"
          className="rounded-md text-base font-semibold focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        >
          {BRAND.name}
          <span className="ms-2 text-xs font-medium text-muted-foreground">Console</span>
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

      <nav aria-label="Main" className="flex flex-1 flex-col gap-1 overflow-y-auto px-3 py-4">
        {items.map((item) => {
          const active = isCurrent(item.href, pathname);
          const Icon = NAV_ICONS[item.icon];
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? 'page' : undefined}
              {...(onNavigate === undefined ? {} : { onClick: onNavigate })}
              className={cn(
                'flex items-center gap-2.5 rounded-lg py-2 ps-3 pe-3 text-sm font-medium transition-colors duration-150',
                active
                  ? 'bg-primary/10 text-primary'
                  : 'text-muted-foreground hover:bg-card/70 hover:text-foreground',
              )}
            >
              <Icon className={cn('shrink-0', ICON_SIZE.nav)} aria-hidden="true" />
              <span className="truncate">{item.label}</span>
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}

function Header({ session, onOpenMenu }: { session: PlatformSession; onOpenMenu: () => void }) {
  const [askingSignOut, setAskingSignOut] = useState(false);

  return (
    <header className="flex h-16 shrink-0 items-center gap-2 border-b border-border/50 bg-sidebar px-3 md:px-4">
      <button
        type="button"
        aria-label="Open menu"
        onClick={onOpenMenu}
        className="inline-flex size-10 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none md:hidden"
      >
        <MenuIcon className={ICON_SIZE.nav} aria-hidden="true" />
      </button>

      <div className="ms-auto flex items-center gap-1">
        <ThemeToggle />
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className="flex h-10 items-center gap-2 rounded-lg px-2 text-sm hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
            >
              <span className="inline-flex size-8 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
                {initials(session.name)}
              </span>
              <span className="hidden max-w-40 truncate font-medium sm:inline">{session.name}</span>
              <ChevronDownIcon className="size-4 text-muted-foreground" aria-hidden="true" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="min-w-56">
            <DropdownMenuLabel>
              <div className="flex items-center gap-2">
                <AccountIcon className="size-4 text-muted-foreground" aria-hidden="true" />
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium">{session.name}</div>
                  <div className="truncate text-xs font-normal text-muted-foreground">
                    {ROLE_LABEL[session.role]} · {session.email}
                  </div>
                </div>
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              destructive
              onSelect={() => {
                setAskingSignOut(true);
              }}
            >
              <SignOutIcon aria-hidden="true" />
              Sign out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <SignOutConfirm open={askingSignOut} onOpenChange={setAskingSignOut} />
    </header>
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
      const response = await fetch(ROUTES.platform.auth.logout, {
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
      title="Sign out of the console?"
      description="You will need to sign in again to continue."
      confirmLabel="Sign out"
      cancelLabel="Cancel"
      tone="primary"
      onConfirm={signOut}
    />
  );
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const first = parts[0]?.[0] ?? '';
  const last = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? '') : '';
  return (first + last).toUpperCase() || '?';
}
