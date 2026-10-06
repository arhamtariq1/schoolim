'use client';

import type { StudentListItem } from '@ilm/contracts';
import { Card, CardContent, CardHeader, CardTitle } from '@ilm/ui';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { Route } from 'next';

import { StudentAdmissionAvatar } from '@/components/dashboard/student-admission-avatar';
import { useTenantHref } from '@/lib/use-tenant-href';

type DashboardAdmissionsListProps = {
  rows: StudentListItem[];
  listHref: string;
};

export function DashboardAdmissionsList({ rows, listHref }: DashboardAdmissionsListProps) {
  const router = useRouter();
  const tenantHref = useTenantHref();

  return (
    <Card className="flex h-full w-full flex-col rounded-2xl shadow-raised">
      <CardHeader className="flex flex-row items-center justify-between gap-2 border-0 px-4 pb-0 pt-4 sm:px-6">
        <CardTitle>Recent admissions</CardTitle>
        <Link href={listHref as Route} className="text-xs font-medium text-primary hover:underline">
          View all
        </Link>
      </CardHeader>
      <CardContent className="flex min-h-0 flex-1 flex-col px-4 pb-4 pt-3 sm:px-6">
        {rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">No admissions yet.</p>
        ) : (
          <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border">
            {rows.slice(0, 4).map((row) => {
              const name = `${row.firstName} ${row.lastName}`.trim();
              return (
                <li key={row.id}>
                  <button
                    type="button"
                    onClick={() => {
                      router.push(tenantHref(`/students/${row.id}` as Route));
                    }}
                    className="flex w-full items-center gap-3 px-3 py-2.5 text-start transition-colors hover:bg-muted/40"
                  >
                    <StudentAdmissionAvatar
                      firstName={row.firstName}
                      lastName={row.lastName}
                      photoUrl={row.photoUrl}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-foreground">{name}</span>
                      <span className="block truncate text-xs text-muted-foreground">
                        {row.className ?? 'Not enrolled'}
                      </span>
                    </span>
                    <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                      {relativeAdmitted(row.admittedOn)}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

function relativeAdmitted(iso: string | null): string {
  if (iso === null) {
    return '—';
  }
  const admitted = new Date(`${iso}T12:00:00Z`);
  const now = new Date();
  const days = Math.floor((now.getTime() - admitted.getTime()) / 86_400_000);
  if (days <= 0) {
    return 'Today';
  }
  if (days === 1) {
    return '1 day ago';
  }
  if (days < 7) {
    return `${days} days ago`;
  }
  return admitted.toLocaleDateString('en-PK', { day: 'numeric', month: 'short' });
}
