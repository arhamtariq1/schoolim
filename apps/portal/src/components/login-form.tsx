'use client';

import { loginRequestSchema, ROUTES, type LoginOutcome, type SchoolChoice } from '@ilm/contracts';
import { Button, Field, Input } from '@ilm/ui';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';

interface Problem {
  code?: string;
  detail?: string;
}

/**
 * The sign-in form. **Email and password. Never "which school".**
 *
 * The same component serves both addresses, because from here they are the same
 * interaction — the difference is entirely in what the server can infer:
 *
 * - On `{slug}.<domain>` the school is in the address, and a correct password
 *   comes back as a session that is already set on this origin.
 * - On the apex it is not, so the school is resolved from the credentials and a
 *   correct password comes back as one or more **handoff URLs** (ADR-0009).
 *   Almost always one, and then this redirects without asking anything.
 *
 * The picker below therefore appears only for a person who genuinely holds
 * accounts at more than one school with the same email and password — and only
 * after they have proved it. Asking before the password would be handing the
 * tenant list to anyone who loaded the page.
 */
export function LoginForm() {
  const router = useRouter();
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | undefined>(undefined);
  const [isPending, setIsPending] = useState(false);
  const [choices, setChoices] = useState<SchoolChoice[] | undefined>(undefined);

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
      // Same-origin, always. Whichever host is serving this page also serves
      // the API under `/api/v1` (see app/api/v1/[...path]/route.ts), which is
      // what keeps the session cookie first-party and, at the apex, what tells
      // the API there is no tenant to check against.
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

      const body = (await response.json()) as { data: LoginOutcome };

      if (body.data.kind === 'session') {
        // An invited or reset account must set a password before anything else.
        router.replace(body.data.user.mustChangePassword ? '/settings/password' : '/');
        router.refresh();
        return;
      }

      const [only, ...rest] = body.data.choices;

      if (only !== undefined && rest.length === 0) {
        // The ordinary case, and it must not flicker: a full page load to
        // another origin, not a router push. `router` cannot cross hosts, and
        // the whole point of the handoff is that the cookie is set over there.
        setChoices(undefined);
        window.location.assign(only.continueUrl);
        return;
      }

      setChoices(body.data.choices);
    } catch {
      setFormError('Could not reach the server. Check your connection and try again.');
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

/**
 * Shown only when one set of credentials unlocked several schools.
 *
 * Every entry here is a school this person has just authenticated against, so
 * naming them discloses nothing they did not already know. Each link carries
 * its own single-use token; taking one leaves the others to expire in a couple
 * of minutes, unused.
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
