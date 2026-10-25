'use client';

import { useRef, useState, type ChangeEvent, type ComponentProps } from 'react';

import { CameraIcon, CloseIcon, ICON_SIZE } from '../icons';
import { cn } from '../lib/cn';

const ACCEPT = ['image/png', 'image/jpeg', 'image/webp'];

export interface AvatarUploadProps extends Omit<ComponentProps<'div'>, 'onChange'> {
  /** Current image — a data URL or remote URL. Empty or null shows the placeholder. */
  value: string | null;
  /** Called with the chosen image as a data URL, or null when it is removed. */
  onChange: (next: string | null) => void;
  /** Largest file accepted, in bytes. */
  maxBytes?: number;
  /** Shown inside the circle while there is no image. */
  placeholder?: string;
  disabled?: boolean;
  /** Set by the form to show a server-side message under the control. */
  error?: string | undefined;
}

/**
 * A circular image picker: the preview is the control.
 *
 * Replaces a bare `<input type="file">`, which shows a browser-drawn button and
 * a filename and nothing of what was actually chosen. Pure presentation — the
 * caller decides what to do with the data URL.
 */
export function AvatarUpload({
  value,
  onChange,
  maxBytes = 512 * 1024,
  placeholder,
  disabled = false,
  error,
  className,
  ...props
}: AvatarUploadProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [localError, setLocalError] = useState<string | undefined>(undefined);
  const shown = value !== null && value !== '' ? value : undefined;
  const message = error ?? localError;

  async function choose(event: ChangeEvent<HTMLInputElement>): Promise<void> {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (file === undefined) {
      return;
    }
    if (!ACCEPT.includes(file.type)) {
      setLocalError('Choose a PNG, JPEG or WebP image.');
      return;
    }
    if (file.size > maxBytes) {
      setLocalError(`That image is too large. Use one under ${Math.round(maxBytes / 1024)} KB.`);
      return;
    }
    setLocalError(undefined);
    onChange(await readAsDataUrl(file));
  }

  return (
    <div className={cn('flex items-center gap-4', className)} {...props}>
      <button
        type="button"
        disabled={disabled}
        aria-label={shown === undefined ? 'Add profile image' : 'Change profile image'}
        onClick={() => {
          inputRef.current?.click();
        }}
        className="group relative size-20 shrink-0 overflow-hidden rounded-full border border-dashed border-border bg-muted text-muted-foreground transition-colors hover:border-primary hover:text-primary focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50"
      >
        {shown === undefined ? (
          <span className="flex size-full flex-col items-center justify-center gap-1 text-xs">
            <CameraIcon className={ICON_SIZE.heading} aria-hidden="true" />
            {placeholder}
          </span>
        ) : (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element -- may be a data URL */}
            <img src={shown} alt="" className="size-full object-cover" />
            <span className="absolute inset-0 flex items-center justify-center bg-foreground/50 text-background opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">
              <CameraIcon className={ICON_SIZE.heading} aria-hidden="true" />
            </span>
          </>
        )}
      </button>

      <div className="min-w-0 space-y-1">
        <div className="flex flex-wrap items-center gap-3 text-sm">
          <button
            type="button"
            disabled={disabled}
            onClick={() => {
              inputRef.current?.click();
            }}
            className="font-medium text-primary hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none disabled:opacity-50"
          >
            {shown === undefined ? 'Select image' : 'Change image'}
          </button>
          {shown === undefined ? null : (
            <button
              type="button"
              disabled={disabled}
              onClick={() => {
                setLocalError(undefined);
                onChange(null);
              }}
              className="inline-flex items-center gap-1 text-muted-foreground hover:text-danger focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none disabled:opacity-50"
            >
              <CloseIcon className={ICON_SIZE.inline} aria-hidden="true" />
              Remove
            </button>
          )}
        </div>
        <p className="text-xs text-muted-foreground">
          Optional. PNG, JPEG or WebP, up to {Math.round(maxBytes / 1024)} KB.
        </p>
        {message === undefined ? null : (
          <p role="alert" className="text-xs text-danger">
            {message}
          </p>
        )}
      </div>

      <input
        ref={inputRef}
        type="file"
        accept={ACCEPT.join(',')}
        className="sr-only"
        tabIndex={-1}
        aria-hidden="true"
        onChange={(event) => {
          void choose(event);
        }}
      />
    </div>
  );
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
