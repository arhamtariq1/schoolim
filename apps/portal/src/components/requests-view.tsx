'use client';

import {
  allowedNextStatuses,
  REQUEST_CATEGORIES,
  REQUEST_CATEGORY_LABELS,
  REQUEST_PRIORITIES,
  REQUEST_PRIORITY_LABELS,
  REQUEST_STATUS_LABELS,
  REQUEST_STATUSES,
  ROUTES,
  type RequestAssigneeOption,
  type RequestListItem,
  type RequestStatus,
  type RequestSummary,
} from '@ilm/contracts';
import {
  Button,
  DateDisplay,
  DropdownMenuItem,
  SimpleSelect,
  useToast,
  type CardTableColumn,
} from '@ilm/ui';
import {
  ApproveIcon,
  CreateIcon,
  FilterIcon,
  ICON_SIZE,
  OverdueIcon,
  RequestsIcon,
  SessionIcon,
  SuccessIcon,
  TagIcon,
  UndoIcon,
  ViewIcon,
} from '@ilm/ui/icons';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useMemo, useState } from 'react';

import { DashboardStatCard } from '@/components/dashboard/dashboard-stat-card';
import { afterMenuAction, feeListSortableTableHeader, feeListTableHeader, FEE_LIST_TABLE_CELL, useDebouncedSearchFilter } from '@/components/fees/fee-list-shared';
import { ListDataTable } from '@/components/list-data-table';
import { ListPageToolbar } from '@/components/list-page-toolbar';
import { ListTablePaginationFooter } from '@/components/list-table-pagination-footer';
import { ListTableRowActions } from '@/components/list-table-row-actions';
import { ListTableScreen } from '@/components/list-table-screen';
import { NewRequestDialog } from '@/components/new-request-dialog';
import { PageHeader } from '@/components/page-header';
import { RequestPriorityBadge, RequestStatusBadge } from '@/components/request-badges';
import { nextSortParams } from '@/lib/list-page';
import { mutate } from '@/lib/mutate';
import { useTenantHref } from '@/lib/use-tenant-href';

export type RequestsMode = 'manage' | 'mine';

export interface RequestsFilters {
  readonly q: string;
  readonly status: string;
  readonly category: string;
  readonly priority: string;
  readonly assignee: string;
}

export interface RequestsViewProps {
  readonly mode: RequestsMode;
  readonly rows: readonly RequestListItem[];
  readonly total: number;
  readonly summary: RequestSummary;
  readonly filters: RequestsFilters;
  readonly sort: string;
  readonly order: 'asc' | 'desc';
  readonly limit: number;
  readonly offset: number;
  /** Who a request can be given to. Empty in "mine" mode. */
  readonly assignees: readonly RequestAssigneeOption[];
  /** A failed read, said in words. The page still renders around it. */
  readonly error?: string | undefined;
}

/**
 * Requests, in one of two shapes.
 *
 * **Manage Requests** is the office's queue: every request in the school, who
 * raised it, who has it. **My Requests** is a parent's or a teacher's own, with
 * a way to send a new one. Same table, same filters — the mode decides which
 * columns and which row actions make sense, and the server decides which rows
 * exist at all.
 */
