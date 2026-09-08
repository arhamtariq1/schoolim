'use client';

import {
  GUARDIAN_RELATIONS,
  ROUTES,
  upsertGuardianSchema,
  type StudentGuardian,
} from '@ilm/contracts';
import { Button, CheckboxField, Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, Field, Input, SimpleSelect, useToast } from '@ilm/ui';
import { SearchIcon } from '@ilm/ui/icons';
import { useRouter } from 'next/navigation';
import { useEffect, useState, type FormEvent } from 'react';

import { mutate } from '@/lib/mutate';

/**
 * Add or edit a guardian.
 *
 * The important part is the search at the top when adding. A school types the
 * same father's name three times for three siblings, and each time it creates a
 * new person. That costs them three phone numbers to keep in step, three fee
 * vouchers where one family should get one, and a sibling discount nobody can
 * calculate. So this looks for an existing guardian **before** offering the
 * form, and linking is one click.
 */

export interface GuardianDialogProps {
  readonly studentId: string;
  readonly open: boolean;
  readonly mode: 'add' | 'edit';
  readonly guardian?: StudentGuardian | undefined;
  readonly onOpenChange: (open: boolean) => void;
}

interface Match {
  readonly id: string;
  readonly name: string;
  readonly phone: string | null;
  readonly childCount: number;
}

/** Pakistani numbers are typed a dozen ways; the contract wants E.164. */
function toE164(raw: string): string | undefined {
  const digits = raw.replace(/[\s()-]/g, '');
  if (digits === '') {
    return undefined;
  }
  if (digits.startsWith('+')) {
    return digits;
  }
  if (digits.startsWith('0')) {
    return `+92${digits.slice(1)}`;
  }
  if (digits.startsWith('92')) {
    return `+${digits}`;
  }
  return `+92${digits}`;
}

