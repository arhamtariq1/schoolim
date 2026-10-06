'use client';

import {
  completeOnboardingSchema,
  ROUTES,
  SCHOOL_LEVEL_IDS,
  type CompleteOnboarding,
  type SchoolLevelId,
  type SlugAvailability,
  type UploadSchoolLogo,
  type UserProfile,
} from '@ilm/contracts';
import { Field, Input, SearchableSelect, Textarea, useToast } from '@ilm/ui';
import { useRouter } from 'next/navigation';

import { useTenantHref } from '@/lib/use-tenant-href';
import { useEffect, useMemo, useState, type FormEvent } from 'react';

import { FormSectionCard, SetupFormFooter } from '@/components/form-section-card';
import { LogoPicker } from './logo-picker';
import { ProfileFormActions } from '@/components/profile-form-actions';
import { ProfilePersonFields } from '@/components/profile-person-fields';
import { SchoolLevelPicker } from '@/components/school-level-picker';
import { SchoolSlugField } from '@/components/school-slug-field';
import {
  citiesForPakistanProvince,
  PAKISTAN_COUNTRY_LABEL,
  PAKISTAN_PROVINCES,
  provinceForPakistanCity,
} from '@/lib/pakistan-locations';
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
  const cityOptions = useMemo(() => citiesForPakistanProvince(province), [province]);

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

  function onProvinceChange(next: string): void {
    setProvince(next);
    setCity('');
    clearErrors('school.province', 'school.city');
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

  const slugHint = describeAvailability(
    effectiveSlug,
    availability,
    checkingSlug,
    initial.school.slug,
  );

  return (
    <form
      onSubmit={(event) => {
        void submit(event);
      }}
      noValidate
      className="w-full space-y-5 pb-6"
    >
      <FormSectionCard
        variant="setup"
        title="Profile information"
        description="Your account details as they appear across the school portal."
      >
        <ProfilePersonFields
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
      </FormSectionCard>

      <FormSectionCard
        variant="setup"
        title="School information"
        description="How your school appears to staff and parents — you can update these later in Settings."
      >
        <fieldset disabled={isPending} className="space-y-5">
          <LogoPicker
            variant="profile"
            title="School logo"
            value={logo}
            onChange={setLogo}
            disabled={isPending}
            hint="Optional. PNG, JPEG or WebP, up to 512 KB."
          />

          <div className="grid gap-4 lg:grid-cols-3 lg:gap-5">
            <Field label="School name" error={fieldErrors['school.name']} required>
              <Input
                name="schoolName"
                autoComplete="organization"
                placeholder="e.g. Beacon Academy"
                value={schoolName}
                onChange={(event) => {
                  setSchoolName(event.target.value);
                  clearErrors('school.name');
                }}
              />
            </Field>

            <Field label="School email" error={fieldErrors['school.email']} required>
              <Input
                name="schoolEmail"
                type="email"
                autoComplete="email"
                value={schoolEmail}
                onChange={(event) => {
                  setSchoolEmail(event.target.value);
                  clearErrors('school.email');
                }}
              />
            </Field>

            <Field
              label="School contact number"
              error={fieldErrors['school.phone']}
              hint="Local numbers starting with 03 are fine."
              required
            >
              <Input
                name="schoolPhone"
                type="tel"
                autoComplete="tel"
                inputMode="tel"
                placeholder="03XX XXXXXXX"
                value={schoolPhone}
                onChange={(event) => {
                  setSchoolPhone(phoneDigits(event.target.value));
                  clearErrors('school.phone');
                }}
              />
            </Field>
          </div>

          <div className="rounded-xl border border-border/60 bg-muted/25 p-4 sm:p-5">
            <p className="mb-4 text-sm font-semibold text-foreground">Location</p>
            <div className="grid gap-4 lg:grid-cols-3 lg:gap-5">
              <Field label="Country" hint="Fixed for schools on this product.">
                <Input readOnly disabled value={PAKISTAN_COUNTRY_LABEL} />
              </Field>

              <Field label="State / Province" error={fieldErrors['school.province']} required>
                <SearchableSelect
                  value={province}
                  onValueChange={onProvinceChange}
                  options={PAKISTAN_PROVINCES}
                  placeholder="Select province"
                  searchPlaceholder="Search provinces…"
                />
              </Field>

              <Field label="City" error={fieldErrors['school.city']} required>
                <SearchableSelect
                  value={city}
                  onValueChange={(value) => {
                    setCity(value);
                    clearErrors('school.city');
                  }}
                  options={cityOptions}
                  placeholder={province === '' ? 'Select province first' : 'Select city'}
                  searchPlaceholder="Search cities…"
                  disabled={province === ''}
                />
              </Field>
            </div>

            <Field
              label="Complete address"
              error={fieldErrors['school.address']}
              hint="Street, area or block — as parents would write it."
              required
            >
              <Textarea
                name="schoolAddress"
                rows={2}
                autoComplete="street-address"
                placeholder="Block 15, Gulshan-e-Iqbal, Karachi"
                value={address}
                onChange={(event) => {
                  setAddress(event.target.value);
                  clearErrors('school.address');
                }}
              />
            </Field>
          </div>

          <SchoolLevelPicker
            value={schoolLevels}
            onChange={(next) => {
              setSchoolLevels(next);
              clearErrors('school.schoolLevels');
            }}
            error={fieldErrors['school.schoolLevels']}
            disabled={isPending}
          />

          <div className="grid gap-4 lg:grid-cols-3 lg:gap-5">
            <div className="lg:col-span-2">
              <SchoolSlugField
                value={effectiveSlug}
                onChange={(next) => {
                  setSlugTouched(true);
                  setSlug(slugify(next));
                  clearErrors('school.slug');
                }}
                error={fieldErrors['school.slug']}
                availability={slugHint}
                disabled={isPending}
              />
            </div>
          </div>
        </fieldset>
      </FormSectionCard>

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

function parseSchoolLevels(values: readonly string[]): SchoolLevelId[] {
  return values.filter((value): value is SchoolLevelId =>
    (SCHOOL_LEVEL_IDS as readonly string[]).includes(value),
  );
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
