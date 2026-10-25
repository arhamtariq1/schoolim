'use client';

import {
  ROUTES,
  TIMETABLE_KIND_LABELS,
  TIMETABLE_KINDS,
  timetableInputSchema,
  WEEKDAY_LABELS,
  WEEKDAY_NUMBERS,
  type TimetableDetail,
  type TimetableKind,
  type TimetableOptions,
} from '@ilm/contracts';
import {
  Button,
  DatePicker,
  Card,
  Field,
  Input,
  SimpleSelect,
  Textarea,
  useToast,
} from '@ilm/ui';
import { ChevronLeftIcon, CreateIcon, DeleteIcon, ICON_SIZE } from '@ilm/ui/icons';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';

import { PageHeader } from '@/components/page-header';
import { showFormValidationToast } from '@/lib/form-validation';
import { mutate } from '@/lib/mutate';
import { useTenantHref } from '@/lib/use-tenant-href';

/** A period or a paper as it is being typed: everything is text until it is saved. */
interface EntryDraft {
  readonly key: string;
  dayOfWeek: string;
  onDate: string;
  startTime: string;
  endTime: string;
  subjectId: string;
  teacherId: string;
  room: string;
  notes: string;
  isBreak: boolean;
}

function blankEntry(kind: TimetableKind): EntryDraft {
  return {
    key: crypto.randomUUID(),
    dayOfWeek: kind === 'CLASS' ? '1' : '',
    onDate: '',
    startTime: '09:00',
    endTime: '09:40',
    subjectId: '',
    teacherId: '',
    room: '',
    notes: '',
    isBreak: false,
  };
}

function blankBreak(previous: EntryDraft | undefined): EntryDraft {
  return {
    ...blankEntry('CLASS'),
    dayOfWeek: previous?.dayOfWeek ?? '1',
    startTime: previous?.endTime ?? '11:00',
    endTime: '11:20',
    notes: 'Break',
    isBreak: true,
  };
}

/**
 * Make or edit a timetable, on a page of its own.
 *
 * The periods are rows, one per period or paper, because that is how the office
 * thinks about it. The picture of a week — the grid — is on the timetable's own
 * page. Saving goes through the shared schema first, so a mistake is named
 * beside the row it is in before anything is sent; the server then checks what
 * only it can: clashes with what is already scheduled.
 */
