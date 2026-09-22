'use client';

import {
  CURRENT_TERMS_VERSION,
  ROUTES,
  signupStartRequestSchema,
  type SignupStartResult,
} from '@ilm/contracts';
import { Button, CheckboxField, Field, Input, PasswordInput, useToast } from '@ilm/ui';
import { useRouter } from 'next/navigation';
import { useEffect, useState, type FormEvent } from 'react';

import { SIGNUP_CONTEXT } from './signup-step-gate';

/**
 * Signup step 1 — credentials and terms.
 *
 * School details wait until the email OTP succeeds. The API sets an httpOnly
 * signup cookie; this form never stores the password in the browser.
 */
export function SignupCredentialsForm() {
  const toast = useToast();
  const router = useRouter();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [accepted, setAccepted] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [isPending, setIsPending] = useState(false);

  // Resume an in-flight signup if the cookie is still valid.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const response = await fetch(ROUTES.public.signupStatus, { credentials: 'include' });
        if (!response.ok || cancelled) {
          return;
        }
        const body = (await response.json()) as {
          data: { email: string; step: 'otp' | 'school' };
        };
        if (cancelled) {
          return;
        }
        router.replace(
          body.data.step === 'otp'
            ? `/otp-verification?context=${SIGNUP_CONTEXT}&email=${encodeURIComponent(body.data.email)}`
            : `/signup/school?email=${encodeURIComponent(body.data.email)}`,
        );
      } catch {
        // Cold start — stay on credentials.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [router]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isPending) {
      return;
    }

    setFieldErrors({});

    const parsed = signupStartRequestSchema.safeParse({
      name,
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
        accepted
          ? (parsed.error.issues[0]?.message ?? 'Check the highlighted fields.')
          : 'Accept the terms to continue.',
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
      className="space-y-4"
    >
      <Field label="Name" error={fieldErrors['name']} required>
        <Input
          name="name"
          autoComplete="name"
          autoFocus
          value={name}
          disabled={isPending}
          onChange={(event) => {
            setName(event.target.value);
          }}
        />
      </Field>

      <Field label="Email" error={fieldErrors['email']} required>
        <Input
          name="email"
          type="email"
          autoComplete="email"
          value={email}
          disabled={isPending}
          onChange={(event) => {
            setEmail(event.target.value);
          }}
        />
      </Field>

      <Field
        label="Password"
        error={fieldErrors['password']}
        hint="At least 12 characters. A short phrase is easier to remember and harder to guess."
        required
      >
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

      <Field label="Confirm password" error={fieldErrors['confirmPassword']} required>
        <PasswordInput
          name="confirmPassword"
          autoComplete="new-password"
          value={confirmPassword}
          disabled={isPending}
          onChange={(event) => {
            setConfirmPassword(event.target.value);
          }}
        />
      </Field>

      <CheckboxField
        label="I have read and accept the terms of service and the data processing agreement, and I am authorised to accept them for this school."
        id="accepted-terms"
        name="acceptedTerms"
        checked={accepted}
        disabled={isPending}
        onCheckedChange={(next) => {
          setAccepted(next === true);
        }}
      />

      <Button
        type="submit"
        isPending={isPending}
        disabled={!accepted}
        className="w-full"
        size="touch"
      >
        {isPending ? 'Sending code…' : 'Continue'}
      </Button>
    </form>
  );
}
