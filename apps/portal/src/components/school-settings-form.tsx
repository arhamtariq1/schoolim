'use client';

import {
  ROUTES,
  SCHOOL_LEVEL_IDS,
  updateSchoolSettingsSchema,
  type SchoolLevelId,
  type SchoolSettings,
  type UpdateSchoolSettings,
} from '@ilm/contracts';
import { Button, Field, Input, SimpleSelect, Textarea, useToast } from '@ilm/ui';
import { useRouter } from 'next/navigation';
import { useMemo, useState, type FormEvent } from 'react';

import { SchoolLevelPicker } from '@/components/school-level-picker';
import { mutate } from '@/lib/mutate';
import { schoolSlugAffixes } from '@/lib/school-slug-preview';

/**
 * Settings › School — the details that sit at the top of every printed page.
 *
 * Onboarding collects these once and then refuses to run again, so before this
 * screen a school that mistyped its name, moved premises or changed its landline
 * had no way to say so. Everything here reaches paper that leaves the building.
 *
 * ## Why the web address is shown but not editable
 *
 * Signup calls it permanent, and it is: it is the hostname every member of
 * staff signs in on, session cookies are host-only (ADR-0009), and changing it
 * would sign out the whole school mid-morning and break every bookmark and
 * every link in every email already sent. Hiding the field entirely would be
 * worse — people look for their own address here — so it is displayed, plainly
 * marked as fixed, rather than offered as an input that fails.
 *
 * ## Why the form tracks "dirty"
 *
 * Save is disabled until something actually differs. The request is cheap, but
 * the audit row it writes is not noise-free: `school.settings.update` with an
 * identical before and after is a row somebody has to read past when they are
 * trying to find the change that mattered.
 */

export interface SchoolSettingsFormProps {
  readonly settings: SchoolSettings;
  readonly canConfigure: boolean;
  /** A failed server read. The form still renders, with the reason above it. */
  readonly error?: string | undefined;
}

const LOCALES = [
  { value: 'en', label: 'English' },
  { value: 'ur', label: 'اردو (Urdu)' },
] as const;

/**
 * The zones a school in this market actually operates in.
 *
 * Not the full IANA list: a select with six hundred entries is a search problem
 * the user did not ask for. The server accepts any zone the runtime resolves,
 * so widening this list is a one-line change and never a migration.
 */
const TIME_ZONES = [
  { value: 'Asia/Karachi', label: 'Pakistan — Asia/Karachi (PKT)' },
  { value: 'Asia/Dubai', label: 'United Arab Emirates — Asia/Dubai (GST)' },
  { value: 'Asia/Riyadh', label: 'Saudi Arabia — Asia/Riyadh (AST)' },
  { value: 'Asia/Kabul', label: 'Afghanistan — Asia/Kabul (AFT)' },
  { value: 'Asia/Dhaka', label: 'Bangladesh — Asia/Dhaka (BST)' },
  { value: 'Asia/Colombo', label: 'Sri Lanka — Asia/Colombo (IST)' },
  { value: 'Europe/London', label: 'United Kingdom — Europe/London' },
  { value: 'UTC', label: 'UTC' },
] as const;

