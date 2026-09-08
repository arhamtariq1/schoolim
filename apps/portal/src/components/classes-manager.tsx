'use client';

import {
  createClassLevelSchema,
  createSectionSchema,
  ROUTES,
  type AcademicSession,
  type ClassLevel,
  type Section,
} from '@ilm/contracts';
import {
  Button,
  ConfirmDialog,
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
  StatusBadge,
  useToast,
} from '@ilm/ui';
import { CreateIcon, DeleteIcon, EditIcon, ICON_SIZE } from '@ilm/ui/icons';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';

import { mutate } from '@/lib/mutate';

/**
 * Classes and their sections.
 *
 * ## Why one screen and not two
 *
 * A class with no sections cannot hold a student, so "add a class" and "add its
 * sections" are one job that happens to touch two tables. Splitting them across
 * pages means a school sets up twelve classes, leaves, and discovers at
 * admission time that none of them can be enrolled into.
 *
 * Sections are rendered as chips on the class row rather than in a second
 * table: a class has two or three of them, and a table of 36 rows to express
 * "twelve classes × three sections" is a worse view of the same fact.
 *
 * ## Sessions
 *
 * Sections belong to a session, so this page has a session picker and it is not
 * cosmetic — a school sets up next year's sections while this year is running,
 * and a page that could only show the current year could not be used for that.
 */

export interface ClassesManagerProps {
  classes: ClassLevel[];
  sessions: AcademicSession[];
  activeSessionId: string | undefined;
  error?: string | undefined;
  canConfigure: boolean;
}

