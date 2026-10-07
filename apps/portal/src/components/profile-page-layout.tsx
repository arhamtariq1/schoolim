import { ChevronRightIcon } from '@ilm/ui/icons';
import Link from 'next/link';
import type { ReactNode } from 'react';

type ProfilePageLayoutProps = {
  title: string;
  description: string;
  children: ReactNode;
  breadcrumbsHomeHref?: string;
};

export function ProfilePageLayout({
  title,
  description,
  children,
  breadcrumbsHomeHref = '/',
}: ProfilePageLayoutProps) {
  return (
    <div className="w-full space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight text-foreground md:text-3xl">{title}</h1>
          <p className="max-w-2xl text-sm text-muted-foreground md:text-base">{description}</p>
        </div>
        <nav aria-label="Breadcrumb" className="flex shrink-0 items-center gap-1 text-sm text-muted-foreground">
          <Link href={breadcrumbsHomeHref} className="transition-colors hover:text-foreground">
            Home
          </Link>
          <ChevronRightIcon className="size-3.5 opacity-60" aria-hidden="true" />
          <span className="font-medium text-foreground">Profile</span>
        </nav>
      </div>
      {children}
    </div>
  );
}
