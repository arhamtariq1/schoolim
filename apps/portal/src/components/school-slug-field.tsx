'use client';

import { Field, Input } from '@ilm/ui';
import { ErrorIcon, ICON_SIZE, SpinnerIcon, SuccessIcon } from '@ilm/ui/icons';

import { schoolSlugAffixes } from '@/lib/school-slug-preview';

export function SchoolSlugField({
  value,
  onChange,
  error,
  hint = 'Letters and numbers only. This is your school’s unique sign-in name.',
  availability,
  disabled = false,
}: {
  value: string;
  onChange: (slug: string) => void;
  error?: string | undefined;
  hint?: string;
  availability?: { text: string; tone: 'ok' | 'bad' | 'muted' } | undefined;
  disabled?: boolean;
}) {
  const { prefix, suffix } = schoolSlugAffixes();
  const displaySlug = value === '' ? 'your-school' : value;

  return (
    <div className="space-y-2">
      <Field label="Sign-in address (Web address)" error={error} hint={hint} required>
        <div className="flex overflow-hidden rounded-lg border border-input bg-background focus-within:ring-2 focus-within:ring-ring">
          {prefix === '' ? null : (
            <span className="hidden shrink-0 border-r border-input bg-muted/40 px-3 py-2 text-sm text-muted-foreground sm:inline">
              {prefix}
            </span>
          )}
          <Input
            name="slug"
            autoComplete="off"
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
            disabled={disabled}
            className="min-w-0 border-0 font-mono text-sm shadow-none focus-visible:ring-0"
            value={value}
            placeholder="yamaan-school"
            onChange={(event) => {
              onChange(event.target.value);
            }}
          />
          {suffix === '' ? null : (
            <span className="hidden shrink-0 border-l border-input bg-muted/40 px-3 py-2 text-sm text-muted-foreground sm:inline">
              {suffix}
            </span>
          )}
        </div>
      </Field>

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border border-border/70 bg-muted/30 px-3 py-2.5 text-xs sm:hidden">
        <span className="font-mono text-muted-foreground">
          {prefix}
          {displaySlug}
          {suffix}
        </span>
      </div>

      {availability === undefined ? null : (
        <p
          className={`inline-flex items-center gap-1 text-xs ${
            availability.tone === 'ok'
              ? 'text-success'
              : availability.tone === 'bad'
                ? 'text-danger'
                : 'text-muted-foreground'
          }`}
        >
          {availability.tone === 'ok' ? (
            <SuccessIcon className={ICON_SIZE.inline} aria-hidden="true" />
          ) : availability.tone === 'bad' ? (
            <ErrorIcon className={ICON_SIZE.inline} aria-hidden="true" />
          ) : (
            <SpinnerIcon className={`${ICON_SIZE.inline} animate-spin`} aria-hidden="true" />
          )}
          {availability.text}
        </p>
      )}
    </div>
  );
}
