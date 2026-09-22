'use client';

import {
  ROUTES,
  type ForgotPasswordResendOtpResult,
  type ForgotPasswordVerifyOtpResult,
  type SignupResendOtpResult,
  type SignupVerifyOtpResult,
} from '@ilm/contracts';
import { Button, Field, OtpInput, useToast } from '@ilm/ui';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState, type FormEvent } from 'react';

import { SIGNUP_CONTEXT } from './signup-step-gate';

/** Query `context` for the forgot-password OTP step. */
export const PASSWORD_RESET_CONTEXT = 'password-reset';

/**
 * OTP entry for signup and password reset.
 */
export function OtpVerificationForm({
  email,
  context,
}: {
  readonly email?: string;
  readonly context?: string;
}) {
  const toast = useToast();
  const router = useRouter();
  const [code, setCode] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [isPending, setIsPending] = useState(false);
  const [isResending, setIsResending] = useState(false);
  const [cooldownSeconds, setCooldownSeconds] = useState(0);
  const isSignup = context === SIGNUP_CONTEXT || context === 'signup';
  const isPasswordReset = context === PASSWORD_RESET_CONTEXT;

  useEffect(() => {
    if (cooldownSeconds <= 0) {
      return;
    }

    const timer = window.setTimeout(() => {
      setCooldownSeconds((current) => Math.max(0, current - 1));
    }, 1000);

    return () => {
      window.clearTimeout(timer);
    };
  }, [cooldownSeconds]);

  function applyResendResult(result: {
    readonly sent: boolean;
    readonly retryAfterSeconds?: number | undefined;
  }) {
    if (result.sent) {
      setCooldownSeconds(0);
      toast.success('Code sent', 'Check your inbox for a new code.');
      return;
    }

    if (result.retryAfterSeconds !== undefined && result.retryAfterSeconds > 0) {
      setCooldownSeconds(result.retryAfterSeconds);
      return;
    }

    toast.warning('Could not send another code just yet.');
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isPending) {
      return;
    }

    setFieldErrors({});
    const digits = code.replace(/\s/g, '');
    if (!/^\d{6}$/.test(digits)) {
      const message = 'Enter the 6-digit code.';
      setFieldErrors({ code: message });
      toast.error(message);
      return;
    }

    if (isPasswordReset) {
      if (email === undefined || email === '') {
        toast.error('Start again from forgot password.');
        router.replace('/forgot-password');
        return;
      }

      setIsPending(true);
      try {
        const response = await fetch(ROUTES.auth.forgotPasswordVerifyOtp, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ email, code: digits }),
        });

        if (!response.ok) {
          const problem = (await response.json().catch(() => ({}))) as {
            detail?: string;
            code?: string;
          };
          if (problem.code === 'AUTH_EMAIL_NOT_FOUND') {
            toast.error(problem.detail ?? 'No account uses that email.');
            router.replace('/forgot-password');
            return;
          }
          toast.error(problem.detail ?? 'That code is not correct.');
          return;
        }

        const body = (await response.json()) as { data: ForgotPasswordVerifyOtpResult };
        toast.success('Code confirmed');
        router.push(
          `/new-password?email=${encodeURIComponent(body.data.email)}&token=${encodeURIComponent(body.data.resetToken)}`,
        );
      } catch {
        toast.error('Could not reach the server. Check your connection and try again.');
      } finally {
        setIsPending(false);
      }
      return;
    }

    if (!isSignup) {
      toast.error('Open this page from forgot password or signup.');
      router.replace('/forgot-password');
      return;
    }

    setIsPending(true);
    try {
      const response = await fetch(ROUTES.public.signupVerifyOtp, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ code: digits }),
      });

      if (!response.ok) {
        const problem = (await response.json().catch(() => ({}))) as {
          detail?: string;
          code?: string;
        };
        if (problem.code === 'SIGNUP_SESSION_REQUIRED') {
          toast.error(problem.detail ?? 'Start signup again.');
          router.replace('/signup');
          return;
        }
        toast.error(problem.detail ?? 'That code is not correct.');
        return;
      }

      const body = (await response.json()) as { data: SignupVerifyOtpResult };
      toast.success('Email confirmed');
      router.push(`/signup/school?email=${encodeURIComponent(body.data.email)}`);
    } catch {
      toast.error('Could not reach the server. Check your connection and try again.');
    } finally {
      setIsPending(false);
    }
  }

  async function resend() {
    if (isResending || isPending || cooldownSeconds > 0) {
      return;
    }

    if (isPasswordReset) {
      if (email === undefined || email === '') {
        router.replace('/forgot-password');
        return;
      }

      setIsResending(true);
      try {
        const response = await fetch(ROUTES.auth.forgotPasswordResendOtp, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ email }),
        });

        if (!response.ok) {
          const problem = (await response.json().catch(() => ({}))) as {
            detail?: string;
            code?: string;
          };
          if (problem.code === 'AUTH_EMAIL_NOT_FOUND') {
            toast.error(problem.detail ?? 'No account uses that email.');
            router.replace('/forgot-password');
            return;
          }
          toast.error(problem.detail ?? 'Could not resend the code.');
          return;
        }

        const body = (await response.json()) as { data: ForgotPasswordResendOtpResult };
        applyResendResult(body.data);
      } catch {
        toast.error('Could not reach the server. Check your connection and try again.');
      } finally {
        setIsResending(false);
      }
      return;
    }

    if (!isSignup) {
      router.push('/forgot-password');
      return;
    }

    setIsResending(true);
    try {
      const response = await fetch(ROUTES.public.signupResendOtp, {
        method: 'POST',
        credentials: 'include',
      });

      if (!response.ok) {
        const problem = (await response.json().catch(() => ({}))) as {
          detail?: string;
          code?: string;
        };
        if (problem.code === 'SIGNUP_SESSION_REQUIRED') {
          toast.error(problem.detail ?? 'Start signup again.');
          router.replace('/signup');
          return;
        }
        toast.error(problem.detail ?? 'Could not resend the code.');
        return;
      }

      const body = (await response.json()) as { data: SignupResendOtpResult };
      applyResendResult(body.data);
    } catch {
      toast.error('Could not reach the server. Check your connection and try again.');
    } finally {
      setIsResending(false);
    }
  }

  const startOverHref = isPasswordReset ? '/forgot-password' : '/signup';
  const resendDisabled = isResending || isPending || cooldownSeconds > 0;

  return (
    <form
      onSubmit={(event) => {
        void submit(event);
      }}
      noValidate
      className="space-y-4"
    >
      {email === undefined ? null : (
        <p className="rounded-md border border-border bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
          Code sent to <span className="font-medium text-foreground">{email}</span>
        </p>
      )}

      <Field label="Verification code" error={fieldErrors['code']} required>
        <OtpInput
          name="code"
          autoFocus
          value={code}
          disabled={isPending}
          onChange={(next) => {
            setCode(next);
            if (fieldErrors['code'] !== undefined) {
              setFieldErrors({});
            }
          }}
        />
      </Field>

      <Button type="submit" isPending={isPending} className="w-full" size="touch">
        {isPending ? 'Verifying…' : 'Verify code'}
      </Button>

      <p className="text-center text-sm text-muted-foreground">
        {cooldownSeconds > 0 ? (
          <span className="tabular-nums">Resend code in {String(cooldownSeconds)}s</span>
        ) : (
          <button
            type="button"
            className="font-medium text-primary hover:underline disabled:opacity-50"
            disabled={resendDisabled}
            onClick={() => {
              void resend();
            }}
          >
            {isResending ? 'Sending…' : 'Resend code'}
          </button>
        )}
        {' · '}
        <Link href={startOverHref} className="font-medium text-primary hover:underline">
          Start over
        </Link>
      </p>
    </form>
  );
}
