'use client';


import {
  createHolidaySchema,
  HOLIDAY_AUDIENCE_LABELS,
  HOLIDAY_AUDIENCES,
  HOLIDAY_TYPE_LABELS,
  HOLIDAY_TYPES,
  ROUTES,
  type AcademicSession,
  type Holiday,
} from '@ilm/contracts';
import { Button, CheckboxField, ConfirmDialog, DataTable, DateDisplay, DatePicker, Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, EmptyState, Field, Input, SimpleSelect, StatusBadge, type Column, useToast } from '@ilm/ui';
import { CreateIcon, DeleteIcon, EditIcon, ICON_SIZE } from '@ilm/ui/icons';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';

import { mutate } from '@/lib/mutate';
import { useTenantHref } from '@/lib/use-tenant-href';

/**
 * The school calendar.
 *
 * Holidays are **ranges**, not one row per day. "Summer vacation, 1 June to 15
 * August" is one thing a school declares and one thing it later shortens, and
 * 76 rows would make moving the end date a delete-and-recreate that loses the
 * name. A single day is simply the same date twice, and the form hides the
 * second field until it is needed.
 */

const TYPE_OPTIONS = HOLIDAY_TYPES.map((value) => ({
  value,
  label: HOLIDAY_TYPE_LABELS[value],
}));

const AUDIENCE_OPTIONS = HOLIDAY_AUDIENCES.map((value) => ({
  value,
  label: HOLIDAY_AUDIENCE_LABELS[value],
}));

const TYPE_TONE: Record<string, 'neutral' | 'warning' | 'success'> = {
  HOLIDAY: 'warning',
  VACATION: 'neutral',
  EVENT: 'success',
};

export interface HolidaysManagerProps {
  holidays: Holiday[];
  sessions: AcademicSession[];
  activeSessionId: string | undefined;
  error?: string | undefined;
  canConfigure: boolean;
}

