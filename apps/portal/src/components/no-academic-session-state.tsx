'use client';

import { EmptyState } from '@ilm/ui';
import Link from 'next/link';

import { useTenantHref } from '@/lib/use-tenant-href';


/** Shown instead of an error when the school has not set a current academic session. */
export function NoAcademicSessionState() {
  const tenantHref = useTenantHref();
  return (
    <EmptyState
      title="No academic session available"
      description="Attendance is recorded against the current academic session. Set one under Academics to get started."
      action={
        <Link
          href={tenantHref('/academics/sessions')}
          className="inline-flex h-9 items-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90"
        >
          Go to academic sessions
        </Link>
      }
    />
  );
}
