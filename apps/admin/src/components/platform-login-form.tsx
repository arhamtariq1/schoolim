'use client';

import { platformLoginSchema, ROUTES } from '@ilm/contracts';
import { Button, Field, Input, PasswordInput } from '@ilm/ui';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';

/**
 * Sign in to the platform console.
 *
 * Posts same-origin to `/api/v1/platform/auth/login`, which the console's own
 * proxy forwards. Validation is the shared zod schema, so the client and the
 * server cannot drift.
 */
export function PlatformLoginForm() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | undefined>(undefined);
  const [isPending, setIsPending] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(undefined);
    setFieldErrors({});

    const parsed = platformLoginSchema.safeParse({ email, password });
    if (!parsed.success) {
      const next: Record<string, string> = {};
      for (const issue of parsed.error.issues) {
        const key = issue.path[0];
        if (typeof key === 'string') {
          next[key] = issue.message;
        }
      }
      setFieldErrors(next);
      return;
    }

    setIsPending(true);
    try {
      const response = await fetch(ROUTES.platform.auth.login, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(parsed.data),
      });

      if (!response.ok) {
        const problem = (await response.json().catch(() => ({}))) as { detail?: string };
        setFormError(problem.detail ?? 'Could not sign you in. Try again.');
        return;
      }

      router.replace('/schools');
      router.refresh();
    } catch {
      setFormError('Could not reach the server. Check your connection and try again.');
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
      {formError === undefined ? null : (
        <div
          role="alert"
          className="rounded-md border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger"
        >
          {formError}
        </div>
      )}

      <Field label="Email" error={fieldErrors['email']} required>
        <Input
          type="email"
          name="email"
          autoComplete="username"
          autoFocus
          value={email}
          onChange={(event) => {
            setEmail(event.target.value);
          }}
        />
      </Field>

      <Field label="Password" error={fieldErrors['password']} required>
        <PasswordInput
          name="password"
          autoComplete="current-password"
          value={password}
          onChange={(event) => {
            setPassword(event.target.value);
          }}
        />
      </Field>

      <Button type="submit" isPending={isPending} className="w-full" size="touch">
        {isPending ? 'Signing in…' : 'Sign in'}
      </Button>
    </form>
  );
}
