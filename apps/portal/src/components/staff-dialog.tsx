'use client';

import {
  createStaffSchema,
  ROUTES,
  STAFF_ROLE_LABELS,
  STAFF_ROLES,
  staffRoleCanSignIn,
  type StaffListItem,
  type StaffProfile,
  type StaffRole,
} from '@ilm/contracts';
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
  Textarea,
  useToast,
} from '@ilm/ui';
import { useRouter } from 'next/navigation';
import { useEffect, useState, type FormEvent } from 'react';

import { fetchJson, mutate } from '@/lib/mutate';

const ROLE_OPTIONS = STAFF_ROLES.map((value) => ({ value, label: STAFF_ROLE_LABELS[value] }));

const GENDER_OPTIONS = [
  { value: 'MALE', label: 'Male' },
  { value: 'FEMALE', label: 'Female' },
  { value: 'OTHER', label: 'Other' },
];

const PHOTO_MAX_BYTES = 512 * 1024;
const CV_MAX_BYTES = 2 * 1024 * 1024;

export function StaffDialog({
  editing,
  onClose,
}: {
  editing: StaffListItem | StaffProfile | undefined;
  onClose: () => void;
}) {
  const router = useRouter();
  const toast = useToast();

  const [name, setName] = useState(editing?.name ?? '');
  const [email, setEmail] = useState(editing?.email ?? '');
  const [phone, setPhone] = useState(editing?.phone ?? '');
  const [gender, setGender] = useState<string>(editing?.gender ?? '');
  const [role, setRole] = useState<StaffRole>(editing?.role ?? 'TEACHER');
  const [casual, setCasual] = useState(String(editing?.casualLeaves ?? 0));
  const [sick, setSick] = useState(String(editing?.sickLeaves ?? 0));
  const [salary, setSalary] = useState(
    editing === undefined ? '0' : (editing.basicSalaryMinor / 100).toFixed(2),
  );
  const [cnic, setCnic] = useState('');
  const [address, setAddress] = useState('');
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [cvUrl, setCvUrl] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | undefined>(undefined);
  const [isPending, setIsPending] = useState(false);
  const [loadingProfile, setLoadingProfile] = useState(editing !== undefined);

  const canSignIn = staffRoleCanSignIn(role);

  useEffect(() => {
    if (editing === undefined) {
      setLoadingProfile(false);
      return;
    }

    const profile = editing as StaffProfile;
    if (profile.cnic !== undefined) {
      setCnic(profile.cnic ?? '');
      setAddress(profile.address ?? '');
      setPhotoUrl(profile.photoUrl);
      setCvUrl(profile.cvUrl);
      setLoadingProfile(false);
      return;
    }

    let cancelled = false;
    void fetchJson<{ data: StaffProfile }>(ROUTES.staff.detail(editing.id)).then((result) => {
      if (cancelled) {
        return;
      }
      if (result.ok) {
        setCnic(result.data.data.cnic ?? '');
        setAddress(result.data.data.address ?? '');
        setPhotoUrl(result.data.data.photoUrl);
        setCvUrl(result.data.data.cvUrl);
      }
      setLoadingProfile(false);
    });

    return () => {
      cancelled = true;
    };
  }, [editing]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFieldErrors({});
    setFormError(undefined);

    const rupees = Number(salary);
    if (!Number.isFinite(rupees) || rupees < 0) {
      setFieldErrors({ basicSalaryMinor: 'Enter an amount, for example 40000.' });
      return;
    }

    const payload = {
      name,
      role,
      casualLeaves: Number(casual) || 0,
      sickLeaves: Number(sick) || 0,
      basicSalaryMinor: Math.trunc(rupees * 100 + 0.5),
      ...(email.trim() === '' ? {} : { email }),
      ...(phone.trim() === '' ? {} : { phone: toE164(phone) }),
      ...(gender === '' ? {} : { gender }),
      ...(editing === undefined ? { cnic: cnic.trim() } : {}),
      ...(editing !== undefined && cnic.trim() !== '' ? { cnic: cnic.trim() } : {}),
      ...(address.trim() === '' ? { address: null } : { address: address.trim() }),
      photoUrl,
      cvUrl,
    };

    if (editing === undefined) {
      const parsed = createStaffSchema.safeParse(payload);
      if (!parsed.success) {
        const next: Record<string, string> = {};
        for (const issue of parsed.error.issues) {
          next[issue.path.join('.')] = issue.message;
        }
        setFieldErrors(next);
        setFormError('Check the highlighted fields.');
        return;
      }
    }

    setIsPending(true);
    const result =
      editing === undefined
        ? await mutate(ROUTES.staff.create, 'POST', payload)
        : await mutate(ROUTES.staff.update(editing.id), 'PATCH', payload);
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
      <DialogContent className="max-w-3xl">
        <form
          onSubmit={(event) => {
            void submit(event);
          }}
          noValidate
        >
          <DialogHeader>
            <DialogTitle>
              {editing === undefined ? 'Add staff' : `Edit ${editing.name}`}
            </DialogTitle>
            <DialogDescription>
              Roles that use the portal can be given a login. Security guards and janitors are on
              the payroll without one.
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

            {loadingProfile ? (
              <p className="text-sm text-muted-foreground">Loading profile…</p>
            ) : (
              <>
                <Field label="Name" error={fieldErrors['name']} required>
                  <Input
                    value={name}
                    autoFocus
                    onChange={(event) => {
                      setName(event.target.value);
                    }}
                  />
                </Field>

                <Field label="CNIC" error={fieldErrors['cnic']} required hint="National ID card number.">
                  <Input
                    value={cnic}
                    placeholder="35202-1234567-1"
                    className="font-mono tabular-nums"
                    onChange={(event) => {
                      setCnic(event.target.value);
                    }}
                  />
                </Field>

                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Role" error={fieldErrors['role']} required>
                    <SimpleSelect
                      value={role}
                      onValueChange={(next) => {
                        setRole(next as StaffRole);
                      }}
                      options={ROLE_OPTIONS}
                      ariaLabel="Role"
                    />
                  </Field>
                  <Field label="Gender" error={fieldErrors['gender']}>
                    <SimpleSelect
                      value={gender}
                      onValueChange={setGender}
                      options={GENDER_OPTIONS}
                      ariaLabel="Gender"
                      emptyOption={{ value: '', label: 'Not recorded' }}
                    />
                  </Field>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <Field
                    label="Email"
                    error={fieldErrors['email']}
                    hint={
                      canSignIn
                        ? 'The invitation to set up their portal login is sent here.'
                        : 'Optional — this role does not use the portal.'
                    }
                    required={canSignIn}
                  >
                    <Input
                      type="email"
                      value={email}
                      onChange={(event) => {
                        setEmail(event.target.value);
                      }}
                    />
                  </Field>
                  <Field
                    label="Phone"
                    error={fieldErrors['phone']}
                    hint="Start with 0 and we will add +92."
                    required
                  >
                    <Input
                      type="tel"
                      inputMode="tel"
                      placeholder="0300 1234567"
                      value={phone}
                      onChange={(event) => {
                        setPhone(event.target.value);
                      }}
                    />
                  </Field>
                </div>

                <Field label="Address" error={fieldErrors['address']} hint="Optional.">
                  <Textarea
                    value={address}
                    rows={2}
                    onChange={(event) => {
                      setAddress(event.target.value);
                    }}
                  />
                </Field>

                {!canSignIn ? null : (
                  <p className="rounded-md border border-border bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
                    {editing === undefined
                      ? 'An invitation is emailed as soon as you save. They choose their own password — nobody here ever sees it.'
                      : 'Re-send an invitation from the staff list if they have not set a password yet.'}
                  </p>
                )}

                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-1">
                    <Field
                      label="Photo"
                      error={fieldErrors['photoUrl']}
                      hint="Optional. PNG, JPEG or WebP, up to 512 KB."
                    >
                      <Input
                        type="file"
                        accept="image/png,image/jpeg,image/webp"
                        onChange={(event) => {
                          void pickImage(
                            event.target.files?.[0],
                            setPhotoUrl,
                            setFieldErrors,
                            'photoUrl',
                          );
                          event.target.value = '';
                        }}
                      />
                    </Field>
                    {photoUrl === null || photoUrl === '' ? null : (
                      <p className="text-xs text-muted-foreground">Photo attached.</p>
                    )}
                  </div>
                  <div className="space-y-1">
                    <Field label="CV" error={fieldErrors['cvUrl']} hint="Optional. PDF, up to 2 MB.">
                      <Input
                        type="file"
                        accept="application/pdf"
                        onChange={(event) => {
                          void pickPdf(event.target.files?.[0], setCvUrl, setFieldErrors, 'cvUrl');
                          event.target.value = '';
                        }}
                      />
                    </Field>
                    {cvUrl === null || cvUrl === '' ? null : (
                      <p className="text-xs text-muted-foreground">CV attached.</p>
                    )}
                  </div>
                </div>

                <div className="grid gap-4 sm:grid-cols-3">
                  <Field label="Casual leaves" error={fieldErrors['casualLeaves']}>
                    <Input
                      value={casual}
                      inputMode="numeric"
                      className="text-end font-mono tabular-nums"
                      onChange={(event) => {
                        setCasual(event.target.value);
                      }}
                    />
                  </Field>
                  <Field label="Sick leaves" error={fieldErrors['sickLeaves']}>
                    <Input
                      value={sick}
                      inputMode="numeric"
                      className="text-end font-mono tabular-nums"
                      onChange={(event) => {
                        setSick(event.target.value);
                      }}
                    />
                  </Field>
                  <Field label="Salary (PKR)" error={fieldErrors['basicSalaryMinor']}>
                    <Input
                      value={salary}
                      inputMode="decimal"
                      className="text-end font-mono tabular-nums"
                      onChange={(event) => {
                        setSalary(event.target.value);
                      }}
                    />
                  </Field>
                </div>
              </>
            )}
          </DialogBody>

          <DialogFooter>
            <Button type="button" tone="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" isPending={isPending} disabled={loadingProfile}>
              {editing === undefined ? 'Add staff' : 'Save changes'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

async function pickImage(
  file: File | undefined,
  setUrl: (value: string | null) => void,
  setFieldErrors: (value: Record<string, string>) => void,
  key: string,
): Promise<void> {
  if (file === undefined) {
    return;
  }
  if (file.size > PHOTO_MAX_BYTES) {
    setFieldErrors({ [key]: 'That image is too large. Use one under 512 KB.' });
    return;
  }
  const dataUrl = await readAsDataUrl(file);
  setUrl(dataUrl);
}

async function pickPdf(
  file: File | undefined,
  setUrl: (value: string | null) => void,
  setFieldErrors: (value: Record<string, string>) => void,
  key: string,
): Promise<void> {
  if (file === undefined) {
    return;
  }
  if (file.size > CV_MAX_BYTES) {
    setFieldErrors({ [key]: 'That file is too large. Use a PDF under 2 MB.' });
    return;
  }
  const dataUrl = await readAsDataUrl(file);
  setUrl(dataUrl);
}

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      resolve(typeof reader.result === 'string' ? reader.result : '');
    };
    reader.onerror = () => {
      reject(new Error('Could not read that file.'));
    };
    reader.readAsDataURL(file);
  });
}

function toE164(input: string): string {
  const digits = input.replace(/[\s()-]/g, '');
  if (digits.startsWith('+')) {
    return digits;
  }
  if (digits.startsWith('0')) {
    return `+92${digits.slice(1)}`;
  }
  return digits;
}
