'use client';

import {
  CURRENT_TERMS_VERSION,
  ROUTES,
  signupStartRequestSchema,
  type SignupStartResult,
} from '@ilm/contracts';
import { Button, Checkbox, Field, Input, PasswordInput, useToast } from '@ilm/ui';
import { useRouter } from 'next/navigation';
import { useEffect, useState, type FormEvent } from 'react';

import { AuthFormActions } from './auth-form-actions';
import { AuthInlineLink } from './auth-inline-link';
import { PasswordRequirements } from './password-requirements';
import { SIGNUP_CONTEXT } from './signup-step-gate';

import { readSignupDraft, saveSignupDraft } from '@/lib/signup-draft';

/**
 * Signup step 1 — credentials and terms.
 *
 * School details wait until the email OTP succeeds. The API sets an httpOnly
 * signup cookie. A sessionStorage draft restores the fields when the person
 * uses Back from the OTP screen.
 */
export function SignupCredentialsForm() {
  const toast = useToast();
  const router = useRouter();
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [accepted, setAccepted] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [isPending, setIsPending] = useState(false);
  const [hydrated, setHydrated] = useState(false);

  // Restore draft after mount (SSR has no sessionStorage), then maybe resume.
  useEffect(() => {
    const stored = readSignupDraft();
    if (stored !== undefined) {
      setFirstName(stored.firstName);
      setLastName(stored.lastName);
      setEmail(stored.email);
      setPassword(stored.password);
      setConfirmPassword(stored.confirmPassword);
      setAccepted(stored.accepted);
    }
    setHydrated(true);
  }, []);

  // Resume an in-flight signup if the cookie is still valid.
  useEffect(() => {
    if (!hydrated) {
      return;
    }

    let cancelled = false;
    void (async () => {
      try {
        const response = await fetch(ROUTES.public.signupStatus, { credentials: 'include' });
        if (!response.ok || cancelled) {
          return;
        }
        const body = (await response.json()) as {
          data: { email: string; step: 'otp' };
        };
        if (cancelled) {
          return;
        }
        router.replace(
          `/otp-verification?context=${SIGNUP_CONTEXT}&email=${encodeURIComponent(body.data.email)}`,
        );
      } catch {
        // Cold start — stay on credentials.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [hydrated, router]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isPending) {
      return;
    }

    setFieldErrors({});

    const parsed = signupStartRequestSchema.safeParse({
      firstName,
      lastName,
      email,
      password,
      confirmPassword,
      acceptedTerms: accepted ? true : undefined,
      termsVersion: CURRENT_TERMS_VERSION,
    });

    if (!parsed.success) {
      const next: Record<string, string> = {};
      for (const issue of parsed.error.issues) {
        const key = issue.path.join('.');
        if (key !== '') {
          next[key] = issue.message;
        }
      }
      setFieldErrors(next);
      toast.error(
        !accepted ? 'Accept the terms to continue.' : 'Check the highlighted fields below.',
      );
      return;
    }

    setIsPending(true);
    try {
      const response = await fetch(ROUTES.public.signupStart, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(parsed.data),
      });

      if (!response.ok) {
        const problem = (await response.json().catch(() => ({}))) as { detail?: string };
        toast.error(problem.detail ?? 'Could not start signup. Try again.');
        return;
      }

      const body = (await response.json()) as { data: SignupStartResult };
      saveSignupDraft({
        firstName,
        lastName,
        email,
        password,
        confirmPassword,
        accepted,
      });
      toast.success('Check your email', `We sent a code to ${body.data.email}.`);
      router.push(
        `/otp-verification?context=${SIGNUP_CONTEXT}&email=${encodeURIComponent(body.data.email)}`,
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
      className="space-y-3.5"
    >
      <div className="grid gap-3.5 sm:grid-cols-2">
        <Field label="First name" error={fieldErrors['firstName']} required>
          <Input
            name="firstName"
            autoComplete="given-name"
            autoFocus
            placeholder="e.g. Ayesha"
            value={firstName}
            disabled={isPending}
            onChange={(event) => {
              setFirstName(event.target.value);
            }}
          />
        </Field>

        <Field label="Last name" error={fieldErrors['lastName']} required>
          <Input
            name="lastName"
            autoComplete="family-name"
            placeholder="e.g. Khan"
            value={lastName}
            disabled={isPending}
            onChange={(event) => {
              setLastName(event.target.value);
            }}
          />
        </Field>
      </div>

      <Field label="Email" error={fieldErrors['email']} required>
        <Input
          name="email"
          type="email"
          autoComplete="email"
          placeholder="you@school.edu.pk"
          value={email}
          disabled={isPending}
          onChange={(event) => {
            setEmail(event.target.value);
          }}
        />
      </Field>

      <div className="space-y-1.5">
        <Field label="Password" error={fieldErrors['password']} required>
          <PasswordInput
            name="password"
            autoComplete="new-password"
            placeholder="Create a password"
            value={password}
            disabled={isPending}
            onChange={(event) => {
              setPassword(event.target.value);
            }}
          />
        </Field>
        <PasswordRequirements password={password} dense />
      </div>

      <Field label="Confirm password" error={fieldErrors['confirmPassword']} required>
        <PasswordInput
          name="confirmPassword"
          autoComplete="new-password"
          placeholder="Re-enter your password"
          value={confirmPassword}
          disabled={isPending}
          onChange={(event) => {
            setConfirmPassword(event.target.value);
          }}
        />
      </Field>

      <label
        htmlFor="accepted-terms"
        className="flex cursor-pointer items-center gap-2.5 py-0.5 select-none"
      >
        <Checkbox
          id="accepted-terms"
          name="acceptedTerms"
          checked={accepted}
          disabled={isPending}
          onCheckedChange={(next) => {
            setAccepted(next === true);
          }}
        />
        <span className="text-sm leading-snug text-foreground">
          I accept the{' '}
          <span className="font-medium text-primary">Terms &amp; Conditions.</span>
        </span>
      </label>

      <AuthFormActions
        footer={
          <p className="text-center text-sm text-muted-foreground">
            Already have an account? <AuthInlineLink href="/login">Sign in</AuthInlineLink>
          </p>
        }
      >
        <Button
          type="submit"
          isPending={isPending}
          disabled={!accepted}
          className="w-full"
          size="touch"
        >
          {isPending ? 'Sending code…' : 'Continue'}
        </Button>
      </AuthFormActions>
    </form>
  );
}
