'use client';

import {
  ROUTES,
  updateSchoolSettingsSchema,
  upsertUserProfileSchema,
  type SchoolLogoInfo,
  type UpdateSchoolSettings,
  type UploadSchoolLogo,
  type UserProfile,
} from '@ilm/contracts';
import { Button, useToast } from '@ilm/ui';
import { AccountIcon, EditIcon, LockedIcon, SchoolIcon, ICON_SIZE } from '@ilm/ui/icons';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMemo, useState, type FormEvent, type ReactNode } from 'react';

import { ProfileAccountBanner } from '@/components/profile-account-banner';
import { ProfileFormActions } from '@/components/profile-form-actions';
import { ProfilePersonFields } from '@/components/profile-person-fields';
import {
  ProfileSchoolEditorFields,
  schoolValuesFromProfile,
  type ProfileSchoolEditorValues,
} from '@/components/profile-school-editor-fields';
import { ProfileSectionCard } from '@/components/profile-section-card';
import {
  FORM_VALIDATION_TOAST,
  fieldErrorsFromZod,
  prefixFieldErrors,
  humanizeFieldErrors,
  phoneDisplayError,
  withoutFieldErrors,
} from '@/lib/form-validation';
import { mutate } from '@/lib/mutate';
import { notifySchoolLogoUpdated } from '@/lib/school-logo-shell';
import { provinceForPakistanCity } from '@/lib/pakistan-locations';
import { displayPhone, phoneDigits, toE164 } from '@/lib/phone-format';
import type { ProfileSchoolWorkspace } from '@/lib/profile-school-workspace';
import { useTenantHref } from '@/lib/use-tenant-href';

export type ProfileWorkspaceMode = 'view' | 'edit' | 'create';

type ProfileWorkspaceEditorProps = {
  mode: ProfileWorkspaceMode;
  profile: UserProfile;
  workspace: ProfileSchoolWorkspace;
  roleLabel: string;
  children?: ReactNode;
};

