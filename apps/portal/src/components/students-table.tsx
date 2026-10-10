'use client';

import {
  ROUTES,
  STUDENT_STATUSES,
  type StudentListItem,
  type StudentListQuery,
} from '@ilm/contracts';
import {
  Button,
  CardTable,
  ConfirmDialog,
  DateDisplay,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
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
  CalendarIcon,
  ClassIcon,
  CreateIcon,
  DeleteIcon,
  EditIcon,
  FeesIcon,
  MoreIcon,
  PhoneIcon,
  StudentsIcon,
} from '@ilm/ui/icons';
import { minorUnits } from '@ilm/utils';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useMemo, useRef, useState, useTransition } from 'react';

import { EditStudentDialog } from './edit-student-dialog';

import { StudentAdmissionAvatar } from '@/components/dashboard/student-admission-avatar';
import { ListPageToolbar } from '@/components/list-page-toolbar';
import { WorkspacePageHeader } from '@/components/workspace-page-header';
import { mutateOrThrow } from '@/lib/mutate';
import { useTenantHref } from '@/lib/use-tenant-href';

function afterMenuAction(action: () => void): void {
  action();
  const swallow = (event: MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
  };
  document.addEventListener('click', swallow, true);
  window.setTimeout(() => {
    document.removeEventListener('click', swallow, true);
  }, 100);
}

