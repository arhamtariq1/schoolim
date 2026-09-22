'use client';

import {
  forgotPasswordRequestSchema,
  ROUTES,
  type ForgotPasswordResult,
} from '@ilm/contracts';
import { Button, Field, Input, useToast } from '@ilm/ui';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';

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
      const message = parsed.error.issues[0]?.message ?? 'Enter a valid email address.';
      setFieldErrors({ email: message });
      toast.error(message);
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
        const message =
          problem.code === 'AUTH_EMAIL_NOT_FOUND'
            ? (problem.detail ?? 'No account uses that email.')
            : (problem.detail ?? 'Could not send a reset code. Try again.');
        if (problem.code === 'AUTH_EMAIL_NOT_FOUND') {
          setFieldErrors({ email: message });
        }
        toast.error(message);
        return;
      }

      const body = (await response.json()) as { data: ForgotPasswordResult };
      toast.success('Check your email', `We sent a code to ${body.data.email}.`);
      router.push(
        `/otp-verification?context=${PASSWORD_RESET_CONTEXT}&email=${encodeURIComponent(body.data.email)}`,
      );
    } catch {
      toast.error('Could not reach the server. Check your connection and try again.');
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
      className="space-y-4"
    >
      <Field label="Email" error={fieldErrors['email']} required>
        <Input
          type="email"
          name="email"
          autoComplete="email"
          autoFocus
          value={email}
          disabled={isPending}
          onChange={(event) => {
            setEmail(event.target.value);
          }}
        />
      </Field>

      <Button type="submit" isPending={isPending} className="w-full" size="touch">
        {isPending ? 'Sending…' : 'Send reset code'}
      </Button>

      <p className="text-center text-sm text-muted-foreground">
        Remembered it?{' '}
        <Link href="/login" className="font-medium text-primary hover:underline">
          Sign in
        </Link>
      </p>
    </form>
  );
}