export function HolidaysManager({
  holidays,
  sessions,
  activeSessionId,
  error,
  canConfigure,
}: HolidaysManagerProps) {
  const router = useRouter();
  const tenantHref = useTenantHref();
  const toast = useToast();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Holiday | undefined>(undefined);
  const [deleting, setDeleting] = useState<Holiday | undefined>(undefined);

  const activeSession = sessions.find((entry) => entry.id === activeSessionId);
  const totalDays = holidays.reduce((sum, entry) => sum + entry.days, 0);

  function changeSession(nextId: string) {
    const url = new URL(window.location.href);
    if (nextId === '') {
      url.searchParams.delete('sessionId');
    } else {
      url.searchParams.set('sessionId', nextId);
    }
    router.push(`${url.pathname}${url.search}`);
  }

  async function confirmDelete() {
    if (deleting === undefined) {
      return;
    }
    const result = await mutate(ROUTES.academics.holiday(deleting.id), 'DELETE');

    if (!result.ok) {
      toast.error(result.message);
      setDeleting(undefined);
      return;
    }

    toast.success(`${deleting.name} removed`);
    setDeleting(undefined);
    router.refresh();
  }

  const columns: Column<Holiday>[] = [
    {
      key: 'name',
      header: 'Occasion',
      render: (row) => (
        <div className="min-w-0">
          <p className="truncate font-medium text-foreground">{row.name}</p>
          {row.notes === null ? null : (
            <p className="truncate text-xs text-muted-foreground">{row.notes}</p>
          )}
        </div>
      ),
    },
    {
      key: 'dates',
      header: 'When',
      render: (row) => (
        <span className="text-sm">
          <DateDisplay value={row.startDate} />
          {row.startDate === row.endDate ? null : (
            <>
              {' — '}
              <DateDisplay value={row.endDate} />
            </>
          )}
        </span>
      ),
    },
    {
      key: 'days',
      header: 'Days',
      align: 'end',
      render: (row) => <span className="font-mono text-sm tabular-nums">{row.days}</span>,
    },
    {
      key: 'type',
      header: 'Type',
      render: (row) => (
        <StatusBadge tone={TYPE_TONE[row.type] ?? 'neutral'}>
          {HOLIDAY_TYPE_LABELS[row.type]}
        </StatusBadge>
      ),
    },
    {
      key: 'appliesTo',
      header: 'Applies to',
      hideOnMobile: true,
      render: (row) => (
        <span className="text-sm text-muted-foreground">
          {HOLIDAY_AUDIENCE_LABELS[row.appliesTo]}
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
            <Button
              tone="ghost"
              size="sm"
              onClick={() => {
                setEditing(row);
                setDialogOpen(true);
              }}
            >
              <EditIcon className={ICON_SIZE.inline} aria-hidden />
              Edit
            </Button>
            <Button
              tone="ghost"
              size="sm"
              aria-label={`Remove ${row.name}`}
              onClick={() => {
                setDeleting(row);
              }}
            >
              <DeleteIcon className={`${ICON_SIZE.inline} text-danger`} aria-hidden />
            </Button>
          </div>
        ),
    },
  ];

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-foreground">Calendar</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {holidays.length === 0
              ? 'Days the school is closed or running something else.'
              : `${String(holidays.length)} entries · ${String(totalDays)} non-teaching days`}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {sessions.length > 0 ? (
            <div className="w-52">
              <SimpleSelect
                value={activeSessionId ?? ''}
                onValueChange={changeSession}
                options={sessions.map((entry) => ({
                  value: entry.id,
                  label: entry.isCurrent ? `${entry.name} (current)` : entry.name,
                }))}
                ariaLabel="Session"
              />
            </div>
          ) : null}

          {canConfigure && sessions.length > 0 ? (
            <Button
              onClick={() => {
                setEditing(undefined);
                setDialogOpen(true);
              }}
            >
              <CreateIcon className={ICON_SIZE.inline} aria-hidden />
              Add
            </Button>
          ) : null}
        </div>
      </header>

      {sessions.length === 0 ? (
        <EmptyState
          title="No academic session yet"
          description="A calendar belongs to a school year, so create a session first — the same date next year is a separate decision."
          action={
            <Button asChild>
              <a href={tenantHref('/academics/sessions')}>Go to sessions</a>
            </Button>
          }
        />
      ) : (
        <DataTable
          rows={holidays}
          columns={columns}
          rowKey={(row) => row.id}
          error={error}
          caption={`Calendar for ${activeSession?.name ?? 'this session'}`}
          empty={{
            title: 'Nothing in the calendar yet',
            description:
              'Add public holidays, vacations and school events. Attendance will use these so a closed day is never counted as absence.',
            action: canConfigure ? (
              <Button
                onClick={() => {
                  setEditing(undefined);
                  setDialogOpen(true);
                }}
              >
                <CreateIcon className={ICON_SIZE.inline} aria-hidden />
                Add the first entry
              </Button>
            ) : undefined,
          }}
        />
      )}

      <HolidayDialog
        open={dialogOpen}
        editing={editing}
        sessionId={activeSessionId}
        sessionName={activeSession?.name}
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
        title={`Remove ${deleting?.name ?? ''}?`}
        description="Nothing else refers to a calendar entry, so removing it changes no records."
        confirmLabel="Remove"
        tone="danger"
        onConfirm={confirmDelete}
      />
    </div>
  );
}

