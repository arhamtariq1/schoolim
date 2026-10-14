'use client';

import { StatusBadge } from '@ilm/ui';
import { EditIcon, ICON_SIZE } from '@ilm/ui/icons';
import { useRef, useState, type ChangeEvent } from 'react';

const AVATAR_ACCEPT = 'image/png,image/jpeg,image/webp';
const AVATAR_MAX_BYTES = 512 * 1024;

type ProfileAccountBannerProps = {
  name: string;
  email: string;
  phone: string | null;
  roleLabel: string;
  readOnly?: boolean;
  /** Current avatar (data URL or remote URL). */
  avatarSrc?: string | null;
  /** When set, the pencil opens a file picker and reports the chosen data URL. */
  onAvatarChange?: (next: string | null) => void;
  onAvatarError?: (message: string) => void;
};

export function ProfileAccountBanner({
  name,
  email,
  phone,
  roleLabel,
  readOnly = false,
  avatarSrc = null,
  onAvatarChange,
  onAvatarError,
}: ProfileAccountBannerProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [localError, setLocalError] = useState<string | undefined>(undefined);
  const canPick = !readOnly && onAvatarChange !== undefined;
  const shown = avatarSrc !== null && avatarSrc !== '' ? avatarSrc : undefined;

  async function choose(event: ChangeEvent<HTMLInputElement>): Promise<void> {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (file === undefined || onAvatarChange === undefined) {
      return;
    }

    setLocalError(undefined);
    if (!AVATAR_ACCEPT.split(',').includes(file.type)) {
      const message = 'Choose a PNG, JPEG or WebP image.';
      setLocalError(message);
      onAvatarError?.(message);
      return;
    }
    if (file.size > AVATAR_MAX_BYTES) {
      const message = 'That image is too large. Use one under 512 KB.';
      setLocalError(message);
      onAvatarError?.(message);
      return;
    }

    const dataUrl = await readAsDataUrl(file);
    onAvatarChange(dataUrl);
  }

  return (
    <div className="mb-6 flex flex-col gap-4 border-b border-border/70 pb-6 sm:flex-row sm:items-center">
      <div className="relative shrink-0">
        <span className="flex size-20 items-center justify-center overflow-hidden rounded-full bg-primary/10 text-xl font-semibold text-primary ring-2 ring-card">
          {shown === undefined ? (
            initials(name)
          ) : (
            // eslint-disable-next-line @next/next/no-img-element -- avatar may be a data URL
            <img src={shown} alt="" className="size-full object-cover" />
          )}
        </span>
        {canPick ? (
          <button
            type="button"
            aria-label="Add profile photo"
            onClick={() => {
              inputRef.current?.click();
            }}
            className="absolute -end-0.5 -bottom-0.5 flex size-8 items-center justify-center rounded-full border border-border bg-card text-primary shadow-sm hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          >
            <EditIcon className={ICON_SIZE.inline} aria-hidden="true" />
          </button>
        ) : readOnly ? null : (
          <span
            className="absolute -end-0.5 -bottom-0.5 flex size-8 items-center justify-center rounded-full border border-border bg-card text-primary shadow-sm"
            aria-hidden="true"
          >
            <EditIcon className={ICON_SIZE.inline} />
          </span>
        )}
        {canPick ? (
          <input
            ref={inputRef}
            type="file"
            accept={AVATAR_ACCEPT}
            className="sr-only"
            tabIndex={-1}
            aria-hidden="true"
            onChange={(event) => {
              void choose(event);
            }}
          />
        ) : null}
      </div>
      <div className="min-w-0 space-y-1.5">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-lg font-semibold text-foreground">{name}</p>
          {roleLabel === '' ? null : <StatusBadge tone="success">{roleLabel}</StatusBadge>}
        </div>
        <p className="text-sm text-muted-foreground">{email}</p>
        {phone === null || phone === '' ? null : (
          <p className="text-sm text-muted-foreground">{phone}</p>
        )}
        {localError === undefined ? null : (
          <p role="alert" className="text-sm text-danger">
            {localError}
          </p>
        )}
        {canPick ? (
          <p className="text-xs text-muted-foreground">
            PNG, JPEG or WebP. Max 512 KB. Optional.
          </p>
        ) : null}
      </div>
    </div>
  );
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) {
    return '?';
  }
  const first = parts[0]?.[0] ?? '';
  const last = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? '') : '';
  return (first + last).toUpperCase();
}

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      resolve(typeof reader.result === 'string' ? reader.result : '');
    };
    reader.onerror = () => {
      reject(new Error('Could not read that file.'));
    };
    reader.readAsDataURL(file);
  });
}
