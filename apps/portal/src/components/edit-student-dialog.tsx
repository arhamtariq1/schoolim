'use client';

import { GENDERS, ROUTES, updateStudentSchema, type StudentListItem } from '@ilm/contracts';
import {
  Button,
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
import { useState, type FormEvent } from 'react';

import { mutate } from '@/lib/mutate';

/**
 * Edit a student's details.
 *
 * **Status is absent, and so are both register numbers.** Status is a state
 * change with consequences — leaving ends an enrolment and stops billing — so
 * it has its own action that can require a reason. The GR and admission numbers
 * are the school's permanent record of this child; editing them is how two
 * children end up sharing one, and how a register stops being trustworthy.
 * They are shown, read-only, so the operator can see who they are editing.
 */

export interface EditStudentDialogProps {
  readonly student: StudentListItem;
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
}

export function EditStudentDialog({ student, open, onOpenChange }: EditStudentDialogProps) {
  const router = useRouter();
  const toast = useToast();
  const [firstName, setFirstName] = useState(student.firstName);
  const [lastName, setLastName] = useState(student.lastName);
  const [gender, setGender] = useState(student.gender ?? '');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | undefined>(undefined);
  const [isPending, setIsPending] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(undefined);
    setFieldErrors({});

    const parsed = updateStudentSchema.safeParse({
      firstName,
      lastName,
      ...(gender === '' ? {} : { gender }),
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
      <DialogContent>
        <form
          onSubmit={(event) => {
            void submit(event);
          }}
          noValidate
        >
          <DialogHeader>
            <DialogTitle>Edit student</DialogTitle>
            <DialogDescription>
              GR <span className="font-mono text-foreground">{student.grNo}</span> · Admission{' '}
              <span className="font-mono text-foreground">{student.admissionNo}</span>. Neither can
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
                  value={firstName}
                  autoFocus
                  onChange={(event) => {
                    setFirstName(event.target.value);
                  }}
                />
              </Field>

              <Field label="Last name" error={fieldErrors['lastName']} required>
                <Input
                  value={lastName}
                  onChange={(event) => {
                    setLastName(event.target.value);
                  }}
                />
              </Field>

              <Field label="Gender" error={fieldErrors['gender']}>
                <SimpleSelect
                  value={gender}
                  onValueChange={setGender}
                  placeholder="Not recorded"
                  emptyOption={{ value: '', label: 'Not recorded' }}
                  options={GENDERS.map((value) => ({
                    value,
                    label: value.charAt(0) + value.slice(1).toLowerCase(),
                  }))}
                />
              </Field>
            </div>
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
              {isPending ? 'Saving…' : 'Save changes'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
