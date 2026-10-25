'use client';

import {
  ROUTES,
  TIMETABLE_KIND_LABELS,
  TIMETABLE_KINDS,
  TIMETABLE_STATUS_LABELS,
  TIMETABLE_STATUSES,
  type TimetableListItem,
  type TimetableOptions,
} from '@ilm/contracts';
import {
  Button,
  ConfirmDialog,
  DateDisplay,
  DropdownMenuItem,
  SimpleSelect,
  useToast,
  type CardTableColumn,
} from '@ilm/ui';
import {
  ApproveIcon,
  CalendarIcon,
  ClassIcon,
  CreateIcon,
  DeleteIcon,
  EditIcon,
  FilterIcon,
  ICON_SIZE,
  SessionIcon,
  TagIcon,
  UndoIcon,
  ViewIcon,
} from '@ilm/ui/icons';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useMemo, useState } from 'react';

import { afterMenuAction, feeListSortableTableHeader, feeListTableHeader, FEE_LIST_TABLE_CELL, useDebouncedSearchFilter } from '@/components/fees/fee-list-shared';
import { ListDataTable } from '@/components/list-data-table';
import { ListPageToolbar } from '@/components/list-page-toolbar';
import { ListTablePaginationFooter } from '@/components/list-table-pagination-footer';
import { ListTableRowActions } from '@/components/list-table-row-actions';
import { ListTableScreen } from '@/components/list-table-screen';
import { PageHeader } from '@/components/page-header';
import { TimetableStatusBadge } from '@/components/timetable-badges';
import { nextSortParams } from '@/lib/list-page';
import { mutate } from '@/lib/mutate';
import { useTenantHref } from '@/lib/use-tenant-href';

export interface TimetablesFilters {
  readonly q: string;
  readonly sessionId: string;
  readonly classLevelId: string;
  readonly kind: string;
  readonly assessmentTypeId: string;
  readonly status: string;
}

export interface TimetablesViewProps {
  readonly canManage: boolean;
  readonly rows: readonly TimetableListItem[];
  readonly total: number;
  readonly filters: TimetablesFilters;
  readonly sort: string;
  readonly order: 'asc' | 'desc';
  readonly limit: number;
  readonly offset: number;
  /** What the form and the filters offer. Only the office reads it. */
  readonly options: TimetableOptions | undefined;
  readonly error?: string | undefined;
}

/**
 * Timetables.
 *
 * The office sees every timetable, drafts included, and makes them here. A
 * teacher, a parent or a student sees only the published ones that concern them
 * — the server decides which, so this only draws what it is given.
 */
