'use client';

import { loginRequestSchema, ROUTES, type LoginOutcome, type SchoolChoice } from '@ilm/contracts';
import { Button, Field, Input, PasswordInput, useToast } from '@ilm/ui';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';

interface Problem {
  code?: string;
  detail?: string;
}

/**
 * The sign-in form. **Email and password. Never "which school".**
 *
 * Validation and API failures surface as toasts (docs/16 §8 / Chunk 1). Field
 * errors stay under the inputs for assistive tech. `isPending` disables the
 * button so a double click cannot fire two sign-ins.
 */
export function LoginForm({ initialEmail = '' }: { initialEmail?: string }) {
  const router = useRouter();
  const toast = useToast();
  const [identifier, setIdentifier] = useState(initialEmail);
  const [password, setPassword] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [isPending, setIsPending] = useState(false);
  const [choices, setChoices] = useState<SchoolChoice[] | undefined>(undefined);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isPending) {
      return;
    }

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
      toast.error(parsed.error.issues[0]?.message ?? 'Check the highlighted fields.');
      return;
    }

    setIsPending(true);
    try {
      const response = await fetch(ROUTES.auth.login, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(parsed.data),
      });

      if (!response.ok) {
        const problem = (await response.json().catch(() => ({}))) as Problem;
        toast.error(problem.detail ?? 'Could not sign you in. Try again.');
        return;
      }

      const body = (await response.json()) as { data: LoginOutcome };

      if (body.data.kind === 'session') {
        toast.success('Signed in');
        const next = body.data.user.mustChangePassword
          ? '/settings/password'
          : body.data.user.profileCompleted
            ? '/'
            : '/profile/create';
        router.replace(next);
        router.refresh();
        return;
      }

      const [only, ...rest] = body.data.choices;

      if (only !== undefined && rest.length === 0) {
        setChoices(undefined);
        toast.success('Signed in');
        window.location.assign(only.continueUrl);
        return;
      }

      setChoices(body.data.choices);
    } catch {
      toast.error('Could not reach the server. Check your connection and try again.');
    } finally {
      setIsPending(false);
    }
  }

  if (choices !== undefined) {
    return <SchoolPicker choices={choices} />;
  }

  return (
    <>
      <form
        onSubmit={(event) => {
          void submit(event);
        }}
        noValidate
        className="space-y-4"
      >
        <Field label="Email or phone" error={fieldErrors['identifier']} required>
          <Input
            type="text"
            name="identifier"
            autoComplete="username"
            autoFocus
            value={identifier}
            disabled={isPending}
            onChange={(event) => {
              setIdentifier(event.target.value);
            }}
          />
        </Field>

        <Field label="Password" error={fieldErrors['password']} required>
          <PasswordInput
            name="password"
            autoComplete="current-password"
            value={password}
            disabled={isPending}
            onChange={(event) => {
              setPassword(event.target.value);
            }}
          />
        </Field>

        <div className="flex justify-end">
          <Link
            href="/forgot-password"
            className="text-sm font-medium text-primary hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          >
            Forgot password?
          </Link>
        </div>

        <Button type="submit" isPending={isPending} className="w-full" size="touch">
          {isPending ? 'Signing in…' : 'Sign in'}
        </Button>
      </form>
    </>
  );
}

/**
 * Shown only when one set of credentials unlocked several schools.
 */
function SchoolPicker({ choices }: { choices: SchoolChoice[] }) {
  return (
    <div className="space-y-3">
      <div className="rounded-md border border-border bg-muted/50 px-4 py-3 text-sm">
        <p className="font-medium text-foreground">You have access to more than one school.</p>
        <p className="mt-1 text-muted-foreground">Choose where you want to work.</p>
      </div>

      <ul className="space-y-2">
        {choices.map((choice) => (
          <li key={choice.schoolId}>
            <a
              href={choice.continueUrl}
              className="flex w-full items-center justify-between rounded-md border border-border bg-card px-4 py-3 text-sm hover:border-primary focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
            >
              <span className="font-medium text-foreground">{choice.name}</span>
              <span className="font-mono text-xs text-muted-foreground">{choice.slug}</span>
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}
