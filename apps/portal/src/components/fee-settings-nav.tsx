'use client';

import { cn } from '@ilm/ui';
import {
  AccessIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  DesignationIcon,
  FeesIcon,
  ICON_SIZE,
  OverdueIcon,
  PrintIcon,
} from '@ilm/ui/icons';
import Link from 'next/link';
import { useEffect, useState, type ComponentType } from 'react';

import { useCanonicalPathname, useTenantHref } from '@/lib/use-tenant-href';

type FeeSettingsItem = {
  readonly href: string;
  readonly label: string;
  readonly icon: ComponentType<{ className?: string }>;
  readonly permission: string;
};

/** Remembered per browser, like the main sidebar's own. */
const NAV_COLLAPSED_KEY = 'ilm:settings-nav-collapsed';

export const FEE_SETTINGS_ITEMS: readonly FeeSettingsItem[] = [
  {
    href: '/settings/fees',
    label: 'All Fees',
    icon: FeesIcon,
    permission: 'fees.plan.read',
  },
  {
    href: '/settings/fees/late-fee',
    label: 'Late Fee',
    icon: OverdueIcon,
    permission: 'fees.plan.read',
  },
  {
    href: '/settings/voucher',
    label: 'Voucher Settings',
    icon: PrintIcon,
    permission: 'fees.voucher.read',
  },
  {
    href: '/settings/gr-number',
    label: 'GR Number',
    icon: DesignationIcon,
    permission: 'settings.school.configure',
  },
  {
    href: '/settings/access',
    label: 'Users & Access',
    icon: AccessIcon,
    permission: 'settings.user.manage',
  },
];

/**
 * The secondary navigation inside Settings › Fee Settings.
 *
 * A vertical list beside the content from `lg`; a horizontally scrolling strip
 * above it on smaller screens, so the main sidebar and this one never compete
 * for the same narrow width.
 */
export function FeeSettingsNav({ permissions }: { readonly permissions: readonly string[] }) {
  const pathname = useCanonicalPathname();
  const tenantHref = useTenantHref();
  // The item that was just clicked, until the route catches up with it.
  const [pendingHref, setPendingHref] = useState<string | null>(null);

  useEffect(() => {
    setPendingHref(null);
  }, [pathname]);
  const held = new Set(permissions);
  const items = FEE_SETTINGS_ITEMS.filter((item) => held.has(item.permission));

  // Folded to icons, as the main sidebar folds. Read after mount so the server and the
  // first client render agree; storage can be blocked, so every access is guarded.
  const [collapsed, setCollapsed] = useState(false);
  useEffect(() => {
    try {
      setCollapsed(window.localStorage.getItem(NAV_COLLAPSED_KEY) === '1');
    } catch {
      // Blocked storage: start open.
    }
  }, []);

  function toggle(): void {
    setCollapsed((current) => {
      const next = !current;
      try {
        window.localStorage.setItem(NAV_COLLAPSED_KEY, next ? '1' : '0');
      } catch {
        // Not remembered; still works for this visit.
      }
      return next;
    });
  }

  const ToggleIcon = collapsed ? ChevronRightIcon : ChevronLeftIcon;

  return (
    <nav
      aria-label="Fee settings"
      className={cn(
        'border-b border-border pb-3 lg:sticky lg:top-0 lg:h-[calc(100dvh-4rem)] lg:shrink-0 lg:overflow-hidden lg:border-e lg:border-b-0 lg:bg-sidebar lg:px-3 lg:py-4',
        'lg:transition-[width] lg:duration-200 lg:ease-in-out motion-reduce:lg:transition-none',
        collapsed ? 'lg:w-16 lg:px-2' : 'lg:w-56',
      )}
    >
      <div className={cn('mb-2 hidden items-center lg:flex', collapsed ? 'justify-center' : 'justify-between ps-3')}>
        {collapsed ? null : <span className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">Fee settings</span>}
        <button
          type="button"
          aria-label={collapsed ? 'Expand settings menu' : 'Collapse settings menu'}
          aria-pressed={collapsed}
          title={collapsed ? 'Expand settings menu' : 'Collapse settings menu'}
          onClick={toggle}
          className="inline-flex size-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        >
          <ToggleIcon className={ICON_SIZE.nav} aria-hidden="true" />
        </button>
      </div>
      <ul className="scrollbar-hidden flex gap-1 overflow-x-auto lg:flex-col lg:overflow-visible">
        {items.map((item) => {
          const active = (pendingHref ?? pathname) === item.href;
          const Icon = item.icon;
          return (
            <li key={item.href} className="shrink-0 lg:shrink">
              <Link
                href={tenantHref(item.href)}
                aria-current={active ? 'page' : undefined}
                onClick={() => {
                  setPendingHref(item.href);
                }}
                title={collapsed ? item.label : undefined}
                className={cn(
                  'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
                  collapsed && 'lg:justify-center lg:px-0',
                  active
                    ? 'bg-primary/10 font-semibold text-primary'
                    : 'font-medium text-muted-foreground hover:bg-muted hover:text-foreground',
                )}
              >
                <Icon
                  className={cn(ICON_SIZE.nav, 'shrink-0', active ? undefined : 'opacity-80')}
                  aria-hidden="true"
                />
                <span className={cn('whitespace-nowrap', collapsed && 'lg:sr-only')}>{item.label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
