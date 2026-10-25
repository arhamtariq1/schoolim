'use client';

import { ChevronRightIcon, DashboardIcon, ICON_SIZE } from '@ilm/ui/icons';
import Link from 'next/link';
import type { ReactNode } from 'react';

import { useTenantHref } from '@/lib/use-tenant-href';

export interface WorkspaceBreadcrumbItem {
  readonly label: string;
  readonly href?: string;
}

export function WorkspaceBreadcrumbs({ items }: { items: readonly WorkspaceBreadcrumbItem[] }) {
  const tenantHref = useTenantHref();

  return (
    <nav aria-label="Breadcrumb" className="text-sm text-muted-foreground">
      <ol className="flex flex-wrap items-center gap-1">
        <li className="flex items-center gap-1">
          <Link
            href={tenantHref('/')}
            className="inline-flex items-center gap-1 rounded-sm hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          >
            <DashboardIcon className={ICON_SIZE.inline} aria-hidden="true" />
            <span className="sr-only">Home</span>
          </Link>
        </li>
        {items.map((item, index) => (
          <li key={`${item.label}-${String(index)}`} className="flex items-center gap-1">
            <ChevronRightIcon className="size-3.5 shrink-0 opacity-60" aria-hidden="true" />
            <Crumb item={item} tenantHref={tenantHref} isLast={index === items.length - 1} />
          </li>
        ))}
      </ol>
    </nav>
  );
}

function Crumb({
  item,
  tenantHref,
  isLast,
}: {
  item: WorkspaceBreadcrumbItem;
  tenantHref: (path: string) => string;
  isLast: boolean;
}): ReactNode {
  if (isLast || item.href === undefined) {
    return <span className="font-medium text-foreground">{item.label}</span>;
  }
  return (
    <Link
      href={tenantHref(item.href)}
      className="rounded-sm hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
    >
      {item.label}
    </Link>
  );
}
