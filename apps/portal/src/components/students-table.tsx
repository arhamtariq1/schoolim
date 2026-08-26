'use client';

import { ROUTES, STUDENT_STATUSES, type StudentListItem } from '@ilm/contracts';
import {
  Button,
  ConfirmDialog,
  DataTable,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  SimpleSelect,
  StatusBadge,
  useToast,
  type Column,
} from '@ilm/ui';
import { CreateIcon, DeleteIcon, EditIcon, MoreIcon, SearchIcon } from '@ilm/ui/icons';
import { useRouter } from 'next/navigation';
import { usePathname, useSearchParams } from 'next/navigation';
import { useState, useTransition, type FormEvent } from 'react';

import { AdmitStudentDialog, type ClassOption } from './admit-student-dialog';
import { EditStudentDialog } from './edit-student-dialog';

import { mutateOrThrow } from '@/lib/mutate';

/**
 * The student list.
 *
 * Filters live in the URL, not in component state: a filtered view is then a
 * link someone can paste to a colleague, it survives a refresh, and the back
 * button does what it should. `useTransition` keeps the previous rows on screen
 * while the new ones load rather than flashing a skeleton over data that is
 * about to be almost identical (docs/16 §7).
 *
 * Row actions sit behind one menu rather than four buttons per row. Thirteen
 * rows with four visible actions is fifty-two tap targets competing for
 * attention; one "⋯" per row is one.
 */

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

export interface StudentsTableProps {
  rows: StudentListItem[];
  total: number;
  aggregates: Record<string, number>;
  error?: string | undefined;
  search: string;
  status: string;
  isFiltered: boolean;
  /** Server-rendered, so the admission form has classes without a round trip. */
  classes: readonly ClassOption[];
  sessionId: string | undefined;
  can: { create: boolean; update: boolean; delete: boolean };
}

