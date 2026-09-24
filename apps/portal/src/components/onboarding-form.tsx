'use client';

import {
  completeOnboardingSchema,
  ROUTES,
  type CompleteOnboarding,
  type SlugAvailability,
  type UploadSchoolLogo,
  type UserProfile,
} from '@ilm/contracts';
import { Button, Field, Input, useToast } from '@ilm/ui';
import {
  AccountIcon,
  ErrorIcon,
  ICON_SIZE,
  SchoolIcon,
  SpinnerIcon,
  SuccessIcon,
} from '@ilm/ui/icons';
import { useRouter } from 'next/navigation';
import { useEffect, useState, type FormEvent, type ReactNode } from 'react';

import { LogoPicker } from './logo-picker';

import { mutate } from '@/lib/mutate';
import { TENANT_MODE } from '@/lib/tenant-mode';

/**
 * First-login form after signup OTP — school details + owner profile.
 *
 * Saving unlocks the rest of the portal. Personal-only edits after that use
 * `ProfileForm` on `/profile/edit`.
 */
export function OnboardingForm({ initial }: { readonly initial: UserProfile }) {
  const toast = useToast();
  const router = useRouter();

  const [personName, setPersonName] = useState(initial.name);
  const [personPhone, setPersonPhone] = useState(displayPhone(initial.phone ?? ''));
  const [designation, setDesignation] = useState(initial.designation ?? '');

  const [schoolName, setSchoolName] = useState(
    initial.school.onboarded ? initial.school.name : '',
  );
  const [slug, setSlug] = useState(initial.school.slug);
  const [slugTouched, setSlugTouched] = useState(Boolean(initial.school.slug));
  const [city, setCity] = useState(initial.school.city ?? '');
  const [schoolPhone, setSchoolPhone] = useState(displayPhone(initial.school.phone ?? ''));
  const [schoolEmail, setSchoolEmail] = useState(initial.school.email ?? initial.email);
  const [availability, setAvailability] = useState<SlugAvailability | undefined>(undefined);
  const [checkingSlug, setCheckingSlug] = useState(false);
  const [logo, setLogo] = useState<UploadSchoolLogo | undefined>(undefined);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [isPending, setIsPending] = useState(false);

  const effectiveSlug = slugTouched ? slug : slugify(schoolName);

  useEffect(() => {
    if (effectiveSlug.length < 2) {
      setAvailability(undefined);
      return;
    }

    if (effectiveSlug === initial.school.slug) {
      setAvailability({ slug: effectiveSlug, available: true });
      setCheckingSlug(false);
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
  }, [effectiveSlug, initial.school.slug]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isPending) {
      return;
    }

    setFieldErrors({});

    const payload: CompleteOnboarding = {
      person: {
        name: personName,
        phone: toE164(personPhone),
        ...(designation.trim() === '' ? {} : { designation: designation.trim() }),
      },
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
    };

    const parsed = completeOnboardingSchema.safeParse(payload);
    if (!parsed.success) {
      const next: Record<string, string> = {};
      for (const issue of parsed.error.issues) {
        next[issue.path.join('.')] = issue.message;
      }
      setFieldErrors(next);
      toast.error(parsed.error.issues[0]?.message ?? 'Check the highlighted fields.');
      return;
    }

    if (
      availability !== undefined &&
      !availability.available &&
      effectiveSlug !== initial.school.slug
    ) {
      setFieldErrors({ 'school.slug': 'That web address is already taken.' });
      toast.error('Choose another web address.');
      return;
    }

    setIsPending(true);
    try {
      const result = await mutate<UserProfile & { relocateTo?: string }>(
        ROUTES.me.onboarding,
        'POST',
        parsed.data,
      );
      if (!result.ok) {
        setFieldErrors(result.fieldErrors);
        toast.error(result.message);
        return;
      }

      toast.success('You are set up', 'Welcome — your workspace is ready.');

      const relocateTo = result.data.relocateTo;
      if (relocateTo !== undefined && relocateTo !== '') {
        // Slug changed — session cookies stay on the old host. Follow the
        // handoff URL so the new host issues its own (ADR-0009).
        window.location.assign(relocateTo);
        return;
      }

      // Same host: refresh so the `pc` claim flips, then open the dashboard.
      const refreshed = await fetch(ROUTES.auth.refresh, {
        method: 'POST',
        credentials: 'include',
      });
      if (!refreshed.ok) {
        toast.warning(
          'Saved',
          'Sign out and sign in again if the rest of the portal stays locked.',
        );
      }

      router.replace('/');
      router.refresh();
    } finally {
      setIsPending(false);
    }
  }

  const slugHint = describeAvailability(
    effectiveSlug,
    availability,
    checkingSlug,
    initial.school.slug,
  );

  return (
    <form
      onSubmit={(event) => {
        void submit(event);
      }}
      noValidate
      className="mx-auto w-full max-w-3xl space-y-6 pb-24"
    >
      <ol className="flex flex-wrap items-center gap-2 text-xs font-medium text-muted-foreground">
        <li className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-2.5 py-1 text-primary">
          <span className="flex size-5 items-center justify-center rounded-full bg-primary text-[10px] text-primary-foreground">
            1
          </span>
          School
        </li>
        <li aria-hidden="true" className="h-px w-6 bg-border" />
        <li className="inline-flex items-center gap-1.5 rounded-full bg-muted px-2.5 py-1">
          <span className="flex size-5 items-center justify-center rounded-full bg-muted-foreground/20 text-[10px] text-foreground">
            2
          </span>
          About you
        </li>
      </ol>

      <FormSection
        icon={<SchoolIcon className={ICON_SIZE.nav} aria-hidden="true" />}
        title="Your school"
        description="How parents and staff will find you. The web address is permanent."
      >
        <fieldset disabled={isPending} className="space-y-5">
          <div className="rounded-lg border border-dashed border-border bg-muted/20 p-4">
            <p className="mb-3 text-sm font-medium text-foreground">School logo</p>
            <LogoPicker
              value={logo}
              onChange={setLogo}
              disabled={isPending}
              hint="Optional. PNG, JPEG or WebP, up to 512 KB."
            />
          </div>

          <div className="grid gap-5 sm:grid-cols-2">
            <Field label="School name" error={fieldErrors['school.name']} required>
              <Input
                name="schoolName"
                autoComplete="organization"
                autoFocus
                placeholder="e.g. Beacon Academy"
                value={schoolName}
                onChange={(event) => {
                  setSchoolName(event.target.value);
                }}
              />
            </Field>

            <Field label="School email" error={fieldErrors['school.email']} required>
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
          </div>

          <div className="grid gap-5 sm:grid-cols-2">
            <Field label="City" error={fieldErrors['school.city']} required>
              <Input
                name="city"
                autoComplete="address-level2"
                placeholder="e.g. Lahore"
                value={city}
                onChange={(event) => {
                  setCity(event.target.value);
                }}
              />
            </Field>

            <Field
              label="School phone"
              error={fieldErrors['school.phone']}
              hint="Local numbers starting with 03 are fine."
              required
            >
              <Input
                name="schoolPhone"
                type="tel"
                autoComplete="tel"
                inputMode="tel"
                placeholder="03XX XXXXXXX"
                value={schoolPhone}
                onChange={(event) => {
                  setSchoolPhone(phoneDigits(event.target.value));
                }}
              />
            </Field>
          </div>

          <div className="space-y-2">
            <Field
              label="Web address"
              error={fieldErrors['school.slug']}
              hint="Choose carefully — this is where everyone signs in."
              required
            >
              <Input
                name="slug"
                autoComplete="off"
                autoCapitalize="off"
                autoCorrect="off"
                spellCheck={false}
                className="font-mono text-sm"
                value={effectiveSlug}
                onChange={(event) => {
                  setSlugTouched(true);
                  setSlug(slugify(event.target.value));
                }}
              />
            </Field>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border border-border/80 bg-muted/40 px-3 py-2 text-xs">
              <span className="font-mono text-muted-foreground">
                {schoolAddress(effectiveSlug === '' ? 'your-school' : effectiveSlug)}
              </span>
              {slugHint === undefined ? null : (
                <span
                  className={`inline-flex items-center gap-1 ${
                    slugHint.tone === 'ok'
                      ? 'text-success'
                      : slugHint.tone === 'bad'
                        ? 'text-danger'
                        : 'text-muted-foreground'
                  }`}
                >
                  {slugHint.tone === 'ok' ? (
                    <SuccessIcon className={ICON_SIZE.inline} aria-hidden="true" />
                  ) : slugHint.tone === 'bad' ? (
                    <ErrorIcon className={ICON_SIZE.inline} aria-hidden="true" />
                  ) : (
                    <SpinnerIcon
                      className={`${ICON_SIZE.inline} animate-spin`}
                      aria-hidden="true"
                    />
                  )}
                  {slugHint.text}
                </span>
              )}
            </div>
          </div>
        </fieldset>
      </FormSection>

      <FormSection
        icon={<AccountIcon className={ICON_SIZE.nav} aria-hidden="true" />}
        title="About you"
        description="Your details as the school owner. You can change these later."
      >
        <fieldset disabled={isPending} className="space-y-5">
          <Field label="Full name" error={fieldErrors['person.name']} required>
            <Input
              name="personName"
              autoComplete="name"
              value={personName}
              onChange={(event) => {
                setPersonName(event.target.value);
              }}
            />
          </Field>

          <div className="grid gap-5 sm:grid-cols-2">
            <Field
              label="Phone"
              error={fieldErrors['person.phone']}
              hint="Include country code, or start with 03."
              required
            >
              <Input
                name="personPhone"
                type="tel"
                autoComplete="tel"
                inputMode="tel"
                placeholder="03XX XXXXXXX"
                value={personPhone}
                onChange={(event) => {
                  setPersonPhone(phoneDigits(event.target.value));
                }}
              />
            </Field>

            <Field
              label="Designation"
              error={fieldErrors['person.designation']}
              hint="Optional."
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
          </div>
        </fieldset>
      </FormSection>

      <div className="sticky bottom-0 z-10 -mx-4 border-t border-border bg-background/95 px-4 py-3 backdrop-blur supports-[backdrop-filter]:bg-background/80 md:-mx-6 md:px-6">
        <div className="mx-auto flex max-w-3xl flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-muted-foreground">
            After saving, the rest of the portal unlocks.
          </p>
          <Button type="submit" disabled={isPending} className="min-w-44">
            {isPending ? 'Saving…' : 'Save and open dashboard'}
          </Button>
        </div>
      </div>
    </form>
  );
}

