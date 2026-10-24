'use client';

import {
  SCHOOL_STATUSES,
  TRIAL_WARNING_DAYS,
  type PlatformOverview,
  type SchoolListItem,
} from '@ilm/contracts';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  DataTable,
  DateDisplay,
  type Column,
} from '@ilm/ui';
import Link from 'next/link';

import { SchoolStatusBadge, STATUS_LABEL } from '@/components/school-status';

const numberFormat = new Intl.NumberFormat('en-PK');

function SchoolCell({ row }: { row: SchoolListItem }) {
  return (
    <div>
      <div className="font-medium text-balance">{row.name}</div>
      <div className="font-mono text-xs text-muted-foreground">{row.slug}</div>
    </div>
  );
}

const TRIAL_COLUMNS: Column<SchoolListItem>[] = [
  { key: 'name', header: 'School', render: (row) => <SchoolCell row={row} /> },
  {
    key: 'trialEndsAt',
    header: 'Trial ends',
    render: (row) =>
      row.trialEndsAt === null ? (
        <span className="text-muted-foreground">—</span>
      ) : (
        <DateDisplay value={row.trialEndsAt} />
      ),
  },
  {
    key: 'students',
    header: 'Students',
    align: 'end',
    render: (row) => <span className="font-mono text-xs tabular-nums">{row.studentCount}</span>,
  },
];

const RECENT_COLUMNS: Column<SchoolListItem>[] = [
  { key: 'name', header: 'School', render: (row) => <SchoolCell row={row} /> },
  { key: 'status', header: 'Status', render: (row) => <SchoolStatusBadge status={row.status} /> },
  {
    key: 'createdAt',
    header: 'Added',
    hideOnMobile: true,
    render: (row) => <DateDisplay value={row.createdAt} />,
  },
];

function Stat({ label, value, status }: { label: string; value: number; status?: string }) {
  const body = (
    <Card className="h-full p-4">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums">{numberFormat.format(value)}</p>
    </Card>
  );

  // A status tile is a link to the list already filtered by it.
  return status === undefined ? (
    body
  ) : (
    <Link
      href={{ pathname: '/schools', query: { status } }}
      className="rounded-xl focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
    >
      {body}
    </Link>
  );
}

export function OverviewView({ overview }: { overview: PlatformOverview }) {
  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-xl font-semibold">Overview</h1>
        <p className="text-sm text-muted-foreground">
          {numberFormat.format(overview.totalSchools)}{' '}
          {overview.totalSchools === 1 ? 'school' : 'schools'} on the platform
        </p>
      </header>

      <section
        aria-label="Schools by status"
        className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5"
      >
        {SCHOOL_STATUSES.map((status) => (
          <Stat
            key={status}
            label={STATUS_LABEL[status]}
            value={overview.schoolsByStatus[status]}
            status={status}
          />
        ))}
      </section>

      <section aria-label="Platform scale" className="grid grid-cols-2 gap-3 md:max-w-md">
        <Stat label="Students" value={overview.totalStudents} />
        <Stat label="Staff" value={overview.totalStaff} />
      </section>

      <div className="grid gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Trials ending within {TRIAL_WARNING_DAYS} days</CardTitle>
          </CardHeader>
          <CardContent>
            <DataTable
              rows={overview.trialsEndingSoon}
              columns={TRIAL_COLUMNS}
              rowKey={(row) => row.id}
              caption="Trials ending soon"
              empty={{
                title: 'No trials ending soon',
                description: 'Nothing needs chasing this week.',
              }}
            />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Recent signups</CardTitle>
          </CardHeader>
          <CardContent>
            <DataTable
              rows={overview.recentSignups}
              columns={RECENT_COLUMNS}
              rowKey={(row) => row.id}
              caption="Recent signups"
              empty={{
                title: 'No schools yet',
                description: 'Schools appear here as they sign up or are added.',
              }}
            />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