export function TimetablesView(props: TimetablesViewProps) {
  const { canManage, rows, total, filters, sort, order, limit, offset, options, error } = props;

  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const tenantHref = useTenantHref();
  const toast = useToast();

  const [deleting, setDeleting] = useState<TimetableListItem | undefined>(undefined);

  function pushFilters(next: Record<string, string>): void {
    const query = new URLSearchParams(params.toString());
    for (const [key, value] of Object.entries(next)) {
      if (value === '') {
        query.delete(key);
      } else {
        query.set(key, value);
      }
    }
    if (!Object.hasOwn(next, 'offset')) {
      query.delete('offset');
    }
    router.push(`${pathname}?${query.toString()}`);
  }

  const { searchQuery, onSearchQueryChange } = useDebouncedSearchFilter(filters.q, (value) => {
    pushFilters({ q: value });
  });

  function toggleSort(columnKey: string): void {
    const next = nextSortParams(sort, order, columnKey);
    pushFilters({ sort: next.sort, order: next.order });
  }

  const isFiltered = Object.values(filters).some((value) => value !== '');

  async function setPublished(row: TimetableListItem, publish: boolean): Promise<void> {
    const result = await mutate(publish ? ROUTES.timetables.publish(row.id) : ROUTES.timetables.unpublish(row.id), 'POST');
    if (!result.ok) {
      toast.error(result.message);
      return;
    }
    toast.success(publish ? 'Published. Teachers and parents have been told.' : 'Taken back to a draft.');
    router.refresh();
  }

  async function confirmDelete(): Promise<void> {
    if (deleting === undefined) return;
    const result = await mutate(ROUTES.timetables.detail(deleting.id), 'DELETE');
    if (!result.ok) {
      toast.error(result.message);
      setDeleting(undefined);
      return;
    }
    toast.success(`${deleting.title} deleted.`);
    setDeleting(undefined);
    router.refresh();
  }

  const columns = useMemo((): CardTableColumn<TimetableListItem>[] => {
    const sortState = { key: sort, direction: order };
    return [
      {
        key: 'title',
        label: 'Timetable',
        ...FEE_LIST_TABLE_CELL,
        cellClassName: 'px-3 py-2.5',
        width: 'w-[30%]',
        sortable: true,
        headerCell: feeListSortableTableHeader('Timetable', 'title', sortState, toggleSort, CalendarIcon),
        render: (row) => (
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-foreground">{row.title}</p>
            <p className="text-xs text-muted-foreground">
              {TIMETABLE_KIND_LABELS[row.kind]}
              {row.assessmentType === null ? '' : ` · ${row.assessmentType.name}`}
            </p>
          </div>
        ),
      },
      {
        key: 'class',
        label: 'Class',
        ...FEE_LIST_TABLE_CELL,
        headerCell: feeListTableHeader('Class', ClassIcon),
        render: (row) => (
          <div>
            <p className="text-sm text-foreground">{row.classLevel.name}</p>
            <p className="text-xs text-muted-foreground">{row.section === null ? 'Whole class' : `Section ${row.section.name}`}</p>
          </div>
        ),
      },
      {
        key: 'session',
        label: 'Session',
        ...FEE_LIST_TABLE_CELL,
        headerCell: feeListTableHeader('Session', SessionIcon),
        render: (row) => <span className="text-sm">{row.session.name}</span>,
      },
      {
        key: 'span',
        label: 'Dates',
        ...FEE_LIST_TABLE_CELL,
        headerCell: feeListTableHeader('Dates'),
        render: (row) =>
          row.startsOn === null && row.endsOn === null ? (
            <span className="text-sm text-muted-foreground">{row.kind === 'CLASS' ? 'All session' : '—'}</span>
          ) : (
            <span className="text-sm text-foreground">
              {row.startsOn === null ? '…' : <DateDisplay value={row.startsOn} />}
              {row.endsOn === null || row.endsOn === row.startsOn ? null : (
                <>
                  {' – '}
                  <DateDisplay value={row.endsOn} />
                </>
              )}
            </span>
          ),
      },
      {
        key: 'entryCount',
        label: 'Periods',
        ...FEE_LIST_TABLE_CELL,
        headerCell: feeListTableHeader('Periods'),
        render: (row) => <span className="text-sm tabular-nums">{row.entryCount}</span>,
      },
      {
        key: 'status',
        label: 'Status',
        ...FEE_LIST_TABLE_CELL,
        sortable: true,
        headerCell: feeListSortableTableHeader('Status', 'status', sortState, toggleSort),
        render: (row) => <TimetableStatusBadge status={row.status} />,
      },
      {
        key: 'updatedAt',
        label: 'Updated',
        ...FEE_LIST_TABLE_CELL,
        sortable: true,
        headerCell: feeListSortableTableHeader('Updated', 'updatedAt', sortState, toggleSort),
        render: (row) => (
          <span className="text-sm text-muted-foreground">
            <DateDisplay value={row.updatedAt} />
          </span>
        ),
      },
      {
        key: 'actions',
        label: 'Actions',
        headerClassName: 'w-12 px-2 py-2.5',
        cellClassName: 'w-12 px-2 py-2.5',
        render: (row) => (
          <ListTableRowActions ariaLabel={`Actions for ${row.title}`}>
            <DropdownMenuItem
              onSelect={() => {
                afterMenuAction(() => {
                  router.push(tenantHref(`/timetables/${row.id}`));
                });
              }}
            >
              <ViewIcon className={ICON_SIZE.inline} aria-hidden />
              View timetable
            </DropdownMenuItem>
            {canManage ? (
              <>
                <DropdownMenuItem
                  onSelect={() => {
                    afterMenuAction(() => {
                      router.push(tenantHref(`/timetables/${row.id}/edit`));
                    });
                  }}
                >
                  <EditIcon className={ICON_SIZE.inline} aria-hidden />
                  Edit
                </DropdownMenuItem>
                <DropdownMenuItem
                  onSelect={() => {
                    afterMenuAction(() => void setPublished(row, row.status === 'DRAFT'));
                  }}
                >
                  {row.status === 'DRAFT' ? (
                    <ApproveIcon className={ICON_SIZE.inline} aria-hidden />
                  ) : (
                    <UndoIcon className={ICON_SIZE.inline} aria-hidden />
                  )}
                  {row.status === 'DRAFT' ? 'Publish' : 'Back to draft'}
                </DropdownMenuItem>
                <DropdownMenuItem
                  onSelect={() => {
                    afterMenuAction(() => {
                      setDeleting(row);
                    });
                  }}
                >
                  <DeleteIcon className={ICON_SIZE.inline} aria-hidden />
                  Delete
                </DropdownMenuItem>
              </>
            ) : null}
          </ListTableRowActions>
        ),
      },
    ];
  }, [canManage, sort, order, params]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Timetables"
        description={
          canManage
            ? 'Weekly class periods, and dated tests and exams. Publish one and its teachers and families are told.'
            : 'The class timetables and exam schedules that concern you.'
        }
      />

      <ListTableScreen
        tableTitle="All timetables"
        headerActions={
          canManage ? (
            <Button asChild size="sm">
              <Link href={tenantHref('/timetables/new')}>
                <CreateIcon className={ICON_SIZE.inline} aria-hidden />
                New timetable
              </Link>
            </Button>
          ) : null
        }
        filters={
          <ListPageToolbar
            searchQuery={searchQuery}
            onSearchQueryChange={onSearchQueryChange}
            searchPlaceholder="Search by title or class…"
            searchAriaLabel="Search timetables"
            searchClassName="md:max-w-xs lg:max-w-sm"
            filters={
              <>
                {options === undefined ? null : (
                  <>
                    <SimpleSelect
                      className="w-full min-w-32 sm:w-36"
                      ariaLabel="Filter by session"
                      value={filters.sessionId}
                      triggerIcon={SessionIcon}
                      emptyOption={{ value: '', label: 'All sessions' }}
                      placeholder="All sessions"
                      options={options.sessions.map((session) => ({ value: session.id, label: session.name }))}
                      onValueChange={(next) => {
                        pushFilters({ sessionId: next });
                      }}
                    />
                    <SimpleSelect
                      className="w-full min-w-32 sm:w-36"
                      ariaLabel="Filter by class"
                      value={filters.classLevelId}
                      triggerIcon={ClassIcon}
                      emptyOption={{ value: '', label: 'All classes' }}
                      placeholder="All classes"
                      options={options.classes.map((item) => ({ value: item.id, label: item.name }))}
                      onValueChange={(next) => {
                        pushFilters({ classLevelId: next });
                      }}
                    />
                  </>
                )}
                <SimpleSelect
                  className="w-full min-w-32 sm:w-40"
                  ariaLabel="Filter by type"
                  value={filters.kind}
                  triggerIcon={TagIcon}
                  emptyOption={{ value: '', label: 'All types' }}
                  placeholder="All types"
                  options={TIMETABLE_KINDS.map((value) => ({ value, label: TIMETABLE_KIND_LABELS[value] }))}
                  onValueChange={(next) => {
                    pushFilters({ kind: next });
                  }}
                />
                {options === undefined ? null : (
                  <SimpleSelect
                    className="w-full min-w-32 sm:w-40"
                    ariaLabel="Filter by assessment type"
                    value={filters.assessmentTypeId}
                    triggerIcon={TagIcon}
                    emptyOption={{ value: '', label: 'Any assessment' }}
                    placeholder="Any assessment"
                    options={options.assessmentTypes.map((type) => ({ value: type.id, label: type.name }))}
                    onValueChange={(next) => {
                      pushFilters({ assessmentTypeId: next });
                    }}
                  />
                )}
                {canManage ? (
                  <SimpleSelect
                    className="w-full min-w-32 sm:w-36"
                    ariaLabel="Filter by status"
                    value={filters.status}
                    triggerIcon={FilterIcon}
                    emptyOption={{ value: '', label: 'All statuses' }}
                    placeholder="All statuses"
                    options={TIMETABLE_STATUSES.map((value) => ({ value, label: TIMETABLE_STATUS_LABELS[value] }))}
                    onValueChange={(next) => {
                      pushFilters({ status: next });
                    }}
                  />
                ) : null}
              </>
            }
          />
        }
        footer={
          <ListTablePaginationFooter
            total={total}
            limit={limit}
            offset={offset}
            label="timetables"
            onPageChange={(next) => {
              pushFilters({ offset: next === 0 ? '' : String(next) });
            }}
            onLimitChange={(next) => {
              pushFilters({ limit: next, offset: '' });
            }}
          />
        }
      >
        <ListDataTable
          title="Timetables"
          rows={rows}
          columns={columns}
          rowKey={(row) => row.id}
          tableLayout="auto"
          minWidthClass="min-w-[60rem]"
          error={error}
          isFiltered={isFiltered}
          onClearFilters={() => {
            router.push(pathname);
          }}
          sort={{ key: sort, direction: order, onToggle: toggleSort }}
          onRowClick={(row) => {
            router.push(tenantHref(`/timetables/${row.id}`));
          }}
          renderMobileRow={(row) => (
            <div className="space-y-1.5 p-4">
              <div className="flex items-start justify-between gap-2">
                <p className="min-w-0 text-sm font-medium text-foreground">{row.title}</p>
                <TimetableStatusBadge status={row.status} />
              </div>
              <p className="text-xs text-muted-foreground">
                {row.classLevel.name}
                {row.section === null ? '' : ` · ${row.section.name}`} · {TIMETABLE_KIND_LABELS[row.kind]}
              </p>
              <p className="text-xs text-muted-foreground">
                {row.entryCount} {row.entryCount === 1 ? 'period' : 'periods'} · {row.session.name}
              </p>
            </div>
          )}
          empty={{
            title: canManage ? 'No timetables yet' : 'Nothing scheduled for you yet',
            description: canManage
              ? 'Make a class timetable or an exam schedule. It stays a draft until you publish it.'
              : 'When the school publishes a timetable for your class, it appears here and on the calendar.',
          }}
        />
      </ListTableScreen>

      <ConfirmDialog
        open={deleting !== undefined}
        onOpenChange={(open) => {
          if (!open) {
            setDeleting(undefined);
          }
        }}
        title={`Delete ${deleting?.title ?? ''}?`}
        description="Its periods and its events on the calendar are removed with it. Teachers and parents are not notified."
        confirmLabel="Delete"
        tone="danger"
        onConfirm={confirmDelete}
      />
    </div>
  );
}
