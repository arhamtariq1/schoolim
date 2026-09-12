'use client';

import { cn } from '@ilm/ui';
import {
  ClassIcon,
  ExpenseIcon,
  FeesIcon,
  HolidayIcon,
  ICON_SIZE,
  SessionIcon,
} from '@ilm/ui/icons';
import Link from 'next/link';
import type { ComponentType } from 'react';

import { useCanonicalPathname, useTenantHref } from '@/lib/use-tenant-href';

/**
 * Navigation between sibling screens in a section.
 *
 * Real links to real routes, not a client-side tab switcher: each view is
 * separately linkable, each fetches only its own data, and the browser's Back
 * button behaves. A tab component holding three payloads behind one URL is a
 * page that cannot be sent to a colleague.
 *
 * These are deliberately *not* in the sidebar. The sidebar is capped at eight
 * items and reflects what people do daily (docs/00 §6); structure is set up
 * once a year and then rarely touched.
 *
 * ## When a section outgrows this
 *
 * Tabs work for two or three sibling screens. Fees reached five and moved to
 * the sidebar as a nested section instead: past three, a row of tabs stops
 * reading as navigation and starts reading as clutter, and it competes with the
 * sidebar for the same job. Academics and Finance are two apiece, which is what
 * this is for.
 *
 * ## Why one component and not several
 *
 * There were three of these — academics, fees, finance — identical apart from
 * their arrays, and they had already drifted in their icon sizes. A copy of a
 * navigation pattern per section is a place to fix the next thing per section.
 *
 * ## Why the active tab is derived, not passed
 *
 * Every call site used to pass `active="classes"`, which is a second source of
 * truth for something the URL already knows — and one a copy-pasted page gets
 * wrong silently, highlighting the wrong tab with no error anywhere. The
 * pathname is the answer, so it is what gets asked.
 */

export interface TabLinkItem {
  readonly href: string;
  readonly label: string;
  readonly icon: ComponentType<{ className?: string }>;
}

export interface TabLinksProps {
  readonly label: string;
  readonly items: readonly TabLinkItem[];
  readonly className?: string;
}

export function TabLinks({ label, items, className }: TabLinksProps) {
  // Canonical, so the comparison below still works when the school is in the
  // path rather than the hostname.
  const pathname = useCanonicalPathname();
  const tenantHref = useTenantHref();

  return (
    <nav aria-label={label} className={cn('border-b border-border', className)}>
      <ul className="-mb-px flex gap-1 overflow-x-auto">
        {items.map((item) => {
          // Exact, not prefix. These are sibling routes and `/academics` is a
          // prefix of `/academics/sessions` — a prefix match lights up two tabs
          // at once on every nested screen.
          const isActive = pathname === item.href;

          return (
            <li key={item.href}>
              <Link
                href={tenantHref(item.href)}
                aria-current={isActive ? 'page' : undefined}
                className={cn(
                  'flex items-center gap-2 border-b-2 px-4 py-2.5 text-sm font-medium whitespace-nowrap',
                  'transition-colors duration-150',
                  'focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
                  isActive
                    ? 'border-primary text-primary'
                    : 'border-transparent text-muted-foreground hover:border-border hover:text-foreground',
                )}
              >
                <item.icon className={ICON_SIZE.inline} aria-hidden="true" />
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

const ACADEMICS: readonly TabLinkItem[] = [
  { href: '/academics', label: 'Classes', icon: ClassIcon },
  { href: '/academics/sessions', label: 'Sessions', icon: SessionIcon },
  { href: '/academics/holidays', label: 'Calendar', icon: HolidayIcon },
];

const FINANCE: readonly TabLinkItem[] = [
  { href: '/finance/expenses', label: 'Expenses', icon: ExpenseIcon },
  { href: '/finance/expense-types', label: 'Expense types', icon: FeesIcon },
];

export function AcademicsTabs() {
  return <TabLinks label="Academics" items={ACADEMICS} />;
}

export function FinanceTabs() {
  return <TabLinks label="Finance" items={FINANCE} />;
}
