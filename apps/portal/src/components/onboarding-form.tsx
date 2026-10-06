'use client';

import {
  completeOnboardingSchema,
  ROUTES,
  type CompleteOnboarding,
  type SchoolLevelId,
  type SlugAvailability,
  type UploadSchoolLogo,
  type UserProfile,
} from '@ilm/contracts';
import { useToast } from '@ilm/ui';
import { AccountIcon, SchoolIcon } from '@ilm/ui/icons';
import { useRouter } from 'next/navigation';

import { useTenantHref } from '@/lib/use-tenant-href';
import { useEffect, useMemo, useState, type FormEvent } from 'react';

import { SetupFormFooter } from '@/components/form-section-card';
import { ProfileAccountBanner } from '@/components/profile-account-banner';
import { ProfileFormActions } from '@/components/profile-form-actions';
import { ProfilePersonFields } from '@/components/profile-person-fields';
import {
  parseSchoolLevels,
  ProfileSchoolEditorFields,
  type ProfileSchoolEditorValues,
} from '@/components/profile-school-editor-fields';
import { ProfileSectionCard } from '@/components/profile-section-card';
import { provinceForPakistanCity } from '@/lib/pakistan-locations';
import {
  FORM_VALIDATION_TOAST,
  fieldErrorsFromZod,
  humanizeFieldErrors,
  phoneDisplayError,
  withoutFieldErrors,
} from '@/lib/form-validation';
import { displayPhone, phoneDigits, toE164 } from '@/lib/phone-format';
import { mutate } from '@/lib/mutate';

/**
 * First-login form after signup OTP — school details + owner profile.
 */