export function TimetableForm({
  options,
  editing,
  copyOf,
  addPeriod = false,
}: {
  readonly options: TimetableOptions;
  /** Absent when making a new one. */
  readonly editing: TimetableDetail | undefined;
  /** A timetable to start a new one from: its fields and periods, saved as a fresh draft. */
  readonly copyOf?: TimetableDetail | undefined;
  /** Open with one more blank period, as "Add period" asks. */
  readonly addPeriod?: boolean;
}) {
  const router = useRouter();
  const toast = useToast();
  const tenantHref = useTenantHref();
  const backHref = tenantHref(editing === undefined ? '/timetables' : `/timetables/${editing.id}`);

  const seed = editing ?? copyOf;
  const current = options.sessions.find((session) => session.isCurrent) ?? options.sessions[0];
  const [kind, setKind] = useState<TimetableKind>(seed?.kind ?? 'CLASS');
  const [sessionId, setSessionId] = useState(seed?.session.id ?? current?.id ?? '');
  const [classLevelId, setClassLevelId] = useState(seed?.classLevel.id ?? '');
  const [sectionId, setSectionId] = useState(seed?.section?.id ?? '');
  const [assessmentTypeId, setAssessmentTypeId] = useState(seed?.assessmentType?.id ?? '');
  const [title, setTitle] = useState(copyOf === undefined ? (seed?.title ?? '') : `${copyOf.title} (copy)`);
  const [description, setDescription] = useState(seed?.description ?? '');
  const [startsOn, setStartsOn] = useState(seed?.kind === 'CLASS' ? (seed.startsOn ?? '') : '');
  const [endsOn, setEndsOn] = useState(seed?.kind === 'CLASS' ? (seed.endsOn ?? '') : '');
  const [entries, setEntries] = useState<EntryDraft[]>(
    seed === undefined
      ? [blankEntry('CLASS')]
      : [...seed.entries.map((entry) => ({
          key: entry.id,
          dayOfWeek: entry.dayOfWeek === null ? '' : String(entry.dayOfWeek),
          onDate: entry.onDate ?? '',
          startTime: entry.startTime,
          endTime: entry.endTime,
          subjectId: entry.subject?.id ?? '',
          teacherId: entry.teacher?.id ?? '',
          room: entry.room ?? '',
          notes: entry.notes ?? '',
          isBreak: entry.isBreak,
        })), ...(addPeriod ? [blankEntry(seed.kind)] : [])],
  );
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | undefined>(undefined);
  const [isPending, setIsPending] = useState(false);

  const selectedClass = options.classes.find((item) => item.id === classLevelId);
  const sections = (selectedClass?.sections ?? []).filter((section) => section.sessionId === sessionId);
  // A class with subjects set up schedules those; one with none has not said.
  const subjects = useMemo(
    () =>
      selectedClass === undefined || selectedClass.subjectIds.length === 0
        ? options.subjects
        : options.subjects.filter((subject) => selectedClass.subjectIds.includes(subject.id)),
    [options.subjects, selectedClass],
  );
  const isDraftOrNew = editing === undefined || editing.status === 'DRAFT';

  function changeKind(next: TimetableKind): void {
    setKind(next);
    setAssessmentTypeId('');
    setEntries((rows) =>
      rows.map((row) => ({ ...row, dayOfWeek: next === 'CLASS' ? (row.dayOfWeek || '1') : '', onDate: next === 'CLASS' ? '' : row.onDate })),
    );
  }

  function patch(key: string, change: Partial<EntryDraft>): void {
    setEntries((rows) => rows.map((row) => (row.key === key ? { ...row, ...change } : row)));
  }

  async function save(publish: boolean): Promise<void> {
    if (isPending) return;
    setErrors({});
    setFormError(undefined);

    const parsed = timetableInputSchema.safeParse({
      sessionId,
      classLevelId,
      sectionId: sectionId === '' ? null : sectionId,
      kind,
      assessmentTypeId: kind === 'ASSESSMENT' && assessmentTypeId !== '' ? assessmentTypeId : null,
      title,
      description,
      startsOn: kind === 'CLASS' && startsOn !== '' ? startsOn : null,
      endsOn: kind === 'CLASS' && endsOn !== '' ? endsOn : null,
      entries: entries.map((row) => ({
        subjectId: row.isBreak || row.subjectId === '' ? null : row.subjectId,
        teacherId: row.isBreak || row.teacherId === '' ? null : row.teacherId,
        room: row.isBreak ? '' : row.room,
        dayOfWeek: kind === 'CLASS' && row.dayOfWeek !== '' ? Number(row.dayOfWeek) : null,
        onDate: kind === 'ASSESSMENT' && row.onDate !== '' ? row.onDate : null,
        startTime: row.startTime,
        endTime: row.endTime,
        notes: row.notes,
        isBreak: row.isBreak,
      })),
      publish,
    });

    if (!parsed.success) {
      const next: Record<string, string> = {};
      for (const issue of parsed.error.issues) {
        next[issue.path.join('.')] ??= issue.message;
      }
      // The ids are chosen from lists, so an unchosen one reads as a missing choice.
      for (const field of ['sessionId', 'classLevelId'] as const) {
        if (next[field] !== undefined) next[field] = 'Choose one.';
      }
      setErrors(next);
      showFormValidationToast(toast);
      return;
    }

    setIsPending(true);
    const result =
      editing === undefined
        ? await mutate<TimetableDetail>(ROUTES.timetables.list, 'POST', parsed.data)
        : await mutate<TimetableDetail>(ROUTES.timetables.detail(editing.id), 'PUT', parsed.data);
    setIsPending(false);

    if (!result.ok) {
      setErrors(result.fieldErrors);
      // A clash is the message the office needs to read, so it is not a toast.
      setFormError(result.message);
      return;
    }

    toast.success(
      publish
        ? 'Saved and published. Teachers and parents have been told.'
        : editing === undefined
          ? 'Saved as a draft.'
          : 'Timetable saved.',
    );
    router.push(tenantHref(`/timetables/${result.data.id}`));
    router.refresh();
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={editing === undefined ? 'New timetable' : 'Edit timetable'}
        description={
          kind === 'CLASS'
            ? 'The weekly periods of a class or section. They repeat every week.'
            : 'A dated schedule of tests or exams, with one row for each paper.'
        }
        actions={
          <Button asChild tone="outline" size="sm">
            <Link href={backHref}>
              <ChevronLeftIcon className={ICON_SIZE.inline} aria-hidden />
              Back
            </Link>
          </Button>
        }
      />

      <Card className="space-y-5 p-4 sm:p-6">
          {formError === undefined ? null : (
            <p role="alert" className="rounded-md border border-danger/30 bg-danger/10 p-3 text-sm text-danger">
              {formError}
            </p>
          )}

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <Field label="Type" required>
              <SimpleSelect
                value={kind}
                disabled={editing !== undefined}
                options={TIMETABLE_KINDS.map((value) => ({ value, label: TIMETABLE_KIND_LABELS[value] }))}
                onValueChange={(next) => {
                  changeKind(next as TimetableKind);
                }}
              />
            </Field>
            <Field label="Session" required error={errors['sessionId']}>
              <SimpleSelect
                value={sessionId}
                placeholder="Choose a session"
                options={options.sessions.map((session) => ({ value: session.id, label: session.name }))}
                onValueChange={(next) => {
                  setSessionId(next);
                  setSectionId('');
                }}
              />
            </Field>
            <Field label="Class" required error={errors['classLevelId']}>
              <SimpleSelect
                value={classLevelId}
                placeholder="Choose a class"
                options={options.classes.map((item) => ({ value: item.id, label: item.name }))}
                onValueChange={(next) => {
                  setClassLevelId(next);
                  setSectionId('');
                }}
              />
            </Field>
            <Field label="Section" hint="Leave as the whole class to cover every section.">
              <SimpleSelect
                value={sectionId}
                placeholder="Whole class"
                emptyOption={{ value: '', label: 'Whole class' }}
                options={sections.map((section) => ({ value: section.id, label: section.name }))}
                onValueChange={setSectionId}
              />
            </Field>
            {kind === 'ASSESSMENT' ? (
              <Field label="Assessment type" required error={errors['assessmentTypeId']}>
                <SimpleSelect
                  value={assessmentTypeId}
                  placeholder="Choose a type"
                  options={options.assessmentTypes.map((type) => ({ value: type.id, label: type.name }))}
                  onValueChange={setAssessmentTypeId}
                />
              </Field>
            ) : null}
            <Field label="Title" required error={errors['title']} className={kind === 'ASSESSMENT' ? '' : 'lg:col-span-2'}>
              <Input
                value={title}
                maxLength={120}
                placeholder={kind === 'CLASS' ? 'Class 5 weekly timetable' : 'Midterm exam, October'}
                onChange={(event) => {
                  setTitle(event.target.value);
                }}
              />
            </Field>
          </div>

          {kind === 'CLASS' ? (
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="From (optional)" hint="Leave both empty for the whole session." error={errors['startsOn']}>
                <DatePicker value={startsOn} onChange={setStartsOn} />
              </Field>
              <Field label="Until (optional)" error={errors['endsOn']}>
                <DatePicker value={endsOn} onChange={setEndsOn} />
              </Field>
            </div>
          ) : null}

          <Field label="Description or instructions (optional)" error={errors['description']}>
            <Textarea
              rows={2}
              maxLength={1000}
              value={description}
              onChange={(event) => {
                setDescription(event.target.value);
              }}
            />
          </Field>

          <section aria-labelledby="entries-heading" className="space-y-3">
            <div className="flex items-center justify-between gap-2">
              <h3 id="entries-heading" className="text-sm font-semibold text-foreground">
                {kind === 'CLASS' ? 'Periods' : 'Papers'}
              </h3>
              <div className="flex gap-2">
                {kind === 'CLASS' ? (
                  <Button
                    type="button"
                    tone="outline"
                    size="sm"
                    onClick={() => {
                      setEntries((rows) => [...rows, blankBreak(rows.at(-1))]);
                    }}
                  >
                    <CreateIcon className={ICON_SIZE.inline} aria-hidden />
                    Add break
                  </Button>
                ) : null}
                <Button
                  type="button"
                  tone="outline"
                  size="sm"
                  onClick={() => {
                    setEntries((rows) => [...rows, blankEntry(kind)]);
                  }}
                >
                  <CreateIcon className={ICON_SIZE.inline} aria-hidden />
                  {kind === 'CLASS' ? 'Add period' : 'Add paper'}
                </Button>
              </div>
            </div>
            {errors['entries'] === undefined ? null : (
              <p role="alert" className="text-xs text-danger">
                {errors['entries']}
              </p>
            )}

            <ul className="space-y-3">
              {entries.map((row, index) => {
                const problem = (field: string): string | undefined => errors[`entries.${String(index)}.${field}`];
                return (
                  <li key={row.key} className="rounded-xl border border-border bg-card p-3">
                    <div className={row.isBreak ? 'grid gap-3 sm:grid-cols-2 lg:grid-cols-4' : 'grid gap-3 sm:grid-cols-2 lg:grid-cols-6'}>
                      {kind === 'CLASS' ? (
                        <Field label="Day" error={problem('dayOfWeek')}>
                          <SimpleSelect
                            value={row.dayOfWeek}
                            options={WEEKDAY_NUMBERS.map((day) => ({ value: String(day), label: WEEKDAY_LABELS[day] ?? '' }))}
                            onValueChange={(next) => {
                              patch(row.key, { dayOfWeek: next });
                            }}
                          />
                        </Field>
                      ) : (
                        <Field label="Date" error={problem('onDate')}>
                          <DatePicker value={row.onDate} onChange={(next) => { patch(row.key, { onDate: next }); }} />
                        </Field>
                      )}
                      <Field label="Starts" error={problem('startTime')}>
                        <Input type="time" value={row.startTime} onChange={(event) => { patch(row.key, { startTime: event.target.value }); }} />
                      </Field>
                      <Field label="Ends" error={problem('endTime')}>
                        <Input type="time" value={row.endTime} onChange={(event) => { patch(row.key, { endTime: event.target.value }); }} />
                      </Field>
                      {row.isBreak ? (
                        <Field label="Break name" error={problem('notes')}>
                          <Input value={row.notes} maxLength={60} placeholder="Lunch, recess…" onChange={(event) => { patch(row.key, { notes: event.target.value }); }} />
                        </Field>
                      ) : (
                        <>
                      <Field label="Subject">
                        <SimpleSelect
                          value={row.subjectId}
                          placeholder="None"
                          emptyOption={{ value: '', label: 'None' }}
                          options={subjects.map((subject) => ({ value: subject.id, label: subject.name }))}
                          onValueChange={(next) => {
                            // The teacher the office gave this subject in this class, unless one is already chosen.
                            const assigned = selectedClass?.subjectTeachers.find((link) => link.subjectId === next)?.teacherId;
                            patch(row.key, {
                              subjectId: next,
                              ...(assigned !== undefined && row.teacherId === '' ? { teacherId: assigned } : {}),
                            });
                          }}
                        />
                      </Field>
                      <Field label="Teacher">
                        <SimpleSelect
                          value={row.teacherId}
                          placeholder="None"
                          emptyOption={{ value: '', label: 'None' }}
                          options={options.teachers.map((teacher) => ({ value: teacher.id, label: teacher.name }))}
                          onValueChange={(next) => {
                            patch(row.key, { teacherId: next });
                          }}
                        />
                      </Field>
                      <Field label="Room (optional)">
                        <Input value={row.room} maxLength={60} onChange={(event) => { patch(row.key, { room: event.target.value }); }} />
                      </Field>
                        </>
                      )}
                    </div>
                    <div className="mt-3 flex items-end justify-end gap-3">
                      {row.isBreak ? null : (
                      <Field label="Notes (optional)" className="flex-1" error={problem('notes')}>
                        <Input
                          value={row.notes}
                          maxLength={500}
                          placeholder={kind === 'ASSESSMENT' ? 'Syllabus, what to bring…' : ''}
                          onChange={(event) => { patch(row.key, { notes: event.target.value }); }}
                        />
                      </Field>
                      )}
                      <Button
                        type="button"
                        tone="ghost"
                        size="sm"
                        disabled={entries.length === 1}
                        aria-label={`Remove row ${String(index + 1)}`}
                        onClick={() => {
                          setEntries((rows) => rows.filter((item) => item.key !== row.key));
                        }}
                      >
                        <DeleteIcon className={ICON_SIZE.inline} aria-hidden />
                        Remove
                      </Button>
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>
      </Card>

      <div className="flex flex-wrap items-center justify-end gap-2">
          <Button asChild tone="ghost">
            <Link href={backHref}>Cancel</Link>
          </Button>
          <Button type="button" tone="outline" isPending={isPending} onClick={() => void save(false)}>
            {editing === undefined ? 'Save as draft' : 'Save changes'}
          </Button>
          {isDraftOrNew ? (
            <Button type="button" isPending={isPending} onClick={() => void save(true)}>
              Save &amp; publish
            </Button>
          ) : null}
      </div>
    </div>
  );
}
