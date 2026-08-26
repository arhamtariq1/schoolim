'use client';

import { createSchoolSchema, ROUTES, type CreateSchoolResult } from '@ilm/contracts';
import { Button, Field, Input } from '@ilm/ui';
import Link from 'next/link';
import { useEffect, useState, type FormEvent } from 'react';

/**
 * Add a school.
 *
 * Two things here are deliberate and would be wrong the obvious way round:
 *
 * **The slug is suggested, never silently derived.** A school's short name is
 * its address forever — it goes on letters and into bookmarks — so the operator
 * sees it, can change it, and is told before submitting whether it is free.
 * Deriving it invisibly from the name is how a school ends up living at
 * `the-city-grammar-school-pvt-ltd`.
 *
 * **The temporary password is shown once and only once.** It is generated
 * server-side, stored only as an argon2 hash, and never retrievable again. The
 * screen after submission is therefore the only chance to copy it, and it says
 * so.
 */

interface FieldErrors {
  [key: string]: string | undefined;
}

/** A readable suggestion, not the final answer. */
function suggestSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/\b(school|college|academy|public|model|grammar|pvt|ltd|the)\b/g, ' ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
}

export function CreateSchoolForm({ appDomain }: { appDomain: string }) {
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [slugTouched, setSlugTouched] = useState(false);
  const [city, setCity] = useState('');
  const [ownerName, setOwnerName] = useState('');
  const [ownerEmail, setOwnerEmail] = useState('');

  const [slugState, setSlugState] = useState<'unknown' | 'checking' | 'free' | 'taken'>('unknown');
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | undefined>(undefined);
  const [isPending, setIsPending] = useState(false);
  const [result, setResult] = useState<CreateSchoolResult | undefined>(undefined);

  const effectiveSlug = slugTouched ? slug : suggestSlug(name);

  // Availability is checked as the operator types, debounced. It is only a
  // courtesy: the server checks again inside the transaction, which is what
  // actually prevents two operators claiming one slug at the same moment.
  useEffect(() => {
    if (effectiveSlug.length < 2) {
      setSlugState('unknown');
      return;
    }

    setSlugState('checking');
    const timer = setTimeout(() => {
      void (async () => {
        try {
          const response = await fetch(
            `${ROUTES.platform.schools.slugAvailable}?slug=${encodeURIComponent(effectiveSlug)}`,
            { credentials: 'include' },
          );
          if (!response.ok) {
            setSlugState('unknown');
            return;
          }
          const body = (await response.json()) as { data?: { available?: boolean } };
          setSlugState(body.data?.available === true ? 'free' : 'taken');
        } catch {
          setSlugState('unknown');
        }
      })();
    }, 350);

    return () => {
      clearTimeout(timer);
    };
  }, [effectiveSlug]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(undefined);
    setFieldErrors({});

    const parsed = createSchoolSchema.safeParse({
      name,
      slug: effectiveSlug,
      ...(city.trim() === '' ? {} : { city }),
      timezone: 'Asia/Karachi',
      locale: 'en',
      owner: { name: ownerName, email: ownerEmail },
    });

    if (!parsed.success) {
      const next: FieldErrors = {};
      for (const issue of parsed.error.issues) {
        next[issue.path.join('.')] = issue.message;
      }
      setFieldErrors(next);
      return;
    }

    setIsPending(true);
    try {
      const response = await fetch(ROUTES.platform.schools.create, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(parsed.data),
      });

      const body = (await response.json().catch(() => ({}))) as {
        detail?: string;
        data?: CreateSchoolResult;
      };

      if (!response.ok || body.data === undefined) {
        setFormError(body.detail ?? 'Could not create the school. Try again.');
        return;
      }

      setResult(body.data);
    } catch {
      setFormError('Could not reach the server. Check your connection and try again.');
    } finally {
      setIsPending(false);
    }
  }

  if (result !== undefined) {
    return <CreatedPanel result={result} />;
  }

  return (
    <form
      onSubmit={(event) => {
        void submit(event);
      }}
      noValidate
      className="space-y-5"
    >
      {formError === undefined ? null : (
        <div
          role="alert"
          className="rounded-md border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger"
        >
          {formError}
        </div>
      )}

      <Field label="School name" error={fieldErrors['name']} required>
        <Input
          name="name"
          autoFocus
          value={name}
          onChange={(event) => {
            setName(event.target.value);
          }}
        />
      </Field>

      <Field
        label="Short name (its address)"
        error={fieldErrors['slug']}
        required
        // The full address goes in the hint rather than beside the input:
        // `Field` clones its single child to attach the generated id, so
        // wrapping the input in a layout div would put the label's `htmlFor`
        // on the div and silently break the association.
        hint={
          slugState === 'taken'
            ? `${effectiveSlug}.${appDomain} is already in use. Choose another.`
            : slugState === 'free'
              ? `Available — the school will live at ${effectiveSlug}.${appDomain}`
              : `Lowercase letters, numbers and hyphens. Becomes ${effectiveSlug || '…'}.${appDomain}, and cannot be changed later.`
        }
      >
        <Input
          name="slug"
          value={effectiveSlug}
          onChange={(event) => {
            setSlugTouched(true);
            setSlug(event.target.value.toLowerCase());
          }}
        />
      </Field>

      <Field label="City" error={fieldErrors['city']}>
        <Input
          name="city"
          value={city}
          onChange={(event) => {
            setCity(event.target.value);
          }}
        />
      </Field>

      <fieldset className="space-y-4 rounded-md border border-border p-4">
        <legend className="px-1 text-sm font-medium">Owner account</legend>
        <p className="text-sm text-muted-foreground">
          Created with the school. Without it nobody can sign in, so it is not a separate step.
        </p>

        <Field label="Owner name" error={fieldErrors['owner.name']} required>
          <Input
            name="ownerName"
            value={ownerName}
            onChange={(event) => {
              setOwnerName(event.target.value);
            }}
          />
        </Field>

        <Field label="Owner email" error={fieldErrors['owner.email']} required>
          <Input
            type="email"
            name="ownerEmail"
            value={ownerEmail}
            onChange={(event) => {
              setOwnerEmail(event.target.value);
            }}
          />
        </Field>
      </fieldset>

      <div className="flex items-center gap-3">
        <Button type="submit" isPending={isPending} disabled={slugState === 'taken'}>
          {isPending ? 'Creating…' : 'Create school'}
        </Button>
        <Link href="/schools" className="text-sm text-muted-foreground underline">
          Cancel
        </Link>
      </div>
    </form>
  );
}