export function SchoolSettingsForm({ settings, canConfigure, error }: SchoolSettingsFormProps) {
  const router = useRouter();
  const toast = useToast();

  const [draft, setDraft] = useState(() => toDraft(settings));
  const [schoolLevels, setSchoolLevels] = useState<SchoolLevelId[]>(() =>
    parseSchoolLevels(settings.schoolLevels),
  );
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | undefined>(undefined);
  const [isSaving, setIsSaving] = useState(false);

  // A zone the school already has that is not in the shortlist above must still
  // appear, or opening this page and saving would silently move them to the
  // first option in the list.
  const zones = TIME_ZONES.some((zone) => zone.value === settings.timezone)
    ? TIME_ZONES
    : [{ value: settings.timezone, label: settings.timezone }, ...TIME_ZONES];

  const saved = toDraft(settings);
  const savedLevels = useMemo(() => parseSchoolLevels(settings.schoolLevels), [settings.schoolLevels]);
  const isDirty =
    (Object.keys(saved) as DraftKey[]).some((key) => draft[key] !== saved[key]) ||
    !levelsEqual(schoolLevels, savedLevels);
  const slugAffix = schoolSlugAffixes();

  function set(key: DraftKey, value: string): void {
    setDraft((current) => ({ ...current, [key]: value }));
  }

  async function save(event: FormEvent): Promise<void> {
    event.preventDefault();
    if (isSaving || !canConfigure) {
      return;
    }

    setFormError(undefined);
    setFieldErrors({});

    // Parsed here as well as on the server so a typo lands beside the input
    // that caused it rather than as one sentence above the whole form.
    const parsed = updateSchoolSettingsSchema.safeParse(toPayload(draft, schoolLevels));

    if (!parsed.success) {
      const next: Record<string, string> = {};
      for (const issue of parsed.error.issues) {
        next[issue.path.join('.')] = issue.message;
      }
      setFieldErrors(next);
      toast.error('Check the highlighted fields.');
      return;
    }

    setIsSaving(true);
    const result = await mutate<SchoolSettings>(ROUTES.school.settings, 'PUT', parsed.data);
    setIsSaving(false);

    if (!result.ok) {
      setFieldErrors(result.fieldErrors);
      setFormError(result.message);
      return;
    }

    toast.success('School details saved.');
    // The name is in the sidebar and the header, both rendered on the server
    // from the session — a refresh is what makes the change visible everywhere
    // rather than only in the inputs it was typed into.
    router.refresh();
  }

  return (
    <form
      className="rounded-xl border border-border bg-card p-4"
      onSubmit={(event) => void save(event)}
      aria-labelledby="school-details"
    >
      <h2 id="school-details" className="text-base font-medium text-foreground">
        School details
      </h2>
      <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
        Printed at the top of every challan, receipt and report. Keep the address and phone current —
        they are how a parent holding a printed challan reaches you.
      </p>

      {error === undefined ? null : <Alert>{error}</Alert>}
      {formError === undefined ? null : <Alert>{formError}</Alert>}

      <fieldset disabled={!canConfigure || isSaving} className="mt-4 space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="School name" error={fieldErrors['name']} required>
            <Input
              autoComplete="organization"
              value={draft.name}
              onChange={(event) => {
                set('name', event.target.value);
              }}
            />
          </Field>

          <Field
            label="Registered name"
            hint="Optional. The legal entity, if it differs from the name above."
            error={fieldErrors['legalName']}
          >
            <Input
              value={draft.legalName}
              placeholder="e.g. Demo Public School (Pvt) Ltd"
              onChange={(event) => {
                set('legalName', event.target.value);
              }}
            />
          </Field>
        </div>

        <SchoolLevelPicker
          value={schoolLevels}
          onChange={setSchoolLevels}
          error={fieldErrors['schoolLevels']}
          disabled={!canConfigure || isSaving}
        />

        <Field
          label="Street address"
          hint="Optional. Appears on letterhead exactly as typed."
          error={fieldErrors['address']}
        >
          <Textarea
            rows={2}
            autoComplete="street-address"
            value={draft.address}
            onChange={(event) => {
              set('address', event.target.value);
            }}
          />
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="City" error={fieldErrors['city']} required>
            <Input
              autoComplete="address-level2"
              value={draft.city}
              onChange={(event) => {
                set('city', event.target.value);
              }}
            />
          </Field>

          <Field
            label="School phone"
            hint="Include the country code, or start with 0 and we will add +92."
            error={fieldErrors['phone']}
            required
          >
            <Input
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              placeholder="+92 300 1234567"
              value={draft.phone}
              onChange={(event) => {
                set('phone', event.target.value);
              }}
            />
          </Field>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            label="School email"
            hint="The school’s public address — the one on the prospectus, not a login."
            error={fieldErrors['email']}
            required
          >
            <Input
              type="email"
              autoComplete="email"
              value={draft.email}
              onChange={(event) => {
                set('email', event.target.value);
              }}
            />
          </Field>

          <Field
            label="Time zone"
            hint="Due dates and attendance are read in this zone."
            error={fieldErrors['timezone']}
            required
          >
            <SimpleSelect
              value={draft.timezone}
              options={zones}
              onValueChange={(value) => {
                set('timezone', value);
              }}
            />
          </Field>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Language" error={fieldErrors['locale']} required>
            <SimpleSelect
              value={draft.locale}
              options={LOCALES}
              onValueChange={(value) => {
                set('locale', value);
              }}
            />
          </Field>

          <Field label="Web address" hint="Fixed. Everyone signs in here.">
            <Input
              readOnly
              value={`${slugAffix.prefix}${settings.slug}${slugAffix.suffix}`}
              className="font-mono text-sm"
            />
          </Field>
        </div>
      </fieldset>

      {!canConfigure ? (
        <p className="mt-4 text-sm text-muted-foreground">
          Only an owner or principal can change these. Ask one of them if something here is wrong.
        </p>
      ) : (
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <Button type="submit" isPending={isSaving} disabled={!isDirty}>
            Save details
          </Button>
          {!isDirty ? null : (
            <Button
              type="button"
              tone="ghost"
              onClick={() => {
                setDraft(saved);
                setSchoolLevels(savedLevels);
                setFieldErrors({});
                setFormError(undefined);
              }}
            >
              Discard changes
            </Button>
          )}
        </div>
      )}
    </form>
  );
}

