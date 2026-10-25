'use client';

import { changePasswordRequestSchema, ROUTES } from '@ilm/contracts';
import { Button, Field, PasswordInput, useToast } from '@ilm/ui';
import { ICON_SIZE, LockedIcon, SaveIcon } from '@ilm/ui/icons';
import { useState, type FormEvent } from 'react';

import { PasswordRequirements } from '@/components/password-requirements';
import {
  fieldErrorsFromResetPassword,
  showApiErrorToast,
  showFormValidationToast,
  showNetworkErrorToast,
} from '@/lib/form-validation';
import { mutate } from '@/lib/mutate';

export function ChangePasswordForm({
  onSuccess,
  onCancel,
  submitLabel = 'Update password',
}: {
  onSuccess: () => void;
  onCancel?: () => void;
  submitLabel?: string;
}) {
  const toast = useToast();
  const [currentPassword, setCurrentPassword] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [isPending, setIsPending] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isPending) {
      return;
    }

    setFieldErrors({});
    const parsed = changePasswordRequestSchema.safeParse({
      currentPassword,
      password,
      confirmPassword: confirm,
    });

    if (!parsed.success) {
      setFieldErrors(fieldErrorsFromResetPassword(parsed.error));
      showFormValidationToast(toast);
      return;
    }

    setIsPending(true);
    try {
      const result = await mutate<{ ok: true }>(ROUTES.auth.changePassword, 'POST', parsed.data);
      if (!result.ok) {
        showApiErrorToast(toast, 'Password not updated', result.message);
        return;
      }

      await fetch(ROUTES.auth.refresh, { method: 'POST', credentials: 'include' });
      toast.success('Password updated.');
      onSuccess();
    } catch {
      showNetworkErrorToast(toast);
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
      className="space-y-3.5"
    >
      <Field label="Current password" error={fieldErrors.currentPassword} required leadingIcon={LockedIcon}>
        <PasswordInput
          name="currentPassword"
          autoComplete="current-password"
          value={currentPassword}
          disabled={isPending}
          onChange={(event) => {
            setCurrentPassword(event.target.value);
          }}
        />
      </Field>

      <Field label="New password" error={fieldErrors.password} required leadingIcon={LockedIcon}>
        <PasswordInput
          name="password"
          autoComplete="new-password"
          value={password}
          disabled={isPending}
          onChange={(event) => {
            setPassword(event.target.value);
          }}
        />
      </Field>

      <PasswordRequirements password={password} />

      <Field label="Confirm new password" error={fieldErrors.confirm} required leadingIcon={LockedIcon}>
        <PasswordInput
          name="confirmPassword"
          autoComplete="new-password"
          value={confirm}
          disabled={isPending}
          onChange={(event) => {
            setConfirm(event.target.value);
          }}
        />
      </Field>

      <div className="flex flex-wrap justify-end gap-3 pt-2">
        {onCancel === undefined ? null : (
          <Button type="button" tone="outline" disabled={isPending} onClick={onCancel}>
            Cancel
          </Button>
        )}
        <Button type="submit" disabled={isPending} className="min-w-36">
          {isPending ? (
            'Updating…'
          ) : (
            <>
              <SaveIcon className={ICON_SIZE.inline} aria-hidden="true" />
              {submitLabel}
            </>
          )}
        </Button>
      </div>
    </form>
  );
}
