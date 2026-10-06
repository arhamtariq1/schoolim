'use client';

import { Field, Input } from '@ilm/ui';
import {
  AccountIcon,
  DesignationIcon,
  EmailIcon,
  PhoneIcon,
} from '@ilm/ui/icons';

import { ProfileDisplayField } from '@/components/profile-display-field';
import { InputWithIcon } from '@/components/input-with-icon';

/**
 * Personal profile fields — shared by profile workspace, create, edit and onboarding.
 */
export function ProfilePersonFields({
  name,
  onNameChange,
  phone,
  onPhoneChange,
  designation,
  onDesignationChange,
  email,
  fieldErrors,
  disabled = false,
  autoFocusName = false,
  layout = 'grid',
  displayOnly = false,
}: {
  name: string;
  onNameChange: (value: string) => void;
  phone: string;
  onPhoneChange: (value: string) => void;
  designation: string;
  onDesignationChange: (value: string) => void;
  email?: string;
  fieldErrors: Record<string, string>;
  disabled?: boolean;
  autoFocusName?: boolean;
  layout?: 'grid' | 'reference';
  displayOnly?: boolean;
}) {
  if (layout === 'reference' && displayOnly) {
    return (
      <dl className="grid gap-4 sm:grid-cols-2">
        <ProfileDisplayField label="Full name" value={name} />
        {email === undefined ? null : <ProfileDisplayField label="Email" value={email} />}
        <ProfileDisplayField label="Personal contact number" value={phone} />
        <ProfileDisplayField
          label="Designation (Optional)"
          value={designation.trim() === '' ? '—' : designation}
          className="sm:col-span-2"
        />
      </dl>
    );
  }

  if (layout === 'reference') {
    return (
      <fieldset disabled={disabled} className="space-y-4">
        <Field label="Full name" error={fieldErrors['name'] ?? fieldErrors['person.name']} required>
          <InputWithIcon
            icon={AccountIcon}
            name="name"
            autoComplete="name"
            autoFocus={autoFocusName}
            value={name}
            onChange={(event) => {
              onNameChange(event.target.value);
            }}
          />
        </Field>

        {email === undefined ? null : (
          <Field label="Email" required>
            <InputWithIcon icon={EmailIcon} readOnly disabled value={email} autoComplete="email" />
          </Field>
        )}

        <Field
          label="Personal contact number"
          error={fieldErrors['phone'] ?? fieldErrors['person.phone']}
          required
        >
          <InputWithIcon
            icon={PhoneIcon}
            name="phone"
            type="tel"
            autoComplete="tel"
            inputMode="tel"
            placeholder="03XX XXXXXXX"
            value={phone}
            onChange={(event) => {
              onPhoneChange(event.target.value);
            }}
          />
        </Field>

        <Field
          label="Designation (Optional)"
          error={fieldErrors['designation'] ?? fieldErrors['person.designation']}
        >
          <InputWithIcon
            icon={DesignationIcon}
            name="designation"
            autoComplete="organization-title"
            placeholder="e.g. Principal"
            value={designation}
            onChange={(event) => {
              onDesignationChange(event.target.value);
            }}
          />
        </Field>
      </fieldset>
    );
  }

  return (
    <fieldset disabled={disabled} className="space-y-4">
      <div className="grid gap-4 lg:grid-cols-3 lg:gap-5">
        <Field label="Full name" error={fieldErrors['name'] ?? fieldErrors['person.name']} required>
          <Input
            name="name"
            autoComplete="name"
            autoFocus={autoFocusName}
            value={name}
            onChange={(event) => {
              onNameChange(event.target.value);
            }}
          />
        </Field>

        {email === undefined ? null : (
          <Field label="Email" hint="Sign-in address for this account.">
            <Input readOnly disabled value={email} autoComplete="email" />
          </Field>
        )}

        <Field
          label="Personal contact number"
          error={fieldErrors['phone'] ?? fieldErrors['person.phone']}
          hint="Include country code, or start with 03."
          required
        >
          <Input
            name="phone"
            type="tel"
            autoComplete="tel"
            inputMode="tel"
            placeholder="03XX XXXXXXX"
            value={phone}
            onChange={(event) => {
              onPhoneChange(event.target.value);
            }}
          />
        </Field>
      </div>

      <div className="grid gap-4 lg:grid-cols-3 lg:gap-5">
        <Field
          label="Designation"
          error={fieldErrors['designation'] ?? fieldErrors['person.designation']}
          hint="Optional. For example Principal or Accountant."
        >
          <Input
            name="designation"
            autoComplete="organization-title"
            placeholder="e.g. Principal"
            value={designation}
            onChange={(event) => {
              onDesignationChange(event.target.value);
            }}
          />
        </Field>
      </div>
    </fieldset>
  );
}
