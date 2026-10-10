'use client';

import {
  createHolidaySchema,
  HOLIDAY_AUDIENCE_LABELS,
  HOLIDAY_AUDIENCES,
  HOLIDAY_COLOR_KEYS,
  HOLIDAY_COLOR_LABELS,
  HOLIDAY_TYPE_LABELS,
  HOLIDAY_TYPES,
  ROUTES,
  type AcademicSession,
  type Holiday,
  type HolidayColorKey,
  type HolidayType,
} from '@ilm/contracts';
import {
  Button,
  CheckboxField,
  cn,
  ConfirmDialog,
  DatePicker,
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  EmptyState,
  Field,
  Input,
  SimpleSelect,
  useToast,
} from '@ilm/ui';
import { useRouter } from 'next/navigation';
import { useEffect, useState, type FormEvent } from 'react';

import { AcademicCalendarView } from '@/components/academic-calendar/academic-calendar-view';
import {
  defaultColorForType,
  HOLIDAY_COLOR_THEME,
} from '@/components/academic-calendar/calendar-holiday-colors';
import { mutate } from '@/lib/mutate';
import { useTenantHref } from '@/lib/use-tenant-href';

const TYPE_OPTIONS = HOLIDAY_TYPES.map((value) => ({
  value,
  label: HOLIDAY_TYPE_LABELS[value],
}));

const AUDIENCE_OPTIONS = HOLIDAY_AUDIENCES.map((value) => ({
  value,
  label: HOLIDAY_AUDIENCE_LABELS[value],
}));

export interface HolidaysManagerProps {
  holidays: Holiday[];
  sessions: AcademicSession[];
  activeSessionId: string | undefined;
  today: string;
  error?: string | undefined;
  canConfigure: boolean;
}

export function HolidaysManager({
  holidays,
  sessions,
  activeSessionId,
  today,
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

  if (sessions.length === 0) {
    return (
      <div className="space-y-6">
        <EmptyState
          title="No academic session yet"
          description="A calendar belongs to a school year, so create a session first — the same date next year is a separate decision."
          action={
            <Button asChild>
              <a href={tenantHref('/academics/sessions')}>Go to sessions</a>
            </Button>
          }
        />
      </div>
    );
  }

  return (
    <>
      <AcademicCalendarView
        holidays={holidays}
        sessions={sessions}
        activeSessionId={activeSessionId}
        activeSession={activeSession}
        today={today}
        error={error}
        canConfigure={canConfigure}
        onSessionChange={changeSession}
        onAddEvent={() => {
          setEditing(undefined);
          setDialogOpen(true);
        }}
        onEditEvent={(row) => {
          setEditing(row);
          setDialogOpen(true);
        }}
        onDeleteEvent={(row) => {
          setDeleting(row);
        }}
      />

      {dialogOpen ? (
        <HolidayDialog
          key={editing?.id ?? 'new'}
          editing={editing}
          sessionId={activeSessionId}
          sessionName={activeSession?.name}
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
        description="Nothing else refers to a calendar entry, so removing it changes no records."
        confirmLabel="Remove"
        tone="danger"
        onConfirm={confirmDelete}
      />
    </>
  );
}

function HolidayDialog({
  editing,
  sessionId,
  sessionName,
  onClose,
}: {
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
  const [colorKey, setColorKey] = useState<HolidayColorKey>('rose');
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
    const nextType = editing?.type ?? 'HOLIDAY';
    setColorKey(editing?.colorKey ?? defaultColorForType(nextType));
    setIsRange(editing !== undefined && editing.startDate !== editing.endDate);
    setFieldErrors({});
    setFormError(undefined);
  }

  useEffect(reset, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFieldErrors({});
    setFormError(undefined);

    if (sessionId === undefined) {
      setFormError('Pick a session first.');
      return;
    }

    const payload = {
      sessionId,
      name,
      type,
      appliesTo,
      startDate,
      endDate: isRange && endDate !== '' ? endDate : startDate,
      colorKey,
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
            colorKey: parsed.data.colorKey,
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
      open
      onOpenChange={(next) => {
        if (!next) {
          onClose();
        }
      }}
    >
      <DialogContent className="max-w-2xl">
        <form
          onSubmit={(event) => {
            void submit(event);
          }}
          noValidate
        >
          <DialogHeader>
            <DialogTitle>{editing === undefined ? 'Add event' : `Edit ${editing.name}`}</DialogTitle>
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
                  onValueChange={(next) => {
                    setType(next);
                    if (editing === undefined) {
                      setColorKey(defaultColorForType(next as HolidayType));
                    }
                  }}
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
                <DatePicker value={startDate} onChange={setStartDate} />
              </Field>
              {isRange ? (
                <Field label="Last day" error={fieldErrors['endDate']} required>
                  <DatePicker value={endDate} min={startDate} onChange={setEndDate} />
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

            <Field
              label="Calendar colour"
              error={fieldErrors['colorKey']}
              hint="How this event appears on the month grid."
            >
              <div className="flex flex-wrap gap-2" role="group" aria-label="Calendar colour">
                {HOLIDAY_COLOR_KEYS.map((key) => (
                  <button
                    key={key}
                    type="button"
                    aria-pressed={colorKey === key}
                    aria-label={HOLIDAY_COLOR_LABELS[key]}
                    title={HOLIDAY_COLOR_LABELS[key]}
                    onClick={() => {
                      setColorKey(key);
                    }}
                    className={cn(
                      'size-9 rounded-md transition-shadow',
                      HOLIDAY_COLOR_THEME[key].swatch,
                      colorKey === key && 'ring-2 ring-ring ring-offset-2 ring-offset-background',
                    )}
                  />
                ))}
              </div>
            </Field>

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
              {editing === undefined ? 'Add event' : 'Save changes'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
