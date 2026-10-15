'use client';

import {
  createStaffSchema,
  formatCnic,
  ROUTES,
  STAFF_ROLE_LABELS,
  ASSIGNABLE_STAFF_ROLES,
  STAFF_ROLES,
  staffRoleCanSignIn,
  type StaffListItem,
  type StaffProfile,
  type StaffRole,
} from '@ilm/contracts';
import {
  AvatarUpload,
  Button,
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Field,
  FieldIconWrap,
  Input,
  SimpleSelect,
  Textarea,
  useToast,
} from '@ilm/ui';
import {
  AccountIcon,
  CloseIcon,
  DesignationIcon,
  EmailIcon,
  FeesIcon,
  FileIcon,
  HolidayIcon,
  ICON_SIZE,
  LocationIcon,
  PhoneIcon,
  StudentsIcon,
} from '@ilm/ui/icons';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState, type FormEvent } from 'react';

import { fetchJson, mutate } from '@/lib/mutate';
import { displayPhone, toE164 } from '@/lib/phone-format';

const roleOptions = (roles: readonly StaffRole[]) =>
  roles.map((value) => ({ value, label: STAFF_ROLE_LABELS[value] }));

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
  const [phone, setPhone] = useState(displayPhone(editing?.phone ?? ''));
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
  const [cvName, setCvName] = useState<string | null>(null);
  const cvInputRef = useRef<HTMLInputElement>(null);
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
              Principal, Office Staff and Teacher are invited to the portal by email.
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
                <AvatarUpload
                  value={photoUrl}
                  onChange={setPhotoUrl}
                  maxBytes={PHOTO_MAX_BYTES}
                  error={fieldErrors['photoUrl']}
                  disabled={isPending}
                />

                <div className="grid gap-5 sm:grid-cols-2">
                  <Field label="Name" error={fieldErrors['name']} required>
                    <FieldIconWrap icon={AccountIcon}>
                      <Input
                        value={name}
                        autoFocus
                        autoComplete="name"
                        placeholder="Enter full name"
                        onChange={(event) => {
                          setName(event.target.value);
                        }}
                      />
                    </FieldIconWrap>
                  </Field>

                  <Field label="CNIC" error={fieldErrors['cnic']} required>
                    <FieldIconWrap icon={DesignationIcon}>
                      <Input
                        value={cnic}
                        placeholder="35202-1234567-1"
                        inputMode="numeric"
                        autoComplete="off"
                        maxLength={15}
                        onChange={(event) => {
                          setCnic(formatCnic(event.target.value));
                        }}
                      />
                    </FieldIconWrap>
                  </Field>

                  <Field label="Role" error={fieldErrors['role']} required>
                    <FieldIconWrap icon={DesignationIcon}>
                      <SimpleSelect
                        value={role}
                        onValueChange={(next) => {
                          setRole(next as StaffRole);
                        }}
                        // Admin only appears for the owner's own record.
                        options={roleOptions(
                          editing?.role === 'ADMIN' ? STAFF_ROLES : ASSIGNABLE_STAFF_ROLES,
                        )}
                        placeholder="Select role"
                        ariaLabel="Role"
                      />
                    </FieldIconWrap>
                  </Field>

                  <Field label="Gender" error={fieldErrors['gender']}>
                    <FieldIconWrap icon={StudentsIcon}>
                      <SimpleSelect
                        value={gender}
                        onValueChange={setGender}
                        options={GENDER_OPTIONS}
                        placeholder="Select gender"
                        ariaLabel="Gender"
                        emptyOption={{ value: '', label: 'Select gender' }}
                      />
                    </FieldIconWrap>
                  </Field>

                  <Field label="Email" error={fieldErrors['email']} required={canSignIn}>
                    <FieldIconWrap icon={EmailIcon}>
                      <Input
                        type="email"
                        autoComplete="email"
                        placeholder="Enter email address"
                        value={email}
                        onChange={(event) => {
                          setEmail(event.target.value);
                        }}
                      />
                    </FieldIconWrap>
                  </Field>

                  <Field label="Phone" error={fieldErrors['phone']} required>
                    <FieldIconWrap icon={PhoneIcon}>
                      <Input
                        type="tel"
                        inputMode="numeric"
                        autoComplete="tel-national"
                        placeholder="03001234567"
                        maxLength={11}
                        value={phone}
                        onChange={(event) => {
                          setPhone(event.target.value.replace(/\D/g, '').slice(0, 11));
                          setFieldErrors((current) => ({ ...current, phone: '' }));
                        }}
                      />
                    </FieldIconWrap>
                  </Field>

                  <Field
                    label="Address"
                    error={fieldErrors['address']}
                    className="sm:col-span-2"
                  >
                    <FieldIconWrap icon={LocationIcon} alignTop>
                      <Textarea
                        value={address}
                        rows={2}
                        autoComplete="street-address"
                        placeholder="Enter address"
                        onChange={(event) => {
                          setAddress(event.target.value);
                        }}
                      />
                    </FieldIconWrap>
                  </Field>
                </div>

                <Field label="CV" error={fieldErrors['cvUrl']}>
                  <div className="flex flex-wrap items-center gap-3 rounded-md border border-border px-3 py-2">
                    <FileIcon
                      className={`${ICON_SIZE.inline} shrink-0 text-muted-foreground`}
                      aria-hidden="true"
                    />
                    <span className="min-w-0 flex-1 truncate text-sm text-muted-foreground">
                      {cvUrl === null || cvUrl === ''
                        ? 'Attach CV (PDF, up to 2 MB)'
                        : (cvName ?? 'CV attached')}
                    </span>
                    <Button
                      type="button"
                      tone="outline"
                      size="sm"
                      disabled={isPending}
                      onClick={() => {
                        cvInputRef.current?.click();
                      }}
                    >
                      {cvUrl === null || cvUrl === '' ? 'Choose PDF' : 'Change'}
                    </Button>
                    {cvUrl === null || cvUrl === '' ? null : (
                      <Button
                        type="button"
                        tone="ghost"
                        size="sm"
                        disabled={isPending}
                        onClick={() => {
                          setCvUrl(null);
                          setCvName(null);
                          setFieldErrors((current) => ({ ...current, cvUrl: '' }));
                        }}
                      >
                        <CloseIcon className={ICON_SIZE.inline} aria-hidden="true" />
                        Remove
                      </Button>
                    )}
                    <input
                      ref={cvInputRef}
                      type="file"
                      accept="application/pdf"
                      className="sr-only"
                      tabIndex={-1}
                      aria-hidden="true"
                      onChange={(event) => {
                        const file = event.target.files?.[0];
                        event.target.value = '';
                        void pickPdf(file, setCvUrl, setCvName, setFieldErrors);
                      }}
                    />
                  </div>
                </Field>

                <div className="grid gap-5 sm:grid-cols-3">
                  <Field label="Casual leaves" error={fieldErrors['casualLeaves']}>
                    <FieldIconWrap icon={HolidayIcon}>
                      <Input
                        value={casual}
                        inputMode="numeric"
                        placeholder="0"
                        onChange={(event) => {
                          setCasual(event.target.value);
                        }}
                      />
                    </FieldIconWrap>
                  </Field>
                  <Field label="Sick leaves" error={fieldErrors['sickLeaves']}>
                    <FieldIconWrap icon={HolidayIcon}>
                      <Input
                        value={sick}
                        inputMode="numeric"
                        placeholder="0"
                        onChange={(event) => {
                          setSick(event.target.value);
                        }}
                      />
                    </FieldIconWrap>
                  </Field>
                  <Field label="Salary (PKR)" error={fieldErrors['basicSalaryMinor']}>
                    <FieldIconWrap icon={FeesIcon}>
                      <Input
                        value={salary}
                        inputMode="decimal"
                        placeholder="Enter monthly salary"
                        onChange={(event) => {
                          setSalary(event.target.value);
                        }}
                      />
                    </FieldIconWrap>
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

async function pickPdf(
  file: File | undefined,
  setUrl: (value: string | null) => void,
  setName: (value: string | null) => void,
  setFieldErrors: (update: (current: Record<string, string>) => Record<string, string>) => void,
): Promise<void> {
  if (file === undefined) {
    return;
  }
  // The message is set and cleared in one place: a rejected file leaves the
  // previous CV (if any) alone, and an accepted one removes the old complaint.
  const setError = (message: string) => {
    setFieldErrors((current) => ({ ...current, cvUrl: message }));
  };
  if (file.type !== 'application/pdf') {
    setError('Choose a PDF file.');
    return;
  }
  if (file.size > CV_MAX_BYTES) {
    setError('That file is too large. Use a PDF under 2 MB.');
    return;
  }
  setUrl(await readAsDataUrl(file));
  setName(file.name);
  setError('');
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
