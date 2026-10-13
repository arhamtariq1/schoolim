'use client';

import {
  ROUTES,
  type ForgotPasswordResendOtpResult,
  type ForgotPasswordVerifyOtpResult,
  type SignupResendOtpResult,
  type SignupVerifyOtpResult,
} from '@ilm/contracts';
import { Button, Field, OtpInput, useToast } from '@ilm/ui';
import { ApproveIcon, ICON_SIZE } from '@ilm/ui/icons';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState, type FormEvent } from 'react';

import { AuthFormActions } from './auth-form-actions';
import { AuthInlineLink, AuthSecondaryNav } from './auth-inline-link';
import { SIGNUP_CONTEXT } from './signup-step-gate';

import { showApiErrorToast, showNetworkErrorToast } from '@/lib/form-validation';
import { clearSignupDraft } from '@/lib/signup-draft';

/** Query `context` for the forgot-password OTP step. */
export const PASSWORD_RESET_CONTEXT = 'password-reset';

/**
 * OTP entry for signup and password reset.
 *
 * Verify stays disabled until all six digits are in. Filling the last digit
 * submits automatically — the usual pattern for short codes.
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
  const formRef = useRef<HTMLFormElement>(null);
  const [code, setCode] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [isPending, setIsPending] = useState(false);
  const [isResending, setIsResending] = useState(false);
  const [cooldownSeconds, setCooldownSeconds] = useState(0);
  const isSignup = context === SIGNUP_CONTEXT || context === 'signup';
  const isPasswordReset = context === PASSWORD_RESET_CONTEXT;
  const digits = code.replace(/\D/g, '');
  const isComplete = digits.length === 6;

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
      toast.success('New verification code sent.');
      return;
    }

    if (result.retryAfterSeconds !== undefined && result.retryAfterSeconds > 0) {
      setCooldownSeconds(result.retryAfterSeconds);
      return;
    }

    toast.warning('Please wait before requesting another code.');
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isPending || !isComplete) {
      return;
    }

    setFieldErrors({});
    if (!/^\d{6}$/.test(digits)) {
      const message = 'Enter the 6-digit code from your email.';
      setFieldErrors({ code: message });
      toast.error(message);
      return;
    }

    if (isPasswordReset) {
      if (email === undefined || email === '') {
        toast.error('Session expired. Start again from forgot password.');
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
            showApiErrorToast(
              toast,
              'Email not found',
              problem.detail,
              'No account uses that email address.',
            );
            router.replace('/forgot-password');
            return;
          }
          showApiErrorToast(toast, 'Incorrect code', problem.detail, 'Check the code and try again.');
          return;
        }

        const body = (await response.json()) as { data: ForgotPasswordVerifyOtpResult };
        toast.success('Code confirmed.');
        router.push(
          `/new-password?email=${encodeURIComponent(body.data.email)}&token=${encodeURIComponent(body.data.resetToken)}`,
        );
      } catch {
        showNetworkErrorToast(toast);
      } finally {
        setIsPending(false);
      }
      return;
    }

    if (!isSignup) {
      toast.error('Open this page from signup or forgot password.');
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
          showApiErrorToast(toast, 'Signup expired', problem.detail, 'Start signup again.');
          router.replace('/signup');
          return;
        }
        showApiErrorToast(toast, 'Incorrect code', problem.detail, 'Check the code and try again.');
        return;
      }

      const body = (await response.json()) as { data: SignupVerifyOtpResult };
      clearSignupDraft();
      toast.success('Email verified. Sign in to continue.');
      const params = new URLSearchParams({
        verified: '1',
        email: body.data.email,
      });
      router.replace(`/login?${params.toString()}`);
    } catch {
      showNetworkErrorToast(toast);
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
            showApiErrorToast(
              toast,
              'Email not found',
              problem.detail,
              'No account uses that email address.',
            );
            router.replace('/forgot-password');
            return;
          }
          showApiErrorToast(toast, 'Could not resend code', problem.detail, 'Try again in a moment.');
          return;
        }

        const body = (await response.json()) as { data: ForgotPasswordResendOtpResult };
        applyResendResult(body.data);
      } catch {
        showNetworkErrorToast(toast);
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
          showApiErrorToast(toast, 'Signup expired', problem.detail, 'Start signup again.');
          router.replace('/signup');
          return;
        }
        showApiErrorToast(toast, 'Could not resend code', problem.detail, 'Try again in a moment.');
        return;
      }

      const body = (await response.json()) as { data: SignupResendOtpResult };
      applyResendResult(body.data);
    } catch {
      showNetworkErrorToast(toast);
    } finally {
      setIsResending(false);
    }
  }

  const resendDisabled = isResending || isPending || cooldownSeconds > 0;

  return (
    <form
      ref={formRef}
      onSubmit={(event) => {
        void submit(event);
      }}
      noValidate
      className="space-y-3.5"
    >
      {email === undefined ? null : (
        <div className="rounded-lg border border-border/70 bg-muted/35 px-4 py-3">
          <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
            Code sent to
          </p>
          <p className="mt-1 truncate text-sm font-medium text-foreground" title={email}>
            {email}
          </p>
        </div>
      )}

      <Field label="Verification code" error={fieldErrors['code']} required>
        <OtpInput
          name="code"
          autoFocus
          value={code}
          disabled={isPending}
          aria-invalid={fieldErrors['code'] !== undefined}
          onChange={(next) => {
            setCode(next);
            if (fieldErrors['code'] !== undefined) {
              setFieldErrors({});
            }
            if (next.replace(/\D/g, '').length === 6) {
              queueMicrotask(() => {
                formRef.current?.requestSubmit();
              });
            }
          }}
        />
      </Field>

      <AuthFormActions
        nav={
          <AuthSecondaryNav
            left={<AuthInlineLink href="/login">Sign in</AuthInlineLink>}
            right={<AuthInlineLink href="/signup">Create account</AuthInlineLink>}
          />
        }
        showDivider={false}
      >
        <Button
          type="submit"
          isPending={isPending}
          disabled={!isComplete}
          className="w-full"
          size="touch"
        >
          <ApproveIcon className={ICON_SIZE.inline} aria-hidden />
          {isPending ? 'Verifying…' : 'Verify code'}
        </Button>
      </AuthFormActions>

      <p className="text-center text-sm text-muted-foreground">
          {cooldownSeconds > 0 ? (
            <>
              Didn&apos;t get it?{' '}
              <span className="tabular-nums text-foreground/80">
                Resend in {String(cooldownSeconds)}s
              </span>
            </>
          ) : (
            <>
              Didn&apos;t get it?{' '}
              <button
                type="button"
                className="font-medium text-primary hover:underline focus-visible:rounded-sm focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none disabled:opacity-50"
                disabled={resendDisabled}
                onClick={() => {
                  void resend();
                }}
              >
                {isResending ? 'Sending…' : 'Resend code'}
              </button>
            </>
          )}
        </p>
    </form>
  );
}
