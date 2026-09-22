'use client';

import {
  ROUTES,
  signupCompleteRequestSchema,
  TRIAL_DAYS,
  type SignupResult,
  type SlugAvailability,
  type UploadSchoolLogo,
} from '@ilm/contracts';
import { Button, Field, Input, useToast } from '@ilm/ui';
import { ErrorIcon, ICON_SIZE, SpinnerIcon, SuccessIcon } from '@ilm/ui/icons';
import { useRouter } from 'next/navigation';
import { useEffect, useState, type FormEvent } from 'react';

import { LogoPicker } from './logo-picker';

import { TENANT_MODE } from '@/lib/tenant-mode';

/**
 * Signup step 3 — school details.
 *
 * Owner identity is already on the signup cookie from steps 1–2. Completing
 * creates the tenant and hands the browser to the school hostname.
 */
export function SchoolSetupForm({ ownerEmail }: { readonly ownerEmail?: string }) {
  const toast = useToast();
  const router = useRouter();
  const [schoolName, setSchoolName] = useState('');
  const [slug, setSlug] = useState('');
  const [slugTouched, setSlugTouched] = useState(false);
  const [city, setCity] = useState('');
  const [schoolPhone, setSchoolPhone] = useState('');
  const [schoolEmail, setSchoolEmail] = useState('');
  const [availability, setAvailability] = useState<SlugAvailability | undefined>(undefined);
  const [checkingSlug, setCheckingSlug] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [logo, setLogo] = useState<UploadSchoolLogo | undefined>(undefined);
  const [isPending, setIsPending] = useState(false);

  const effectiveSlug = slugTouched ? slug : slugify(schoolName);

  useEffect(() => {
    if (effectiveSlug.length < 2) {
      setAvailability(undefined);
      return;
    }

    const controller = new AbortController();
    setCheckingSlug(true);

    const timer = setTimeout(() => {
      void (async () => {
        try {
          const response = await fetch(
            `${ROUTES.public.slugAvailable}?slug=${encodeURIComponent(effectiveSlug)}`,
            { signal: controller.signal },
          );
          const body = response.ok
            ? ((await response.json()) as { data: SlugAvailability })
            : undefined;
          setAvailability(body?.data);
        } catch {
          setAvailability(undefined);
        } finally {
          setCheckingSlug(false);
        }
      })();
    }, 400);

    return () => {
      controller.abort();
      clearTimeout(timer);
      setCheckingSlug(false);
    };
  }, [effectiveSlug]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isPending) {
      return;
    }

    setFieldErrors({});

    const parsed = signupCompleteRequestSchema.safeParse({
      school: {
        name: schoolName,
        slug: effectiveSlug,
        city,
        phone: toE164(schoolPhone),
        email: schoolEmail,
        timezone: 'Asia/Karachi',
        locale: 'en',
      },
      ...(logo === undefined ? {} : { logo }),
    });

    if (!parsed.success) {
      const next: Record<string, string> = {};
      for (const issue of parsed.error.issues) {
        next[issue.path.join('.')] = issue.message;
      }
      setFieldErrors(next);
      toast.error(parsed.error.issues[0]?.message ?? 'Check the highlighted fields.');
      return;
    }

    setIsPending(true);
    try {
      const response = await fetch(ROUTES.public.signupComplete, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(parsed.data),
      });

      if (!response.ok) {
        const problem = (await response.json().catch(() => ({}))) as {
          detail?: string;
          code?: string;
        };
        if (problem.code === 'SIGNUP_EMAIL_UNVERIFIED' || problem.code === 'SIGNUP_SESSION_REQUIRED') {
          toast.error(problem.detail ?? 'Confirm your email first.');
          router.replace('/signup');
          return;
        }
        toast.error(problem.detail ?? 'Could not create your school. Try again.');
        setIsPending(false);
        return;
      }

      const body = (await response.json()) as { data: SignupResult };
      toast.success('School created', `Opening ${body.data.continueTo.name}…`);
      window.location.assign(body.data.continueTo.continueUrl);
    } catch {
      toast.error('Could not reach the server. Check your connection and try again.');
      setIsPending(false);
    }
  }

  const slugHint = describeAvailability(effectiveSlug, availability, checkingSlug);

  return (
    <form
      onSubmit={(event) => {
        void submit(event);
      }}
      noValidate
      className="space-y-8"
    >
      {ownerEmail === undefined ? null : (
        <p className="rounded-md border border-border bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
          Setting up for <span className="font-medium text-foreground">{ownerEmail}</span>
        </p>
      )}

      <fieldset disabled={isPending} className="space-y-4">

        <Field label="School name" error={fieldErrors['school.name']} required>
          <Input
            name="schoolName"
            autoComplete="organization"
            autoFocus
            value={schoolName}
            onChange={(event) => {
              setSchoolName(event.target.value);
            }}
          />
        </Field>

        <Field
          label="Web address"
          error={fieldErrors['school.slug']}
          hint="Permanent. This is where your staff and parents will sign in."
          required
        >
          <Input
            name="slug"
            value={effectiveSlug}
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
            className="font-mono"
            onChange={(event) => {
              setSlugTouched(true);
              setSlug(slugify(event.target.value));
            }}
          />
        </Field>

        <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
          <span className="font-mono text-muted-foreground">
            {schoolAddress(effectiveSlug === '' ? 'your-school' : effectiveSlug)}
          </span>
          {slugHint === undefined ? null : (
            <span className={`flex items-center gap-1 ${slugHint.tone}`}>
              <slugHint.Icon className={ICON_SIZE.inline} aria-hidden />
              {slugHint.text}
            </span>
          )}
        </p>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="City" error={fieldErrors['school.city']} required>
            <Input
              name="city"
              autoComplete="address-level2"
              value={city}
              onChange={(event) => {
                setCity(event.target.value);
              }}
            />
          </Field>

          <Field
            label="School phone"
            error={fieldErrors['school.phone']}
            hint="Include the country code, or start with 0 and we will add +92."
            required
          >
            <Input
              name="schoolPhone"
              type="tel"
              autoComplete="tel"
              inputMode="tel"
              placeholder="+92 300 1234567"
              value={schoolPhone}
              onChange={(event) => {
                setSchoolPhone(event.target.value);
              }}
            />
          </Field>
        </div>

        <Field
          label="School email"
          error={fieldErrors['school.email']}
          hint="The school’s public address — the one on the prospectus, not your login."
          required
        >
          <Input
            name="schoolEmail"
            type="email"
            autoComplete="email"
            value={schoolEmail}
            onChange={(event) => {
              setSchoolEmail(event.target.value);
            }}
          />
        </Field>

        <Field label="School logo" hint="Optional — you can add or change it later in Settings.">
          <div>
            <LogoPicker value={logo} onChange={setLogo} disabled={isPending} />
          </div>
        </Field>
      </fieldset>

      <Button type="submit" isPending={isPending} className="w-full" size="touch">
        {isPending ? 'Setting up your school…' : `Start my ${String(TRIAL_DAYS)}-day trial`}
      </Button>

      <p className="text-center text-xs text-muted-foreground">
        No card required. Nothing is charged until you choose a package.
      </p>
    </form>
  );
}

