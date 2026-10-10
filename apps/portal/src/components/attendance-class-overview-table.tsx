'use client';

import {
  SCHOOL_LEVEL_LABELS,
  type ClassAttendanceCard,
  type ClassOverview,
  type SchoolLevelId,
} from '@ilm/contracts';
import {
  Button,
  CardTable,
  DatePicker,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  SimpleSelect,
  StatusBadge,
  TwoLineCell,
  type CardTableColumn,
} from '@ilm/ui';
import {
  ClassIcon,
  CreateIcon,
  MoreIcon,
  SchoolIcon,
  StudentsIcon,
  SuccessIcon,
  ViewIcon,
  WarningIcon,
} from '@ilm/ui/icons';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMemo, useState, type ReactNode } from 'react';

import { closedMessage } from '@/components/attendance-class-grid';
import { ListPageToolbar } from '@/components/list-page-toolbar';
import { WorkspacePageHeader } from '@/components/workspace-page-header';
import { classDisplayMeta } from '@/lib/class-level-display';
import { useTenantHref } from '@/lib/use-tenant-href';

type AttendanceClassRow = ClassAttendanceCard & { index: number };

type LevelFilter = '' | string;
type StatusFilter = '' | 'marked' | 'not_marked';

export type AttendanceClassOverviewTableProps = {
  overview: ClassOverview;
  hrefPrefix: string;
  hrefSuffix?: string;
  actionLabel: string;
  title: string;
  description: string;
  showDatePicker?: boolean;
  basePath: string;
  error?: string | undefined;
  /** Secondary action when register exists — defaults to "View / Edit". */
  reviewLabel?: string;
  reportHrefPrefix?: string;
};

