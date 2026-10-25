'use client';

import {
  ROUTES,
  STUDENT_STATUSES,
  type StudentListItem,
  type StudentListQuery,
} from '@ilm/contracts';
import {
  Button,
  ConfirmDialog,
  DateDisplay,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  Money,
  SimpleSelect,
  StatusBadge,
  TwoLineCell,
  useToast,
  type CardTableColumn,
} from '@ilm/ui';
import {
  AccountIcon,
  CalendarIcon,
  ClassIcon,
  CreateIcon,
  DeleteIcon,
  EditIcon,
  ErrorIcon,
  FeesIcon,
  LockedIcon,
  PhoneIcon,
  SignOutIcon,
  StudentsIcon,
  SuccessIcon,
} from '@ilm/ui/icons';
import { minorUnits } from '@ilm/utils';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useMemo, useState, useTransition } from 'react';

import { EditStudentDialog } from './edit-student-dialog';
import { ListDataTable } from './list-data-table';
import { ListTablePaginationFooter } from './list-table-pagination-footer';
import { ListTableRowActions } from './list-table-row-actions';
import { ListTableScreen } from './list-table-screen';
import { TableSelectionBar } from './table-selection-bar';

import { StudentAdmissionAvatar } from '@/components/dashboard/student-admission-avatar';
import {
  FEE_LIST_TABLE_CELL,
  LIST_TABLE_BADGE_CLASS,
  afterMenuAction,
  classBadgeTone,
  feeListSortableTableHeader,
  feeListTableHeader,
  useDebouncedSearchFilter,
} from '@/components/fees/fee-list-shared';
import { ListPageToolbar } from '@/components/list-page-toolbar';
import { WorkspacePageHeader } from '@/components/workspace-page-header';
import { listTableSelectColumn, useRowSelection } from '@/lib/use-row-selection';
import { pageIntro } from '@/lib/page-copy';
import { mutateOrThrow } from '@/lib/mutate';
import { useTenantHref } from '@/lib/use-tenant-href';

const STATUS_TONE: Record<string, 'success' | 'neutral' | 'warning' | 'danger'> = {
  ACTIVE: 'success',
  INACTIVE: 'neutral',
  GRADUATED: 'neutral',
  LEFT: 'warning',
  STRUCK_OFF: 'danger',
};

const STUDENT_STATUS_ICON = {
  ACTIVE: SuccessIcon,
  INACTIVE: LockedIcon,
  GRADUATED: ClassIcon,
  LEFT: SignOutIcon,
  STRUCK_OFF: ErrorIcon,
} as const satisfies Record<(typeof STUDENT_STATUSES)[number], typeof SuccessIcon>;

function humanise(status: string): string {
  return status.toLowerCase().replace('_', ' ');
}

export type StudentSortKey = StudentListQuery['sort'];

export interface StudentsTableProps {
  rows: StudentListItem[];
  total: number;
  aggregates: Record<string, number>;
  error?: string | undefined;
  limit: number;
  offset: number;
  search: string;
  status: string;
  classLevelId: string;
  classes: readonly { id: string; name: string }[];
  isFiltered: boolean;
  sort: StudentSortKey;
  order: 'asc' | 'desc';
  can: { create: boolean; update: boolean; delete: boolean };
}