function schoolAddress(slug: string): string {
  const domain = process.env['NEXT_PUBLIC_APP_DOMAIN'] ?? 'localhost';
  return TENANT_MODE === 'path' ? `${domain}/${slug}` : `${slug}.${domain}`;
}

function toE164(input: string): string {
  const digits = input.replace(/[\s()-]/g, '');
  if (digits.startsWith('+')) {
    return digits;
  }
  if (digits.startsWith('0')) {
    return `+92${digits.slice(1)}`;
  }
  return digits;
}

function slugify(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+/, '')
    .slice(0, 63)
    .replace(/-+$/, '');
}

interface SlugHint {
  readonly text: string;
  readonly tone: string;
  readonly Icon: typeof SuccessIcon;
}

function describeAvailability(
  slug: string,
  availability: SlugAvailability | undefined,
  checking: boolean,
): SlugHint | undefined {
  if (slug.length < 2) {
    return undefined;
  }

  if (checking) {
    return { text: 'Checking…', tone: 'text-muted-foreground', Icon: SpinnerIcon };
  }

  if (availability === undefined || availability.slug !== slug) {
    return undefined;
  }

  if (availability.available) {
    return { text: 'Available', tone: 'text-success', Icon: SuccessIcon };
  }

  const reason =
    availability.reason === 'reserved'
      ? 'That name is reserved for the platform. Choose another.'
      : availability.reason === 'invalid'
        ? 'Use letters, numbers and hyphens only.'
        : 'Another school already uses that address. Choose another.';

  return { text: reason, tone: 'text-danger', Icon: ErrorIcon };
}
