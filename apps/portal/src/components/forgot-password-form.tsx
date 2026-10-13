'use client';

import {
  forgotPasswordRequestSchema,
  ROUTES,
  type ForgotPasswordResult,
} from '@ilm/contracts';
import { Button, Field, Input, useToast } from '@ilm/ui';
import { EmailIcon, ICON_SIZE, SendIcon } from '@ilm/ui/icons';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';

import {
  fieldErrorsFromZod,
  showApiErrorToast,
  showFormValidationToast,
  showNetworkErrorToast,
} from '@/lib/form-validation';

import { AuthFormActions } from './auth-form-actions';
import { AuthInlineLink } from './auth-inline-link';
import { PASSWORD_RESET_CONTEXT } from './otp-verification-form';

/**
 * Ask for an email so a reset OTP can be sent.
 *
 * Unknown addresses are refused — the person can fix a typo instead of waiting
 * on a message that will never arrive.
 */
export function ForgotPasswordForm() {
  const toast = useToast();
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [isPending, setIsPending] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isPending) {
      return;
    }

    setFieldErrors({});
    const parsed = forgotPasswordRequestSchema.safeParse({ email });
    if (!parsed.success) {
      setFieldErrors(fieldErrorsFromZod(parsed.error));
      showFormValidationToast(toast);
      return;
    }

    setIsPending(true);
    try {
      const response = await fetch(ROUTES.auth.forgotPassword, {
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
        const title =
          problem.code === 'AUTH_EMAIL_NOT_FOUND' ? 'Email not found' : 'Could not send code';
        const detail =
          problem.code === 'AUTH_EMAIL_NOT_FOUND'
            ? (problem.detail ?? 'No account uses that email address.')
            : (problem.detail ?? 'Try again in a moment.');
        if (problem.code === 'AUTH_EMAIL_NOT_FOUND') {
          setFieldErrors({ email: detail });
        }
        showApiErrorToast(toast, title, detail);
        return;
      }

      const body = (await response.json()) as { data: ForgotPasswordResult };
      toast.success(`Reset code sent to ${body.data.email}.`);
      router.push(
        `/otp-verification?context=${PASSWORD_RESET_CONTEXT}&email=${encodeURIComponent(body.data.email)}`,
      );
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
      <Field label="Email" error={fieldErrors['email']} required leadingIcon={EmailIcon}>
        <Input
          type="email"
          name="email"
          autoComplete="email"
          autoFocus
          placeholder="you@school.edu.pk"
          value={email}
          disabled={isPending}
          onChange={(event) => {
            setEmail(event.target.value);
          }}
        />
      </Field>

      <AuthFormActions
        footer={
          <p className="text-center text-sm text-muted-foreground">
            Remembered it? <AuthInlineLink href="/login">Sign in</AuthInlineLink>
          </p>
        }
      >
        <Button type="submit" isPending={isPending} className="w-full" size="touch">
          <SendIcon className={ICON_SIZE.inline} aria-hidden />
          {isPending ? 'Sending…' : 'Send reset code'}
        </Button>
      </AuthFormActions>
    </form>
  );
}