export function ProfileWorkspaceEditor({
  mode,
  profile,
  workspace,
  roleLabel,
  children,
}: ProfileWorkspaceEditorProps) {
  const readOnly = mode === 'view';
  const canEditSchool = workspace.canConfigure && profile.school.onboarded;
  const schoolDisabled = readOnly || !canEditSchool || mode === 'create';

  const toast = useToast();
  const router = useRouter();
  const tenantHref = useTenantHref();

  const initialProvince = useMemo(
    () => provinceForPakistanCity(profile.school.city ?? '') ?? '',
    [profile.school.city],
  );

  const [name, setName] = useState(profile.name);
  const [phone, setPhone] = useState(displayPhone(profile.phone ?? ''));
  const [designation, setDesignation] = useState(profile.designation ?? '');
  const [school, setSchool] = useState<ProfileSchoolEditorValues>(() =>
    schoolValuesFromProfile(profile, initialProvince, {
      oLevelClassNames: workspace.settings.oLevelClassNames,
      aLevelClassNames: workspace.settings.aLevelClassNames,
    }),
  );
  const [logo, setLogo] = useState<UploadSchoolLogo | undefined>(undefined);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [isPending, setIsPending] = useState(false);

  const logoCurrentSrc =
    workspace.logo.present === true
      ? `${ROUTES.schoolLogo.image}?v=${workspace.logo.version ?? ''}`
      : undefined;

  function patchSchool(patch: Partial<ProfileSchoolEditorValues>): void {
    setSchool((current) => ({ ...current, ...patch }));
    setFieldErrors((current) =>
      withoutFieldErrors(
        current,
        'name',
        'school.name',
        'email',
        'school.email',
        'phone',
        'school.phone',
        'city',
        'school.city',
        'address',
        'school.address',
        'schoolLevels',
        'school.schoolLevels',
        'school.province',
      ),
    );
  }

  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (readOnly || isPending) {
      return;
    }

    setFieldErrors({});

    const clientErrors: Record<string, string> = {};
    const personPhoneError = phoneDisplayError(phone);
    if (personPhoneError !== undefined) {
      clientErrors.phone = personPhoneError;
    }
    if (canEditSchool && mode === 'edit') {
      if (school.province === '') {
        clientErrors['school.province'] = 'Select a province or state.';
      }
      if (school.city.trim() === '') {
        clientErrors['school.city'] = 'Select a city.';
      }
      if (school.address.trim() === '') {
        clientErrors['school.address'] = 'Enter the school’s street address.';
      }
      if (school.schoolLevels.length === 0) {
        clientErrors['school.schoolLevels'] = 'Select at least one school level.';
      }
      const schoolPhoneError = phoneDisplayError(school.phone);
      if (schoolPhoneError !== undefined) {
        clientErrors['school.phone'] = schoolPhoneError;
      }
    }

    const personPayload = {
      name,
      phone: toE164(phone),
      ...(designation.trim() === '' ? {} : { designation: designation.trim() }),
    };
    const personParsed = upsertUserProfileSchema.safeParse(personPayload);
    const personSchemaErrors = personParsed.success ? {} : fieldErrorsFromZod(personParsed.error);

    let schoolParsed: ReturnType<typeof updateSchoolSettingsSchema.safeParse> | undefined;
    if (canEditSchool && mode === 'edit') {
      const schoolPayload: UpdateSchoolSettings = {
        name: school.name,
        legalName: workspace.settings.legalName,
        address: school.address.trim() === '' ? null : school.address.trim(),
        city: school.city,
        phone: toE164(school.phone),
        email: school.email,
        schoolLevels: [...school.schoolLevels],
        oLevelClassNames: [...school.oLevelClassNames],
        aLevelClassNames: [...school.aLevelClassNames],
        timezone: workspace.settings.timezone,
        locale: workspace.settings.locale === 'ur' ? 'ur' : 'en',
      };
      schoolParsed = updateSchoolSettingsSchema.safeParse(schoolPayload);
    }

    const schoolSchemaErrors =
      schoolParsed === undefined || schoolParsed.success
        ? {}
        : prefixFieldErrors(fieldErrorsFromZod(schoolParsed.error), 'school');

    const nextErrors = {
      ...personSchemaErrors,
      ...schoolSchemaErrors,
      ...clientErrors,
    };
    if (Object.keys(nextErrors).length > 0) {
      setFieldErrors(nextErrors);
      toast.error(FORM_VALIDATION_TOAST);
      return;
    }

    if (!personParsed.success) {
      return;
    }

    setIsPending(true);
    try {
      const personResult = await mutate<UserProfile>(ROUTES.me.profile, 'PUT', personParsed.data);
      if (!personResult.ok) {
        setFieldErrors(humanizeFieldErrors(personResult.fieldErrors));
        toast.error(
          Object.keys(personResult.fieldErrors).length > 0 ? FORM_VALIDATION_TOAST : personResult.message,
        );
        return;
      }

      if (schoolParsed?.success === true && canEditSchool && mode === 'edit') {
        const schoolResult = await mutate(ROUTES.school.settings, 'PUT', schoolParsed.data);
        if (!schoolResult.ok) {
          setFieldErrors(prefixFieldErrors(humanizeFieldErrors(schoolResult.fieldErrors), 'school'));
          toast.error(schoolResult.message);
          return;
        }
      }

      if (logo !== undefined && canEditSchool) {
        const logoResult = await mutate<SchoolLogoInfo>(ROUTES.schoolLogo.image, 'PUT', logo);
        if (!logoResult.ok) {
          toast.error(logoResult.message);
          return;
        }
        notifySchoolLogoUpdated(logoResult.data);
      }

      await fetch(ROUTES.auth.refresh, { method: 'POST', credentials: 'include' });

      if (mode === 'create') {
        toast.success('Profile created', 'Welcome — your workspace is ready.');
        window.location.assign(tenantHref('/'));
        return;
      }

      toast.success('Profile saved');
      router.replace('/profile');
      router.refresh();
    } finally {
      setIsPending(false);
    }
  }

  const changePasswordAction =
    readOnly ? null : (
      <Button asChild tone="outline" size="sm">
        <Link href="/settings/password" className="cursor-pointer">
          <LockedIcon className={ICON_SIZE.inline} aria-hidden="true" />
          Change Password
        </Link>
      </Button>
    );

  const body = (
    <div className="flex w-full flex-col gap-4">
      <ProfileSectionCard
        icon={AccountIcon}
        title="Account Information"
        description="Your personal details and account access."
        action={changePasswordAction}
      >
        <ProfileAccountBanner
          name={name}
          email={profile.email}
          phone={toE164(phone) || profile.phone}
          roleLabel={roleLabel}
          readOnly={readOnly}
        />
        <ProfilePersonFields
          layout="reference"
          displayOnly={readOnly}
          name={name}
          onNameChange={setName}
          phone={phone}
          onPhoneChange={(value) => {
            setPhone(phoneDigits(value));
          }}
          designation={designation}
          onDesignationChange={setDesignation}
          email={profile.email}
          fieldErrors={fieldErrors}
          disabled={isPending}
        />
      </ProfileSectionCard>

      {/* Only for somebody who can change it.

          A teacher editing their own profile was being shown the school's name,
          email, contact number and address as a column of starred, required
          fields they could not edit — which reads as a form they have failed to
          fill in. Their school's address is not their business on this screen,
          and the people whose business it is have Settings › School. */}
      {!canEditSchool && !readOnly ? null : (
      <ProfileSectionCard
        icon={SchoolIcon}
        title="School Information"
        description="Your school details as they appear in the portal."
      >
        <ProfileSchoolEditorFields
          values={school}
          onChange={patchSchool}
          fieldErrors={fieldErrors}
          displayOnly={readOnly}
          disabled={(!readOnly && schoolDisabled) || isPending}
          slugLocked={profile.school.onboarded}
          logoValue={logo}
          onLogoChange={setLogo}
          logoCurrentSrc={logoCurrentSrc}
          showLogoPicker={!readOnly && canEditSchool}
        />
      </ProfileSectionCard>
      )}
    </div>
  );

  if (readOnly) {
    return (
      <>
        {body}
        <div className="flex justify-end pt-4">
          <Button asChild>
            <Link href="/profile/edit" className="cursor-pointer">
              <EditIcon className={ICON_SIZE.inline} aria-hidden="true" />
              Edit profile
            </Link>
          </Button>
        </div>
      </>
    );
  }

  return (
    <form
      onSubmit={(event) => {
        void submit(event);
      }}
      noValidate
      className="space-y-6 pb-2"
    >
      {body}
      {children}
      <div className="border-t border-border/70 pt-5">
        <ProfileFormActions
          primaryLabel="Save changes"
          primaryPending={isPending}
          cancelLabel="Cancel"
          onCancel={() => {
            router.push(mode === 'create' ? tenantHref('/') : '/profile');
          }}
        />
      </div>
    </form>
  );
}
