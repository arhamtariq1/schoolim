'use client';


import type { StudentListItem } from '@ilm/contracts';
import { Card, CardContent, CardHeader, CardTitle } from '@ilm/ui';
import { calendarDate, daysBetween } from '@ilm/utils';
import type { Route } from 'next';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

import { StudentAdmissionAvatar } from '@/components/dashboard/student-admission-avatar';
import { useTenantHref } from '@/lib/use-tenant-href';

type DashboardAdmissionsListProps = {
  rows: StudentListItem[];
  listHref: string;
  /** The school's today, so "3 days ago" is counted in its own calendar. */
  todayDate: string;
};

export function DashboardAdmissionsList({
  rows,
  listHref,
  todayDate,
}: DashboardAdmissionsListProps) {
  const router = useRouter();
  const tenantHref = useTenantHref();

  return (
    <Card className="flex h-full w-full flex-col rounded-2xl shadow-raised">
      <CardHeader className="flex flex-row items-center justify-between gap-2 border-0 px-4 pb-0 pt-4 sm:px-6">
        <CardTitle>Recent admissions</CardTitle>
        <Link href={listHref} className="text-xs font-medium text-primary hover:underline">
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
                      {relativeAdmitted(row.admittedOn, todayDate)}
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

/**
 * "3 days ago", counted in the school's own calendar.
 *
 * `todayDate` comes from the snapshot, which resolved it in the school's
 * timezone. Reading the browser's clock instead would tell a parent in another
 * country that a child was admitted tomorrow — and for a Karachi school opened
 * between midnight and 5am, the server's UTC date is yesterday's.
 */
function relativeAdmitted(iso: string | null, todayDate: string): string {
  if (iso === null) {
    return '—';
  }
  const days = daysBetween(calendarDate(iso), calendarDate(todayDate));
  if (days <= 0) {
    return 'Today';
  }
  if (days === 1) {
    return '1 day ago';
  }
  if (days < 7) {
    return `${days} days ago`;
  }
  // Formatted from the calendar date itself, not from a `Date` — parsing an
  // ISO day into an instant just to print it back is how "1 Oct" becomes
  // "30 Sep" for anyone west of the school.
  const [, month, day] = iso.split('-');
  return `${String(Number(day))} ${MONTHS[Number(month) - 1] ?? ''}`.trim();
}

const MONTHS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
] as const;
