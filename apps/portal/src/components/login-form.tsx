'use client';

import { loginRequestSchema, ROUTES, type SessionUser } from '@ilm/contracts';
import { Button, Field, Input } from '@ilm/ui';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';

interface Problem {
  code?: string;
  detail?: string;
}

/**
 * The sign-in form.
 *
 * Rendered only once the page has confirmed the address carries a school
 * (see login/page.tsx). Validation comes from the shared zod schema in
 * `@ilm/contracts`, so the client and the server cannot drift (docs/16 §8).
 */
export function LoginForm() {
  const router = useRouter();
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | undefined>(undefined);
  const [isPending, setIsPending] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(undefined);
    setFieldErrors({});

    const parsed = loginRequestSchema.safeParse({ identifier, password, rememberDevice: false });
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
      // Same-origin, always. The school's own hostname serves the API under
      // `/api/v1` (see app/api/v1/[...path]/route.ts), which is what keeps the
      // session cookie first-party. Pointing this at another origin would need
      // `SameSite=None` and CORS with credentials, so there is no base-URL
      // setting to get wrong.
      const response = await fetch(ROUTES.auth.login, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        // The session lives in httpOnly cookies the browser stores for us; the
        // token never touches JavaScript (docs/11 §8).
        credentials: 'include',
        body: JSON.stringify(parsed.data),
      });

      if (!response.ok) {
        const problem = (await response.json().catch(() => ({}))) as Problem;
        // The API returns one message for every sign-in failure on purpose.
        setFormError(problem.detail ?? 'Could not sign you in. Try again.');
        return;
      }

      const body = (await response.json()) as { data: SessionUser };
      // An invited or reset account must set a password before anything else.
      if (body.data.mustChangePassword) {
        router.replace('/settings/password');
      } else {
        router.replace('/');
      }
      router.refresh();
    } catch {
      setFormError('Could not reach the server. Check your connection and try again.');
    } finally {
      setIsPending(false);
    }
  }

  return (
    <>
      <form
        onSubmit={(event) => {
          // React does not await an async handler, and an unhandled rejection
          // here would be silent. Explicitly detach it.
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

        <Field label="Email or phone" error={fieldErrors['identifier']} required>
          <Input
            type="text"
            name="identifier"
            autoComplete="username"
            autoFocus
            value={identifier}
            onChange={(event) => {
              setIdentifier(event.target.value);
            }}
          />
        </Field>

        <Field label="Password" error={fieldErrors['password']} required>
          <Input
            type="password"
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

      <p className="mt-6 text-center text-xs text-muted-foreground">
        Trouble signing in? Ask your school administrator to reset your password.
      </p>
    </>
  );
}
