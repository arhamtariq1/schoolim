'use client';

import { acceptInviteRequestSchema, ROUTES, type AcceptInviteResult } from '@ilm/contracts';
import { Button, Field, PasswordInput, useToast } from '@ilm/ui';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';

/**
 * "Set your password" — the other end of a staff invitation.
 *
 * ## Why the person is not signed in afterwards
 *
 * This runs in whatever browser the link was opened in, which is usually a
 * phone checking email and usually not the machine they will work on. Signing
 * them in here would leave a live session on a device they were only reading
 * mail with. They are sent to the sign-in page instead, which also makes the
 * first thing they do with the new password be typing it — the one action that
 * tells them whether they remember it.
 *
 * ## Why the token is not in a hidden input
 *
 * It arrives in the query string, is read once on the server and handed down as
 * a prop. Putting it in the DOM as a form field adds nothing and puts a live
 * credential somewhere a browser extension can read it.
 */
export function AcceptInviteForm({
  token,
  email,
}: {
  readonly token: string;
  readonly email: string;
}) {
  const router = useRouter();
  const toast = useToast();

  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | undefined>(undefined);
  const [isPending, setIsPending] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isPending) {
      return;
    }

    setFieldErrors({});
    setFormError(undefined);

    if (password !== confirm) {
      // Checked here rather than on the server, because the server has no
      // business being told the password twice.
      setFieldErrors({ confirm: 'Both passwords must match.' });
      return;
    }

    const parsed = acceptInviteRequestSchema.safeParse({ token, password });

    if (!parsed.success) {
      const next: Record<string, string> = {};
      for (const issue of parsed.error.issues) {
        next[issue.path.join('.')] = issue.message;
      }
      setFieldErrors(next);
      return;
    }

    setIsPending(true);

    let response: Response;
    try {
      response = await fetch(ROUTES.auth.acceptInvite, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(parsed.data),
      });
    } catch {
      setIsPending(false);
      setFormError('Could not reach the server. Check your connection and try again.');
      return;
    }

    if (!response.ok) {
      const problem = (await response.json().catch(() => ({}))) as { detail?: string };
      setIsPending(false);
      setFormError(problem.detail ?? 'That did not work. Ask the school to send a new invitation.');
      return;
    }

    const body = (await response.json()) as { data: AcceptInviteResult };

    toast.success('Your account is ready', 'Sign in with the password you just chose.');
    router.replace(`/login?email=${encodeURIComponent(body.data.email)}`);
  }

  return (
    <form
      onSubmit={(event) => {
        void submit(event);
      }}
      noValidate
      className="space-y-5"
    >
      <p className="rounded-md border border-border bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
        Setting up <span className="font-medium text-foreground">{email}</span>
      </p>

      {formError === undefined ? null : (
        <p
          role="alert"
          className="rounded-md border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger"
        >
          {formError}
        </p>
      )}

      <Field
        label="Choose a password"
        hint="At least 12 characters. Use something you have not used on another site."
        error={fieldErrors['password']}
        required
      >
        <PasswordInput
          autoComplete="new-password"
          autoFocus
          value={password}
          onChange={(event) => {
            setPassword(event.target.value);
          }}
        />
      </Field>

      <Field label="Confirm password" error={fieldErrors['confirm']} required>
        <PasswordInput
          autoComplete="new-password"
          value={confirm}
          onChange={(event) => {
            setConfirm(event.target.value);
          }}
        />
      </Field>

      <Button type="submit" isPending={isPending} className="w-full" size="touch">
        {isPending ? 'Setting up…' : 'Set password and continue'}
      </Button>
    </form>
  );
}