export function AttendanceClassOverviewTable({
  overview,
  hrefPrefix,
  hrefSuffix = '',
  actionLabel,
  title,
  description,
  showDatePicker = true,
  basePath,
  error,
  reviewLabel = 'View / Edit',
  reportHrefPrefix,
}: AttendanceClassOverviewTableProps) {
  const router = useRouter();
  const tenantHref = useTenantHref();

  const [searchQuery, setSearchQuery] = useState('');
  const [levelFilter, setLevelFilter] = useState<LevelFilter>('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('');

  const levelOptions = useMemo(() => {
    const ids = new Set<string>();
    for (const entry of overview.classes) {
      const meta = classDisplayMeta(entry.className, entry.numericOrder);
      if (meta.levelId !== null) {
        ids.add(meta.levelId);
      }
    }
    return [...ids].map((id) => ({
      value: id,
      label: SCHOOL_LEVEL_LABELS[id as SchoolLevelId],
    }));
  }, [overview.classes]);

  const rows = useMemo((): AttendanceClassRow[] => {
    const orderIndex = new Map(overview.classes.map((entry, index) => [entry.classLevelId, index]));
    const query = searchQuery.trim().toLowerCase();
    let list = overview.classes.filter((entry) => {
      const meta = classDisplayMeta(entry.className, entry.numericOrder);
      if (query !== '') {
        const haystack = `${entry.className} ${meta.levelLabel} ${meta.iconCode}`.toLowerCase();
        if (!haystack.includes(query)) {
          return false;
        }
      }
      if (levelFilter !== '' && meta.levelId !== levelFilter) {
        return false;
      }
      const marked = entry.markedAt !== null;
      if (statusFilter === 'marked' && !marked) {
        return false;
      }
      if (statusFilter === 'not_marked' && marked) {
        return false;
      }
      return true;
    });

    list = [...list].sort(
      (left, right) =>
        (orderIndex.get(left.classLevelId) ?? 0) - (orderIndex.get(right.classLevelId) ?? 0),
    );

    return list.map((entry, index) => ({ ...entry, index: index + 1 }));
  }, [overview.classes, searchQuery, levelFilter, statusFilter]);

  const isFiltered = searchQuery.trim() !== '' || levelFilter !== '' || statusFilter !== '';

  function clearFilters(): void {
    setSearchQuery('');
    setLevelFilter('');
    setStatusFilter('');
  }

  const columns = useMemo((): CardTableColumn<AttendanceClassRow>[] => {
    const working = overview.day.isWorkingDay;

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
        width: 'w-[18%]',
        render: (row) => {
          const meta = classDisplayMeta(row.className, row.numericOrder);
          return (
            <div className="flex min-w-0 items-center gap-3">
              <span
                className={`flex size-9 shrink-0 items-center justify-center rounded-lg text-xs font-semibold ${meta.iconToneClass}`}
              >
                {meta.iconCode}
              </span>
              <span className="truncate font-medium text-foreground">{row.className}</span>
            </div>
          );
        },
      },
      {
        key: 'level',
        label: 'Level',
        icon: SchoolIcon,
        width: 'w-[12%]',
        hideOnMobile: true,
        render: (row) => {
          const meta = classDisplayMeta(row.className, row.numericOrder);
          return <StatusBadge tone={meta.tone}>{meta.levelLabel}</StatusBadge>;
        },
      },
      {
        key: 'strength',
        label: 'Total students',
        icon: StudentsIcon,
        align: 'end',
        width: 'w-[11%]',
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
        render: (row) => countCell(row.markedAt !== null ? row.present : null),
      },
      {
        key: 'absent',
        label: 'Absent',
        align: 'end',
        width: 'w-[9%]',
        hideOnMobile: true,
        render: (row) => countCell(row.markedAt !== null ? row.absent : null),
      },
      {
        key: 'notMarked',
        label: 'Not marked',
        align: 'end',
        width: 'w-[10%]',
        hideOnMobile: true,
        render: (row) => {
          if (row.markedAt === null) {
            return countCell(row.strength);
          }
          const remaining = Math.max(
            0,
            row.strength - row.present - row.absent - row.late - row.leave,
          );
          return countCell(remaining);
        },
      },
      {
        key: 'status',
        label: 'Status',
        width: 'w-[11%]',
        render: (row) => {
          if (!working) {
            return (
              <StatusBadge tone="neutral" size="sm">
                Closed
              </StatusBadge>
            );
          }
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
        width: 'w-[16%]',
        render: (row) => {
          const marked = row.markedAt !== null;
          const href = tenantHref(`${hrefPrefix}/${row.classLevelId}${hrefSuffix}`);
          const disabled = !working || row.strength === 0;

          return (
            <div className="flex items-center justify-end gap-1" data-stop-row-click>
              {disabled ? (
                <span className="text-xs text-muted-foreground">—</span>
              ) : (
                <Button asChild tone={marked ? 'outline' : 'primary'} size="sm">
                  <Link href={href}>{marked ? reviewLabel : actionLabel}</Link>
                </Button>
              )}
              {reportHrefPrefix === undefined ? null : (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      type="button"
                      tone="ghost"
                      size="icon"
                      className="size-8 text-muted-foreground hover:text-foreground"
                      aria-label={`More actions for ${row.className}`}
                    >
                      <MoreIcon className="size-4" aria-hidden="true" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-44">
                    <DropdownMenuItem asChild>
                      <Link href={tenantHref(`${reportHrefPrefix}/${row.classLevelId}`)}>
                        <ViewIcon className="size-4" aria-hidden="true" />
                        Monthly report
                      </Link>
                    </DropdownMenuItem>
                    {!disabled ? (
                      <DropdownMenuItem asChild>
                        <Link href={href}>
                          <CreateIcon className="size-4" aria-hidden="true" />
                          {marked ? reviewLabel : actionLabel}
                        </Link>
                      </DropdownMenuItem>
                    ) : null}
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
            </div>
          );
        },
      },
    ];
  }, [
    actionLabel,
    hrefPrefix,
    hrefSuffix,
    overview.day.isWorkingDay,
    reportHrefPrefix,
    reviewLabel,
    tenantHref,
  ]);

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

      {!overview.day.isWorkingDay ? (
        <div
          role="status"
          className="flex items-start gap-2 rounded-lg border border-warning/30 bg-warning/10 px-3 py-2 text-sm"
        >
          <WarningIcon className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden="true" />
          <span>{closedMessage(overview.day)}</span>
        </div>
      ) : null}

      <ListPageToolbar
        searchQuery={searchQuery}
        onSearchQueryChange={setSearchQuery}
        searchPlaceholder="Search classes…"
        searchAriaLabel="Search classes"
        filters={
          <>
            {levelOptions.length > 0 ? (
              <SimpleSelect
                className="w-full sm:w-40"
                ariaLabel="Filter by level"
                value={levelFilter}
                emptyOption={{ value: '', label: 'All levels' }}
                placeholder="All levels"
                onValueChange={setLevelFilter}
                options={levelOptions}
              />
            ) : null}
            <SimpleSelect
              className="w-full sm:w-40"
              ariaLabel="Filter by status"
              value={statusFilter}
              emptyOption={{ value: '', label: 'All status' }}
              placeholder="All status"
              onValueChange={(value) => {
                setStatusFilter(value as StatusFilter);
              }}
              options={[
                { value: 'marked', label: 'Marked' },
                { value: 'not_marked', label: 'Not marked' },
              ]}
            />
            {showDatePicker ? (
              <div className="w-full sm:w-44">
                <DatePicker
                  value={overview.date}
                  max={overview.day.reason === 'FUTURE' ? undefined : overview.date}
                  aria-label="Attendance date"
                  onChange={(nextValue) => {
                    router.push(tenantHref(`${basePath}?date=${nextValue}`));
                  }}
                />
              </div>
            ) : null}
          </>
        }
      />

      <CardTable
        title="Class attendance overview"
        caption="Classes for attendance"
        rows={rows}
        columns={columns}
        rowKey={(row) => row.classLevelId}
        minWidthClass="min-w-[56rem]"
        isFiltered={isFiltered}
        onClearFilters={clearFilters}
        empty={{
          title: overview.classes.length === 0 ? 'No classes yet' : 'No classes match',
          description:
            overview.classes.length === 0
              ? 'Add classes under Academics before marking attendance.'
              : 'Try a different search or clear the filters.',
        }}
        renderMobileRow={(row) => {
          const meta = classDisplayMeta(row.className, row.numericOrder);
          const marked = row.markedAt !== null;
          return (
            <div className="flex items-center justify-between gap-3 px-4 py-3">
              <TwoLineCell
                primary={row.className}
                secondary={`${meta.levelLabel} · ${String(row.strength)} students`}
              />
              {marked ? (
                <StatusBadge tone="success" size="sm">
                  Marked
                </StatusBadge>
              ) : (
                <StatusBadge tone="warning" size="sm">
                  Not marked
                </StatusBadge>
              )}
            </div>
          );
        }}
      />
    </div>
  );
}

function countCell(value: number | null): ReactNode {
  if (value === null) {
    return <span className="text-muted-foreground">—</span>;
  }
  return <span className="font-mono tabular-nums text-foreground">{value}</span>;
}