function FormSection({
  icon,
  title,
  description,
  children,
}: {
  icon: ReactNode;
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <section className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
      <header className="flex items-start gap-3 border-b border-border bg-muted/30 px-4 py-4 sm:px-6">
        <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
          {icon}
        </span>
        <div className="min-w-0">
          <h2 className="text-base font-semibold tracking-tight text-foreground">{title}</h2>
          <p className="mt-0.5 text-sm text-muted-foreground">{description}</p>
        </div>
      </header>
      <div className="p-4 sm:p-6">{children}</div>
    </section>
  );
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+/, '')
    .replace(/-+$/, '')
    .slice(0, 48);
}

function schoolAddress(slug: string): string {
  const domain = process.env['NEXT_PUBLIC_APP_DOMAIN'] ?? 'localhost';
  return TENANT_MODE === 'path' ? `${domain}/${slug}` : `${slug}.${domain}`;
}

function describeAvailability(
  slug: string,
  availability: SlugAvailability | undefined,
  checking: boolean,
  currentSlug: string,
): { text: string; tone: 'ok' | 'bad' | 'muted' } | undefined {
  if (slug.length < 2) {
    return undefined;
  }
  if (checking) {
    return { text: 'Checking…', tone: 'muted' };
  }
  if (slug === currentSlug) {
    return { text: 'Your current address', tone: 'ok' };
  }
  if (availability === undefined) {
    return undefined;
  }
  if (availability.available) {
    return { text: 'Available', tone: 'ok' };
  }
  return { text: 'Already taken', tone: 'bad' };
}

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