/**
 * Shown once, after creation.
 *
 * The password is not stored anywhere readable, so this screen cannot be
 * reproduced. It says that plainly rather than letting someone navigate away
 * and discover it.
 */
function CreatedPanel({ result }: { result: CreateSchoolResult }) {
  return (
    <div className="space-y-5">
      <div className="rounded-md border border-success/30 bg-success/10 px-4 py-3">
        <h2 className="font-medium">{result.school.name} is ready</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Its address is{' '}
          <a href={result.loginUrl} className="font-mono underline">
            {result.loginUrl}
          </a>
        </p>
      </div>

      <div className="rounded-md border border-warning/40 bg-warning/10 px-4 py-3">
        <h3 className="font-medium">Copy this now — it is not shown again</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          The password is stored only as a hash, so nobody, including us, can read it back. The
          owner must change it on first sign-in.
        </p>
        <dl className="mt-3 space-y-1 font-mono text-sm">
          <div className="flex gap-2">
            <dt className="text-muted-foreground">Email</dt>
            <dd className="select-all">{result.owner.email}</dd>
          </div>
          <div className="flex gap-2">
            <dt className="text-muted-foreground">Password</dt>
            <dd className="select-all">{result.owner.temporaryPassword}</dd>
          </div>
        </dl>
      </div>

      <Link href="/schools" className="text-sm underline">
        Back to all schools
      </Link>
    </div>
  );
}
