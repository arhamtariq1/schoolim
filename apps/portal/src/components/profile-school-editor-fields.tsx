'use client';

import {
  SCHOOL_LEVEL_IDS,
  type SchoolLevelId,
  type UploadSchoolLogo,
} from '@ilm/contracts';
import { Field, Input, SearchableSelect, Textarea } from '@ilm/ui';
import { EmailIcon, PhoneIcon, SchoolIcon } from '@ilm/ui/icons';
import { useMemo } from 'react';

import {
  ProfileDisplayField,
  ProfileDisplayLevelBadges,
} from '@/components/profile-display-field';
import { InputWithIcon } from '@/components/input-with-icon';
import { schoolSlugAffixes } from '@/lib/school-slug-preview';
import { LogoPicker } from '@/components/logo-picker';
import { SchoolLevelPicker } from '@/components/school-level-picker';
import { SchoolSlugField } from '@/components/school-slug-field';
import {
  citiesForPakistanProvince,
  PAKISTAN_COUNTRY_LABEL,
  PAKISTAN_PROVINCES,
} from '@/lib/pakistan-locations';
import { displayPhone, phoneDigits } from '@/lib/phone-format';

export type ProfileSchoolEditorValues = {
  name: string;
  email: string;
  phone: string;
  province: string;
  city: string;
  address: string;
  schoolLevels: SchoolLevelId[];
  slug: string;
};

type ProfileSchoolEditorFieldsProps = {
  values: ProfileSchoolEditorValues;
  onChange: (patch: Partial<ProfileSchoolEditorValues>) => void;
  fieldErrors: Record<string, string>;
  disabled?: boolean;
  slugLocked?: boolean;
  slugAvailability?: { text: string; tone: 'ok' | 'bad' | 'muted' } | undefined;
  logoValue: UploadSchoolLogo | undefined;
  onLogoChange: (next: UploadSchoolLogo | undefined) => void;
  logoCurrentSrc?: string | undefined;
  showLogoPicker?: boolean;
  displayOnly?: boolean;
};