export function StudentsTable({
  rows,
  total,
  error,
  search,
  status,
  classLevelId,
  classes,
  isFiltered,
  limit,
  offset,
  sort,
  order,
  can,
}: StudentsTableProps) {
  const router = useRouter();
  const tenantHref = useTenantHref();
  const pathname = usePathname();
  const params = useSearchParams();
  const [isPending, startTransition] = useTransition();
  const toast = useToast();

  const [editing, setEditing] = useState<StudentListItem | undefined>(undefined);
  const [deleting, setDeleting] = useState<StudentListItem | undefined>(undefined);
  const [leaving, setLeaving] = useState<StudentListItem | undefined>(undefined);

  const {
    selected,
    clearSelection,
    allOnPageSelected,
    someOnPageSelected,
    toggleAllOnPage,
    toggleRowSelected,
  } = useRowSelection(rows, (row) => row.id);

  function apply(next: Record<string, string>) {
    const updated = new URLSearchParams(params.toString());
    for (const [key, value] of Object.entries(next)) {
      if (value === '') {
        updated.delete(key);
      } else {
        updated.set(key, value);
      }
    }

    if (!Object.hasOwn(next, 'offset')) {
      updated.delete('offset');
      clearSelection();
    }

    startTransition(() => {
      router.push(`${pathname}?${updated.toString()}`);
    });
  }

  const { searchQuery, onSearchQueryChange } = useDebouncedSearchFilter(search, (value) => {
    apply({ q: value });
  });

  function clearFilters(): void {
    apply({ q: '', status: '', classLevelId: '' });
  }

  function toggleSort(columnKey: string): void {
    const nextKey = columnKey as StudentSortKey;
    if (sort === nextKey) {
      apply({ order: order === 'asc' ? 'desc' : 'asc' });
      return;
    }
    apply({ sort: nextKey, order: 'asc' });
  }

  const sortState = useMemo(() => ({ key: sort, direction: order }), [sort, order]);

  const columns = useMemo((): CardTableColumn<StudentListItem>[] => {
    return [
      listTableSelectColumn({
        selected,
        allOnPageSelected,
        someOnPageSelected,
        toggleAllOnPage,
        toggleRowSelected,
        getRowId: (row) => row.id,
        rowAriaLabel: (row) => `${row.firstName} ${row.lastName}`,
        selectAllAriaLabel: 'Select every student on this page',
      }),
      {
        key: 'grNo',
        label: 'GR no.',
        ...FEE_LIST_TABLE_CELL,
        colStyle: { width: '6.5rem' },
        sortable: true,
        headerCell: feeListSortableTableHeader(
          'GR no.',
          'grNo',
          sortState,
          toggleSort,
          StudentsIcon,
        ),
        render: (row) => (
          <span className="text-sm font-medium tabular-nums text-foreground">{row.grNo}</span>
        ),
      },
      {
        key: 'name',
        label: 'Name',
        ...FEE_LIST_TABLE_CELL,
        width: 'w-[20%]',
        sortable: true,
        headerCell: feeListSortableTableHeader(
          'Name',
          'name',
          sortState,
          toggleSort,
          StudentsIcon,
        ),
        render: (row) => (
          <div className="flex min-w-0 items-center gap-3">
            <StudentAdmissionAvatar
              firstName={row.firstName}
              lastName={row.lastName}
              photoUrl={row.photoUrl}
              className="size-9 text-[11px]"
            />
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-foreground">
                {row.firstName} {row.lastName}
              </p>
              <p className="truncate text-xs tabular-nums text-muted-foreground">
                GR {row.grNo}
              </p>
            </div>
          </div>
        ),
      },
      {
        key: 'className',
        label: 'Class',
        ...FEE_LIST_TABLE_CELL,
        width: 'w-[12%]',
        hideOnMobile: true,
        sortable: true,
        headerCell: feeListSortableTableHeader(
          'Class',
          'className',
          sortState,
          toggleSort,
          ClassIcon,
        ),
        render: (row) =>
          row.className === null ? (
            <span className="text-sm text-muted-foreground">—</span>
          ) : (
            <StatusBadge
              tone={classBadgeTone(row.className)}
              size="sm"
              icon={ClassIcon}
              className={LIST_TABLE_BADGE_CLASS}
            >
              {row.sectionName === null ? row.className : `${row.className} · ${row.sectionName}`}
            </StatusBadge>
          ),
      },
      {
        key: 'father',
        label: 'Father / guardian',
        ...FEE_LIST_TABLE_CELL,
        width: 'w-[14%]',
        hideOnMobile: true,
        headerCell: feeListTableHeader('Father / guardian', AccountIcon),
        render: (row) =>
          row.fatherName === null ? (
            <span className="text-sm text-muted-foreground">—</span>
          ) : (
            <span className="text-sm text-foreground">{row.fatherName}</span>
          ),
      },
      {
        key: 'contact',
        label: 'Contact',
        ...FEE_LIST_TABLE_CELL,
        width: 'w-[12%]',
        hideOnMobile: true,
        headerCell: feeListTableHeader('Contact', PhoneIcon),
        render: (row) =>
          row.guardianPhone === null ? (
            <span className="text-sm text-muted-foreground">—</span>
          ) : (
            <a
              href={`tel:${row.guardianPhone}`}
              className="text-sm tabular-nums text-foreground no-underline hover:text-primary"
              onClick={(event) => {
                event.stopPropagation();
              }}
            >
              {row.guardianPhone}
            </a>
          ),
      },
      {
        key: 'status',
        label: 'Status',
        ...FEE_LIST_TABLE_CELL,
        width: 'w-[10%]',
        headerCell: feeListTableHeader('Status'),
        render: (row) => (
          <StatusBadge
            tone={STATUS_TONE[row.status] ?? 'neutral'}
            size="sm"
            icon={row.status === 'ACTIVE' ? SuccessIcon : undefined}
            className={LIST_TABLE_BADGE_CLASS}
          >
            {humanise(row.status)}
          </StatusBadge>
        ),
      },
      {
        key: 'tuition',
        label: 'Tuition',
        ...FEE_LIST_TABLE_CELL,
        width: 'w-[10%]',
        hideOnMobile: true,
        headerCell: feeListTableHeader('Tuition', FeesIcon),
        render: (row) =>
          row.tuitionFeeMinor === null ? (
            <span className="text-sm text-muted-foreground">—</span>
          ) : (
            <Money valueMinor={minorUnits(row.tuitionFeeMinor)} withSymbol />
          ),
      },
      {
        key: 'createdAt',
        label: 'Admitted',
        ...FEE_LIST_TABLE_CELL,
        width: 'w-[11%]',
        hideOnMobile: true,
        sortable: true,
        headerCell: feeListSortableTableHeader(
          'Admitted',
          'createdAt',
          sortState,
          toggleSort,
          CalendarIcon,
        ),
        render: (row) =>
          row.admittedOn === null ? (
            <span className="text-sm text-muted-foreground">—</span>
          ) : (
            <span className="inline-flex items-center gap-2 text-sm leading-none text-foreground">
              <CalendarIcon className="size-4 shrink-0 text-muted-foreground" aria-hidden />
              <DateDisplay value={row.admittedOn} />
            </span>
          ),
      },
      {
        key: 'actions',
        label: 'Actions',
        ...FEE_LIST_TABLE_CELL,
        width: 'w-[8%]',
        headerCell: feeListTableHeader('Actions'),
        render: (row) =>
          !can.update && !can.delete ? (
            <span className="text-muted-foreground">—</span>
          ) : (
            <ListTableRowActions
              ariaLabel={`Actions for ${row.firstName} ${row.lastName}`}
            >
              <DropdownMenuLabel>
                {row.firstName} {row.lastName}
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              {can.update ? (
                <DropdownMenuItem
                  onSelect={() => {
                    afterMenuAction(() => {
                      setEditing(row);
                    });
                  }}
                >
                  <EditIcon className="text-muted-foreground" aria-hidden />
                  Edit details
                </DropdownMenuItem>
              ) : null}
              {can.update && row.status === 'ACTIVE' ? (
                <DropdownMenuItem
                  onSelect={() => {
                    afterMenuAction(() => {
                      setLeaving(row);
                    });
                  }}
                >
                  <SignOutIcon className="text-muted-foreground" aria-hidden />
                  Mark as left
                </DropdownMenuItem>
              ) : null}
              {can.delete ? (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    className="text-danger focus:text-danger"
                    onSelect={() => {
                      afterMenuAction(() => {
                        setDeleting(row);
                      });
                    }}
                  >
                    <DeleteIcon aria-hidden />
                    Delete record
                  </DropdownMenuItem>
                </>
              ) : null}
            </ListTableRowActions>
          ),
      },
    ];
  }, [
    allOnPageSelected,
    can.delete,
    can.update,
    order,
    selected,
    someOnPageSelected,
    sort,
    sortState,
    toggleAllOnPage,
    toggleRowSelected,
  ]);

  return (
    <div className="w-full space-y-6">
      <WorkspacePageHeader title="Students" description={pageIntro('/students')} />

      {error !== undefined ? (
        <div
          role="alert"
          className="rounded-md border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-danger"
        >
          {error}
        </div>
      ) : null}

      <div
        aria-busy={isPending}
        className={isPending ? 'opacity-60 transition-opacity' : undefined}
      >
        <ListTableScreen
          tableTitle="All students"
          filters={
            <ListPageToolbar
              searchQuery={searchQuery}
              onSearchQueryChange={onSearchQueryChange}
              searchPlaceholder="Name, father/guardian, phone or GR no…"
              searchAriaLabel="Search students by name, guardian, phone or GR number"
              filters={
                <>
                  <SimpleSelect
                    className="w-full min-w-32 sm:w-36"
                    ariaLabel="Filter by class"
                    value={classLevelId}
                    triggerIcon={ClassIcon}
                    emptyOption={{ value: '', label: 'Any class' }}
                    placeholder="Any class"
                    disabled={classes.length === 0}
                    onValueChange={(value) => {
                      apply({ classLevelId: value });
                    }}
                    options={classes.map((entry) => ({
                      value: entry.id,
                      label: entry.name,
                      icon: ClassIcon,
                    }))}
                  />
                  <SimpleSelect
                    className="w-full min-w-32 sm:w-36"
                    ariaLabel="Filter by status"
                    value={status}
                    triggerIcon={SuccessIcon}
                    emptyOption={{ value: '', label: 'Any status' }}
                    placeholder="Any status"
                    onValueChange={(value) => {
                      apply({ status: value });
                    }}
                    options={STUDENT_STATUSES.map((value) => ({
                      value,
                      label: humanise(value),
                      icon: STUDENT_STATUS_ICON[value],
                    }))}
                  />
                  {can.create ? (
                    <Button asChild className="w-full sm:w-auto">
                      <Link href={tenantHref('/students/new')}>
                        <CreateIcon className="size-4" aria-hidden="true" />
                        Admit student
                      </Link>
                    </Button>
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
              label="students"
              onPageChange={(next) => {
                apply({ offset: next === 0 ? '' : String(next) });
              }}
              onLimitChange={(next) => {
                apply({ limit: next, offset: '' });
              }}
            />
          }
        >
          <ListDataTable
            title="All students"
            caption="Students"
            rows={rows}
            columns={columns}
            rowKey={(row) => row.id}
            minWidthClass="min-w-[64rem]"
            isFiltered={isFiltered}
            onClearFilters={clearFilters}
            sort={{
              key: sort,
              direction: order,
              onToggle: toggleSort,
            }}
            onRowClick={(row) => {
              router.push(tenantHref(`/students/${row.id}`));
            }}
            empty={{
              title: 'No students yet',
              description:
                'A student is admitted with a GR number, a class and a guardian. Admitting the first one takes about a minute.',
              action: can.create ? (
                <Button asChild>
                  <Link href={tenantHref('/students/new')}>
                    <CreateIcon className="size-4" aria-hidden="true" />
                    Admit the first student
                  </Link>
                </Button>
              ) : undefined,
            }}
            renderMobileRow={(row) => (
              <div className="flex items-center gap-3 px-4 py-3">
                <StudentAdmissionAvatar
                  firstName={row.firstName}
                  lastName={row.lastName}
                  photoUrl={row.photoUrl}
                />
                <TwoLineCell
                  primary={
                    <span className="font-medium">
                      {row.firstName} {row.lastName}
                    </span>
                  }
                  secondary={`GR ${row.grNo} · ${row.className ?? 'Not enrolled'} · ${humanise(row.status)}`}
                />
              </div>
            )}
          />
        </ListTableScreen>
      </div>

      <TableSelectionBar
        count={selected.size}
        noun="student"
        onClear={clearSelection}
      />

      {editing === undefined ? null : (
        <EditStudentDialog
          student={editing}
          open
          onOpenChange={(next) => {
            if (!next) {
              setEditing(undefined);
            }
          }}
        />
      )}

      <ConfirmDialog
        open={leaving !== undefined}
        onOpenChange={(next) => {
          if (!next) {
            setLeaving(undefined);
          }
        }}
        tone="primary"
        title={`Mark ${leaving?.firstName ?? ''} ${leaving?.lastName ?? ''} as left?`}
        description={
          <>
            They will be removed from{' '}
            <span className="text-foreground">{leaving?.className ?? 'their class'}</span> and stop
            appearing on class lists and fee runs. Their record stays in the register.
          </>
        }
        confirmLabel="Mark as left"
        onConfirm={async () => {
          const target = leaving;
          if (target === undefined) {
            return;
          }
          await mutateOrThrow(ROUTES.students.changeStatus(target.id), 'POST', {
            status: 'LEFT',
            reason: 'Marked as left from the student list',
          });
          toast.success(`${target.firstName} ${target.lastName} marked as left`);
          router.refresh();
        }}
      />

      <ConfirmDialog
        open={deleting !== undefined}
        onOpenChange={(next) => {
          if (!next) {
            setDeleting(undefined);
          }
        }}
        title={`Delete ${deleting?.firstName ?? ''} ${deleting?.lastName ?? ''}?`}
        description={
          <>
            This is for a record created by mistake. For a student who has left, use{' '}
            <span className="text-foreground">Mark as left</span> instead — deleting removes them
            from the register.
          </>
        }
        requireTyping={deleting?.grNo}
        confirmLabel="Delete record"
        onConfirm={async () => {
          const target = deleting;
          if (target === undefined) {
            return;
          }
          await mutateOrThrow(ROUTES.students.remove(target.id), 'DELETE', {
            reason: 'Record created in error, deleted from the student list',
          });
          toast.success(`${target.firstName} ${target.lastName} deleted`);
          router.refresh();
        }}
      />
    </div>
  );
}
