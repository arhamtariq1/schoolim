'use client';

import { resetPasswordRequestSchema, ROUTES } from '@ilm/contracts';
import { Button, Field, PasswordInput, useToast } from '@ilm/ui';
import { ICON_SIZE, LockedIcon } from '@ilm/ui/icons';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';

import {
  fieldErrorsFromResetPassword,
  showApiErrorToast,
  showFormValidationToast,
  showNetworkErrorToast,
} from '@/lib/form-validation';

import { AuthFormActions } from './auth-form-actions';
import { AuthInlineLink } from './auth-inline-link';
import { PasswordRequirements } from './password-requirements';

/**
 * Choose a new password after the reset OTP succeeds.
 *
 * The opaque `token` comes from verify-otp and is single-use on the API.
 */
export function NewPasswordForm({
  email,
  token,
}: {
  readonly email?: string;
  readonly token?: string;
}) {
  const toast = useToast();
  const router = useRouter();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [isPending, setIsPending] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isPending) {
      return;
    }

    if (token === undefined || token === '') {
      toast.error('Reset link expired. Request a new code from forgot password.');
      router.replace('/forgot-password');
      return;
    }

    setFieldErrors({});
    const parsed = resetPasswordRequestSchema.safeParse({
      token,
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
      const response = await fetch(ROUTES.auth.resetPassword, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(parsed.data),
      });

      if (!response.ok) {
        const problem = (await response.json().catch(() => ({}))) as {
          detail?: string;
          code?: string;
        };
        if (problem.code === 'AUTH_RESET_TOKEN_INVALID') {
          showApiErrorToast(
            toast,
            'Reset link expired',
            problem.detail,
            'Request a new code from forgot password.',
          );
          router.replace('/forgot-password');
          return;
        }
        showApiErrorToast(
          toast,
          'Password not updated',
          problem.detail,
          'Could not save your new password. Try again.',
        );
        return;
      }

      toast.success('Password updated successfully.');
      router.push('/login');
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
      {email === undefined ? null : (
        <p className="rounded-md border border-border bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
          New password for <span className="font-medium text-foreground">{email}</span>
        </p>
      )}

      <div className="space-y-1.5">
        <Field label="New password" error={fieldErrors['password']} required leadingIcon={LockedIcon}>
          <PasswordInput
            name="password"
            autoComplete="new-password"
            autoFocus
            placeholder="Create a password"
            value={password}
            disabled={isPending}
            onChange={(event) => {
              setPassword(event.target.value);
            }}
          />
        </Field>
        <PasswordRequirements password={password} />
      </div>

      <Field label="Confirm password" error={fieldErrors['confirm']} required leadingIcon={LockedIcon}>
        <PasswordInput
          name="confirm"
          autoComplete="new-password"
          placeholder="Re-enter your password"
          value={confirm}
          disabled={isPending}
          onChange={(event) => {
            setConfirm(event.target.value);
          }}
        />
      </Field>

      <AuthFormActions
        footer={
          <p className="text-center text-sm text-muted-foreground">
            <AuthInlineLink href="/login">Back to sign in</AuthInlineLink>
          </p>
        }
      >
        <Button type="submit" isPending={isPending} className="w-full" size="touch">
          {isPending ? 'Saving…' : 'Save new password'}
        </Button>
      </AuthFormActions>
    </form>
  );
}
