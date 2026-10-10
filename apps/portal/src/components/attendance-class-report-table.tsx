'use client';

import { type ClassAttendanceCard, type ClassOverview } from '@ilm/contracts';
import {
  Button,
  CardTable,
  cn,
  SimpleSelect,
  StatusBadge,
  TwoLineCell,
  type CardTableColumn,
  type CardTableSortDirection,
} from '@ilm/ui';
import {
  ClassIcon,
  ForwardIcon,
  StudentsIcon,
  SuccessIcon,
} from '@ilm/ui/icons';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMemo, useState, type ReactNode } from 'react';

import { ListPageToolbar } from '@/components/list-page-toolbar';
import { WorkspacePageHeader } from '@/components/workspace-page-header';
import { classDisplayMeta, compareClassesByProgression } from '@/lib/class-level-display';
import { useTenantHref } from '@/lib/use-tenant-href';

type ReportClassRow = ClassAttendanceCard & { index: number };

type ClassSortKey = 'class' | 'students' | 'attendance';

export type AttendanceClassReportTableProps = {
  overview: ClassOverview;
  hrefPrefix: string;
  title: string;
  description: string;
  error?: string | undefined;
};

export function AttendanceClassReportTable({
  overview,
  hrefPrefix,
  title,
  description,
  error,
}: AttendanceClassReportTableProps) {
  const router = useRouter();
  const tenantHref = useTenantHref();
  const [searchQuery, setSearchQuery] = useState('');
  const [sortKey, setSortKey] = useState<ClassSortKey>('class');
  const [sortDir, setSortDir] = useState<CardTableSortDirection>('asc');

  const rows = useMemo((): ReportClassRow[] => {
    const query = searchQuery.trim().toLowerCase();
    let list = overview.classes.filter((entry) => {
      if (query === '') {
        return true;
      }
      const meta = classDisplayMeta(entry.className, entry.numericOrder);
      const haystack = `${entry.className} ${meta.levelLabel} ${meta.iconCode}`.toLowerCase();
      return haystack.includes(query);
    });

    list = [...list].sort((left, right) => {
      let cmp = 0;
      switch (sortKey) {
        case 'class':
          cmp = compareClassesByProgression(
            { name: left.className, numericOrder: left.numericOrder },
            { name: right.className, numericOrder: right.numericOrder },
          );
          break;
        case 'students':
          cmp = left.strength - right.strength;
          break;
        case 'attendance':
          cmp = attendancePercent(left) - attendancePercent(right);
          break;
        default:
          cmp = 0;
      }
      return sortDir === 'asc' ? cmp : -cmp;
    });

    return list.map((entry, index) => ({ ...entry, index: index + 1 }));
  }, [overview.classes, searchQuery, sortKey, sortDir]);

  const isFiltered = searchQuery.trim() !== '';

  const columns = useMemo((): CardTableColumn<ReportClassRow>[] => {
    return [
      {
        key: 'index',
        label: '#',
        width: 'w-[4%]',
        align: 'end',
        render: (row) => (
          <span className="font-mono text-sm text-muted-foreground tabular-nums">{row.index}</span>
        ),
      },
      {
        key: 'class',
        label: 'Class',
        icon: ClassIcon,
        width: 'w-[16%]',
        sortable: true,
        render: (row) => {
          const meta = classDisplayMeta(row.className, row.numericOrder);
          return (
            <div className="flex min-w-0 items-center gap-3">
              <span
                className={cn(
                  'flex size-9 shrink-0 items-center justify-center rounded-lg text-xs font-semibold',
                  meta.iconToneClass,
                )}
              >
                {meta.iconCode}
              </span>
              <span className="truncate font-medium text-foreground">{row.className}</span>
            </div>
          );
        },
      },
      {
        key: 'students',
        label: 'Students',
        icon: StudentsIcon,
        align: 'end',
        width: 'w-[9%]',
        sortable: true,
        render: (row) => (
          <span className="font-mono tabular-nums text-foreground">{row.strength}</span>
        ),
      },
      {
        key: 'present',
        label: 'Present',
        align: 'end',
        width: 'w-[9%]',
        hideOnMobile: true,
        render: (row) => (
          <StatCount tone="success" value={row.markedAt === null ? null : row.present} />
        ),
      },
      {
        key: 'absent',
        label: 'Absent',
        align: 'end',
        width: 'w-[9%]',
        hideOnMobile: true,
        render: (row) => (
          <StatCount tone="danger" value={row.markedAt === null ? null : row.absent} />
        ),
      },
      {
        key: 'late',
        label: 'Late',
        align: 'end',
        width: 'w-[8%]',
        hideOnMobile: true,
        render: (row) => (
          <StatCount tone="warning" value={row.markedAt === null ? null : row.late} />
        ),
      },
      {
        key: 'attendance',
        label: 'Attendance %',
        width: 'w-[16%]',
        sortable: true,
        hideOnMobile: true,
        render: (row) => <AttendancePercentBar percent={attendancePercent(row)} />,
      },
      {
        key: 'lastMarked',
        label: 'Last marked',
        width: 'w-[12%]',
        hideOnMobile: true,
        render: (row) =>
          row.markedAt === null ? (
            <span className="text-muted-foreground">—</span>
          ) : (
            <span className="text-sm text-foreground">{formatMarkedDate(row.markedAt)}</span>
          ),
      },
      {
        key: 'status',
        label: 'Status',
        width: 'w-[11%]',
        render: (row) => {
          if (row.strength === 0) {
            return (
              <StatusBadge tone="neutral" size="sm">
                Empty
              </StatusBadge>
            );
          }
          return row.markedAt !== null ? (
            <StatusBadge tone="success" size="sm">
              <SuccessIcon className="size-3.5" aria-hidden="true" />
              Marked
            </StatusBadge>
          ) : (
            <StatusBadge tone="warning" size="sm">
              Not marked
            </StatusBadge>
          );
        },
      },
      {
        key: 'action',
        label: 'Action',
        align: 'end',
        width: 'w-[14%]',
        render: (row) => {
          const href = tenantHref(`${hrefPrefix}/${row.classLevelId}`);
          if (row.strength === 0) {
            return <span className="text-xs text-muted-foreground">—</span>;
          }
          return (
            <Button asChild tone="primary" size="sm" data-stop-row-click>
              <Link href={href}>
                View report
                <ForwardIcon className="size-4" aria-hidden="true" />
              </Link>
            </Button>
          );
        },
      },
    ];
  }, [hrefPrefix, tenantHref]);

  function toggleSort(key: string): void {
    if (sortKey === key) {
      setSortDir((current) => (current === 'asc' ? 'desc' : 'asc'));
      return;
    }
    setSortKey(key as ClassSortKey);
    setSortDir('asc');
  }

  return (
    <div className="w-full space-y-6">
      <WorkspacePageHeader title={title} description={description} />

      {error === undefined ? null : (
        <div
          role="alert"
          className="rounded-md border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-danger"
        >
          {error}
        </div>
      )}

      <ListPageToolbar
        searchQuery={searchQuery}
        onSearchQueryChange={setSearchQuery}
        searchPlaceholder="Search class…"
        searchAriaLabel="Search classes"
        filters={
          <SimpleSelect
            className="w-full sm:w-48"
            ariaLabel="Sort classes"
            value={`${sortKey}:${sortDir}`}
            onValueChange={(value) => {
              const [key, dir] = value.split(':') as [ClassSortKey, CardTableSortDirection];
              setSortKey(key);
              setSortDir(dir);
            }}
            options={[
              { value: 'class:asc', label: 'Class order (Playgroup → …)' },
              { value: 'class:desc', label: 'Class order (reverse)' },
              { value: 'students:desc', label: 'Most students' },
              { value: 'attendance:desc', label: 'Highest attendance' },
            ]}
          />
        }
      />

      <CardTable
        title="Classes"
        description="Click on a class to view detailed attendance report."
        caption="Classes for attendance report"
        rows={rows}
        columns={columns}
        rowKey={(row) => row.classLevelId}
        minWidthClass="min-w-[64rem]"
        isFiltered={isFiltered}
        onClearFilters={() => {
          setSearchQuery('');
        }}
        sort={{
          key: sortKey,
          direction: sortDir,
          onToggle: toggleSort,
        }}
        empty={{
          title: overview.classes.length === 0 ? 'No classes yet' : 'No classes match',
          description:
            overview.classes.length === 0
              ? 'Add classes under Academics before viewing attendance reports.'
              : 'Try a different search or clear the filters.',
        }}
        renderMobileRow={(row) => {
          const meta = classDisplayMeta(row.className, row.numericOrder);
          const pct = attendancePercent(row);
          return (
            <div className="flex items-center justify-between gap-3 px-4 py-3">
              <TwoLineCell
                primary={row.className}
                secondary={`${meta.levelLabel} · ${String(row.strength)} students`}
              />
              <div className="text-end">
                {pct < 0 ? (
                  <StatusBadge tone="warning" size="sm">
                    Not marked
                  </StatusBadge>
                ) : (
                  <span className="font-mono text-sm tabular-nums">{pct}%</span>
                )}
              </div>
            </div>
          );
        }}
        onRowClick={(row) => {
          if (row.strength === 0) {
            return;
          }
          router.push(tenantHref(`${hrefPrefix}/${row.classLevelId}`));
        }}
      />
    </div>
  );
}

