'use client';

import { type SchoolListItem } from '@ilm/contracts';
import { buttonVariants, DataTable, StatusBadge, type Column } from '@ilm/ui';
import { CreateIcon } from '@ilm/ui/icons';
import Link from 'next/link';

/**
 * Every school on the platform.
 *
 * Counts, not contents. This screen says how many students a school has and
 * never who they are — an operator who needs a school's actual records has to
 * impersonate, which is consented and audited (docs/17 §5). Making the tenant
 * list browsable and the tenant data not is the whole design.
 */

const STATUS_TONE: Record<string, 'success' | 'neutral' | 'warning' | 'danger'> = {
  ACTIVE: 'success',
  TRIAL: 'neutral',
  PAST_DUE: 'warning',
  SUSPENDED: 'warning',
  CHURNED: 'danger',
};

export interface SchoolsTableProps {
  rows: SchoolListItem[];
  total: number;
  error?: string | undefined;
  appDomain: string;
  canCreate: boolean;
}

export function SchoolsTable({ rows, total, error, appDomain, canCreate }: SchoolsTableProps) {
  const columns: Column<SchoolListItem>[] = [
    {
      key: 'name',
      header: 'School',
      render: (row) => (
        <div>
          <div className="font-medium text-balance">{row.name}</div>
          <div className="font-mono text-xs text-muted-foreground">
            {row.slug}.{appDomain}
          </div>
        </div>
      ),
    },
    {
      key: 'city',
      header: 'City',
      hideOnMobile: true,
      render: (row) =>
        row.city === null ? (
          <span className="text-muted-foreground">—</span>
        ) : (
          <span>{row.city}</span>
        ),
    },
    {
      key: 'students',
      header: 'Students',
      align: 'end',
      render: (row) => <span className="font-mono text-xs tabular-nums">{row.studentCount}</span>,
    },
    {
      key: 'users',
      header: 'Staff',
      align: 'end',
      hideOnMobile: true,
      render: (row) => <span className="font-mono text-xs tabular-nums">{row.userCount}</span>,
    },
    {
      key: 'status',
      header: 'Status',
      render: (row) => (
        <StatusBadge tone={STATUS_TONE[row.status] ?? 'neutral'}>
          {row.status.toLowerCase().replace('_', ' ')}
        </StatusBadge>
      ),
    },
  ];

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Schools</h1>
          <p className="text-sm text-muted-foreground">
            {total} {total === 1 ? 'school' : 'schools'} on the platform
          </p>
        </div>
        {canCreate ? (
          // A real link, not a button with an onClick: middle-click and
          // "open in new tab" have to work on a navigation.
          <Link href="/schools/new" className={buttonVariants()}>
            <CreateIcon className="size-4" aria-hidden="true" />
            Add school
          </Link>
        ) : null}
      </header>

      <DataTable
        rows={rows}
        columns={columns}
        rowKey={(row) => row.id}
        caption="Schools"
        {...(error === undefined ? {} : { error })}
        empty={{
          title: 'No schools yet',
          description:
            'Adding a school creates its address and its first owner account in one step. It takes about a minute.',
        }}
      />
    </div>
  );
}
