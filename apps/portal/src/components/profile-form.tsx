'use client';

import {
  ROUTES,
  upsertUserProfileSchema,
  type UpsertUserProfile,
  type UserProfile,
} from '@ilm/contracts';
import { useToast } from '@ilm/ui';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';

import { FormSectionCard, SetupFormFooter } from '@/components/form-section-card';
import { ProfileFormActions } from '@/components/profile-form-actions';
import { ProfilePersonFields } from '@/components/profile-person-fields';
import {
  FORM_VALIDATION_TOAST,
  fieldErrorsFromZod,
  humanizeFieldErrors,
  phoneDisplayError,
  withoutFieldErrors,
} from '@/lib/form-validation';
import { displayPhone, phoneDigits, toE164 } from '@/lib/phone-format';
import { mutate } from '@/lib/mutate';
import { useTenantHref } from '@/lib/use-tenant-href';

export function ProfileForm({
  mode,
  initial,
  setupLayout = false,
}: {
  mode: 'create' | 'edit';
  initial?: Partial<UserProfile> | undefined;
  setupLayout?: boolean;
}) {
  const toast = useToast();
  const router = useRouter();
  const tenantHref = useTenantHref();
  const [name, setName] = useState(initial?.name ?? '');
  const [phone, setPhone] = useState(displayPhone(initial?.phone ?? ''));
  const [designation, setDesignation] = useState(initial?.designation ?? '');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [isPending, setIsPending] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isPending) {
      return;
    }

    setFieldErrors({});

    const clientErrors: Record<string, string> = {};
    const phoneError = phoneDisplayError(phone);
    if (phoneError !== undefined) {
      clientErrors.phone = phoneError;
    }

    const payload: UpsertUserProfile = {
      name,
      phone: toE164(phone),
      ...(designation.trim() === '' ? {} : { designation: designation.trim() }),
    };

    const parsed = upsertUserProfileSchema.safeParse(payload);
    const schemaErrors = parsed.success ? {} : fieldErrorsFromZod(parsed.error);
    const nextErrors = { ...schemaErrors, ...clientErrors };

    if (Object.keys(nextErrors).length > 0) {
      setFieldErrors(nextErrors);
      toast.error(FORM_VALIDATION_TOAST);
      return;
    }

    setIsPending(true);
    try {
      const result = await mutate<UserProfile>(ROUTES.me.profile, 'PUT', parsed.data);
      if (!result.ok) {
        setFieldErrors(humanizeFieldErrors(result.fieldErrors));
        toast.error(
          Object.keys(result.fieldErrors).length > 0 ? FORM_VALIDATION_TOAST : result.message,
        );
        return;
      }

      const refreshed = await fetch(ROUTES.auth.refresh, {
        method: 'POST',
        credentials: 'include',
      });
      if (!refreshed.ok) {
        toast.warning(
          'Profile saved',
          'Sign out and sign in again if the rest of the portal stays locked.',
        );
      }

      if (mode === 'create') {
        toast.success('Profile created', 'Welcome — your workspace is ready.');
        window.location.assign(tenantHref('/'));
        return;
      }

      toast.success('Profile updated');
      router.replace('/profile');
      router.refresh();
    } finally {
      setIsPending(false);
    }
  }

  return (
    <form
      onSubmit={(event) => {
        void submit(event);
      }}
      noValidate
      className={setupLayout ? 'w-full space-y-5 pb-6' : 'mx-auto w-full max-w-5xl space-y-6 pb-10'}
    >
      <FormSectionCard
        variant={setupLayout ? 'setup' : 'default'}
        title="Profile information"
        description={
          mode === 'create'
            ? 'Your account details as they appear across the school portal.'
            : 'Update your name, phone or designation.'
        }
      >
        <ProfilePersonFields
          name={name}
          onNameChange={(value) => {
            setName(value);
            setFieldErrors((current) => withoutFieldErrors(current, 'name', 'person.name'));
          }}
          phone={phone}
          onPhoneChange={(value) => {
            setPhone(phoneDigits(value));
            setFieldErrors((current) => withoutFieldErrors(current, 'phone', 'person.phone'));
          }}
          designation={designation}
          onDesignationChange={(value) => {
            setDesignation(value);
            setFieldErrors((current) =>
              withoutFieldErrors(current, 'designation', 'person.designation'),
            );
          }}
          email={initial?.email}
          fieldErrors={fieldErrors}
          disabled={isPending}
          autoFocusName={mode === 'create'}
        />
      </FormSectionCard>

      {setupLayout ? (
        <SetupFormFooter>
          <ProfileFormActions
            primaryLabel="Save changes"
            primaryPending={isPending}
            cancelLabel="Cancel"
          />
        </SetupFormFooter>
      ) : (
        <div className="rounded-2xl border border-border/80 bg-card px-6 py-5 shadow-sm sm:px-8">
          <ProfileFormActions
            primaryLabel="Save changes"
            primaryPending={isPending}
            cancelLabel="Cancel"
            onCancel={() => {
              router.push('/profile');
            }}
          />
        </div>
      )}
    </form>
  );
}