const STATUS_TONE: Record<string, 'success' | 'neutral' | 'warning' | 'danger'> = {
  ACTIVE: 'success',
  INACTIVE: 'neutral',
  GRADUATED: 'neutral',
  LEFT: 'warning',
  STRUCK_OFF: 'danger',
};

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
  aggregates,
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
  const [searchQuery, setSearchQuery] = useState(search);
  const searchDebounce = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    setSearchQuery(search);
  }, [search]);

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
    }

    startTransition(() => {
      router.push(`${pathname}?${updated.toString()}`);
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
    apply({ q: '', status: '', classLevelId: '' });
  }

  function toggleSort(nextKey: StudentSortKey): void {
    if (sort === nextKey) {
      apply({ order: order === 'asc' ? 'desc' : 'asc' });
      return;
    }
    apply({ sort: nextKey, order: 'asc' });
  }

  const columns = useMemo((): CardTableColumn<StudentListItem>[] => {
    return [
      {
        key: 'grNo',
        label: 'GR no.',
        icon: StudentsIcon,
        sortable: true,
        width: 'w-[9%]',
        render: (row) => (
          <span className="font-mono text-xs select-all text-foreground">{row.grNo}</span>
        ),
      },
      {
        key: 'name',
        label: 'Name',
        icon: AccountIcon,
        sortable: true,
        width: 'w-[20%]',
        render: (row) => (
          <div className="flex min-w-0 items-center gap-3">
            <StudentAdmissionAvatar
              firstName={row.firstName}
              lastName={row.lastName}
              photoUrl={row.photoUrl}
            />
            <span className="min-w-0 font-medium text-balance text-foreground">
              {row.firstName} {row.lastName}
            </span>
          </div>
        ),
      },
      {
        key: 'className',
        label: 'Class',
        icon: ClassIcon,
        sortable: true,
        width: 'w-[14%]',
        render: (row) =>
          row.className === null ? (
            <StatusBadge tone="warning" size="sm">
              Not enrolled
            </StatusBadge>
          ) : (
            <span className="inline-flex flex-wrap items-center gap-1.5">
              <StatusBadge tone="neutral" size="sm">
                {row.className}
              </StatusBadge>
              {row.sectionName === null ? null : (
                <StatusBadge tone="neutral" size="sm">
                  {row.sectionName}
                </StatusBadge>
              )}
            </span>
          ),
      },
      {
        key: 'father',
        label: 'Father / guardian',
        icon: AccountIcon,
        width: 'w-[14%]',
        hideOnMobile: true,
        render: (row) =>
          row.fatherName === null ? (
            <span className="text-warning">No guardian on file</span>
          ) : (
            <span>{row.fatherName}</span>
          ),
      },
      {
        key: 'contact',
        label: 'Contact',
        icon: PhoneIcon,
        width: 'w-[12%]',
        hideOnMobile: true,
        render: (row) =>
          row.guardianPhone === null ? (
            <span className="text-muted-foreground">—</span>
          ) : (
            <a
              href={`tel:${row.guardianPhone}`}
              className="font-mono text-xs underline"
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
        width: 'w-[10%]',
        render: (row) => (
          <StatusBadge tone={STATUS_TONE[row.status] ?? 'neutral'}>{humanise(row.status)}</StatusBadge>
        ),
      },
      {
        key: 'tuition',
        label: 'Tuition',
        icon: FeesIcon,
        align: 'end',
        width: 'w-[10%]',
        hideOnMobile: true,
        render: (row) =>
          row.tuitionFeeMinor === null ? (
            <span className="text-muted-foreground">—</span>
          ) : (
            <Money valueMinor={minorUnits(row.tuitionFeeMinor)} className="font-mono tabular-nums" />
          ),
      },
      {
        key: 'createdAt',
        label: 'Admitted',
        icon: CalendarIcon,
        sortable: true,
        width: 'w-[11%]',
        hideOnMobile: true,
        render: (row) =>
          row.admittedOn === null ? (
            <span className="text-muted-foreground">—</span>
          ) : (
            <DateDisplay value={row.admittedOn} />
          ),
      },
      {
        key: 'actions',
        label: 'Actions',
        align: 'end',
        width: 'w-[8%]',
        render: (row) =>
          !can.update && !can.delete ? (
            <span className="text-muted-foreground">—</span>
          ) : (
            <div className="flex justify-end" data-stop-row-click>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    type="button"
                    tone="ghost"
                    size="icon"
                    className="size-8 text-muted-foreground hover:text-foreground"
                    aria-label={`Actions for ${row.firstName} ${row.lastName}`}
                    onClick={(event) => {
                      event.stopPropagation();
                    }}
                  >
                    <MoreIcon className="size-4" aria-hidden="true" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent
                  align="end"
                  className="w-48"
                  onCloseAutoFocus={(event) => {
                    event.preventDefault();
                  }}
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
                      <EditIcon className="size-4" aria-hidden="true" />
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
                        <DeleteIcon className="size-4" aria-hidden="true" />
                        Delete record
                      </DropdownMenuItem>
                    </>
                  ) : null}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          ),
      },
    ];
  }, [can.delete, can.update]);

  return (
    <div className="w-full space-y-6">
      <WorkspacePageHeader
        title="Students"
        description={
          <>
            {total} {total === 1 ? 'student' : 'students'}
            {aggregates['totalActive'] === undefined
              ? ''
              : ` · ${aggregates['totalActive']} active`}
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
        searchPlaceholder="Name or GR no."
        searchAriaLabel="Search students"
        filters={
          <>
            <SimpleSelect
              className="w-full sm:w-44"
              ariaLabel="Filter by class"
              value={classLevelId}
              emptyOption={{ value: '', label: 'Any class' }}
              placeholder="Any class"
              disabled={classes.length === 0}
              onValueChange={(value) => {
                apply({ classLevelId: value });
              }}
              options={classes.map((entry) => ({ value: entry.id, label: entry.name }))}
            />
            <SimpleSelect
              className="w-full sm:w-44"
              ariaLabel="Filter by status"
              value={status}
              emptyOption={{ value: '', label: 'Any status' }}
              placeholder="Any status"
              onValueChange={(value) => {
                apply({ status: value });
              }}
              options={STUDENT_STATUSES.map((value) => ({ value, label: humanise(value) }))}
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

      <div
        aria-busy={isPending}
        className={isPending ? 'space-y-6 opacity-60 transition-opacity' : 'space-y-6'}
      >
        <CardTable
          title="All students"
          caption="Students"
          rows={rows}
          columns={columns}
          rowKey={(row) => row.id}
          minWidthClass="min-w-[56rem]"
          isFiltered={isFiltered}
          onClearFilters={clearFilters}
          sort={{
            key: sort,
            direction: order,
            onToggle: (key) => {
              toggleSort(key as StudentSortKey);
            },
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

        {total === 0 ? null : (
          <Pagination
            total={total}
            limit={limit}
            offset={offset}
            label="students"
            onChange={(next) => {
              apply({ offset: next === 0 ? '' : String(next) });
            }}
          />
        )}
      </div>

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
