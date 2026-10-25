'use client';

import {
  GENDERS,
  ROUTES,
  updateStudentSchema,
  type StudentListItem,
  type UpdateStudent,
} from '@ilm/contracts';
import {
  Button,
  DatePicker,
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
  Textarea,
  useToast,
} from '@ilm/ui';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';

import { mutate } from '@/lib/mutate';

/**
 * Edit a student's details — all of them.
 *
 * This used to offer three fields: first name, last name, gender. Everything
 * else a school types at admission — date of birth, B-Form, religion, blood
 * group, nationality, address, city, emergency contact, the admission date —
 * could be entered once and then never corrected, which makes a typo at the
 * front desk permanent. `updateStudentSchema` has always accepted the lot; the
 * form simply did not ask.
 *
 * **Status is absent, and so are both numbers.** Status is a state change with
 * consequences — leaving ends an enrolment and stops billing — so it has its
 * own action that can require a reason. The GR number and Student ID are the
 * school's permanent record of this child; editing them is how two children end
 * up sharing one, and how a register stops being trustworthy. They are shown,
 * read-only, so the operator can see who they are editing.
 *
 * **Fees are their own dialog.** A fee structure is a list of money that is
 * replaced as a whole and audited as a whole, not a field on a form.
 */

/** Everything this dialog can edit, beyond what a list row carries. */
export interface EditableStudent extends StudentListItem {
  readonly dateOfBirth?: string | null;
  readonly religion?: string | null;
  readonly bloodGroup?: string | null;
  readonly nationality?: string | null;
  readonly address?: string | null;
  readonly city?: string | null;
  readonly emergencyContact?: string | null;
}

export interface EditStudentDialogProps {
  readonly student: EditableStudent;
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
}