export function RequestsView(props: RequestsViewProps) {
  const { mode, rows, total, summary, filters, sort, order, limit, offset, assignees, error } = props;
  const manage = mode === 'manage';

  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const tenantHref = useTenantHref();
  const toast = useToast();
  const [creating, setCreating] = useState(false);

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

  async function moveTo(row: RequestListItem, status: RequestStatus): Promise<void> {
    const result = await mutate(ROUTES.requests.status(row.id), 'POST', { status });
    if (!result.ok) {
      toast.error(result.message);
      return;
    }
    toast.success(`${row.requestNo} marked ${REQUEST_STATUS_LABELS[status].toLowerCase()}.`);
    router.refresh();
  }

  const columns = useMemo((): CardTableColumn<RequestListItem>[] => {
    const sortState = { key: sort, direction: order };
    const open = (row: RequestListItem): void => {
      router.push(tenantHref(`/requests/${row.id}`));
    };

    const base: CardTableColumn<RequestListItem>[] = [
      {
        key: 'requestNo',
        label: 'Request',
        ...FEE_LIST_TABLE_CELL,
        cellClassName: 'px-3 py-2.5',
        width: 'w-[26%]',
        sortable: true,
        headerCell: feeListSortableTableHeader('Request', 'requestNo', sortState, toggleSort, RequestsIcon),
        render: (row) => (
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-foreground">{row.subject}</p>
            <p className="font-mono text-xs text-muted-foreground">{row.requestNo}</p>
          </div>
        ),
      },
    ];

    if (manage) {
      base.push({
        key: 'requester',
        label: 'Raised by',
        ...FEE_LIST_TABLE_CELL,
        headerCell: feeListTableHeader('Raised by'),
        render: (row) => (
          <div>
            <p className="text-sm text-foreground">{row.requester.name}</p>
            <p className="text-xs text-muted-foreground">
              {row.requester.roleLabel}
              {row.student === null ? '' : ` · ${row.student.name}`}
            </p>
          </div>
        ),
      });
    }

    base.push(
      {
        key: 'category',
        label: 'Category',
        ...FEE_LIST_TABLE_CELL,
        headerCell: feeListTableHeader('Category', TagIcon),
        render: (row) => <span className="text-sm">{REQUEST_CATEGORY_LABELS[row.category]}</span>,
      },
      {
        key: 'priority',
        label: 'Priority',
        ...FEE_LIST_TABLE_CELL,
        sortable: true,
        headerCell: feeListSortableTableHeader('Priority', 'priority', sortState, toggleSort),
        render: (row) => <RequestPriorityBadge priority={row.priority} />,
      },
      {
        key: 'status',
        label: 'Status',
        ...FEE_LIST_TABLE_CELL,
        sortable: true,
        headerCell: feeListSortableTableHeader('Status', 'status', sortState, toggleSort),
        render: (row) => <RequestStatusBadge status={row.status} />,
      },
    );

    if (manage) {
      base.push({
        key: 'assignee',
        label: 'Assigned to',
        ...FEE_LIST_TABLE_CELL,
        headerCell: feeListTableHeader('Assigned to'),
        render: (row) =>
          row.assignee === null ? (
            <span className="text-sm text-muted-foreground">Unassigned</span>
          ) : (
            <span className="text-sm">{row.assignee.name}</span>
          ),
      });
    }

    base.push(
      {
        key: 'lastActivityAt',
        label: 'Last activity',
        ...FEE_LIST_TABLE_CELL,
        sortable: true,
        headerCell: feeListSortableTableHeader('Last activity', 'lastActivityAt', sortState, toggleSort),
        render: (row) => (
          <span className="text-sm text-muted-foreground">
            <DateDisplay value={row.lastActivityAt} precision="datetime" />
          </span>
        ),
      },
      {
        key: 'actions',
        label: 'Actions',
        headerClassName: 'w-12 px-2 py-2.5',
        cellClassName: 'w-12 px-2 py-2.5',
        render: (row) => {
          const next = allowedNextStatuses(row.status, manage ? 'manager' : 'requester');
          return (
            <ListTableRowActions ariaLabel={`Actions for ${row.requestNo}`}>
              <DropdownMenuItem
                onSelect={() => {
                  afterMenuAction(() => {
                    open(row);
                  });
                }}
              >
                <ViewIcon className={ICON_SIZE.inline} aria-hidden />
                View request
              </DropdownMenuItem>
              {manage && next.includes('IN_PROGRESS') ? (
                <DropdownMenuItem
                  onSelect={() => {
                    afterMenuAction(() => void moveTo(row, 'IN_PROGRESS'));
                  }}
                >
                  <OverdueIcon className={ICON_SIZE.inline} aria-hidden />
                  Start working
                </DropdownMenuItem>
              ) : null}
              {manage && next.includes('RESOLVED') ? (
                <DropdownMenuItem
                  onSelect={() => {
                    afterMenuAction(() => void moveTo(row, 'RESOLVED'));
                  }}
                >
                  <ApproveIcon className={ICON_SIZE.inline} aria-hidden />
                  Mark resolved
                </DropdownMenuItem>
              ) : null}
              {next.includes('REOPENED') ? (
                <DropdownMenuItem
                  onSelect={() => {
                    afterMenuAction(() => void moveTo(row, 'REOPENED'));
                  }}
                >
                  <UndoIcon className={ICON_SIZE.inline} aria-hidden />
                  Reopen
                </DropdownMenuItem>
              ) : null}
            </ListTableRowActions>
          );
        },
      },
    );

    return base;
  }, [manage, sort, order, params]);

  return (
    <div className="space-y-6">
      <PageHeader
        title={manage ? 'Manage Requests' : 'My Requests'}
        description={
          manage
            ? 'Every request, complaint and concern the school has received — assign them and see each one through.'
            : 'What you have asked the school, and where each request stands.'
        }
      />

      {creating ? (
        <NewRequestDialog
          onClose={() => {
            setCreating(false);
          }}
        />
      ) : null}

      {/* The office works from these counts; a person reading their own few requests does not need them. */}
      {manage ? (
        <SummaryCards summary={summary} active={filters.status} onPick={(status) => pushFilters({ status })} />
      ) : null}

      <ListTableScreen
        tableTitle={manage ? 'All requests' : 'Your requests'}
        // The office answers requests; it does not send them.
        headerActions={
          manage ? null : (
            <Button
              size="sm"
              onClick={() => {
                setCreating(true);
              }}
            >
              <CreateIcon className={ICON_SIZE.inline} aria-hidden />
              New request
            </Button>
          )
        }
        filters={
          <ListPageToolbar
            searchQuery={searchQuery}
            onSearchQueryChange={onSearchQueryChange}
            searchPlaceholder={
              manage ? 'Search by subject, number, person or student…' : 'Search your requests…'
            }
            searchAriaLabel="Search requests"
            searchClassName="md:max-w-xs lg:max-w-sm"
            filters={
              <>
                <SimpleSelect
                  className="w-full min-w-32 sm:w-36"
                  ariaLabel="Filter by status"
                  value={filters.status}
                  triggerIcon={FilterIcon}
                  emptyOption={{ value: '', label: 'All statuses' }}
                  placeholder="All statuses"
                  options={REQUEST_STATUSES.map((value) => ({ value, label: REQUEST_STATUS_LABELS[value] }))}
                  onValueChange={(next) => {
                    pushFilters({ status: next });
                  }}
                />
                <SimpleSelect
                  className="w-full min-w-32 sm:w-40"
                  ariaLabel="Filter by category"
                  value={filters.category}
                  triggerIcon={TagIcon}
                  emptyOption={{ value: '', label: 'All categories' }}
                  placeholder="All categories"
                  options={REQUEST_CATEGORIES.map((value) => ({ value, label: REQUEST_CATEGORY_LABELS[value] }))}
                  onValueChange={(next) => {
                    pushFilters({ category: next });
                  }}
                />
                <SimpleSelect
                  className="w-full min-w-32 sm:w-36"
                  ariaLabel="Filter by priority"
                  value={filters.priority}
                  triggerIcon={SessionIcon}
                  emptyOption={{ value: '', label: 'All priorities' }}
                  placeholder="All priorities"
                  options={REQUEST_PRIORITIES.map((value) => ({ value, label: REQUEST_PRIORITY_LABELS[value] }))}
                  onValueChange={(next) => {
                    pushFilters({ priority: next });
                  }}
                />
                {manage ? (
                  <SimpleSelect
                    className="w-full min-w-32 sm:w-44"
                    ariaLabel="Filter by assignee"
                    value={filters.assignee}
                    triggerIcon={SuccessIcon}
                    emptyOption={{ value: '', label: 'Anyone' }}
                    placeholder="Anyone"
                    options={[
                      { value: 'me', label: 'Assigned to me' },
                      { value: 'unassigned', label: 'Unassigned' },
                      ...assignees.map((person) => ({ value: person.id, label: person.name })),
                    ]}
                    onValueChange={(next) => {
                      pushFilters({ assignee: next });
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
            label="requests"
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
          title="Requests"
          rows={rows}
          columns={columns}
          rowKey={(row) => row.id}
          tableLayout="auto"
          minWidthClass={manage ? 'min-w-[60rem]' : 'min-w-[44rem]'}
          error={error}
          isFiltered={isFiltered}
          onClearFilters={() => {
            router.push(pathname);
          }}
          sort={{ key: sort, direction: order, onToggle: toggleSort }}
          onRowClick={(row) => {
            router.push(tenantHref(`/requests/${row.id}`));
          }}
          renderMobileRow={(row) => <MobileRow row={row} manage={manage} />}
          empty={{
            title: manage ? 'No requests yet' : 'You have not sent any requests',
            description: manage
              ? 'When a parent or a teacher writes to the school, it appears here and the office is notified.'
              : 'A question, a complaint or a concern — send it here and follow what happens to it.',
          }}
        />
      </ListTableScreen>
    </div>
  );
}

// --- Pieces -----------------------------------------------------------------

/** Total, Pending, In progress and Resolved. Each is a way into the list below it. */
function SummaryCards({
  summary,
  active,
  onPick,
}: {
  readonly summary: RequestSummary;
  readonly active: string;
  readonly onPick: (status: string) => void;
}) {
  const cards: readonly {
    readonly label: string;
    readonly value: number;
    readonly status: string;
    readonly description: string;
  }[] = [
    { label: 'Total', value: summary.total, status: '', description: 'Every request' },
    { label: 'Pending', value: summary.pending, status: 'PENDING', description: 'Waiting for a first reply' },
    { label: 'In progress', value: summary.inProgress, status: 'IN_PROGRESS', description: 'Being worked on' },
    { label: 'Resolved', value: summary.resolved, status: 'RESOLVED', description: 'Closed with an answer' },
  ];

  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {cards.map((card) => (
        <DashboardStatCard
          key={card.label}
          label={card.label}
          value={String(card.value)}
          description={card.description}
          selected={active === card.status}
          onSelect={() => {
            onPick(card.status);
          }}
        />
      ))}
    </div>
  );
}

/** Below 768px a table becomes a list of cards (docs/16 §9). */
function MobileRow({ row, manage }: { readonly row: RequestListItem; readonly manage: boolean }) {
  return (
    <div className="space-y-2 p-4">
      <div className="flex items-start justify-between gap-2">
        <p className="min-w-0 text-sm font-medium text-foreground">{row.subject}</p>
        <RequestStatusBadge status={row.status} />
      </div>
      <p className="font-mono text-xs text-muted-foreground">
        {row.requestNo} · {REQUEST_CATEGORY_LABELS[row.category]}
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <RequestPriorityBadge priority={row.priority} />
        {manage ? (
          <span className="text-xs text-muted-foreground">
            {row.requester.name}
            {row.assignee === null ? ' · Unassigned' : ` · ${row.assignee.name}`}
          </span>
        ) : null}
      </div>
      <p className="text-xs text-muted-foreground">
        <DateDisplay value={row.lastActivityAt} precision="datetime" />
      </p>
    </div>
  );
}
