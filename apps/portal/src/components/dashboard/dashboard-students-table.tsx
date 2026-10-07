'use client';

import type { StudentListItem } from '@ilm/contracts';
import { Button, Card, CardContent, CardDescription, CardHeader, CardTitle, DataTable, DateDisplay, StatusBadge } from '@ilm/ui';
import type { Route } from 'next';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

import { useTenantHref } from '@/lib/use-tenant-href';

type DashboardStudentsTableProps = {
  rows: StudentListItem[];
  listHref: string;
  newHref: string;
  canCreate: boolean;
};

export function DashboardStudentsTable({
  rows,
  listHref,
  newHref,
  canCreate,
}: DashboardStudentsTableProps) {
  const router = useRouter();
  const tenantHref = useTenantHref();

  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3 border-0 pb-0">
        <div>
          <CardTitle>Recent admissions</CardTitle>
          <CardDescription>Newest students on the register — open a row for the full profile.</CardDescription>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button tone="ghost" size="sm" asChild>
            <Link href={listHref}>All students</Link>
          </Button>
          {canCreate ? (
            <Button size="sm" asChild>
              <Link href={newHref}>Add admission</Link>
            </Button>
          ) : null}
        </div>
      </CardHeader>
      <CardContent className="pt-4">
        <DataTable
          rows={rows}
          rowKey={(row) => row.id}
          columns={[
            {
              key: 'name',
              header: 'Name',
              render: (row) => (
                <span className="font-medium text-foreground">
                  {row.firstName} {row.lastName}
                </span>
              ),
            },
            {
              key: 'grNo',
              header: 'GR No.',
              hideOnMobile: true,
              render: (row) => row.grNo,
            },
            {
              key: 'class',
              header: 'Class',
              render: (row) => row.className ?? '—',
            },
            {
              key: 'status',
              header: 'Status',
              hideOnMobile: true,
              render: (row) => (
                <StatusBadge tone={row.status === 'ACTIVE' ? 'success' : 'neutral'}>
                  {row.status.replaceAll('_', ' ')}
                </StatusBadge>
              ),
            },
            {
              key: 'admitted',
              header: 'Admitted',
              align: 'end',
              hideOnMobile: true,
              render: (row) =>
                row.admittedOn === null ? '—' : <DateDisplay value={row.admittedOn} />,
            },
          ]}
          empty={{
            title: 'No students yet',
            description: 'Admissions you record will appear in this table.',
            action: canCreate ? (
              <Button size="sm" asChild>
                <Link href={newHref}>Add admission</Link>
              </Button>
            ) : undefined,
          }}
          onRowClick={(row) => {
            router.push(tenantHref(`/students/${row.id}` as Route));
          }}
        />
      </CardContent>
    </Card>
  );
}
