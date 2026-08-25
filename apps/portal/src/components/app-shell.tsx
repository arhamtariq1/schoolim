'use client';

import { cn } from '@ilm/ui';
import * as Icons from '@ilm/ui/icons';
import { BRAND } from '@ilm/utils';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';

import { visibleNavItems, type NavItem } from '@/lib/navigation';

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
 */

const ICONS = Icons as unknown as Record<string, (props: { className?: string }) => ReactNode>;

export interface AppShellProps {
  user: { name: string; roleLabel: string };
  school: { name: string };
  permissions: readonly string[];
  children: ReactNode;
}

export function AppShell({ user, school, permissions, children }: AppShellProps) {
  const items = visibleNavItems(permissions);

  return (
    <div className="flex min-h-dvh">
      {/* Hidden below md; the mobile pattern is a bottom bar, not a squeezed
          sidebar — a teacher marking attendance on a phone needs the screen. */}
      <aside className="hidden w-60 shrink-0 border-e border-border bg-card md:flex md:flex-col">
        <div className="flex h-14 items-center gap-2 border-b border-border px-4">
          <span className="truncate text-sm font-semibold">{school.name}</span>
        </div>

        <nav aria-label="Main" className="flex-1 space-y-0.5 p-2">
          {items.map((item) => (
            <NavLink key={item.href} item={item} />
          ))}
        </nav>

        <div className="border-t border-border p-3">
          <p className="truncate text-sm font-medium">{user.name}</p>
          <p className="truncate text-xs text-muted-foreground">{user.roleLabel}</p>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 items-center justify-between gap-4 border-b border-border px-4">
          <span className="text-sm font-medium md:hidden">{school.name}</span>
          {/* ⌘K replaces the twenty-item menu (docs/00 §6). Wired in Phase 1,
              when there are students and vouchers worth searching. */}
          <button
            type="button"
            disabled
            className="hidden h-9 w-72 items-center gap-2 rounded-md border border-border px-3 text-sm text-muted-foreground md:flex"
          >
            <Icons.SearchIcon className="size-4" aria-hidden="true" />
            Search
            <kbd className="ms-auto font-mono text-xs">⌘K</kbd>
          </button>
          <span className="text-xs text-muted-foreground">{BRAND.name}</span>
        </header>

        <main className="min-w-0 flex-1 p-4 md:p-6">{children}</main>

        {/* The mobile counterpart to the sidebar. */}
        <nav
          aria-label="Main"
          className="flex items-center justify-around border-t border-border bg-card md:hidden"
        >
          {items.slice(0, 5).map((item) => (
            <NavLink key={item.href} item={item} compact />
          ))}
        </nav>
      </div>
    </div>
  );
}

function NavLink({ item, compact = false }: { item: NavItem; compact?: boolean }) {
  const pathname = usePathname();
  const isActive = item.href === '/' ? pathname === '/' : pathname.startsWith(item.href);
  const Icon = ICONS[item.icon];

  return (
    <Link
      href={item.href}
      // Announced to assistive technology, not inferred from styling alone.
      aria-current={isActive ? 'page' : undefined}
      className={cn(
        'flex items-center gap-3 rounded-md text-sm font-medium transition-colors',
        // 44px minimum touch target on the mobile bar (docs/16 §5).
        compact ? 'min-h-11 flex-1 flex-col justify-center gap-1 py-2 text-xs' : 'px-3 py-2',
        isActive ? 'bg-muted text-foreground' : 'text-muted-foreground hover:bg-muted',
      )}
    >
      {Icon === undefined ? null : <Icon className={compact ? 'size-5' : 'size-5'} />}
      {item.label}
    </Link>
  );
}
