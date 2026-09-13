'use client';

import { ROUTES, type SchoolLogoInfo, type UploadSchoolLogo } from '@ilm/contracts';
import { Button, useToast } from '@ilm/ui';
import { ICON_SIZE, SpinnerIcon } from '@ilm/ui/icons';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { LogoPicker } from './logo-picker';

import { mutate } from '@/lib/mutate';

/**
 * Settings › the school's logo.
 *
 * The other half of the optional field on signup: a school that skipped it
 * there, or has since had one designed, adds it here.
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
}

export function SchoolLogoCard({ info, canConfigure, error }: SchoolLogoCardProps) {
  const router = useRouter();
  const toast = useToast();

  const [chosen, setChosen] = useState<UploadSchoolLogo | undefined>(undefined);
  const [isSaving, setIsSaving] = useState(false);
  const [formError, setFormError] = useState<string | undefined>(undefined);

  const currentSrc = info.present
    ? `${ROUTES.schoolLogo.image}?v=${info.version ?? ''}`
    : undefined;

  async function save(): Promise<void> {
    if (chosen === undefined) {
      return;
    }
    setIsSaving(true);
    setFormError(undefined);

    const result = await mutate<SchoolLogoInfo>(ROUTES.schoolLogo.image, 'PUT', chosen);
    setIsSaving(false);

    if (!result.ok) {
      setFormError(result.message);
      return;
    }

    setChosen(undefined);
    toast.success('Logo updated.');
    router.refresh();
  }

  async function remove(): Promise<void> {
    setIsSaving(true);
    setFormError(undefined);

    const result = await mutate<{ removed: true }>(ROUTES.schoolLogo.image, 'DELETE');
    setIsSaving(false);

    if (!result.ok) {
      setFormError(result.message);
      return;
    }

    setChosen(undefined);
    toast.success('Logo removed.');
    router.refresh();
  }

  return (
    <section className="rounded-xl border border-border bg-card p-4" aria-labelledby="school-logo">
      <h2 id="school-logo" className="text-base font-medium text-foreground">
        School logo
      </h2>
      <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
        Shown in the portal and printed on fee challans. A square or wide mark on a transparent
        background works best.
      </p>

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
