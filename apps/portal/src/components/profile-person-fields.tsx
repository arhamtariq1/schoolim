'use client';

import { Field, Input } from '@ilm/ui';

/**
 * Personal profile fields — shared by `/profile/create`, `/profile/edit`, and
 * owner onboarding (same shape as `upsertUserProfileSchema`).
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
}: {
  name: string;
  onNameChange: (value: string) => void;
  phone: string;
  onPhoneChange: (value: string) => void;
  designation: string;
  onDesignationChange: (value: string) => void;
  /** Account email — read-only when shown (onboarding / profile view parity). */
  email?: string;
  fieldErrors: Record<string, string>;
  disabled?: boolean;
  autoFocusName?: boolean;
}) {
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
