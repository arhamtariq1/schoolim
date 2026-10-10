'use client';

import {
  createSessionSchema,
  ROUTES,
  SESSION_STATUSES,
  type AcademicSession,
} from '@ilm/contracts';
import {
  Button,
  CardTable,
  ConfirmDialog,
  DateDisplay,
  DatePicker,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Field,
  Input,
  SimpleSelect,
  StatusBadge,
  TwoLineCell,
  type CardTableColumn,
  useToast,
} from '@ilm/ui';
import {
  ApproveIcon,
  CalendarIcon,
  CreateIcon,
  DeleteIcon,
  EditIcon,
  ICON_SIZE,
  MoreIcon,
  SessionIcon,
  StudentsIcon,
} from '@ilm/ui/icons';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState, type FormEvent } from 'react';

import { WorkspacePageHeader } from '@/components/workspace-page-header';

import { mutate } from '@/lib/mutate';

/**
 * Academic sessions — the axis everything else hangs off (docs/07 §3).
 *
 * ## The one thing this screen must get right
 *
 * **Exactly one session is current.** Sections, enrolments, fee structures and
 * attendance all resolve through it, so a school with none has an admission
 * form that silently cannot enrol anybody, and a school with two has screens
 * that disagree about which year it is. The database enforces it with a partial
 * unique index; this screen makes it a single visible action rather than a
 * checkbox someone can tick twice.
 */

const STATUS_OPTIONS = SESSION_STATUSES.map((value) => ({
  value,
  label: value.charAt(0) + value.slice(1).toLowerCase(),
}));

const STATUS_TONE: Record<string, 'success' | 'neutral' | 'warning'> = {
  ACTIVE: 'success',
  PLANNED: 'warning',
  CLOSED: 'neutral',
};

export interface SessionsManagerProps {
  sessions: AcademicSession[];
  error?: string | undefined;
  canConfigure: boolean;
}

