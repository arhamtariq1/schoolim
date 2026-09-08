'use client';

import {
  createStudentSchema,
  GENDERS,
  GUARDIAN_RELATIONS,
  ROUTES,
  type CreateStudent,
} from '@ilm/contracts';
import { Button, DatePicker, Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, Field, Input, SimpleSelect, useToast } from '@ilm/ui';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';

import { mutate } from '@/lib/mutate';

/**
 * Admit a student.
 *
 * A dialog rather than a page because admission interrupts something else — a
 * parent is standing at the desk — and coming back to a list that has scrolled
 * to the top is its own small tax.
 *
 * Deliberately **not** every field the model has. This is what reception can
 * actually get from a parent in one pass: the child, the class, and someone to
 * telephone. Religion, blood group and B-form are on the student's own page,
 * where there is time. A form that asks for twenty things at admission is a
 * form people work around by typing "x" into the boxes they cannot answer.
 *
 * Neither number is asked for. Both are allocated server-side inside
 * the insert's transaction, because a client-supplied number is how two
 * children end up sharing one.
 */

export interface ClassOption {
  readonly id: string;
  readonly name: string;
  readonly sections: readonly { id: string; name: string }[];
}

export interface AdmitStudentDialogProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly sessionId: string | undefined;
  readonly classes: readonly ClassOption[];
}

interface FormState {
  firstName: string;
  lastName: string;
  gender: string;
  dateOfBirth: string;
  classLevelId: string;
  sectionId: string;
  guardianName: string;
  guardianRelation: string;
  guardianPhone: string;
}

const EMPTY: FormState = {
  firstName: '',
  lastName: '',
  gender: '',
  dateOfBirth: '',
  classLevelId: '',
  sectionId: '',
  guardianName: '',
  guardianRelation: 'FATHER',
  guardianPhone: '',
};

/** Pakistani numbers are typed a dozen ways; the contract wants E.164. */
function toE164(raw: string): string | undefined {
  const digits = raw.replace(/[\s()-]/g, '');
  if (digits === '') {
    return undefined;
  }
  if (digits.startsWith('+')) {
    return digits;
  }
  // 03001234567 → +923001234567. The leading 0 is a domestic trunk prefix and
  // is dropped, not kept — keeping it produces a number that never connects.
  if (digits.startsWith('0')) {
    return `+92${digits.slice(1)}`;
  }
  if (digits.startsWith('92')) {
    return `+${digits}`;
  }
  return `+92${digits}`;
}