export function ClassesManager({
  classes,
  sessions,
  activeSessionId,
  error,
  canConfigure,
}: ClassesManagerProps) {
  const router = useRouter();
  const toast = useToast();

  const [editingClass, setEditingClass] = useState<ClassLevel | undefined>(undefined);
  const [creatingClass, setCreatingClass] = useState(false);
  const [sectionFor, setSectionFor] = useState<ClassLevel | undefined>(undefined);
  const [editingSection, setEditingSection] = useState<
    { section: Section; className: string } | undefined
  >(undefined);
  const [deleting, setDeleting] = useState<
    { kind: 'class' | 'section'; id: string; label: string } | undefined
  >(undefined);

  async function confirmDelete() {
    if (deleting === undefined) {
      return;
    }
    const path =
      deleting.kind === 'class'
        ? ROUTES.academics.class(deleting.id)
        : ROUTES.academics.section(deleting.id);
    const result = await mutate(path, 'DELETE');

    if (!result.ok) {
      // Thrown rather than toasted so the dialog stays open with the reason —
      // "31 students are in this section" is the answer to the question the
      // person just asked, and closing the dialog hides it.
      toast.error(result.message);
      setDeleting(undefined);
      return;
    }

    toast.success(`${deleting.label} deleted`);
    setDeleting(undefined);
    router.refresh();
  }

  function changeSession(nextId: string) {
    const url = new URL(window.location.href);
    if (nextId === '') {
      url.searchParams.delete('sessionId');
    } else {
      url.searchParams.set('sessionId', nextId);
    }
    router.push(`${url.pathname}${url.search}`);
  }

  const totalSections = classes.reduce((sum, entry) => sum + entry.sections.length, 0);

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-foreground">Classes</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {classes.length} {classes.length === 1 ? 'class' : 'classes'} · {totalSections}{' '}
            {totalSections === 1 ? 'section' : 'sections'} in this session
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

          {canConfigure ? (
            <Button
              onClick={() => {
                setCreatingClass(true);
              }}
            >
              <CreateIcon className={ICON_SIZE.inline} aria-hidden />
              Add class
            </Button>
          ) : null}
        </div>
      </header>

      {error !== undefined ? (
        <div
          role="alert"
          className="rounded-md border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-danger"
        >
          {error}
        </div>
      ) : classes.length === 0 ? (
        <EmptyState
          title="No classes yet"
          description="A class is a grade — Nursery, Grade 1, Grade 10. Sections come next, and students are admitted into those."
          action={
            canConfigure ? (
              <Button
                onClick={() => {
                  setCreatingClass(true);
                }}
              >
                <CreateIcon className={ICON_SIZE.inline} aria-hidden />
                Add the first class
              </Button>
            ) : undefined
          }
        />
      ) : (
        <ul className="space-y-3">
          {classes.map((entry) => (
            <li
              key={entry.id}
              className="rounded-xl border border-border bg-card p-4 transition-colors hover:border-primary/40"
            >
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-base font-medium text-foreground">{entry.name}</h2>
                    {entry.isActive ? null : <StatusBadge tone="neutral">Off</StatusBadge>}
                  </div>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    Order {entry.numericOrder} ·{' '}
                    {entry.studentCount === 0
                      ? 'no students yet'
                      : `${String(entry.studentCount)} enrolled, all sessions`}
                  </p>
                </div>

                {canConfigure ? (
                  <div className="flex shrink-0 items-center gap-1">
                    <Button
                      tone="ghost"
                      size="sm"
                      onClick={() => {
                        setSectionFor(entry);
                      }}
                    >
                      <CreateIcon className={ICON_SIZE.inline} aria-hidden />
                      Section
                    </Button>
                    <Button
                      tone="ghost"
                      size="sm"
                      onClick={() => {
                        setEditingClass(entry);
                      }}
                    >
                      <EditIcon className={ICON_SIZE.inline} aria-hidden />
                      Edit
                    </Button>
                    {/* Absent once anyone has ever been enrolled — the server
                        refuses, and offering a control that always fails is
                        worse than not offering it (docs/16 §7). */}
                    {entry.studentCount === 0 ? (
                      <Button
                        tone="ghost"
                        size="sm"
                        aria-label={`Delete ${entry.name}`}
                        onClick={() => {
                          setDeleting({ kind: 'class', id: entry.id, label: entry.name });
                        }}
                      >
                        <DeleteIcon className={`${ICON_SIZE.inline} text-danger`} aria-hidden />
                      </Button>
                    ) : null}
                  </div>
                ) : null}
              </div>

              <div className="mt-3 flex flex-wrap items-center gap-2">
                {entry.sections.length === 0 ? (
                  <p className="text-sm text-warning">
                    No sections in this session — students cannot be admitted into this class yet.
                  </p>
                ) : (
                  entry.sections.map((section) => (
                    <span
                      key={section.id}
                      className="group inline-flex items-center gap-2 rounded-full border border-border bg-muted/40 py-1 ps-3 pe-1 text-sm"
                    >
                      <span className="font-medium">{section.name}</span>
                      <span className="text-xs text-muted-foreground">
                        {section.studentCount}
                        {section.capacity === null ? '' : `/${String(section.capacity)}`}
                      </span>
                      {canConfigure ? (
                        <span className="flex items-center">
                          <button
                            type="button"
                            aria-label={`Edit section ${section.name}`}
                            className="rounded-full p-1 text-muted-foreground hover:bg-background hover:text-foreground"
                            onClick={() => {
                              setEditingSection({ section, className: entry.name });
                            }}
                          >
                            <EditIcon className="size-3.5" aria-hidden />
                          </button>
                          {section.studentCount === 0 ? (
                            <button
                              type="button"
                              aria-label={`Delete section ${section.name}`}
                              className="rounded-full p-1 text-muted-foreground hover:bg-background hover:text-danger"
                              onClick={() => {
                                setDeleting({
                                  kind: 'section',
                                  id: section.id,
                                  label: `Section ${section.name}`,
                                });
                              }}
                            >
                              <DeleteIcon className="size-3.5" aria-hidden />
                            </button>
                          ) : null}
                        </span>
                      ) : null}
                    </span>
                  ))
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      <ClassDialog
        open={creatingClass || editingClass !== undefined}
        editing={editingClass}
        suggestedOrder={
          classes.length === 0 ? 0 : Math.max(...classes.map((c) => c.numericOrder)) + 1
        }
        onClose={() => {
          setCreatingClass(false);
          setEditingClass(undefined);
        }}
      />

      <SectionDialog
        forClass={sectionFor}
        editing={editingSection}
        sessionId={activeSessionId}
        classes={classes}
        onClose={() => {
          setSectionFor(undefined);
          setEditingSection(undefined);
        }}
      />

      <ConfirmDialog
        open={deleting !== undefined}
        onOpenChange={(open) => {
          if (!open) {
            setDeleting(undefined);
          }
        }}
        title={`Delete ${deleting?.label ?? ''}?`}
        description={
          deleting?.kind === 'class'
            ? 'Nobody has been enrolled in it, so nothing is lost. Its sections go with it.'
            : 'Nobody is in this section, so nothing is lost.'
        }
        confirmLabel="Delete"
        tone="danger"
        onConfirm={confirmDelete}
      />
    </div>
  );
}

/** Add or rename a class. Same dialog for both, keyed so defaults reset. */
function ClassDialog({
  open,
  editing,
  suggestedOrder,
  onClose,
}: {
  open: boolean;
  editing: ClassLevel | undefined;
  suggestedOrder: number;
  onClose: () => void;
}) {
  const router = useRouter();
  const toast = useToast();

  const [name, setName] = useState(editing?.name ?? '');
  const [order, setOrder] = useState(String(editing?.numericOrder ?? suggestedOrder));
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | undefined>(undefined);
  const [isPending, setIsPending] = useState(false);

  // The dialog is mounted once and reused, so its fields are reset when it
  // opens rather than relying on a remount that does not happen.
  function reset() {
    setName(editing?.name ?? '');
    setOrder(String(editing?.numericOrder ?? suggestedOrder));
    setFieldErrors({});
    setFormError(undefined);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFieldErrors({});
    setFormError(undefined);

    const parsed = createClassLevelSchema.safeParse({
      name,
      numericOrder: Number(order),
      isActive: editing?.isActive ?? true,
    });

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
        ? await mutate(ROUTES.academics.classes, 'POST', parsed.data)
        : await mutate(ROUTES.academics.class(editing.id), 'PATCH', parsed.data);
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
              {editing === undefined ? 'Add a class' : `Edit ${editing.name}`}
            </DialogTitle>
            <DialogDescription>
              A grade the school teaches. Sections are added to it next.
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

            <Field label="Class name" error={fieldErrors['name']} required>
              <Input
                value={name}
                autoFocus
                placeholder="Grade 1"
                onChange={(event) => {
                  setName(event.target.value);
                }}
              />
            </Field>

            <Field
              label="Order"
              error={fieldErrors['numericOrder']}
              hint="Sorts the list and drives promotion. Nursery 0, Grade 1 is 1, and so on — alphabetical would put Grade 10 before Grade 2."
              required
            >
              <Input
                value={order}
                inputMode="numeric"
                className="w-24 text-right font-mono tabular-nums"
                onChange={(event) => {
                  setOrder(event.target.value);
                }}
              />
            </Field>
          </DialogBody>

          <DialogFooter>
            <Button type="button" tone="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" isPending={isPending}>
              {editing === undefined ? 'Add class' : 'Save changes'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** Add a section to a class, or edit one — including moving it to another class. */
function SectionDialog({
  forClass,
  editing,
  sessionId,
  classes,
  onClose,
}: {
  forClass: ClassLevel | undefined;
  editing: { section: Section; className: string } | undefined;
  sessionId: string | undefined;
  classes: readonly ClassLevel[];
  onClose: () => void;
}) {
  const router = useRouter();
  const toast = useToast();

  const [name, setName] = useState('');
  const [capacity, setCapacity] = useState('');
  const [classLevelId, setClassLevelId] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | undefined>(undefined);
  const [isPending, setIsPending] = useState(false);

  const open = forClass !== undefined || editing !== undefined;

  function reset() {
    setName(editing?.section.name ?? '');
    setCapacity(
      editing?.section.capacity === undefined || editing.section.capacity === null
        ? ''
        : String(editing.section.capacity),
    );
    setClassLevelId(
      forClass?.id ??
        classes.find((entry) => entry.sections.some((s) => s.id === editing?.section.id))?.id ??
        '',
    );
    setFieldErrors({});
    setFormError(undefined);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFieldErrors({});
    setFormError(undefined);

    if (editing === undefined && sessionId === undefined) {
      setFormError('Create an academic session first — a section belongs to one.');
      return;
    }

    const capacityValue = capacity.trim() === '' ? undefined : Number(capacity);
    if (capacityValue !== undefined && (!Number.isInteger(capacityValue) || capacityValue < 1)) {
      setFieldErrors({ capacity: 'Enter a whole number, or leave it blank for no limit.' });
      return;
    }

    setIsPending(true);
    let result;

    if (editing === undefined) {
      const parsed = createSectionSchema.safeParse({
        classLevelId,
        sessionId,
        name,
        ...(capacityValue === undefined ? {} : { capacity: capacityValue }),
      });
      if (!parsed.success) {
        setIsPending(false);
        const next: Record<string, string> = {};
        for (const issue of parsed.error.issues) {
          next[issue.path.join('.')] = issue.message;
        }
        setFieldErrors(next);
        return;
      }
      result = await mutate(ROUTES.academics.sections, 'POST', parsed.data);
    } else {
      result = await mutate(ROUTES.academics.section(editing.section.id), 'PATCH', {
        name,
        // `null` clears the limit; `undefined` would leave it untouched, and
        // the two must not collapse or a capacity can never be removed.
        capacity: capacityValue ?? null,
        ...(classLevelId === '' ? {} : { classLevelId }),
      });
    }

    setIsPending(false);

    if (!result.ok) {
      setFormError(result.message);
      setFieldErrors(result.fieldErrors);
      return;
    }

    toast.success(editing === undefined ? `Section ${name} added` : `Section ${name} saved`);
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
              {editing === undefined
                ? `Add a section to ${forClass?.name ?? ''}`
                : `Edit section ${editing.section.name}`}
            </DialogTitle>
            <DialogDescription>
              Sections belong to one session, so this one is created in the session shown on the
              page.
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

            <Field label="Section name" error={fieldErrors['name']} required>
              <Input
                value={name}
                autoFocus
                placeholder="A"
                onChange={(event) => {
                  setName(event.target.value);
                }}
              />
            </Field>

            <Field
              label="Capacity"
              error={fieldErrors['capacity']}
              hint="Optional. Leave blank for no limit."
            >
              <Input
                value={capacity}
                inputMode="numeric"
                placeholder="30"
                className="w-28 text-right font-mono tabular-nums"
                onChange={(event) => {
                  setCapacity(event.target.value);
                }}
              />
            </Field>

            {editing === undefined ? null : (
              <Field label="Class" hint="Moving a section takes its students with it.">
                <SimpleSelect
                  value={classLevelId}
                  onValueChange={setClassLevelId}
                  options={classes.map((entry) => ({ value: entry.id, label: entry.name }))}
                  ariaLabel="Class"
                />
              </Field>
            )}
          </DialogBody>

          <DialogFooter>
            <Button type="button" tone="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" isPending={isPending}>
              {editing === undefined ? 'Add section' : 'Save changes'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
