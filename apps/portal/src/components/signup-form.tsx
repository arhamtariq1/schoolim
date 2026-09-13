'use client';

import {
  CURRENT_TERMS_VERSION,
  ROUTES,
  signupRequestSchema,
  TRIAL_DAYS,
  type SignupResult,
  type SlugAvailability,
  type UploadSchoolLogo,
} from '@ilm/contracts';
import { Button, CheckboxField, Field, Input } from '@ilm/ui';
import { ErrorIcon, ICON_SIZE, SpinnerIcon, SuccessIcon } from '@ilm/ui/icons';
import { useEffect, useState, type FormEvent } from 'react';

import { LogoPicker } from './logo-picker';

import { TENANT_MODE } from '@/lib/tenant-mode';

/**
 * Set up a school — ADR-0010.
 *
 * One screen, not a wizard. A wizard is right when each step depends on the
 * last; here every field is independent and there are nine of them, so steps
 * would only add clicks and a place to lose someone. The real onboarding —
 * sessions, classes, fee heads, importing students — is the checklist inside
 * the portal (docs/09 §2), and it belongs there, after the account exists.
 *
 * **What is deliberately not asked:** the logo, the postal address, the number
 * of students, anything about billing. A school signing up at 11pm should not
 * be blocked on finding an image file, and every one of those has a better home
 * in Settings once they are inside and can see what it is for.
 *
 * Validation is the shared zod schema (docs/16 §8), so this form and the
 * endpoint cannot disagree about what a valid school is.
 */