export function StudentsTable({
  rows,
  total,
  aggregates,
  error,
  search,
  status,
  isFiltered,
  classes,
  sessionId,
  can,
}: StudentsTableProps) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [isPending, startTransition] = useTransition();
  const toast = useToast();

  const [admitting, setAdmitting] = useState(false);
  const [editing, setEditing] = useState<StudentListItem | undefined>(undefined);
  const [deleting, setDeleting] = useState<StudentListItem | undefined>(undefined);
  const [leaving, setLeaving] = useState<StudentListItem | undefined>(undefined);

  function apply(next: Record<string, string>) {
    const updated = new URLSearchParams(params.toString());
    for (const [key, value] of Object.entries(next)) {
      if (value === '') {
        updated.delete(key);
      } else {
        updated.set(key, value);
      }
    }
    startTransition(() => {
      router.replace(`${pathname}?${updated.toString()}`);
    });
  }

  const columns: Column<StudentListItem>[] = [
    {
      key: 'grNo',
      header: 'GR no.',
      // Monospace and selectable: it is read aloud and copied constantly, and
      // it is the number written on the physical file.
      render: (row) => <span className="font-mono text-xs select-all">{row.grNo}</span>,
    },
    {
      key: 'admissionNo',
      header: 'Admission no.',
      hideOnMobile: true,
      render: (row) => (
        <span className="font-mono text-xs text-muted-foreground select-all">
          {row.admissionNo}
        </span>
      ),
    },
    {
      key: 'name',
      header: 'Name',
      render: (row) => (
        <span className="font-medium text-balance">
          {row.firstName} {row.lastName}
        </span>
      ),
    },
    {
      key: 'class',
      header: 'Class',
      render: (row) =>
        row.className === null ? (
          <span className="text-muted-foreground">Not enrolled</span>
        ) : (
          <span>
            {row.className}
            {row.sectionName === null ? '' : ` — ${row.sectionName}`}
          </span>
        ),
    },
    {
      key: 'roll',
      header: 'Roll',
      align: 'end',
      hideOnMobile: true,
      render: (row) => <span className="font-mono text-xs tabular-nums">{row.rollNo ?? '—'}</span>,
    },
    {
      key: 'guardian',
      header: 'Guardian',
      render: (row) =>
        row.guardianName === null ? (
          // Named plainly: this is a task-queue item, not a cosmetic gap.
          <span className="text-warning">No guardian on file</span>
        ) : (
          <div>
            <div>{row.guardianName}</div>
            {row.guardianPhone === null ? null : (
              <a
                href={`tel:${row.guardianPhone}`}
                className="font-mono text-xs text-muted-foreground underline"
                onClick={(event) => {
                  // The row opens the student; the phone link must not.
                  event.stopPropagation();
                }}
              >
                {row.guardianPhone}
              </a>
            )}
          </div>
        ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (row) => (
        <StatusBadge tone={STATUS_TONE[row.status] ?? 'neutral'}>
          {humanise(row.status)}
        </StatusBadge>
      ),
    },
    {
      key: 'actions',
      header: '',
      align: 'end',
      render: (row) =>
        !can.update && !can.delete ? null : (
          <DropdownMenu>
            <DropdownMenuTrigger
              className="rounded-md p-2 text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
              aria-label={`Actions for ${row.firstName} ${row.lastName}`}
              onClick={(event) => {
                event.stopPropagation();
              }}
            >
              <MoreIcon className="size-4" aria-hidden="true" />
            </DropdownMenuTrigger>

            <DropdownMenuContent>
              <DropdownMenuLabel>
                {row.firstName} {row.lastName}
              </DropdownMenuLabel>
              <DropdownMenuSeparator />

              {can.update ? (
                <DropdownMenuItem
                  onSelect={() => {
                    setEditing(row);
                  }}
                >
                  <EditIcon aria-hidden="true" />
                  Edit details
                </DropdownMenuItem>
              ) : null}

              {can.update && row.status === 'ACTIVE' ? (
                <DropdownMenuItem
                  onSelect={() => {
                    setLeaving(row);
                  }}
                >
                  Mark as left
                </DropdownMenuItem>
              ) : null}

              {can.delete ? (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    destructive
                    onSelect={() => {
                      setDeleting(row);
                    }}
                  >
                    <DeleteIcon aria-hidden="true" />
                    Delete record
                  </DropdownMenuItem>
                </>
              ) : null}
            </DropdownMenuContent>
          </DropdownMenu>
        ),
    },
  ];

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Students</h1>
          <p className="text-sm text-muted-foreground">
            {total} {total === 1 ? 'student' : 'students'}
            {aggregates['totalActive'] === undefined
              ? ''
              : ` · ${aggregates['totalActive']} active`}
          </p>
        </div>

        {can.create ? (
          <Button
            onClick={() => {
              setAdmitting(true);
            }}
          >
            <CreateIcon className="size-4" aria-hidden="true" />
            Admit student
          </Button>
        ) : null}
      </header>

      <form
        role="search"
        className="flex flex-wrap items-center gap-2"
        onSubmit={(event: FormEvent<HTMLFormElement>) => {
          event.preventDefault();
          const value = new FormData(event.currentTarget).get('q');
          apply({ q: typeof value === 'string' ? value : '' });
        }}
      >
        <div className="relative min-w-56 flex-1">
          <SearchIcon
            className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <input
            type="search"
            name="q"
            defaultValue={search}
            placeholder="Name, GR or admission number"
            aria-label="Search students"
            className="h-10 w-full rounded-md border border-border bg-background ps-9 pe-3 text-sm focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          />
        </div>

        <SimpleSelect
          className="w-44"
          ariaLabel="Filter by status"
          value={status}
          emptyOption={{ value: '', label: 'Any status' }}
          placeholder="Any status"
          onValueChange={(value) => {
            apply({ status: value });
          }}
          options={STUDENT_STATUSES.map((value) => ({ value, label: humanise(value) }))}
        />

        <Button type="submit" tone="outline" isPending={isPending}>
          Search
        </Button>
      </form>

      <div
        aria-busy={isPending}
        className={isPending ? 'opacity-60 transition-opacity' : undefined}
      >
        <DataTable
          rows={rows}
          columns={columns}
          rowKey={(row) => row.id}
          caption="Students"
          {...(error === undefined ? {} : { error })}
          isFiltered={isFiltered}
          onClearFilters={() => {
            apply({ q: '', status: '' });
          }}
          empty={{
            title: 'No students yet',
            description:
              'A student is admitted with a GR number, a class and a guardian. Admitting the first one takes about a minute.',
          }}
        />
      </div>

      <AdmitStudentDialog
        open={admitting}
        onOpenChange={setAdmitting}
        sessionId={sessionId}
        classes={classes}
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

      {/* Leaving is a status change, not a delete: the child stays in the
          register. The reason is required because the register has to say why. */}
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

      {/* Delete is for a record created in error. Typing the GR number is
          deliberately annoying — it is the number on the physical file, so it
          forces the operator to confirm they have the right child. */}
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
