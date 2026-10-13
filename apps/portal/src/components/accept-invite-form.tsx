'use client';

import { acceptInviteRequestSchema, ROUTES, type AcceptInviteResult } from '@ilm/contracts';
import { Button, Field, PasswordInput, useToast } from '@ilm/ui';
import { ApproveIcon, ICON_SIZE, LockedIcon } from '@ilm/ui/icons';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';

import {
  fieldErrorsFromZod,
  showApiErrorToast,
  showFormValidationToast,
  showNetworkErrorToast,
} from '@/lib/form-validation';

import { AuthFormActions } from './auth-form-actions';
import { AuthInlineLink, AuthSecondaryNav } from './auth-inline-link';
import { PasswordRequirements } from './password-requirements';

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
      toast.error('Both passwords must match.');
      return;
    }

    const parsed = acceptInviteRequestSchema.safeParse({ token, password });

    if (!parsed.success) {
      setFieldErrors(fieldErrorsFromZod(parsed.error));
      showFormValidationToast(toast);
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
      showNetworkErrorToast(toast);
      setFormError('Could not reach the server. Check your connection and try again.');
      return;
    }

    if (!response.ok) {
      const problem = (await response.json().catch(() => ({}))) as { detail?: string };
      setIsPending(false);
      const detail =
        problem.detail ?? 'Ask your school to send a new invitation link.';
      setFormError(detail);
      showApiErrorToast(toast, 'Invitation failed', detail);
      return;
    }

    const body = (await response.json()) as { data: AcceptInviteResult };

    toast.success('Account ready. Sign in with your new password.');
    router.replace(`/login?email=${encodeURIComponent(body.data.email)}`);
  }

  return (
    <form
      onSubmit={(event) => {
        void submit(event);
      }}
      noValidate
      className="space-y-3.5"
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

      <div className="space-y-1.5">
        <Field label="Choose a password" error={fieldErrors['password']} required leadingIcon={LockedIcon}>
          <PasswordInput
            autoComplete="new-password"
            autoFocus
            placeholder="Create a password"
            value={password}
            onChange={(event) => {
              setPassword(event.target.value);
            }}
          />
        </Field>
        <PasswordRequirements password={password} />
      </div>

      <Field label="Confirm password" error={fieldErrors['confirm']} required leadingIcon={LockedIcon}>
        <PasswordInput
          autoComplete="new-password"
          placeholder="Re-enter your password"
          value={confirm}
          onChange={(event) => {
            setConfirm(event.target.value);
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
        footer={
          <p className="text-center text-sm text-muted-foreground">
            Already have an account? <AuthInlineLink href="/login">Sign in</AuthInlineLink>
          </p>
        }
      >
        <Button type="submit" isPending={isPending} className="w-full" size="touch">
          <ApproveIcon className={ICON_SIZE.inline} aria-hidden />
          {isPending ? 'Setting up…' : 'Set password and continue'}
        </Button>
      </AuthFormActions>
    </form>
  );
}