function attendancePercent(row: ClassAttendanceCard): number {
  if (row.markedAt === null || row.strength === 0) {
    return -1;
  }
  const attended = row.present + row.late;
  return Math.round((attended / row.strength) * 100);
}

function formatMarkedDate(iso: string): string {
  const date = new Date(iso);
  return date.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

function StatCount({
  tone,
  value,
}: {
  tone: 'success' | 'danger' | 'warning';
  value: number | null;
}) {
  if (value === null) {
    return <span className="text-muted-foreground">—</span>;
  }
  const dot =
    tone === 'success' ? 'bg-success' : tone === 'danger' ? 'bg-danger' : 'bg-warning';
  return (
    <span className="inline-flex w-full items-center justify-end gap-1.5 font-mono tabular-nums text-foreground">
      <span className={cn('size-2 shrink-0 rounded-full', dot)} aria-hidden="true" />
      {value}
    </span>
  );
}

function AttendancePercentBar({ percent }: { percent: number }): ReactNode {
  if (percent < 0) {
    return <span className="text-muted-foreground">—</span>;
  }
  return (
    <div className="flex min-w-32 items-center gap-2">
      <span className="w-10 shrink-0 font-mono text-sm tabular-nums text-foreground">
        {percent}%
      </span>
      <div
        className="h-2 min-w-16 flex-1 overflow-hidden rounded-full bg-muted"
        role="presentation"
      >
        <div
          className="h-full rounded-full bg-success transition-[width] duration-150"
          style={{ width: `${String(Math.min(100, Math.max(0, percent)))}%` }}
        />
      </div>
    </div>
  );
}
