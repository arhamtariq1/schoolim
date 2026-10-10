'use client';

import {
  ROUTES,
  STAFF_ROLE_LABELS,
  STAFF_ROLES,
  staffRoleCanSignIn,
  type StaffInviteResult,
  type StaffListItem,
} from '@ilm/contracts';
import {
  Button,
  CardTable,
  ConfirmDialog,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Money,
  Pagination,
  SimpleSelect,
  StatusBadge,
  TwoLineCell,
  useToast,
  type CardTableColumn,
} from '@ilm/ui';
import {
  AccountIcon,
  CreateIcon,
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
import { useEffect, useMemo, useRef, useState, useTransition } from 'react';

import { ListPageToolbar } from '@/components/list-page-toolbar';
import { StaffDialog } from '@/components/staff-dialog';
import { WorkspacePageHeader } from '@/components/workspace-page-header';
import { mutate } from '@/lib/mutate';
import { useTenantHref } from '@/lib/use-tenant-href';

const ROLE_OPTIONS = STAFF_ROLES.map((value) => ({ value, label: STAFF_ROLE_LABELS[value] }));

export interface StaffTableProps {
  rows: StaffListItem[];
  total: number;
  limit: number;
  offset: number;
  error?: string | undefined;
  search: string;
  role: string;
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
  const [searchQuery, setSearchQuery] = useState(search);
  const searchDebounce = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    setSearchQuery(search);
  }, [search]);

  async function sendInvite(row: StaffListItem) {
    setInviting(row.id);
    const result = await mutate<StaffInviteResult>(ROUTES.staff.invite(row.id), 'POST');
    setInviting(undefined);

    if (!result.ok) {
      toast.error(result.message);
      return;
    }

    if (result.data.sent) {
      toast.success(`Invitation sent to ${result.data.email}`, 'The link works once, for 3 days.');
    } else {
      toast.warning(
        'Invitation created, but the email did not go',
        'Check the mail settings, then press Re-send.',
      );
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
    }

    startTransition(() => {
      router.push(`${pathname}?${query.toString()}`);
    });
  }

  function onSearchQueryChange(value: string) {
    setSearchQuery(value);
    if (searchDebounce.current !== undefined) {
      clearTimeout(searchDebounce.current);
    }
    searchDebounce.current = setTimeout(() => {
      apply({ q: value });
    }, 350);
  }

  function clearFilters(): void {
    setSearchQuery('');
    apply({ q: '', role: '' });
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
      `${deleting.name} removed`,
      deleting.hasLogin ? 'Their portal access was revoked immediately.' : undefined,
    );
    setDeleting(undefined);
    router.refresh();
  }

  const isFiltered = search !== '' || role !== '';

  const columns = useMemo((): CardTableColumn<StaffListItem>[] => {
    return [
      {
        key: 'name',
        label: 'Name',
        icon: AccountIcon,
        width: 'w-[24%]',
        render: (row) => (
          <TwoLineCell
            primary={row.name}
            secondary={
              row.email === null || row.email === ''
                ? row.employeeNo
                : `${row.email} · ${row.employeeNo}`
            }
            secondaryMono
          />
        ),
      },
      {
        key: 'role',
        label: 'Role',
        icon: StudentsIcon,
        width: 'w-[14%]',
        render: (row) => (
          <TwoLineCell primary={STAFF_ROLE_LABELS[row.role]} secondary="Job title" />
        ),
      },
      {
        key: 'status',
        label: 'Status',
        icon: AccountIcon,
        width: 'w-[14%]',
        render: (row) => <StaffStatusCell row={row} />,
      },
      {
        key: 'gender',
        label: 'Gender',
        icon: AccountIcon,
        width: 'w-[10%]',
        hideOnMobile: true,
        render: (row) =>
          row.gender === null ? (
            <span className="text-sm text-muted-foreground">—</span>
          ) : (
            <TwoLineCell
              primary={row.gender.charAt(0) + row.gender.slice(1).toLowerCase()}
              secondary="On record"
            />
          ),
      },
      {
        key: 'casual',
        label: 'Casual',
        icon: AccountIcon,
        align: 'end',
        width: 'w-[8%]',
        hideOnMobile: true,
        render: (row) => (
          <TwoLineCell primary={String(row.casualLeaves)} secondary="Days / year" secondaryMono />
        ),
      },
      {
        key: 'sick',
        label: 'Sick',
        icon: AccountIcon,
        align: 'end',
        width: 'w-[8%]',
        hideOnMobile: true,
        render: (row) => (
          <TwoLineCell primary={String(row.sickLeaves)} secondary="Days / year" secondaryMono />
        ),
      },
      {
        key: 'salary',
        label: 'Salary',
        icon: FeesIcon,
        align: 'end',
        width: 'w-[12%]',
        render: (row) => (
          <TwoLineCell
            primary={<Money valueMinor={minorUnits(row.basicSalaryMinor)} dashOnZero />}
            secondary="Basic / month"
          />
        ),
      },
      {
        key: 'actions',
        label: 'Actions',
        align: 'end',
        width: 'w-[10%]',
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
  }, [canManage, inviting]);

  return (
    <div className="w-full space-y-6">
      <WorkspacePageHeader
        title="Staff"
        description={
          <>
            {total} {total === 1 ? 'person' : 'people'} on the payroll
          </>
        }
      />

      {error !== undefined ? (
        <div
          role="alert"
          className="rounded-md border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-danger"
        >
          {error}
        </div>
      ) : null}

      <ListPageToolbar
        searchQuery={searchQuery}
        onSearchQueryChange={onSearchQueryChange}
        searchPlaceholder="Name, email or ID"
        searchAriaLabel="Search staff"
        filters={
          <>
            <SimpleSelect
              className="w-full sm:w-44"
              value={role}
              onValueChange={(next) => {
                apply({ role: next });
              }}
              options={ROLE_OPTIONS}
              ariaLabel="Filter by role"
              emptyOption={{ value: '', label: 'Any role' }}
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

      <CardTable
        title="All staff"
        caption="Staff"
        rows={rows}
        columns={columns}
        rowKey={(row) => row.id}
        isFiltered={isFiltered}
        onClearFilters={clearFilters}
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
              secondary={`${STAFF_ROLE_LABELS[row.role]} · ${row.employeeNo}`}
            />
          </div>
        )}
      />

      {total === 0 ? null : (
        <Pagination
          total={total}
          limit={limit}
          offset={offset}
          label="staff"
          onChange={(next) => {
            apply({ offset: next === 0 ? '' : String(next) });
          }}
        />
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
    return (
      <TwoLineCell
        primary={
          <StatusBadge tone="warning" size="sm">
            Invited
          </StatusBadge>
        }
        secondary="Awaiting password"
      />
    );
  }
  if (row.hasLogin) {
    return (
      <TwoLineCell
        primary={
          <StatusBadge tone="success" size="sm">
            Active login
          </StatusBadge>
        }
        secondary="Portal access"
      />
    );
  }
  if (staffRoleCanSignIn(row.role)) {
    return (
      <TwoLineCell
        primary={
          <StatusBadge tone="neutral" size="sm">
            No login
          </StatusBadge>
        }
        secondary="Send invite"
      />
    );
  }
  return (
    <TwoLineCell
      primary={
        <StatusBadge tone="neutral" size="sm">
          Payroll only
        </StatusBadge>
      }
      secondary="No portal role"
    />
  );
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
  const canInvite =
    canManage && staffRoleCanSignIn(row.role) && row.email !== null && row.email !== '';

  return (
    <div className="flex justify-end" data-stop-row-click>
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
              {inviting ? 'Sending…' : row.hasLogin ? 'Re-send invite' : 'Send invite'}
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
