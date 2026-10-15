'use client';

import {
  ROUTES,
  ASSIGNABLE_STAFF_ROLES,
  STAFF_ROLE_LABELS,
  staffRoleCanSignIn,
  type BulkDeleteStaffResult,
  type StaffInviteResult,
  type StaffListItem,
} from '@ilm/contracts';
import {
  Button,
  ConfirmDialog,
  DateDisplay,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
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
  CreateIcon,
  DesignationIcon,
  DeleteIcon,
  EditIcon,
  FeesIcon,
  ICON_SIZE,
  MoreIcon,
  SendIcon,
  StudentsIcon,
  ViewIcon,
} from '@ilm/ui/icons';
import { minorUnits } from '@ilm/utils';
import type { Route } from 'next';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useMemo, useState, useTransition } from 'react';

import { ListDataTable } from '@/components/list-data-table';
import { ListTablePaginationFooter } from '@/components/list-table-pagination-footer';
import { ListTableScreen } from '@/components/list-table-screen';
import { TableSelectionBar } from '@/components/table-selection-bar';
import { useDebouncedSearchFilter } from '@/components/fees/fee-list-shared';
import { ListPageToolbar } from '@/components/list-page-toolbar';
import { nextSortParams } from '@/lib/list-page';
import { listTableSelectColumn, useRowSelection } from '@/lib/use-row-selection';
import { StaffDialog } from '@/components/staff-dialog';
import { WorkspacePageHeader } from '@/components/workspace-page-header';
import { pageIntro } from '@/lib/page-copy';
import { mutate } from '@/lib/mutate';
import { useTenantHref } from '@/lib/use-tenant-href';

// The school owner (Admin) is not on the staff list, so is not a filter either.
const ROLE_OPTIONS = ASSIGNABLE_STAFF_ROLES.map((value) => ({
  value,
  label: STAFF_ROLE_LABELS[value],
}));

const GENDER_OPTIONS = [
  { value: 'MALE', label: 'Male' },
  { value: 'FEMALE', label: 'Female' },
  { value: 'OTHER', label: 'Other' },
];

export interface StaffTableProps {
  rows: StaffListItem[];
  total: number;
  limit: number;
  offset: number;
  error?: string | undefined;
  search: string;
  role: string;
  gender: string;
  sort: 'name' | 'employeeNo' | 'role' | 'createdAt';
  order: 'asc' | 'desc';
  canManage: boolean;
}

