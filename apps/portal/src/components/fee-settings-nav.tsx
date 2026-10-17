'use client';

import { cn } from '@ilm/ui';
import { DesignationIcon, FeesIcon, ICON_SIZE, OverdueIcon, PrintIcon, SettingsIcon } from '@ilm/ui/icons';
import Link from 'next/link';
import { useEffect, useState, type ComponentType } from 'react';

import { useCanonicalPathname, useTenantHref } from '@/lib/use-tenant-href';

type FeeSettingsItem = {
  readonly href: string;
  readonly label: string;
  readonly icon: ComponentType<{ className?: string }>;
  readonly permission: string;
};

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
    href: '/settings/fees/other',
    label: 'Other Fee Settings',
    icon: SettingsIcon,
    permission: 'dashboard.workspace.read',
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

  return (
    <nav
      aria-label="Fee settings"
      className="border-b border-border pb-3 lg:sticky lg:top-0 lg:h-[calc(100dvh-4rem)] lg:w-56 lg:shrink-0 lg:overflow-hidden lg:border-e lg:border-b-0 lg:bg-card lg:px-3 lg:py-4"
    >
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
                className={cn(
                  'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
                  active
                    ? 'bg-primary/10 font-semibold text-primary'
                    : 'font-medium text-muted-foreground hover:bg-muted hover:text-foreground',
                )}
              >
                <Icon
                  className={cn(ICON_SIZE.nav, 'shrink-0', active ? undefined : 'opacity-80')}
                  aria-hidden="true"
                />
                <span className="whitespace-nowrap">{item.label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
