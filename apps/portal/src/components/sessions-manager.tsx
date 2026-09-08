'use client';

import {
  createSessionSchema,
  ROUTES,
  SESSION_STATUSES,
  type AcademicSession,
} from '@ilm/contracts';
import { Button, ConfirmDialog, DataTable, DateDisplay, DatePicker, Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, Field, Input, SimpleSelect, StatusBadge, type Column, useToast } from '@ilm/ui';
import { ApproveIcon, CreateIcon, DeleteIcon, EditIcon, ICON_SIZE } from '@ilm/ui/icons';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';

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

  const hasCurrent = sessions.some((entry) => entry.isCurrent);

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

  const columns: Column<AcademicSession>[] = [
    {
      key: 'name',
      header: 'Session',
      render: (row) => (
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-medium text-foreground">{row.name}</span>
          {row.isCurrent ? <StatusBadge tone="success">Current</StatusBadge> : null}
        </div>
      ),
    },
    {
      key: 'dates',
      header: 'Runs',
      render: (row) => (
        <span className="text-sm">
          <DateDisplay value={row.startDate} /> — <DateDisplay value={row.endDate} />
        </span>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (row) => (
        <StatusBadge tone={STATUS_TONE[row.status] ?? 'neutral'}>
          {row.status.charAt(0) + row.status.slice(1).toLowerCase()}
        </StatusBadge>
      ),
    },
    {
      key: 'sections',
      header: 'Sections',
      align: 'end',
      hideOnMobile: true,
      render: (row) => (
        <span className="font-mono text-sm text-muted-foreground tabular-nums">
          {row.sectionCount === 0 ? '—' : row.sectionCount}
        </span>
      ),
    },
    {
      key: 'students',
      header: 'Enrolled',
      align: 'end',
      hideOnMobile: true,
      render: (row) => (
        <span className="font-mono text-sm text-muted-foreground tabular-nums">
          {row.enrollmentCount === 0 ? '—' : row.enrollmentCount}
        </span>
      ),
    },
    {
      key: 'actions',
      header: '',
      align: 'end',
      render: (row) =>
        !canConfigure ? null : (
          <div className="flex items-center justify-end gap-1">
            {row.isCurrent || row.status === 'CLOSED' ? null : (
              <Button
                tone="ghost"
                size="sm"
                disabled={busyId !== undefined}
                onClick={() => {
                  void makeCurrent(row);
                }}
              >
                <ApproveIcon className={ICON_SIZE.inline} aria-hidden />
                Make current
              </Button>
            )}
            <Button
              tone="ghost"
              size="sm"
              disabled={busyId !== undefined}
              onClick={() => {
                setEditing(row);
                setDialogOpen(true);
              }}
            >
              <EditIcon className={ICON_SIZE.inline} aria-hidden />
              Edit
            </Button>
            {/* Not offered for a session with enrolments or the current one —
                the server refuses both, and a control that always fails is
                worse than one that is not there. */}
            {row.enrollmentCount === 0 && !row.isCurrent ? (
              <Button
                tone="ghost"
                size="sm"
                aria-label={`Delete ${row.name}`}
                disabled={busyId !== undefined}
                onClick={() => {
                  setDeleting(row);
                }}
              >
                <DeleteIcon className={`${ICON_SIZE.inline} text-danger`} aria-hidden />
              </Button>
            ) : null}
          </div>
        ),
    },
  ];

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-foreground">Academic sessions</h1>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            The school year. Sections, enrolments and fees all belong to one, which is what makes
            rolling over to next year a supported step rather than a data migration.
          </p>
        </div>

        {canConfigure ? (
          <Button
            onClick={() => {
              setEditing(undefined);
              setDialogOpen(true);
            }}
          >
            <CreateIcon className={ICON_SIZE.inline} aria-hidden />
            Add session
          </Button>
        ) : null}
      </header>

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

      <DataTable
        rows={sessions}
        columns={columns}
        rowKey={(row) => row.id}
        error={error}
        caption="Academic sessions"
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
      />

      <SessionDialog
        open={dialogOpen}
        editing={editing}
        onClose={() => {
          setDialogOpen(false);
          setEditing(undefined);
        }}
      />

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

function SessionDialog({
  open,
  editing,
  onClose,
}: {
  open: boolean;
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
      open={open}
      onOpenChange={(next) => {
        if (next) {
          reset();
        } else {
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