export function StaffTable({
  rows,
  total,
  limit,
  offset,
  error,
  search,
  role,
  gender,
  sort,
  order,
  canManage,
}: StaffTableProps) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const toast = useToast();
  const [, startTransition] = useTransition();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<StaffListItem | undefined>(undefined);
  const [deleting, setDeleting] = useState<StaffListItem | undefined>(undefined);
  const [inviting, setInviting] = useState<string | undefined>(undefined);
  const [pendingBulkDelete, setPendingBulkDelete] = useState(false);
  const [isBulkDeleting, setIsBulkDeleting] = useState(false);

  const {
    selected,
    clearSelection,
    allOnPageSelected,
    someOnPageSelected,
    toggleAllOnPage,
    toggleRowSelected,
  } = useRowSelection(rows, (row) => row.id);

  async function sendInvite(row: StaffListItem) {
    setInviting(row.id);
    const result = await mutate<StaffInviteResult>(ROUTES.staff.invite(row.id), 'POST');
    setInviting(undefined);

    if (!result.ok) {
      toast.error(result.message);
      return;
    }

    if (result.data.sent) {
      toast.success(`Invitation sent to ${result.data.email}.`);
    } else {
      toast.warning('Invitation created, but the email did not send.');
    }

    router.refresh();
  }

  function apply(next: Record<string, string>) {
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
      clearSelection();
    }

    startTransition(() => {
      router.push(`${pathname}?${query.toString()}`);
    });
  }

  const { searchQuery, onSearchQueryChange } = useDebouncedSearchFilter(search, (value) => {
    apply({ q: value });
  });

  function toggleSort(columnKey: string) {
    const next = nextSortParams(sort, order, columnKey);
    apply({ sort: next.sort, order: next.order });
  }

  function clearFilters(): void {
    apply({ q: '', role: '', gender: '' });
  }

  async function confirmBulkDelete() {
    setIsBulkDeleting(true);
    const result = await mutate<BulkDeleteStaffResult>(ROUTES.staff.bulkDelete, 'POST', {
      ids: [...selected],
      reason: 'Removed from the staff list',
    });
    setIsBulkDeleting(false);
    setPendingBulkDelete(false);

    if (!result.ok) {
      toast.error(result.message);
      return;
    }

    const { deleted, skipped } = result.data;
    toast.success(deleted === 1 ? '1 staff member removed.' : `${String(deleted)} staff members removed.`);
    if (skipped.length > 0) {
      toast.warning(`${String(skipped.length)} were already removed.`);
    }
    clearSelection();
    router.refresh();
  }

  async function confirmDelete() {
    if (deleting === undefined) {
      return;
    }

    const result = await mutate(ROUTES.staff.remove(deleting.id), 'DELETE', {
      reason: 'Removed from the staff list',
    });

    if (!result.ok) {
      toast.error(result.message);
      setDeleting(undefined);
      return;
    }

    toast.success(
      deleting.hasLogin
        ? `${deleting.name} removed and portal access revoked.`
        : `${deleting.name} removed.`,
    );
    setDeleting(undefined);
    router.refresh();
  }

  const isFiltered = search !== '' || role !== '' || gender !== '';

  const columns = useMemo((): CardTableColumn<StaffListItem>[] => {
    return [
      listTableSelectColumn({
        selected,
        allOnPageSelected,
        someOnPageSelected,
        toggleAllOnPage,
        toggleRowSelected,
        getRowId: (row) => row.id,
        rowAriaLabel: (row) => row.name,
        selectAllAriaLabel: 'Select every staff member on this page',
      }),
      {
        key: 'name',
        label: 'Name',
        icon: AccountIcon,
        width: 'w-[22%]',
        sortable: true,
        render: (row) => (
          <TwoLineCell
            primary={row.name}
            secondary={row.email === null || row.email === '' ? '—' : row.email}
          />
        ),
      },
      {
        key: 'role',
        label: 'Role',
        icon: StudentsIcon,
        width: 'w-[12%]',
        sortable: true,
        render: (row) => <StatusBadge tone="info">{STAFF_ROLE_LABELS[row.role]}</StatusBadge>,
      },
      {
        key: 'status',
        label: 'Status',
        icon: AccountIcon,
        width: 'w-[13%]',
        render: (row) => <StaffStatusCell row={row} />,
      },
      {
        key: 'gender',
        label: 'Gender',
        icon: AccountIcon,
        width: 'w-[9%]',
        hideOnMobile: true,
        render: (row) =>
          row.gender === null ? (
            <span className="text-sm text-muted-foreground">—</span>
          ) : (
            <StatusBadge tone="warning">
              {row.gender.charAt(0) + row.gender.slice(1).toLowerCase()}
            </StatusBadge>
          ),
      },
      {
        key: 'casual',
        label: 'Casual',
        icon: AccountIcon,
        width: 'w-[8%]',
        hideOnMobile: true,
        render: (row) => <span className="text-sm tabular-nums">{row.casualLeaves}</span>,
      },
      {
        key: 'sick',
        label: 'Sick',
        icon: AccountIcon,
        width: 'w-[8%]',
        hideOnMobile: true,
        render: (row) => <span className="text-sm tabular-nums">{row.sickLeaves}</span>,
      },
      {
        key: 'salary',
        label: 'Salary',
        icon: FeesIcon,
        width: 'w-[11%]',
        render: (row) => (
          <span className="text-sm">
            <Money valueMinor={minorUnits(row.basicSalaryMinor)} dashOnZero />
          </span>
        ),
      },
      {
        key: 'createdAt',
        label: 'Created at',
        icon: CalendarIcon,
        width: 'w-[10%]',
        hideOnMobile: true,
        sortable: true,
        render: (row) => (
          <span className="text-sm text-foreground">
            <DateDisplay value={row.createdAt} />
          </span>
        ),
      },
      {
        key: 'actions',
        label: 'Actions',
        width: 'w-[7%]',
        render: (row) => (
          <StaffRowActions
            row={row}
            canManage={canManage}
            inviting={inviting === row.id}
            busy={inviting !== undefined}
            onInvite={() => {
              void sendInvite(row);
            }}
            onEdit={() => {
              setEditing(row);
              setDialogOpen(true);
            }}
            onDelete={() => {
              setDeleting(row);
            }}
          />
        ),
      },
    ];
  }, [
    allOnPageSelected,
    canManage,
    inviting,
    selected,
    someOnPageSelected,
    toggleAllOnPage,
    toggleRowSelected,
  ]);

  return (
    <div className="w-full space-y-6">
      <WorkspacePageHeader title="Staff" description={pageIntro('/staff')} />

      {error !== undefined ? (
        <div
          role="alert"
          className="rounded-md border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-danger"
        >
          {error}
        </div>
      ) : null}

      <ListTableScreen
        tableTitle="All staff"
        filters={
          <ListPageToolbar
            searchQuery={searchQuery}
            onSearchQueryChange={onSearchQueryChange}
            searchPlaceholder="Name or email"
            searchAriaLabel="Search staff"
            filters={
              <>
                <SimpleSelect
                  className="w-full min-w-32 sm:w-36"
                  value={role}
                  triggerIcon={DesignationIcon}
                  onValueChange={(next) => {
                    apply({ role: next });
                  }}
                  options={ROLE_OPTIONS}
                  ariaLabel="Filter by role"
                  emptyOption={{ value: '', label: 'Any role' }}
                />
                <SimpleSelect
                  className="w-full min-w-32 sm:w-36"
                  value={gender}
                  triggerIcon={StudentsIcon}
                  onValueChange={(next) => {
                    apply({ gender: next });
                  }}
                  options={GENDER_OPTIONS}
                  ariaLabel="Filter by gender"
                  emptyOption={{ value: '', label: 'Any gender' }}
                />
                {canManage ? (
                  <Button
                    className="w-full sm:w-auto"
                    onClick={() => {
                      setEditing(undefined);
                      setDialogOpen(true);
                    }}
                  >
                    <CreateIcon className={ICON_SIZE.inline} aria-hidden />
                    Add staff
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
            label="staff"
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
          title="All staff"
          caption="Staff"
          rows={rows}
          columns={columns}
          rowKey={(row) => row.id}
          isFiltered={isFiltered}
          onClearFilters={clearFilters}
          sort={{
            key: sort,
            direction: order,
            onToggle: toggleSort,
          }}
          empty={{
            title: 'Nobody on the staff list yet',
            description:
              'Add the people who work here — teachers, office staff, and anyone else on the payroll. Only some roles need a portal login.',
            action: canManage ? (
              <Button
                onClick={() => {
                  setEditing(undefined);
                  setDialogOpen(true);
                }}
              >
                <CreateIcon className={ICON_SIZE.inline} aria-hidden />
                Add the first person
              </Button>
            ) : undefined,
          }}
          renderMobileRow={(row) => (
            <div className="px-4 py-3">
              <TwoLineCell
                primary={row.name}
                secondary={STAFF_ROLE_LABELS[row.role]}
              />
            </div>
          )}
        />
      </ListTableScreen>

      {canManage ? (
        <TableSelectionBar
          count={selected.size}
          noun="staff member"
          onClear={clearSelection}
          actions={
            <Button
              tone="danger"
              size="sm"
              disabled={isBulkDeleting}
              onClick={() => {
                setPendingBulkDelete(true);
              }}
            >
              <DeleteIcon className={ICON_SIZE.inline} aria-hidden />
              Delete selected
            </Button>
          }
        />
      ) : (
        <TableSelectionBar count={selected.size} noun="staff member" onClear={clearSelection} />
      )}

      {dialogOpen ? (
        <StaffDialog
          key={editing?.id ?? 'new'}
          editing={editing}
          onClose={() => {
            setDialogOpen(false);
            setEditing(undefined);
          }}
        />
      ) : null}

      <ConfirmDialog
        open={pendingBulkDelete}
        onOpenChange={(open) => {
          if (!open) {
            setPendingBulkDelete(false);
          }
        }}
        title={
          selected.size === 1
            ? 'Remove 1 staff member?'
            : `Remove ${String(selected.size)} staff members?`
        }
        description="Their employment records are kept for payroll history, but any portal access they have ends immediately."
        confirmLabel="Remove"
        tone="danger"
        onConfirm={() => {
          void confirmBulkDelete();
        }}
      />

      <ConfirmDialog
        open={deleting !== undefined}
        onOpenChange={(open) => {
          if (!open) {
            setDeleting(undefined);
          }
        }}
        title={`Remove ${deleting?.name ?? ''}?`}
        description={
          deleting?.hasLogin === true
            ? 'Their employment record is kept — payroll and any inspection will ask who worked here — but their portal access ends immediately.'
            : 'Their employment record is kept, so the payroll history stays intact. They stop appearing on the staff list.'
        }
        confirmLabel="Remove"
        tone="danger"
        onConfirm={confirmDelete}
      />
    </div>
  );
}

function StaffStatusCell({ row }: { row: StaffListItem }) {
  if (row.invitePending) {
    return <StatusBadge tone="warning">Invited</StatusBadge>;
  }
  if (row.hasLogin) {
    return <StatusBadge tone="success">Active</StatusBadge>;
  }
  if (staffRoleCanSignIn(row.role)) {
    return <StatusBadge tone="neutral">No login</StatusBadge>;
  }
  return <StatusBadge tone="neutral">Payroll only</StatusBadge>;
}

function StaffRowActions({
  row,
  canManage,
  inviting,
  busy,
  onInvite,
  onEdit,
  onDelete,
}: {
  row: StaffListItem;
  canManage: boolean;
  inviting: boolean;
  busy: boolean;
  onInvite: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const tenantHref = useTenantHref();
  const profileHref = tenantHref(`/staff/${row.id}` as Route);
  // Only while there is something to send: no account yet, or one still waiting
  // on its password. Once they have signed in the invitation has done its job.
  const canInvite =
    canManage &&
    staffRoleCanSignIn(row.role) &&
    row.email !== null &&
    row.email !== '' &&
    (row.invitePending || !row.hasLogin);

  return (
    <div className="flex justify-start" data-stop-row-click>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            tone="ghost"
            size="icon"
            className="size-8 text-muted-foreground hover:text-foreground"
            disabled={busy}
            aria-label={`Actions for ${row.name}`}
          >
            <MoreIcon className="size-4" aria-hidden="true" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-48">
          <DropdownMenuItem asChild>
            <Link href={profileHref}>
              <ViewIcon className="size-4" aria-hidden="true" />
              View profile
            </Link>
          </DropdownMenuItem>
          {canInvite ? (
            <DropdownMenuItem
              disabled={busy}
              onSelect={() => {
                onInvite();
              }}
            >
              <SendIcon className="size-4" aria-hidden="true" />
              {inviting ? 'Sending…' : row.invitePending ? 'Re-send invite' : 'Send invite'}
            </DropdownMenuItem>
          ) : null}
          {canManage ? (
            <>
              <DropdownMenuItem
                disabled={busy}
                onSelect={() => {
                  onEdit();
                }}
              >
                <EditIcon className="size-4" aria-hidden="true" />
                Edit staff
              </DropdownMenuItem>
              <DropdownMenuItem
                disabled={busy}
                className="text-danger focus:text-danger"
                onSelect={() => {
                  onDelete();
                }}
              >
                <DeleteIcon className="size-4" aria-hidden="true" />
                Remove staff
              </DropdownMenuItem>
            </>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