function HolidayDialog({
  open,
  editing,
  sessionId,
  sessionName,
  onClose,
}: {
  open: boolean;
  editing: Holiday | undefined;
  sessionId: string | undefined;
  sessionName: string | undefined;
  onClose: () => void;
}) {
  const router = useRouter();
  const toast = useToast();

  const [name, setName] = useState('');
  const [type, setType] = useState<string>('HOLIDAY');
  const [appliesTo, setAppliesTo] = useState<string>('ALL');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [notes, setNotes] = useState('');
  /** Most entries are a single day, so the second date stays out of the way. */
  const [isRange, setIsRange] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | undefined>(undefined);
  const [isPending, setIsPending] = useState(false);

  function reset() {
    setName(editing?.name ?? '');
    setType(editing?.type ?? 'HOLIDAY');
    setAppliesTo(editing?.appliesTo ?? 'ALL');
    setStartDate(editing?.startDate ?? '');
    setEndDate(editing?.endDate ?? '');
    setNotes(editing?.notes ?? '');
    setIsRange(editing !== undefined && editing.startDate !== editing.endDate);
    setFieldErrors({});
    setFormError(undefined);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFieldErrors({});
    setFormError(undefined);

    if (sessionId === undefined) {
      setFormError('Pick a session first.');
      return;
    }

    // A single-day entry sends the same date for both ends rather than omitting
    // one, so switching a range back to one day actually shortens it instead of
    // silently leaving yesterday's end date in place.
    const payload = {
      sessionId,
      name,
      type,
      appliesTo,
      startDate,
      endDate: isRange && endDate !== '' ? endDate : startDate,
      ...(notes.trim() === '' ? {} : { notes }),
    };

    const parsed = createHolidaySchema.safeParse(payload);
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
        ? await mutate(ROUTES.academics.holidays, 'POST', parsed.data)
        : await mutate(ROUTES.academics.holiday(editing.id), 'PATCH', {
            name: parsed.data.name,
            type: parsed.data.type,
            appliesTo: parsed.data.appliesTo,
            startDate: parsed.data.startDate,
            endDate: parsed.data.endDate ?? parsed.data.startDate,
            notes: notes.trim() === '' ? null : notes,
          });
    setIsPending(false);

    if (!result.ok) {
      setFormError(result.message);
      setFieldErrors(result.fieldErrors);
      return;
    }

    toast.success(editing === undefined ? `${name} added` : `${name} saved`);
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
              {editing === undefined ? 'Add to the calendar' : `Edit ${editing.name}`}
            </DialogTitle>
            <DialogDescription>
              {sessionName === undefined
                ? 'A holiday, vacation or school event.'
                : `Added to ${sessionName}. Dates must fall inside that session.`}
            </DialogDescription>
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

            <Field label="Occasion" error={fieldErrors['name']} required>
              <Input
                value={name}
                autoFocus
                placeholder="Eid ul-Fitr"
                onChange={(event) => {
                  setName(event.target.value);
                }}
              />
            </Field>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Type" error={fieldErrors['type']}>
                <SimpleSelect
                  value={type}
                  onValueChange={setType}
                  options={TYPE_OPTIONS}
                  ariaLabel="Type"
                />
              </Field>
              <Field
                label="Applies to"
                error={fieldErrors['appliesTo']}
                hint="A training day closes the school to students only."
              >
                <SimpleSelect
                  value={appliesTo}
                  onValueChange={setAppliesTo}
                  options={AUDIENCE_OPTIONS}
                  ariaLabel="Applies to"
                />
              </Field>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field
                label={isRange ? 'First day' : 'Date'}
                error={fieldErrors['startDate']}
                required
              >
                <DatePicker
                  value={startDate}
                  onChange={setStartDate}
                />
              </Field>
              {isRange ? (
                <Field label="Last day" error={fieldErrors['endDate']} required>
                  <DatePicker
                    value={endDate}
                    min={startDate}
                    onChange={setEndDate}
                  />
                </Field>
              ) : null}
            </div>

            <CheckboxField
              label="This runs over several days"
              checked={isRange}
              onCheckedChange={(next) => {
                const checked = next === true;
                setIsRange(checked);
                if (checked && endDate === '') {
                  setEndDate(startDate);
                }
              }}
            />

            <Field label="Notes" error={fieldErrors['notes']}>
              <Input
                value={notes}
                placeholder="Optional"
                onChange={(event) => {
                  setNotes(event.target.value);
                }}
              />
            </Field>
          </DialogBody>

          <DialogFooter>
            <Button type="button" tone="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" isPending={isPending}>
              {editing === undefined ? 'Add' : 'Save changes'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