export function SignupForm() {
  const [schoolName, setSchoolName] = useState('');
  const [slug, setSlug] = useState('');
  const [slugTouched, setSlugTouched] = useState(false);
  const [city, setCity] = useState('');
  const [schoolPhone, setSchoolPhone] = useState('');
  const [schoolEmail, setSchoolEmail] = useState('');
  const [ownerName, setOwnerName] = useState('');
  const [ownerEmail, setOwnerEmail] = useState('');
  const [password, setPassword] = useState('');
  const [accepted, setAccepted] = useState(false);

  const [availability, setAvailability] = useState<SlugAvailability | undefined>(undefined);
  const [checkingSlug, setCheckingSlug] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | undefined>(undefined);
  const [logo, setLogo] = useState<UploadSchoolLogo | undefined>(undefined);
  const [isPending, setIsPending] = useState(false);

  // The short name follows the school name until someone edits it themselves,
  // and then it stops. Overwriting a deliberate choice on the next keystroke is
  // the kind of helpfulness people remember badly.
  const effectiveSlug = slugTouched ? slug : slugify(schoolName);

  useEffect(() => {
    if (effectiveSlug.length < 2) {
      setAvailability(undefined);
      return;
    }

    const controller = new AbortController();
    setCheckingSlug(true);

    // Debounced: this fires while someone types, and an unthrottled request per
    // keystroke is both a bad experience and a rate limit hit.
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
          // A failed check is not an error the person can act on; the server
          // checks again on submit, which is the check that counts.
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
    setFormError(undefined);
    setFieldErrors({});

    const parsed = signupRequestSchema.safeParse({
      school: {
        name: schoolName,
        slug: effectiveSlug,
        city,
        phone: toE164(schoolPhone),
        email: schoolEmail,
        timezone: 'Asia/Karachi',
        locale: 'en',
      },
      owner: { name: ownerName, email: ownerEmail, password },
      acceptedTerms: accepted,
      termsVersion: CURRENT_TERMS_VERSION,
      // Omitted rather than sent as undefined: the schema is `.strict()`, and
      // an explicit `logo: undefined` is a key that is present.
      ...(logo === undefined ? {} : { logo }),
    });

    if (!parsed.success) {
      const next: Record<string, string> = {};
      for (const issue of parsed.error.issues) {
        // Paths are nested (`school.slug`), and the flat key is what the fields
        // below are keyed by.
        next[issue.path.join('.')] = issue.message;
      }
      setFieldErrors(next);
      setFormError(
        accepted ? 'Check the highlighted fields.' : 'Accept the terms to create your school.',
      );
      return;
    }

    setIsPending(true);
    try {
      const response = await fetch(ROUTES.public.signup, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(parsed.data),
      });

      if (!response.ok) {
        const problem = (await response.json().catch(() => ({}))) as { detail?: string };
        setFormError(problem.detail ?? 'Could not create your school. Try again.');
        return;
      }

      const body = (await response.json()) as { data: SignupResult };

      // A full page load, not a router push: the destination is the school's
      // own hostname, and the session cookie has to be set over there
      // (ADR-0009). `isPending` is deliberately left true — the navigation is
      // in flight and re-enabling the button would invite a second school.
      window.location.assign(body.data.continueTo.continueUrl);
    } catch {
      setFormError('Could not reach the server. Check your connection and try again.');
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
      {formError === undefined ? null : (
        <div
          role="alert"
          className="flex gap-2 rounded-md border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger"
        >
          <ErrorIcon className={`${ICON_SIZE.inline} mt-0.5 shrink-0`} aria-hidden />
          <span>{formError}</span>
        </div>
      )}

      <fieldset disabled={isPending} className="space-y-4">
        <legend className="text-lg font-semibold text-foreground">Your school</legend>

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

        {/* The domain suffix sits outside `Field` rather than beside the input
            inside it: `Field` clones its single child to attach the generated
            id and `aria-describedby`, so wrapping the input in a layout div
            would put the label and the error message on the div instead. */}
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

        {/* Paired, because both are short and neither needs the full width.
            The long ones above — the name and the address that becomes a
            hostname — keep a row each: a subdomain field with a live
            availability check beside it is not a half-width control. */}
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

        <p className="text-xs text-muted-foreground">
          Your address and the rest of your branding are added in Settings once you are inside.
          Nothing here is final.
        </p>
      </fieldset>

      <fieldset disabled={isPending} className="space-y-4">
        <legend className="text-lg font-semibold text-foreground">Your account</legend>
        <p className="text-sm text-muted-foreground">
          You will be the owner: the one account that can do everything, including adding everyone
          else.
        </p>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Your name" error={fieldErrors['owner.name']} required>
            <Input
              name="ownerName"
              autoComplete="name"
              value={ownerName}
              onChange={(event) => {
                setOwnerName(event.target.value);
              }}
            />
          </Field>

          <Field label="Your email" error={fieldErrors['owner.email']} required>
            <Input
              name="ownerEmail"
              type="email"
              autoComplete="email"
              value={ownerEmail}
              onChange={(event) => {
                setOwnerEmail(event.target.value);
              }}
            />
          </Field>
        </div>

        <Field
          label="Password"
          error={fieldErrors['owner.password']}
          hint="At least 12 characters. A short phrase is easier to remember and harder to guess."
          required
        >
          <Input
            name="password"
            type="password"
            autoComplete="new-password"
            value={password}
            onChange={(event) => {
              setPassword(event.target.value);
            }}
          />
        </Field>
      </fieldset>

      <div className="space-y-4">
        <CheckboxField
          label="I have read and accept the terms of service and the data processing agreement, and I am authorised to accept them for this school."
          id="accepted-terms"
          name="acceptedTerms"
          checked={accepted}
          disabled={isPending}
          onCheckedChange={(next) => {
            setAccepted(next === true);
          }}
          aria-describedby="terms-error"
        />

        {fieldErrors['acceptedTerms'] === undefined ? null : (
          <p id="terms-error" className="text-xs text-danger">
            Accept the terms to continue.
          </p>
        )}

        <Button type="submit" isPending={isPending} className="w-full" size="touch">
          {isPending ? 'Setting up your school…' : `Start my ${TRIAL_DAYS}-day trial`}
        </Button>

        <p className="text-center text-xs text-muted-foreground">
          No card required. Nothing is charged until you choose a package.
        </p>
      </div>
    </form>
  );
}

/**
 * The address this school will actually live at, shown as the name is typed.
 *
 * `NEXT_PUBLIC_APP_DOMAIN` rather than `APP_DOMAIN`: this renders in the
 * browser, and a server-only variable would be an empty string there.
 *
 * It has to follow the tenant mode. Under `PORTAL_TENANT_MODE=path` a school
 * has no subdomain, so promising `beacon.<domain>` here would be showing
 * somebody an address that does not resolve — at the exact moment they are
 * choosing a name on the strength of it. In that mode `NEXT_PUBLIC_APP_DOMAIN`
 * is the portal's own host.
 */
function schoolAddress(slug: string): string {
  const domain = process.env['NEXT_PUBLIC_APP_DOMAIN'] ?? 'localhost';
  return TENANT_MODE === 'path' ? `${domain}/${slug}` : `${slug}.${domain}`;
}

/**
 * Input assistance, not validation.
 *
 * Pakistani numbers are written `0300 1234567` on every sign and letterhead,
 * and `phoneSchema` requires E.164. Rejecting the form people actually know is
 * a bad first impression, so the common local shape is converted here and
 * anything else is passed through unchanged for zod to judge.
 */
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

/** School name to a plausible subdomain. Trimmed, lowered, hyphenated. */
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

/**
 * Availability, said in words as well as colour (docs/16 §6).
 *
 * "Taken" and "reserved" get different copy on purpose: one is somebody else's
 * school and the other is ours, and telling a person to "try another" without
 * saying which it was leaves them guessing whether they already have an account.
 */
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
