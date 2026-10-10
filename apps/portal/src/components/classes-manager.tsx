'use client';

import {
  createClassLevelSchema,
  createSectionSchema,
  ROUTES,
  type AcademicSession,
  type ClassLevel,
  type SchoolLevelId,
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
  Field,
  Input,
  SimpleSelect,
  useToast,
} from '@ilm/ui';
import { useRouter } from 'next/navigation';
import { useEffect, useState, type FormEvent } from 'react';

import { ClassesTable } from '@/components/classes-table';
import { mutate } from '@/lib/mutate';

export interface ClassesManagerProps {
  classes: ClassLevel[];
  sessions: AcademicSession[];
  activeSessionId: string | undefined;
  error?: string | undefined;
  canConfigure: boolean;
  canRenumber: boolean;
  enabledSchoolLevels: SchoolLevelId[];
}

export function ClassesManager({
  classes,
  sessions,
  activeSessionId,
  error,
  canConfigure,
  canRenumber,
  enabledSchoolLevels,
}: ClassesManagerProps) {
  const router = useRouter();
  const toast = useToast();

  const [editingClass, setEditingClass] = useState<ClassLevel | undefined>(undefined);
  const [sectionFor, setSectionFor] = useState<ClassLevel | undefined>(undefined);
  const [editingSection, setEditingSection] = useState<
    { section: Section; className: string } | undefined
  >(undefined);
  const [deleting, setDeleting] = useState<
    { kind: 'class' | 'section'; id: string; label: string } | undefined
  >(undefined);
  const [renumbering, setRenumbering] = useState<string | undefined>(undefined);

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
      toast.error(result.message);
      return;
    }

    toast.success(`${deleting.label} deleted`);
    setDeleting(undefined);
    router.refresh();
  }

  async function renumberSection(
    className: string,
    section: { id: string; name: string },
  ): Promise<void> {
    setRenumbering(section.id);
    const result = await mutate<{ renumbered: number }>(
      ROUTES.academics.renumberSection(section.id),
      'POST',
    );
    setRenumbering(undefined);

    if (!result.ok) {
      toast.error(result.message);
      return;
    }

    toast.success(
      `${className} — ${section.name} renumbered`,
      result.data.renumbered === 0
        ? 'There is nobody in this section yet.'
        : `${String(result.data.renumbered)} students, roll 1 to ${String(result.data.renumbered)}, in name order.`,
    );
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

  return (
    <>
      <ClassesTable
        classes={classes}
        sessions={sessions.map((entry) => ({
          id: entry.id,
          name: entry.name,
          isCurrent: entry.isCurrent,
        }))}
        activeSessionId={activeSessionId}
        onSessionChange={changeSession}
        error={error}
        canConfigure={canConfigure}
        onAddSection={(entry) => {
          setSectionFor(entry);
        }}
        onEditClass={(entry) => {
          setEditingClass(entry);
        }}
        onEditSection={(entry, sectionId) => {
          const section = entry.sections.find((row) => row.id === sectionId);
          if (section === undefined) {
            return;
          }
          setEditingSection({ section, className: entry.name });
        }}
        onDeleteClass={(entry) => {
          setDeleting({ kind: 'class', id: entry.id, label: entry.name });
        }}
        onDeleteSection={(entry, section) => {
          setDeleting({
            kind: 'section',
            id: section.id,
            label: `Section ${section.name} (${entry.name})`,
          });
        }}
        canRenumber={canRenumber}
        renumberingSectionId={renumbering}
        onRenumberSection={(entry, section) => {
          void renumberSection(entry.name, section);
        }}
        enabledSchoolLevels={enabledSchoolLevels}
      />

      {editingClass === undefined ? null : (
        <ClassDialog
          key={editingClass.id}
          editing={editingClass}
          onClose={() => {
            setEditingClass(undefined);
          }}
        />
      )}

      {sectionFor !== undefined || editingSection !== undefined ? (
        <SectionDialog
          key={editingSection?.section.id ?? 'new'}
          forClass={sectionFor}
          editing={editingSection}
          sessionId={activeSessionId}
          classes={classes}
          onClose={() => {
            setSectionFor(undefined);
            setEditingSection(undefined);
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
    </>
  );
}

function ClassDialog({
  editing,
  onClose,
}: {
  editing: ClassLevel;
  onClose: () => void;
}) {
  const router = useRouter();
  const toast = useToast();

  const [name, setName] = useState(editing.name);
  const [order, setOrder] = useState(String(editing.numericOrder));
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | undefined>(undefined);
  const [isPending, setIsPending] = useState(false);

  useEffect(() => {
    setName(editing.name);
    setOrder(String(editing.numericOrder));
    setFieldErrors({});
    setFormError(undefined);
  }, [editing.id, editing.name, editing.numericOrder]);

  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setFieldErrors({});
    setFormError(undefined);

    const parsed = createClassLevelSchema.safeParse({
      name,
      numericOrder: Number(order),
      isActive: editing.isActive,
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
    const result = await mutate(ROUTES.academics.class(editing.id), 'PATCH', parsed.data);
    setIsPending(false);

    if (!result.ok) {
      setFormError(result.message);
      return;
    }

    toast.success('Class updated.');
    onClose();
    router.refresh();
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit class</DialogTitle>
          <DialogDescription>Rename or re-order this class in the promotion sequence.</DialogDescription>
        </DialogHeader>
        <form
          onSubmit={(event) => {
            void submit(event);
          }}
          noValidate
        >
          <DialogBody className="space-y-4">
            {formError === undefined ? null : (
              <p role="alert" className="text-sm text-danger">
                {formError}
              </p>
            )}
            <Field label="Name" error={fieldErrors['name']} required>
              <Input
                value={name}
                onChange={(event) => {
                  setName(event.target.value);
                }}
              />
            </Field>
            <Field label="Sort order" error={fieldErrors['numericOrder']} hint="Used for promotion.">
              <Input
                value={order}
                inputMode="numeric"
                className="w-24 font-mono tabular-nums"
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
              Save changes
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

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

  useEffect(reset, []);

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
        capacity: capacityValue ?? null,
        ...(classLevelId === '' ? {} : { classLevelId }),
      });
    }

    setIsPending(false);

    if (!result.ok) {
      setFormError(result.message);
      return;
    }

    toast.success(editing === undefined ? 'Section added.' : 'Section updated.');
    onClose();
    router.refresh();
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{editing === undefined ? 'Add section' : 'Edit section'}</DialogTitle>
          <DialogDescription>
            {editing === undefined
              ? 'Students are admitted into a section within the selected session.'
              : `Section in ${editing.className}.`}
          </DialogDescription>
        </DialogHeader>
        <form
          onSubmit={(event) => {
            void submit(event);
          }}
          noValidate
        >
          <DialogBody className="space-y-4">
            {formError === undefined ? null : (
              <p role="alert" className="text-sm text-danger">
                {formError}
              </p>
            )}
            {editing === undefined ? (
              <Field label="Class" error={fieldErrors['classLevelId']} required>
                <SimpleSelect
                  value={classLevelId}
                  onValueChange={setClassLevelId}
                  options={classes.map((entry) => ({ value: entry.id, label: entry.name }))}
                  placeholder="Choose class"
                  ariaLabel="Class"
                />
              </Field>
            ) : null}
            <Field label="Section name" error={fieldErrors['name']} required>
              <Input
                value={name}
                placeholder="A"
                onChange={(event) => {
                  setName(event.target.value);
                }}
              />
            </Field>
            <Field
              label="Capacity"
              hint="Optional maximum students."
              error={fieldErrors['capacity']}
            >
              <Input
                value={capacity}
                inputMode="numeric"
                placeholder="No limit"
                onChange={(event) => {
                  setCapacity(event.target.value);
                }}
              />
            </Field>
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