export function EditStudentDialog({ student, open, onOpenChange }: EditStudentDialogProps) {
  const router = useRouter();
  const toast = useToast();

  const [form, setForm] = useState(() => initialFrom(student));
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | undefined>(undefined);
  const [isPending, setIsPending] = useState(false);

  function set<K extends keyof EditForm>(key: K, value: EditForm[K]): void {
    setForm((current) => ({ ...current, [key]: value }));
    setFieldErrors((current) => {
      if (current[key as string] === undefined) {
        return current;
      }
      const next = { ...current };
      delete next[key as string];
      return next;
    });
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(undefined);
    setFieldErrors({});

    const parsed = updateStudentSchema.safeParse(toPayload(form));

    if (!parsed.success) {
      const next: Record<string, string> = {};
      for (const issue of parsed.error.issues) {
        next[issue.path.join('.')] = issue.message;
      }
      setFieldErrors(next);
      return;
    }

    setIsPending(true);
    const result = await mutate<StudentListItem>(
      ROUTES.students.update(student.id),
      'PATCH',
      parsed.data,
    );
    setIsPending(false);

    if (!result.ok) {
      setFormError(result.message);
      setFieldErrors(result.fieldErrors);
      return;
    }

    toast.success(`${result.data.firstName} ${result.data.lastName} updated`);
    onOpenChange(false);
    router.refresh();
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!isPending) {
          onOpenChange(next);
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
            <DialogTitle>Edit student</DialogTitle>
            <DialogDescription>
              GR <span className="font-mono text-foreground">{student.grNo}</span> · Student ID{' '}
              <span className="font-mono text-foreground">{student.studentCode}</span>. Neither can
              be changed.
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
                  onChange={(event) => {
                    set('firstName', event.target.value);
                  }}
                  autoFocus
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
                  options={GENDERS.map((value) => ({
                    value,
                    label: value.charAt(0) + value.slice(1).toLowerCase(),
                  }))}
                />
              </Field>

              <Field label="Date of birth" error={fieldErrors['dateOfBirth']}>
                <DatePicker
                  value={form.dateOfBirth}
                  onChange={(value) => {
                    set('dateOfBirth', value);
                  }}
                />
              </Field>

              <Field label="Admitted on" error={fieldErrors['admittedOn']}>
                <DatePicker
                  value={form.admittedOn}
                  onChange={(value) => {
                    set('admittedOn', value);
                  }}
                />
              </Field>

              <Field label="Religion" error={fieldErrors['religion']}>
                <Input
                  value={form.religion}
                  onChange={(event) => {
                    set('religion', event.target.value);
                  }}
                />
              </Field>

              <Field label="Blood group" error={fieldErrors['bloodGroup']}>
                <Input
                  value={form.bloodGroup}
                  placeholder="O+"
                  onChange={(event) => {
                    set('bloodGroup', event.target.value);
                  }}
                />
              </Field>

              <Field label="Nationality" error={fieldErrors['nationality']}>
                <Input
                  value={form.nationality}
                  onChange={(event) => {
                    set('nationality', event.target.value);
                  }}
                />
              </Field>

              <Field label="City" error={fieldErrors['city']}>
                <Input
                  value={form.city}
                  onChange={(event) => {
                    set('city', event.target.value);
                  }}
                />
              </Field>

              <Field
                label="Emergency contact"
                hint="Who to ring when the guardian cannot be reached."
                error={fieldErrors['emergencyContact']}
                className="sm:col-span-2"
              >
                <Input
                  value={form.emergencyContact}
                  onChange={(event) => {
                    set('emergencyContact', event.target.value);
                  }}
                />
              </Field>

              <Field label="Address" error={fieldErrors['address']} className="sm:col-span-2">
                <Textarea
                  rows={2}
                  value={form.address}
                  onChange={(event) => {
                    set('address', event.target.value);
                  }}
                />
              </Field>
            </div>
          </DialogBody>

          <DialogFooter>
            <Button
              type="button"
              tone="ghost"
              disabled={isPending}
              onClick={() => {
                onOpenChange(false);
              }}
            >
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

interface EditForm {
  firstName: string;
  lastName: string;
  gender: string;
  dateOfBirth: string;
  religion: string;
  bloodGroup: string;
  nationality: string;
  address: string;
  city: string;
  emergencyContact: string;
  admittedOn: string;
}

function initialFrom(student: EditableStudent): EditForm {
  return {
    firstName: student.firstName,
    lastName: student.lastName,
    gender: student.gender ?? '',
    dateOfBirth: student.dateOfBirth ?? '',
    religion: student.religion ?? '',
    bloodGroup: student.bloodGroup ?? '',
    nationality: student.nationality ?? '',
    address: student.address ?? '',
    city: student.city ?? '',
    emergencyContact: student.emergencyContact ?? '',
    admittedOn: student.admittedOn ?? '',
  };
}

/**
 * Blank means "not recorded", so a blank field is omitted rather than sent.
 *
 * `updateStudentSchema` is `.partial()`, and the optional strings do not accept
 * `''` — sending one would be a validation error on a field the operator simply
 * left alone.
 */
function toPayload(form: EditForm): UpdateStudent {
  const optional = (value: string): string | undefined =>
    value.trim() === '' ? undefined : value.trim();

  return {
    firstName: form.firstName,
    lastName: form.lastName,
    ...(form.gender === '' ? {} : { gender: form.gender as UpdateStudent['gender'] }),
    ...(optional(form.dateOfBirth) === undefined ? {} : { dateOfBirth: form.dateOfBirth }),
    ...(optional(form.admittedOn) === undefined ? {} : { admittedOn: form.admittedOn }),
    ...pick('religion', optional(form.religion)),
    ...pick('bloodGroup', optional(form.bloodGroup)),
    ...pick('nationality', optional(form.nationality)),
    ...pick('address', optional(form.address)),
    ...pick('city', optional(form.city)),
    ...pick('emergencyContact', optional(form.emergencyContact)),
  };
}

function pick<K extends string>(key: K, value: string | undefined): Record<K, string> | object {
  return value === undefined ? {} : ({ [key]: value });
}
