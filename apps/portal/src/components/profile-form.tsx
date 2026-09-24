'use client';

import {
  ROUTES,
  upsertUserProfileSchema,
  type UpsertUserProfile,
  type UserProfile,
} from '@ilm/contracts';
import { Button, Field, Input, useToast } from '@ilm/ui';
import { AccountIcon, ICON_SIZE } from '@ilm/ui/icons';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';

import { mutate } from '@/lib/mutate';

/**
 * Create and edit share one form.
 *
 * Create stamps `profileCompleted` on the server and unlocks the portal; edit
 * updates the same fields without touching that gate again.
 */
export function ProfileForm({
  mode,
  initial,
}: {
  mode: 'create' | 'edit';
  initial?: Partial<UserProfile> | undefined;
}) {
  const toast = useToast();
  const router = useRouter();
  const [name, setName] = useState(initial?.name ?? '');
  const [phone, setPhone] = useState(displayPhone(initial?.phone ?? ''));
  const [designation, setDesignation] = useState(initial?.designation ?? '');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [isPending, setIsPending] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isPending) {
      return;
    }

    setFieldErrors({});

    const payload: UpsertUserProfile = {
      name,
      phone: toE164(phone),
      ...(designation.trim() === '' ? {} : { designation: designation.trim() }),
    };

    const parsed = upsertUserProfileSchema.safeParse(payload);
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
      const result = await mutate<UserProfile>(ROUTES.me.profile, 'PUT', parsed.data);
      if (!result.ok) {
        setFieldErrors(result.fieldErrors);
        toast.error(result.message);
        return;
      }

      const refreshed = await fetch(ROUTES.auth.refresh, {
        method: 'POST',
        credentials: 'include',
      });
      if (!refreshed.ok) {
        toast.warning(
          'Profile saved',
          'Sign out and sign in again if the rest of the portal stays locked.',
        );
      }

      if (mode === 'create') {
        toast.success('Profile created', 'Welcome — your workspace is ready.');
        router.replace('/');
      } else {
        toast.success('Profile updated');
        router.replace('/profile');
      }
      router.refresh();
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
      className="mx-auto w-full max-w-xl space-y-6"
    >
      <section className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
        <header className="flex items-start gap-3 border-b border-border bg-muted/30 px-4 py-4 sm:px-6">
          <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <AccountIcon className={ICON_SIZE.nav} aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <h2 className="text-base font-semibold tracking-tight text-foreground">
              {mode === 'create' ? 'Your details' : 'Personal details'}
            </h2>
            <p className="mt-0.5 text-sm text-muted-foreground">
              {mode === 'create'
                ? 'Shown to colleagues across the school portal.'
                : 'These details appear on your account and in audit records.'}
            </p>
          </div>
        </header>

        <fieldset disabled={isPending} className="space-y-5 p-4 sm:p-6">
          <Field label="Full name" error={fieldErrors['name']} required>
            <Input
              name="name"
              autoComplete="name"
              autoFocus={mode === 'create'}
              value={name}
              onChange={(event) => {
                setName(event.target.value);
              }}
            />
          </Field>

          <Field
            label="Phone"
            error={fieldErrors['phone']}
            hint="Include country code, or a local number starting with 03."
            required
          >
            <Input
              name="phone"
              type="tel"
              autoComplete="tel"
              inputMode="tel"
              placeholder="03XX XXXXXXX"
              value={phone}
              onChange={(event) => {
                setPhone(phoneDigits(event.target.value));
              }}
            />
          </Field>

          <Field
            label="Designation"
            error={fieldErrors['designation']}
            hint="Optional. For example Principal or Accountant."
          >
            <Input
              name="designation"
              autoComplete="organization-title"
              placeholder="e.g. Principal"
              value={designation}
              onChange={(event) => {
                setDesignation(event.target.value);
              }}
            />
          </Field>
        </fieldset>
      </section>

      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={isPending} className="min-w-36">
          {isPending ? 'Saving…' : mode === 'create' ? 'Create profile' : 'Save changes'}
        </Button>
        {mode === 'edit' ? (
          <Button
            type="button"
            tone="ghost"
            disabled={isPending}
            onClick={() => {
              router.push('/profile');
            }}
          >
            Cancel
          </Button>
        ) : null}
      </div>
    </form>
  );
}

/** Show a stored E.164 number without the +92 prefix when it is a PK mobile. */
function displayPhone(value: string): string {
  if (value.startsWith('+92') && value.length === 13) {
    return `0${value.slice(3)}`;
  }
  return value;
}

/** Digits, spaces, and an optional leading +. Letters are stripped as you type. */
function phoneDigits(value: string): string {
  const cleaned = value.replace(/[^\d+\s]/g, '');
  const plus = cleaned.startsWith('+') ? '+' : '';
  const rest = cleaned.replace(/\+/g, '');
  return plus + rest;
}

function toE164(input: string): string {
  const trimmed = input.trim();
  if (trimmed.startsWith('+')) {
    return trimmed.replace(/\s/g, '');
  }
  const digits = trimmed.replace(/\D/g, '');
  if (digits.startsWith('92') && digits.length >= 12) {
    return `+${digits}`;
  }
  if (digits.startsWith('0')) {
    return `+92${digits.slice(1)}`;
  }
  return digits === '' ? trimmed : `+${digits}`;
}