export function SessionsManager({ sessions, error, canConfigure }: SessionsManagerProps) {
  const router = useRouter();
  const toast = useToast();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<AcademicSession | undefined>(undefined);
  const [deleting, setDeleting] = useState<AcademicSession | undefined>(undefined);
  const [busyId, setBusyId] = useState<string | undefined>(undefined);
  const [sortKey, setSortKey] = useState<'name' | 'startDate' | 'status'>('name');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  const hasCurrent = sessions.some((entry) => entry.isCurrent);

  const sortedSessions = useMemo(() => {
    const list = [...sessions];
    const dir = sortDir === 'asc' ? 1 : -1;
    list.sort((left, right) => {
      let cmp = 0;
      if (sortKey === 'name') {
        cmp = left.name.localeCompare(right.name);
      } else if (sortKey === 'startDate') {
        cmp = left.startDate.localeCompare(right.startDate);
      } else {
        cmp = left.status.localeCompare(right.status);
      }
      return cmp * dir;
    });
    return list;
  }, [sessions, sortKey, sortDir]);

  function toggleSort(key: 'name' | 'startDate' | 'status'): void {
    if (sortKey === key) {
      setSortDir((current) => (current === 'asc' ? 'desc' : 'asc'));
      return;
    }
    setSortKey(key);
    setSortDir('asc');
  }

  async function makeCurrent(entry: AcademicSession) {
    setBusyId(entry.id);
    const result = await mutate(ROUTES.academics.makeSessionCurrent(entry.id), 'POST');
    setBusyId(undefined);

    if (!result.ok) {
      toast.error(result.message);
      return;
    }

    toast.success(`${entry.name} is now the current session`);
    router.refresh();
  }

  async function confirmDelete() {
    if (deleting === undefined) {
      return;
    }
    setBusyId(deleting.id);
    const result = await mutate(ROUTES.academics.session(deleting.id), 'DELETE');
    setBusyId(undefined);

    if (!result.ok) {
      toast.error(result.message);
      setDeleting(undefined);
      return;
    }

    toast.success(`${deleting.name} deleted`);
    setDeleting(undefined);
    router.refresh();
  }

  const columns = useMemo((): CardTableColumn<AcademicSession>[] => {
    return [
      {
        key: 'name',
        label: 'Session',
        icon: SessionIcon,
        sortable: true,
        width: 'w-[24%]',
        render: (row) => (
          <TwoLineCell
            primary={
              <span className="inline-flex flex-wrap items-center gap-2">
                {row.name}
                {row.isCurrent ? (
                  <StatusBadge tone="success" size="sm">
                    Current
                  </StatusBadge>
                ) : null}
              </span>
            }
            secondary={
              row.isCurrent ? 'Current session for enrolments' : 'Academic year'
            }
          />
        ),
      },
      {
        key: 'startDate',
        label: 'Runs',
        icon: CalendarIcon,
        sortable: true,
        width: 'w-[22%]',
        render: (row) => (
          <TwoLineCell
            primary={
              <>
                <DateDisplay value={row.startDate} /> — <DateDisplay value={row.endDate} />
              </>
            }
            secondary="Start to end date"
          />
        ),
      },
      {
        key: 'status',
        label: 'Status',
        icon: SessionIcon,
        sortable: true,
        width: 'w-[14%]',
        render: (row) => (
          <TwoLineCell
            primary={
              <StatusBadge tone={STATUS_TONE[row.status] ?? 'neutral'}>
                {row.status.charAt(0) + row.status.slice(1).toLowerCase()}
              </StatusBadge>
            }
            secondary={row.isCurrent ? 'Marked current' : '—'}
          />
        ),
      },
      {
        key: 'sections',
        label: 'Sections',
        icon: SessionIcon,
        align: 'end',
        width: 'w-[12%]',
        hideOnMobile: true,
        render: (row) => (
          <TwoLineCell
            primary={row.sectionCount === 0 ? '—' : String(row.sectionCount)}
            secondary="In this session"
            secondaryMono
          />
        ),
      },
      {
        key: 'students',
        label: 'Enrolled',
        icon: StudentsIcon,
        align: 'end',
        width: 'w-[12%]',
        hideOnMobile: true,
        render: (row) => (
          <TwoLineCell
            primary={row.enrollmentCount === 0 ? '—' : String(row.enrollmentCount)}
            secondary="Students"
            secondaryMono
          />
        ),
      },
      {
        key: 'actions',
        label: 'Actions',
        align: 'end',
        width: 'w-[12%]',
        render: (row) =>
          !canConfigure ? (
            <div className="flex justify-end">
              <span className="text-muted-foreground">—</span>
            </div>
          ) : (
            <SessionRowActions
              row={row}
              busy={busyId !== undefined}
              onMakeCurrent={() => {
                void makeCurrent(row);
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
  }, [busyId, canConfigure]);

  return (
    <div className="space-y-6">
      <WorkspacePageHeader
        title="Academic sessions"
        description="The school year. Sections, enrolments and fees all belong to one, which is what makes rolling over to next year a supported step rather than a data migration."
        actionsBelow={
          canConfigure ? (
            <Button
              onClick={() => {
                setEditing(undefined);
                setDialogOpen(true);
              }}
            >
              <CreateIcon className={ICON_SIZE.inline} aria-hidden />
              Add session
            </Button>
          ) : undefined
        }
      />

      {/* Not a cosmetic warning: with no current session the admission form
          cannot enrol anybody, and nothing on that screen explains why. */}
      {sessions.length > 0 && !hasCurrent ? (
        <div
          role="alert"
          className="rounded-md border border-warning/30 bg-warning/10 px-4 py-3 text-sm"
        >
          <p className="font-medium text-foreground">No session is current</p>
          <p className="mt-1 text-muted-foreground">
            Students cannot be enrolled into a class until one is. Pick a session below and choose
            &ldquo;Make current&rdquo;.
          </p>
        </div>
      ) : null}

      {error !== undefined ? (
        <div
          role="alert"
          className="rounded-md border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-danger"
        >
          {error}
        </div>
      ) : null}

      <CardTable
        title="All sessions"
        caption="Academic sessions"
        rows={sortedSessions}
        columns={columns}
        rowKey={(row) => row.id}
        sort={{
          key: sortKey,
          direction: sortDir,
          onToggle: (key) => {
            toggleSort(key as 'name' | 'startDate' | 'status');
          },
        }}
        empty={{
          title: 'No sessions yet',
          description:
            'A session is one school year — "2026–2027". Classes get their sections inside it, and students are enrolled into those.',
          action: canConfigure ? (
            <Button
              onClick={() => {
                setEditing(undefined);
                setDialogOpen(true);
              }}
            >
              <CreateIcon className={ICON_SIZE.inline} aria-hidden />
              Add the first session
            </Button>
          ) : undefined,
        }}
        renderMobileRow={(row) => (
          <div className="px-4 py-3">
            <TwoLineCell
              primary={row.name}
              secondary={
                <>
                  <DateDisplay value={row.startDate} /> — <DateDisplay value={row.endDate} />
                </>
              }
            />
          </div>
        )}
      />

      {dialogOpen ? (
        <SessionDialog
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
        title={`Delete ${deleting?.name ?? ''}?`}
        description="Nobody is enrolled in it, so nothing is lost."
        confirmLabel="Delete"
        tone="danger"
        onConfirm={confirmDelete}
      />
    </div>
  );
}

function SessionRowActions({
  row,
  busy,
  onMakeCurrent,
  onEdit,
  onDelete,
}: {
  row: AcademicSession;
  busy: boolean;
  onMakeCurrent: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const canMakeCurrent = !row.isCurrent && row.status !== 'CLOSED';
  const canDelete = row.enrollmentCount === 0 && !row.isCurrent;

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
          {canMakeCurrent ? (
            <DropdownMenuItem
              disabled={busy}
              onSelect={() => {
                onMakeCurrent();
              }}
            >
              <ApproveIcon className="size-4" aria-hidden="true" />
              Make current
            </DropdownMenuItem>
          ) : null}
          <DropdownMenuItem
            disabled={busy}
            onSelect={() => {
              onEdit();
            }}
          >
            <EditIcon className="size-4" aria-hidden="true" />
            Edit session
          </DropdownMenuItem>
          {canDelete ? (
            <DropdownMenuItem
              disabled={busy}
              className="text-danger focus:text-danger"
              onSelect={() => {
                onDelete();
              }}
            >
              <DeleteIcon className="size-4" aria-hidden="true" />
              Delete session
            </DropdownMenuItem>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

function SessionDialog({
  editing,
  onClose,
}: {
  editing: AcademicSession | undefined;
  onClose: () => void;
}) {
  const router = useRouter();
  const toast = useToast();

  const [name, setName] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [status, setStatus] = useState<string>('PLANNED');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | undefined>(undefined);
  const [isPending, setIsPending] = useState(false);

  // Reset on open rather than on mount: the dialog is mounted once and reused,
  // so without this the previous session's dates linger in the fields.
  function reset() {
    setName(editing?.name ?? '');
    setStartDate(editing?.startDate ?? '');
    setEndDate(editing?.endDate ?? '');
    setStatus(editing?.status ?? 'PLANNED');
    setFieldErrors({});
    setFormError(undefined);
  }

  // Run once, on mount. The dialog is mounted fresh for each row (its call site
  // keys it by id), so this is the prefill — and it replaces a `reset()` hung
  // off `onOpenChange(true)`, which Radix only fires for a dialog that opens
  // itself. Opened from a row's Edit button, that callback never ran and the
  // form kept whatever was last typed into it.
  useEffect(reset, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFieldErrors({});
    setFormError(undefined);

    const parsed = createSessionSchema.safeParse({ name, startDate, endDate, status });
    if (!parsed.success) {
      const next: Record<string, string> = {};
      for (const issue of parsed.error.issues) {
        next[issue.path.join('.')] = issue.message;
      }
      setFieldErrors(next);
      return;
    }

    setIsPending(true);
    const result =
      editing === undefined
        ? await mutate(ROUTES.academics.sessions, 'POST', parsed.data)
        : await mutate(ROUTES.academics.session(editing.id), 'PATCH', parsed.data);
    setIsPending(false);

    if (!result.ok) {
      setFormError(result.message);
      setFieldErrors(result.fieldErrors);
      return;
    }

    toast.success(
      editing === undefined ? `${parsed.data.name} added` : `${parsed.data.name} saved`,
    );
    onClose();
    router.refresh();
  }

  return (
    <Dialog
      open
      onOpenChange={(next) => {
        if (!next) {
          onClose();
        }
      }}
    >
      <DialogContent>
        <form
          onSubmit={(event) => {
            void submit(event);
          }}
          noValidate
        >
          <DialogHeader>
            <DialogTitle>
              {editing === undefined ? 'Add a session' : `Edit ${editing.name}`}
            </DialogTitle>
            <DialogDescription>One school year, with the dates it runs between.</DialogDescription>
          </DialogHeader>

          <DialogBody className="space-y-4">
            {formError === undefined ? null : (
              <div
                role="alert"
                className="rounded-md border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger"
              >
                {formError}
              </div>
            )}

            <Field label="Name" error={fieldErrors['name']} required>
              <Input
                value={name}
                autoFocus
                placeholder="2026–2027"
                onChange={(event) => {
                  setName(event.target.value);
                }}
              />
            </Field>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Starts" error={fieldErrors['startDate']} required>
                <DatePicker
                  value={startDate}
                  onChange={setStartDate}
                />
              </Field>
              <Field label="Ends" error={fieldErrors['endDate']} required>
                <DatePicker
                  value={endDate}
                  onChange={setEndDate}
                />
              </Field>
            </div>

            <Field
              label="Status"
              error={fieldErrors['status']}
              hint="Planned is next year being set up. Closed stops new enrolments."
            >
              <SimpleSelect
                value={status}
                onValueChange={setStatus}
                options={STATUS_OPTIONS}
                ariaLabel="Status"
              />
            </Field>
          </DialogBody>

          <DialogFooter>
            <Button type="button" tone="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" isPending={isPending}>
              {editing === undefined ? 'Add session' : 'Save changes'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
