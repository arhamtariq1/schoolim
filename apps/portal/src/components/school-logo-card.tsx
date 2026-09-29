'use client';

import { ROUTES, type SchoolLogoInfo, type UploadSchoolLogo } from '@ilm/contracts';
import { Button, useToast } from '@ilm/ui';
import { ICON_SIZE, SpinnerIcon } from '@ilm/ui/icons';
import { useRouter } from 'next/navigation';
import { useId, useState } from 'react';

import { LogoPicker } from './logo-picker';

import { mutate } from '@/lib/mutate';

/**
 * Settings › an image the school owns.
 *
 * Two of them: the school's own mark, and the mark of the bank its challans are
 * deposited at. They are uploaded, replaced and removed identically — same
 * limits, same sniffing, same cached endpoint — so this takes the endpoint as a
 * prop rather than existing twice with one word changed.
 *
 * ## The `?v=` on the image
 *
 * The endpoint sends an ETag and asks browsers to cache, because this image
 * appears on every page. That is exactly wrong for the thirty seconds after
 * somebody replaces it — the first thing they do is look at whether it worked,
 * and a cached copy says no. The version in the query string changes with the
 * bytes, so a replacement is a different URL and the old one is still valid for
 * everyone who has not reloaded.
 */

export interface SchoolLogoCardProps {
  readonly info: SchoolLogoInfo;
  readonly canConfigure: boolean;
  readonly error?: string | undefined;
  /** Which image this card manages. Defaults to the school's own mark. */
  readonly imageRoute?: string;
  readonly title?: string;
  readonly description?: string;
  /** What the toast calls it — "Logo updated", "Bank logo removed". */
  readonly noun?: string;
}

export function SchoolLogoCard({
  info,
  canConfigure,
  error,
  imageRoute = ROUTES.schoolLogo.image,
  title = 'School logo',
  description = 'Shown in the portal and printed on fee challans. A square or wide mark on a transparent background works best.',
  noun = 'Logo',
}: SchoolLogoCardProps) {
  const router = useRouter();
  const toast = useToast();

  const [chosen, setChosen] = useState<UploadSchoolLogo | undefined>(undefined);
  const [isSaving, setIsSaving] = useState(false);
  const [formError, setFormError] = useState<string | undefined>(undefined);

  const currentSrc = info.present ? `${imageRoute}?v=${info.version ?? ''}` : undefined;
  // Two of these can share a page, so the heading a section is labelled by
  // cannot be a constant — duplicate ids would point both at the first.
  const headingId = useId();

  async function save(): Promise<void> {
    if (chosen === undefined) {
      return;
    }
    setIsSaving(true);
    setFormError(undefined);

    const result = await mutate<SchoolLogoInfo>(imageRoute, 'PUT', chosen);
    setIsSaving(false);

    if (!result.ok) {
      setFormError(result.message);
      return;
    }

    setChosen(undefined);
    toast.success(`${noun} updated.`);
    router.refresh();
  }

  async function remove(): Promise<void> {
    setIsSaving(true);
    setFormError(undefined);

    const result = await mutate<{ removed: true }>(imageRoute, 'DELETE');
    setIsSaving(false);

    if (!result.ok) {
      setFormError(result.message);
      return;
    }

    setChosen(undefined);
    toast.success(`${noun} removed.`);
    router.refresh();
  }

  return (
    <section className="rounded-xl border border-border bg-card p-4" aria-labelledby={headingId}>
      <h2 id={headingId} className="text-base font-medium text-foreground">
        {title}
      </h2>
      <p className="mt-1 max-w-2xl text-sm text-muted-foreground">{description}</p>

      {error === undefined ? null : (
        <p
          role="alert"
          className="mt-3 rounded-md border border-danger/30 bg-danger/10 p-3 text-sm text-danger"
        >
          {error}
        </p>
      )}
      {formError === undefined ? null : (
        <p
          role="alert"
          className="mt-3 rounded-md border border-danger/30 bg-danger/10 p-3 text-sm text-danger"
        >
          {formError}
        </p>
      )}

      <div className="mt-4">
        <LogoPicker
          value={chosen}
          onChange={setChosen}
          currentSrc={currentSrc}
          disabled={!canConfigure || isSaving}
        />
      </div>

      {!canConfigure ? null : (
        <div className="mt-4 flex flex-wrap gap-2">
          <Button disabled={chosen === undefined || isSaving} onClick={() => void save()}>
            {isSaving ? (
              <SpinnerIcon className={`${ICON_SIZE.inline} animate-spin`} aria-hidden />
            ) : null}
            Save logo
          </Button>

          {/* Only when there is something on the server to remove. Clearing a
              file that was merely chosen is the picker's own Remove button, and
              it needs no request. */}
          {info.present ? (
            <Button tone="ghost" disabled={isSaving} onClick={() => void remove()}>
              Remove current logo
            </Button>
          ) : null}
        </div>
      )}
    </section>
  );
}