export function GuardianDialog({
  studentId,
  open,
  mode,
  guardian,
  onOpenChange,
}: GuardianDialogProps) {
  const router = useRouter();
  const toast = useToast();

  const [name, setName] = useState(guardian?.name ?? '');
  const [relation, setRelation] = useState<string>(guardian?.relation ?? 'FATHER');
  const [phone, setPhone] = useState(guardian?.phone ?? '');
  const [email, setEmail] = useState(guardian?.email ?? '');
  const [cnic, setCnic] = useState(guardian?.cnic ?? '');
  const [occupation, setOccupation] = useState(guardian?.occupation ?? '');
  const [isPrimary, setIsPrimary] = useState(guardian?.isPrimary ?? false);
  const [isFeePayer, setIsFeePayer] = useState(guardian?.isFeePayer ?? false);

  const [matches, setMatches] = useState<Match[]>([]);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | undefined>(undefined);
  const [isPending, setIsPending] = useState(false);

  // Only when adding. Editing an existing guardian must not offer to swap them
  // for somebody else halfway through.
  useEffect(() => {
    if (mode !== 'add' || name.trim().length < 2) {
      setMatches([]);
      return;
    }

    const timer = setTimeout(() => {
      void (async () => {
        try {
          const response = await fetch(
            `${ROUTES.students.guardianSearch}?q=${encodeURIComponent(name.trim())}`,
            { credentials: 'include' },
          );
          if (!response.ok) {
            setMatches([]);
            return;
          }
          const body = (await response.json()) as { data?: Match[] };
          setMatches(body.data ?? []);
        } catch {
          setMatches([]);
        }
      })();
    }, 300);

    return () => {
      clearTimeout(timer);
    };
  }, [mode, name]);

  async function linkExisting(match: Match) {
    setIsPending(true);
    const result = await mutate(ROUTES.students.guardianLink(studentId), 'POST', {
      guardianId: match.id,
    });
    setIsPending(false);

    if (!result.ok) {
      setFormError(result.message);
      return;
    }

    toast.success(`${match.name} linked`, 'Siblings now share one guardian record.');
    onOpenChange(false);
    router.refresh();
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(undefined);
    setFieldErrors({});

    const normalisedPhone = toE164(phone);

    const parsed = upsertGuardianSchema.safeParse({
      name,
      relation,
      ...(normalisedPhone === undefined ? {} : { phone: normalisedPhone }),
      ...(email.trim() === '' ? {} : { email }),
      ...(cnic.trim() === '' ? {} : { cnic }),
      ...(occupation.trim() === '' ? {} : { occupation }),
      isPrimary,
      isFeePayer,
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
      mode === 'edit' && guardian !== undefined
        ? await mutate(
            `${ROUTES.students.guardians(studentId)}/${guardian.id}`,
            'PATCH',
            parsed.data,
          )
        : await mutate(ROUTES.students.guardians(studentId), 'POST', parsed.data);
    setIsPending(false);

    if (!result.ok) {
      setFormError(result.message);
      setFieldErrors(result.fieldErrors);
      return;
    }

    toast.success(mode === 'edit' ? `${name} updated` : `${name} added`);
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
      <DialogContent className="max-w-xl">
        <form
          onSubmit={(event) => {
            void submit(event);
          }}
          noValidate
        >
          <DialogHeader>
            <DialogTitle>{mode === 'edit' ? 'Edit guardian' : 'Add a guardian'}</DialogTitle>
            <DialogDescription>
              {mode === 'edit'
                ? 'Changes apply everywhere this guardian appears, including their other children.'
                : 'If they already have a child here, link the existing record rather than creating a second one.'}
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

            <Field label="Full name" error={fieldErrors['name']} required>
              <Input
                value={name}
                autoFocus
                onChange={(event) => {
                  setName(event.target.value);
                }}
              />
            </Field>

            {/* The whole reason this dialog exists in this shape. */}
            {matches.length === 0 ? null : (
              <div className="rounded-md border border-border bg-muted/40 p-3">
                <p className="flex items-center gap-2 text-sm font-medium">
                  <SearchIcon className="size-4" aria-hidden="true" />
                  Already on file — link instead of adding again
                </p>
                <ul className="mt-2 space-y-1">
                  {matches.map((match) => (
                    <li
                      key={match.id}
                      className="flex flex-wrap items-center justify-between gap-2 rounded-md bg-background px-3 py-2"
                    >
                      <div className="min-w-0 text-sm">
                        <span className="font-medium">{match.name}</span>
                        {match.phone === null ? null : (
                          <span className="ms-2 font-mono text-xs text-muted-foreground">
                            {match.phone}
                          </span>
                        )}
                        <span className="ms-2 text-xs text-muted-foreground">
                          {match.childCount}{' '}
                          {match.childCount === 1 ? 'child here' : 'children here'}
                        </span>
                      </div>
                      <Button
                        type="button"
                        size="sm"
                        tone="outline"
                        disabled={isPending}
                        onClick={() => {
                          void linkExisting(match);
                        }}
                      >
                        Link
                      </Button>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Relation" error={fieldErrors['relation']} required>
                <SimpleSelect
                  value={relation}
                  onValueChange={setRelation}
                  options={GUARDIAN_RELATIONS.map((value) => ({
                    value,
                    label: value.charAt(0) + value.slice(1).toLowerCase(),
                  }))}
                />
              </Field>

              <Field
                label="Phone"
                error={fieldErrors['phone']}
                hint="03001234567 or +923001234567."
              >
                <Input
                  type="tel"
                  inputMode="tel"
                  value={phone}
                  onChange={(event) => {
                    setPhone(event.target.value);
                  }}
                />
              </Field>

              <Field label="Email" error={fieldErrors['email']}>
                <Input
                  type="email"
                  value={email}
                  onChange={(event) => {
                    setEmail(event.target.value);
                  }}
                />
              </Field>

              <Field label="Occupation" error={fieldErrors['occupation']}>
                <Input
                  value={occupation}
                  onChange={(event) => {
                    setOccupation(event.target.value);
                  }}
                />
              </Field>

              <Field
                label="CNIC"
                error={fieldErrors['cnic']}
                hint="Optional. Collect it only if your school needs it."
                className="sm:col-span-2"
              >
                <Input
                  value={cnic}
                  onChange={(event) => {
                    setCnic(event.target.value);
                  }}
                />
              </Field>
            </div>

            <fieldset className="space-y-2 rounded-md border border-border p-4">
              <legend className="px-1 text-sm font-medium">Role for this student</legend>

              <CheckboxField
                label="Primary contact"
                hint="The first person called. Setting this moves it off whoever holds it now."
                checked={isPrimary}
                onCheckedChange={(next) => {
                  setIsPrimary(next === true);
                }}
              />

              <CheckboxField
                label="Receives fee vouchers"
                hint="Exactly one guardian per student, or a family gets billed twice."
                checked={isFeePayer}
                onCheckedChange={(next) => {
                  setIsFeePayer(next === true);
                }}
              />
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
              {mode === 'edit' ? 'Save changes' : 'Add guardian'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
