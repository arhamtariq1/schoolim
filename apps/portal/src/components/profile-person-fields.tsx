'use client';

import { Field, Input } from '@ilm/ui';
import { AccountIcon, EmailIcon, PhoneIcon } from '@ilm/ui/icons';

import { PhoneInput } from '@/components/phone-input';
import { ProfileDisplayField } from '@/components/profile-display-field';
import { livePhoneError } from '@/lib/phone-format';

/**
 * Personal profile fields — shared by profile workspace, create, edit and onboarding.
 * The role is shown in the account banner, not as a field.
 */
export function ProfilePersonFields({
  name,
  onNameChange,
  phone,
  onPhoneChange,
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
  email?: string;
  fieldErrors: Record<string, string>;
  disabled?: boolean;
  autoFocusName?: boolean;
  layout?: 'grid' | 'reference';
  displayOnly?: boolean;
}) {
  if (layout === 'reference' && displayOnly) {
    return (
      <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <ProfileDisplayField label="Full name" value={name} />
        {email === undefined ? null : <ProfileDisplayField label="Email" value={email} />}
        <ProfileDisplayField label="Personal contact number" value={phone} />
      </dl>
    );
  }

  const gridClass =
    layout === 'reference' ? 'grid gap-4 sm:grid-cols-2 lg:grid-cols-3' : 'grid gap-4 lg:grid-cols-3 lg:gap-5';

  return (
    <fieldset disabled={disabled} className={gridClass}>
      <Field
        label="Full name"
        error={fieldErrors['name'] ?? fieldErrors['person.name']}
        required
        leadingIcon={AccountIcon}
      >
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
        <Field
          label="Email"
          required={layout === 'reference'}
          hint={layout === 'reference' ? undefined : 'Sign-in address for this account.'}
          leadingIcon={EmailIcon}
        >
          <Input readOnly disabled value={email} autoComplete="email" />
        </Field>
      )}

      <Field
        label="Personal contact number"
        error={fieldErrors['phone'] ?? fieldErrors['person.phone'] ?? livePhoneError(phone)}
        hint={layout === 'reference' ? undefined : 'Digits only, starting with 03 or 02.'}
        required
        leadingIcon={PhoneIcon}
      >
        <PhoneInput name="phone" value={phone} onValueChange={onPhoneChange} />
      </Field>
    </fieldset>
  );
}