export function ProfileSchoolEditorFields({
  values,
  onChange,
  fieldErrors,
  disabled = false,
  slugLocked = false,
  slugAvailability,
  logoValue,
  onLogoChange,
  logoCurrentSrc,
  showLogoPicker = true,
  displayOnly = false,
}: ProfileSchoolEditorFieldsProps) {
  const cityOptions = useMemo(
    () => citiesForPakistanProvince(values.province),
    [values.province],
  );

  const provinceLabel =
    PAKISTAN_PROVINCES.find((entry) => entry.value === values.province)?.label ?? values.province;
  const { prefix, suffix } = schoolSlugAffixes();
  const signInAddress = `${prefix}${values.slug === '' ? 'your-school' : values.slug}${suffix}`;

  if (displayOnly) {
    return (
      <div className="space-y-5">
        {logoCurrentSrc === undefined ? null : (
          <div className="flex items-center gap-4">
            {/* eslint-disable-next-line @next/next/no-img-element -- school logo preview */}
            <img
              src={logoCurrentSrc}
              alt=""
              className="size-20 rounded-xl border border-border bg-card object-contain p-1"
            />
            <p className="text-sm font-medium text-foreground">School logo</p>
          </div>
        )}
        <ProfileDisplayField label="School name" value={values.name} />
        <div className="grid gap-4 sm:grid-cols-2">
          <ProfileDisplayField label="School email" value={values.email} />
          <ProfileDisplayField label="School contact number" value={values.phone} />
        </div>
        <div className="rounded-xl border border-border/50 bg-muted/15 p-4 sm:p-5">
          <p className="mb-4 text-sm font-semibold text-foreground">Location</p>
          <dl className="grid gap-4 sm:grid-cols-3">
            <ProfileDisplayField label="Country" value={PAKISTAN_COUNTRY_LABEL} />
            <ProfileDisplayField label="State / Province" value={provinceLabel} />
            <ProfileDisplayField label="City" value={values.city} />
          </dl>
          <ProfileDisplayField label="Street address" value={values.address} className="mt-4" />
        </div>
        <div className="space-y-2">
          <p className="text-xs font-medium text-muted-foreground">School levels</p>
          <ProfileDisplayLevelBadges levelIds={values.schoolLevels} />
        </div>
        <ProfileDisplayField label="Sign-in address (Web address)" value={signInAddress} />
      </div>
    );
  }

  return (
    <fieldset disabled={disabled} className="space-y-5">
      {showLogoPicker ? (
        <LogoPicker
          variant="profile"
          title="School logo"
          value={logoValue}
          onChange={onLogoChange}
          currentSrc={logoCurrentSrc}
          disabled={disabled}
          hint="PNG, JPEG or WebP. Max 512 KB."
        />
      ) : logoCurrentSrc === undefined ? null : (
        <div className="flex items-center gap-4">
          {/* eslint-disable-next-line @next/next/no-img-element -- school logo preview */}
          <img
            src={logoCurrentSrc}
            alt=""
            className="size-16 rounded-lg border border-border object-contain"
          />
          <p className="text-sm text-muted-foreground">School logo</p>
        </div>
      )}

      <Field label="School name" error={fieldErrors['name'] ?? fieldErrors['school.name']} required>
        <InputWithIcon
          icon={SchoolIcon}
          name="schoolName"
          autoComplete="organization"
          value={values.name}
          onChange={(event) => {
            onChange({ name: event.target.value });
          }}
        />
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="School email" error={fieldErrors['email'] ?? fieldErrors['school.email']} required>
          <InputWithIcon
            icon={EmailIcon}
            name="schoolEmail"
            type="email"
            autoComplete="email"
            value={values.email}
            onChange={(event) => {
              onChange({ email: event.target.value });
            }}
          />
        </Field>

        <Field
          label="School contact number"
          error={fieldErrors['phone'] ?? fieldErrors['school.phone']}
          required
        >
          <InputWithIcon
            icon={PhoneIcon}
            name="schoolPhone"
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            placeholder="03XX XXXXXXX"
            value={values.phone}
            onChange={(event) => {
              onChange({ phone: phoneDigits(event.target.value) });
            }}
          />
        </Field>
      </div>

      <div className="rounded-xl border border-border/60 bg-muted/20 p-4 sm:p-5">
        <p className="mb-4 text-sm font-semibold text-foreground">Location</p>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Country" required>
            <Input readOnly disabled value={PAKISTAN_COUNTRY_LABEL} />
          </Field>

          <Field label="State / Province" error={fieldErrors['school.province']} required>
            <SearchableSelect
              value={values.province}
              onValueChange={(next) => {
                onChange({ province: next, city: '' });
              }}
              options={PAKISTAN_PROVINCES}
              placeholder="Select province"
              searchPlaceholder="Search provinces…"
            />
          </Field>

          <Field label="City" error={fieldErrors['city'] ?? fieldErrors['school.city']} required>
            <SearchableSelect
              value={values.city}
              onValueChange={(next) => {
                onChange({ city: next });
              }}
              options={cityOptions}
              placeholder={values.province === '' ? 'Select province first' : 'Select city'}
              searchPlaceholder="Search cities…"
              disabled={values.province === ''}
            />
          </Field>
        </div>

        <Field
          label="Street address"
          error={fieldErrors['address'] ?? fieldErrors['school.address']}
          required
          className="mt-4"
        >
          <Textarea
            name="schoolAddress"
            rows={2}
            autoComplete="street-address"
            placeholder="Block 15, Gulshan-e-Iqbal, Karachi"
            value={values.address}
            onChange={(event) => {
              onChange({ address: event.target.value });
            }}
          />
        </Field>
      </div>

      <SchoolLevelPicker
        value={values.schoolLevels}
        onChange={(next) => {
          onChange({ schoolLevels: next });
        }}
        error={fieldErrors['schoolLevels'] ?? fieldErrors['school.schoolLevels']}
        disabled={disabled}
      />

      <SchoolSlugField
        value={values.slug}
        onChange={(next) => {
          onChange({ slug: next });
        }}
        error={fieldErrors['slug'] ?? fieldErrors['school.slug']}
        availability={slugAvailability}
        disabled={disabled || slugLocked}
        hint={
          slugLocked
            ? 'Fixed after setup. Everyone at your school signs in at this address.'
            : 'Letters and numbers only. This is your school’s unique sign-in name.'
        }
      />
    </fieldset>
  );
}

export function parseSchoolLevels(values: readonly string[]): SchoolLevelId[] {
  return values.filter((value): value is SchoolLevelId =>
    (SCHOOL_LEVEL_IDS as readonly string[]).includes(value),
  );
}

export function schoolValuesFromProfile(
  profile: {
    school: {
      name: string;
      slug: string;
      city: string | null;
      address: string | null;
      phone: string | null;
      email: string | null;
      schoolLevels: readonly string[];
    };
  },
  province: string,
): ProfileSchoolEditorValues {
  return {
    name: profile.school.name,
    email: profile.school.email ?? '',
    phone: displayPhone(profile.school.phone ?? ''),
    province,
    city: profile.school.city ?? '',
    address: profile.school.address ?? '',
    schoolLevels: parseSchoolLevels(profile.school.schoolLevels),
    slug: profile.school.slug,
  };
}