export function OnboardingForm({ initial }: { readonly initial: UserProfile }) {
  const toast = useToast();
  const router = useRouter();
  const tenantHref = useTenantHref();

  const initialCity = initial.school.city ?? '';
  const [personName, setPersonName] = useState(initial.name);
  const [personPhone, setPersonPhone] = useState(displayPhone(initial.phone ?? ''));
  const [designation, setDesignation] = useState(initial.designation ?? '');

  const [schoolName, setSchoolName] = useState(
    initial.school.onboarded ? initial.school.name : '',
  );
  const [slug, setSlug] = useState(initial.school.slug);
  const [slugTouched, setSlugTouched] = useState(Boolean(initial.school.slug));
  const [province, setProvince] = useState(() => provinceForPakistanCity(initialCity) ?? '');
  const [city, setCity] = useState(initialCity);
  const [address, setAddress] = useState(initial.school.address ?? '');
  const [schoolLevels, setSchoolLevels] = useState<SchoolLevelId[]>(() =>
    parseSchoolLevels(initial.school.schoolLevels ?? []),
  );
  const [schoolPhone, setSchoolPhone] = useState(displayPhone(initial.school.phone ?? ''));
  const [schoolEmail, setSchoolEmail] = useState(initial.school.email ?? initial.email);
  const [availability, setAvailability] = useState<SlugAvailability | undefined>(undefined);
  const [checkingSlug, setCheckingSlug] = useState(false);
  const [logo, setLogo] = useState<UploadSchoolLogo | undefined>(undefined);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [isPending, setIsPending] = useState(false);

  const effectiveSlug = slugTouched ? slug : slugify(schoolName);
  const schoolValues = useMemo(
    (): ProfileSchoolEditorValues => ({
      name: schoolName,
      email: schoolEmail,
      phone: schoolPhone,
      province,
      city,
      address,
      schoolLevels,
      slug: effectiveSlug,
    }),
    [schoolName, schoolEmail, schoolPhone, province, city, address, schoolLevels, effectiveSlug],
  );
  const slugHint = describeAvailability(
    effectiveSlug,
    availability,
    checkingSlug,
    initial.school.slug,
  );

  useEffect(() => {
    if (effectiveSlug.length < 2) {
      setAvailability(undefined);
      return;
    }

    if (effectiveSlug === initial.school.slug) {
      setAvailability({ slug: effectiveSlug, available: true });
      setCheckingSlug(false);
      return;
    }

    const controller = new AbortController();
    setCheckingSlug(true);

    const timer = setTimeout(() => {
      void (async () => {
        try {
          const response = await fetch(
            `${ROUTES.public.slugAvailable}?slug=${encodeURIComponent(effectiveSlug)}`,
            { signal: controller.signal },
          );
          const body = response.ok
            ? ((await response.json()) as { data: SlugAvailability })
            : undefined;
          setAvailability(body?.data);
        } catch {
          setAvailability(undefined);
        } finally {
          setCheckingSlug(false);
        }
      })();
    }, 400);

    return () => {
      controller.abort();
      clearTimeout(timer);
      setCheckingSlug(false);
    };
  }, [effectiveSlug, initial.school.slug]);

  function clearErrors(...keys: string[]): void {
    setFieldErrors((current) => withoutFieldErrors(current, ...keys));
  }

  function patchSchool(patch: Partial<ProfileSchoolEditorValues>): void {
    if (patch.name !== undefined) {
      setSchoolName(patch.name);
      clearErrors('school.name');
    }
    if (patch.email !== undefined) {
      setSchoolEmail(patch.email);
      clearErrors('school.email');
    }
    if (patch.phone !== undefined) {
      setSchoolPhone(patch.phone);
      clearErrors('school.phone');
    }
    if (patch.province !== undefined) {
      setProvince(patch.province);
      setCity(patch.city ?? '');
      clearErrors('school.province', 'school.city');
    }
    if (patch.city !== undefined) {
      setCity(patch.city);
      clearErrors('school.city');
    }
    if (patch.address !== undefined) {
      setAddress(patch.address);
      clearErrors('school.address');
    }
    if (patch.schoolLevels !== undefined) {
      setSchoolLevels(patch.schoolLevels);
      clearErrors('school.schoolLevels');
    }
    if (patch.slug !== undefined) {
      setSlugTouched(true);
      setSlug(slugify(patch.slug));
      clearErrors('school.slug');
    }
  }

  async function signOut(): Promise<void> {
    try {
      const response = await fetch(ROUTES.auth.logout, {
        method: 'POST',
        credentials: 'include',
      });
      if (!response.ok) {
        toast.error('Could not sign you out. Try again.');
        return;
      }
      router.replace('/login');
      router.refresh();
    } catch {
      toast.error('Could not reach the server.');
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isPending) {
      return;
    }

    setFieldErrors({});

    const clientErrors: Record<string, string> = {};
    const personPhoneError = phoneDisplayError(personPhone);
    if (personPhoneError !== undefined) {
      clientErrors['person.phone'] = personPhoneError;
    }
    const schoolPhoneError = phoneDisplayError(schoolPhone);
    if (schoolPhoneError !== undefined) {
      clientErrors['school.phone'] = schoolPhoneError;
    }
    if (province === '') {
      clientErrors['school.province'] = 'Select a province or state.';
    }
    if (city.trim() === '') {
      clientErrors['school.city'] = 'Select a city.';
    }
    if (address.trim() === '') {
      clientErrors['school.address'] = 'Enter the school’s complete address.';
    }
    if (schoolLevels.length === 0) {
      clientErrors['school.schoolLevels'] = 'Select at least one school level.';
    }

    const payload: CompleteOnboarding = {
      person: {
        name: personName,
        phone: toE164(personPhone),
        ...(designation.trim() === '' ? {} : { designation: designation.trim() }),
      },
      school: {
        name: schoolName,
        slug: effectiveSlug,
        city: city.trim(),
        address: address.trim(),
        phone: toE164(schoolPhone),
        email: schoolEmail,
        schoolLevels: [...schoolLevels],
        timezone: 'Asia/Karachi',
        locale: 'en',
      },
      ...(logo === undefined ? {} : { logo }),
    };

    const parsed = completeOnboardingSchema.safeParse(payload);
    const schemaErrors = parsed.success ? {} : fieldErrorsFromZod(parsed.error);
    const nextErrors = { ...schemaErrors, ...clientErrors };

    if (Object.keys(nextErrors).length > 0) {
      setFieldErrors(nextErrors);
      toast.error(FORM_VALIDATION_TOAST);
      return;
    }

    if (
      availability !== undefined &&
      !availability.available &&
      effectiveSlug !== initial.school.slug
    ) {
      setFieldErrors({ 'school.slug': 'That web address is already taken.' });
      toast.error(FORM_VALIDATION_TOAST);
      return;
    }

    setIsPending(true);
    try {
      const result = await mutate<UserProfile & { relocateTo?: string }>(
        ROUTES.me.onboarding,
        'POST',
        parsed.data,
      );
      if (!result.ok) {
        setFieldErrors(humanizeFieldErrors(result.fieldErrors));
        toast.error(
          Object.keys(result.fieldErrors).length > 0 ? FORM_VALIDATION_TOAST : result.message,
        );
        return;
      }

      toast.success('You are set up', 'Welcome — your workspace is ready.');

      const relocateTo = result.data.relocateTo;
      if (relocateTo !== undefined && relocateTo !== '') {
        window.location.assign(relocateTo);
        return;
      }

      const refreshed = await fetch(ROUTES.auth.refresh, {
        method: 'POST',
        credentials: 'include',
      });
      if (!refreshed.ok) {
        toast.warning(
          'Saved',
          'Sign out and sign in again if the rest of the portal stays locked.',
        );
      }

      window.location.assign(tenantHref('/'));
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
      className="space-y-6 pb-4"
    >
      <div className="grid gap-4 lg:grid-cols-2 lg:items-start">
        <ProfileSectionCard
          icon={AccountIcon}
          title="Account Information"
          description="Your personal details and account access."
        >
          <ProfileAccountBanner
            name={personName}
            email={initial.email}
            phone={toE164(personPhone) || initial.phone}
            roleLabel={designation.trim() === '' ? 'Owner' : designation}
          />
          <ProfilePersonFields
            layout="reference"
            name={personName}
            onNameChange={(value) => {
              setPersonName(value);
              clearErrors('person.name', 'name');
            }}
            phone={personPhone}
            onPhoneChange={(value) => {
              setPersonPhone(phoneDigits(value));
              clearErrors('person.phone', 'phone');
            }}
            designation={designation}
            onDesignationChange={(value) => {
              setDesignation(value);
              clearErrors('person.designation', 'designation');
            }}
            email={initial.email}
            fieldErrors={fieldErrors}
            disabled={isPending}
            autoFocusName
          />
        </ProfileSectionCard>

        <ProfileSectionCard
          icon={SchoolIcon}
          title="School Information"
          description="Your school details as they appear in the portal."
        >
          <ProfileSchoolEditorFields
            values={schoolValues}
            onChange={patchSchool}
            fieldErrors={fieldErrors}
            disabled={isPending}
            slugLocked={false}
            slugAvailability={slugHint}
            logoValue={logo}
            onLogoChange={setLogo}
          />
        </ProfileSectionCard>
      </div>

      <div className="border-t border-border/70 pt-5">
        <SetupFormFooter>
          <ProfileFormActions
            primaryLabel="Save changes"
            primaryPending={isPending}
            cancelLabel="Cancel"
            onCancel={() => {
              void signOut();
            }}
            hint="After saving, the rest of the portal unlocks."
          />
        </SetupFormFooter>
      </div>
    </form>
  );
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+/, '')
    .replace(/-+$/, '')
    .slice(0, 48);
}

function describeAvailability(
  slug: string,
  availability: SlugAvailability | undefined,
  checking: boolean,
  currentSlug: string,
): { text: string; tone: 'ok' | 'bad' | 'muted' } | undefined {
  if (slug.length < 2) {
    return undefined;
  }
  if (checking) {
    return { text: 'Checking…', tone: 'muted' };
  }
  if (slug === currentSlug) {
    return { text: 'Your current address', tone: 'ok' };
  }
  if (availability === undefined) {
    return undefined;
  }
  if (availability.available) {
    return { text: 'Available', tone: 'ok' };
  }
  return { text: 'Already taken', tone: 'bad' };
}