export function AdmitStudentDialog({
  open,
  onOpenChange,
  sessionId,
  classes,
}: AdmitStudentDialogProps) {
  const router = useRouter();
  const toast = useToast();
  const [form, setForm] = useState<FormState>(EMPTY);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | undefined>(undefined);
  const [isPending, setIsPending] = useState(false);

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  const sections = classes.find((entry) => entry.id === form.classLevelId)?.sections ?? [];

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(undefined);
    setFieldErrors({});

    const phone = toE164(form.guardianPhone);

    const candidate = {
      firstName: form.firstName,
      lastName: form.lastName,
      ...(form.gender === '' ? {} : { gender: form.gender }),
      ...(form.dateOfBirth === '' ? {} : { dateOfBirth: form.dateOfBirth }),
      // Enrolment only when a class was chosen — a student may be admitted now
      // and placed later, and forcing a class here would mean inventing one.
      ...(form.classLevelId === '' || sessionId === undefined
        ? {}
        : {
            enrollment: {
              sessionId,
              classLevelId: form.classLevelId,
              ...(form.sectionId === '' ? {} : { sectionId: form.sectionId }),
            },
          }),
      ...(form.guardianName === ''
        ? {}
        : {
            guardian: {
              name: form.guardianName,
              relation: form.guardianRelation,
              ...(phone === undefined ? {} : { phone }),
            },
          }),
    };

    // The same schema the server will apply, so the message a person sees here
    // is the message the server would have sent (docs/12 R7).
    const parsed = createStudentSchema.safeParse(candidate);
    if (!parsed.success) {
      const next: Record<string, string> = {};
      for (const issue of parsed.error.issues) {
        next[issue.path.join('.')] = issue.message;
      }
      setFieldErrors(next);
      setFormError('Some details need fixing.');
      return;
    }

    setIsPending(true);
    const result = await mutate<{ id: string; grNo: string; studentCode: string }>(
      ROUTES.students.create,
      'POST',
      parsed.data satisfies CreateStudent,
    );
    setIsPending(false);

    if (!result.ok) {
      setFormError(result.message);
      setFieldErrors(result.fieldErrors);
      return;
    }

    // The GR number is what gets written on the file and read back later, so it
    // leads. Announced rather than only added to the list behind, because the
    // dialog closing looks the same as it being dismissed.
    toast.success(
      `${form.firstName} ${form.lastName} admitted`,
      `GR ${result.data.grNo} · Student ID ${result.data.studentCode}`,
    );

    setForm(EMPTY);
    onOpenChange(false);
    router.refresh();
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (isPending) {
          return;
        }
        if (!next) {
          setFieldErrors({});
          setFormError(undefined);
        }
        onOpenChange(next);
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
            <DialogTitle>Admit a student</DialogTitle>
            <DialogDescription>
              A GR number and a Student ID are issued automatically. Class and guardian can be added
              later if the parent does not have them now.
            </DialogDescription>
          </DialogHeader>

          <DialogBody className="space-y-5">
            {formError === undefined ? null : (
              <div
                role="alert"
                className="rounded-md border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger"
              >
                {formError}
              </div>
            )}

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="First name" error={fieldErrors['firstName']} required>
                <Input
                  value={form.firstName}
                  autoFocus
                  onChange={(event) => {
                    set('firstName', event.target.value);
                  }}
                />
              </Field>

              <Field label="Last name" error={fieldErrors['lastName']} required>
                <Input
                  value={form.lastName}
                  onChange={(event) => {
                    set('lastName', event.target.value);
                  }}
                />
              </Field>

              <Field label="Gender" error={fieldErrors['gender']}>
                <SimpleSelect
                  value={form.gender}
                  onValueChange={(value) => {
                    set('gender', value);
                  }}
                  placeholder="Not recorded"
                  emptyOption={{ value: '', label: 'Not recorded' }}
                  options={GENDERS.map((value) => ({
                    value,
                    label: value.charAt(0) + value.slice(1).toLowerCase(),
                  }))}
                />
              </Field>

              <Field label="Date of birth" error={fieldErrors['dateOfBirth']}>
                <DatePicker
                  value={form.dateOfBirth}
                  onChange={(nextValue) => {
                    set('dateOfBirth', nextValue);
                  }}
                />
              </Field>
            </div>

            <fieldset className="space-y-4 rounded-md border border-border p-4">
              <legend className="px-1 text-sm font-medium">Class</legend>

              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Class" error={fieldErrors['enrollment.classLevelId']}>
                  <SimpleSelect
                    value={form.classLevelId}
                    onValueChange={(value) => {
                      set('classLevelId', value);
                      // The old section belongs to the old class. Keeping it
                      // would enrol the child into another class's section.
                      set('sectionId', '');
                    }}
                    placeholder="Not placed yet"
                    emptyOption={{ value: '', label: 'Not placed yet' }}
                    options={classes.map((entry) => ({ value: entry.id, label: entry.name }))}
                  />
                </Field>

                <Field label="Section" error={fieldErrors['enrollment.sectionId']}>
                  <SimpleSelect
                    value={form.sectionId}
                    onValueChange={(value) => {
                      set('sectionId', value);
                    }}
                    disabled={form.classLevelId === ''}
                    placeholder={form.classLevelId === '' ? 'Choose a class first' : 'Any section'}
                    emptyOption={{ value: '', label: 'Not assigned' }}
                    options={sections.map((entry) => ({ value: entry.id, label: entry.name }))}
                  />
                </Field>
              </div>
            </fieldset>

            <fieldset className="space-y-4 rounded-md border border-border p-4">
              <legend className="px-1 text-sm font-medium">Guardian</legend>
              <p className="text-sm text-muted-foreground">
                One contactable adult. Fee notices and absence messages go here.
              </p>

              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Name" error={fieldErrors['guardian.name']}>
                  <Input
                    value={form.guardianName}
                    onChange={(event) => {
                      set('guardianName', event.target.value);
                    }}
                  />
                </Field>

                <Field label="Relation" error={fieldErrors['guardian.relation']}>
                  <SimpleSelect
                    value={form.guardianRelation}
                    onValueChange={(value) => {
                      set('guardianRelation', value);
                    }}
                    options={GUARDIAN_RELATIONS.map((value) => ({
                      value,
                      label: value.charAt(0) + value.slice(1).toLowerCase(),
                    }))}
                  />
                </Field>

                <Field
                  label="Phone"
                  error={fieldErrors['guardian.phone']}
                  hint="03001234567 or +923001234567 — both work."
                  className="sm:col-span-2"
                >
                  <Input
                    type="tel"
                    inputMode="tel"
                    value={form.guardianPhone}
                    onChange={(event) => {
                      set('guardianPhone', event.target.value);
                    }}
                  />
                </Field>
              </div>
            </fieldset>
          </DialogBody>

          <DialogFooter>
            <Button
              type="button"
              tone="outline"
              disabled={isPending}
              onClick={() => {
                onOpenChange(false);
              }}
            >
              Cancel
            </Button>
            <Button type="submit" isPending={isPending}>
              {isPending ? 'Admitting…' : 'Admit student'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