function Alert({ children }: { readonly children: React.ReactNode }) {
  return (
    <p
      role="alert"
      className="mt-3 rounded-md border border-danger/30 bg-danger/10 p-3 text-sm text-danger"
    >
      {children}
    </p>
  );
}

type Draft = Record<DraftKey, string>;
type DraftKey = 'name' | 'legalName' | 'address' | 'city' | 'phone' | 'email' | 'timezone' | 'locale';

/**
 * Server shape → form shape.
 *
 * Inputs hold strings, and `null` in one is React's uncontrolled-input warning
 * followed by a field that silently stops accepting keystrokes.
 */
function toDraft(settings: SchoolSettings): Draft {
  return {
    name: settings.name,
    legalName: settings.legalName ?? '',
    address: settings.address ?? '',
    city: settings.city ?? '',
    phone: settings.phone ?? '',
    email: settings.email ?? '',
    timezone: settings.timezone,
    locale: settings.locale === 'ur' ? 'ur' : 'en',
  };
}

/** Form shape → wire shape. Blank optional fields are absent, not empty. */
function toPayload(draft: Draft, levels: SchoolLevelId[]): UpdateSchoolSettings {
  return {
    name: draft.name,
    legalName: draft.legalName.trim() === '' ? null : draft.legalName,
    address: draft.address.trim() === '' ? null : draft.address,
    city: draft.city,
    phone: toE164(draft.phone),
    email: draft.email,
    schoolLevels: [...levels],
    timezone: draft.timezone,
    locale: draft.locale === 'ur' ? 'ur' : 'en',
  };
}

function parseSchoolLevels(values: readonly string[]): SchoolLevelId[] {
  return values.filter((value): value is SchoolLevelId =>
    (SCHOOL_LEVEL_IDS as readonly string[]).includes(value),
  );
}

function levelsEqual(a: readonly SchoolLevelId[], b: readonly SchoolLevelId[]): boolean {
  if (a.length !== b.length) {
    return false;
  }
  const sortedA = [...a].sort();
  const sortedB = [...b].sort();
  return sortedA.every((value, index) => value === sortedB[index]);
}

/**
 * `0300 1234567` → `+923001234567`.
 *
 * The same normalisation the signup form does. Storing E.164 is what makes a
 * number typed at the front desk comparable with one the SMS provider returns.
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

