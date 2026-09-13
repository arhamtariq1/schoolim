'use client';

import { LOGO_MIME_TYPES, MAX_LOGO_BYTES, type UploadSchoolLogo } from '@ilm/contracts';
import { Button } from '@ilm/ui';
import { DeleteIcon, ICON_SIZE, ImportIcon } from '@ilm/ui/icons';
import { useRef, useState, type ChangeEvent } from 'react';

/**
 * Choosing a logo file.
 *
 * Used on signup, where there is no school yet and the file travels with the
 * form, and in Settings, where it is uploaded on its own. Both need the same
 * preview, the same limits and the same refusals, and a school that was told
 * "PNG, JPEG or WebP, up to 512 KB" on one screen should not discover a
 * different rule on the other.
 *
 * ## Why it refuses before the server does
 *
 * The server checks everything again — it has to; a form is not a security
 * boundary. But a 4 MB photograph rejected after it has been read, encoded and
 * uploaded is thirty seconds of a slow connection spent to be told no. Checking
 * the size and the type first makes the refusal instant, and the message is the
 * same sentence either way.
 */

export interface LogoPickerProps {
  /** The chosen file, ready to send. `undefined` when nothing is chosen. */
  readonly value: UploadSchoolLogo | undefined;
  readonly onChange: (next: UploadSchoolLogo | undefined) => void;
  /** An existing logo to show when nothing new has been chosen. */
  readonly currentSrc?: string | undefined;
  readonly disabled?: boolean;
  /** Shown under the control; the caller knows whether this is signup or not. */
  readonly hint?: string;
}

const ACCEPT = LOGO_MIME_TYPES.join(',');

export function LogoPicker({ value, onChange, currentSrc, disabled, hint }: LogoPickerProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | undefined>(undefined);
  const [error, setError] = useState<string | undefined>(undefined);

  const shown = preview ?? currentSrc;

  async function choose(event: ChangeEvent<HTMLInputElement>): Promise<void> {
    const file = event.target.files?.[0];
    // Reset immediately, so choosing the same file twice after an error still
    // fires a change event.
    event.target.value = '';

    if (file === undefined) {
      return;
    }
    setError(undefined);

    if (!LOGO_MIME_TYPES.includes(file.type as (typeof LOGO_MIME_TYPES)[number])) {
      setError('Choose a PNG, JPEG or WebP image. SVG files are not accepted.');
      return;
    }
    if (file.size > MAX_LOGO_BYTES) {
      setError(
        `That image is ${describeSize(file.size)}. The limit is ${describeSize(MAX_LOGO_BYTES)}.`,
      );
      return;
    }

    const buffer = await file.arrayBuffer();
    onChange({
      mimeType: file.type as UploadSchoolLogo['mimeType'],
      dataBase64: toBase64(buffer),
    });
    setPreview(URL.createObjectURL(file));
  }

  function clear(): void {
    if (preview !== undefined) {
      // Revoked, or every rejected attempt leaks a blob for the life of the tab.
      URL.revokeObjectURL(preview);
    }
    setPreview(undefined);
    setError(undefined);
    onChange(undefined);
  }

  return (
    <div>
      <div className="flex items-center gap-4">
        <div className="flex size-16 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-dashed border-input bg-muted/40">
          {shown === undefined ? (
            <ImportIcon className={`${ICON_SIZE.heading} text-muted-foreground`} aria-hidden />
          ) : (
            // A plain <img>, not next/image: the source is either a blob URL
            // from the file the person just chose or a same-origin endpoint
            // that streams bytes, and the optimiser can do nothing with either.
            <img src={shown} alt="" className="size-full object-contain" />
          )}
        </div>

        <div className="min-w-0">
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              tone="outline"
              size="sm"
              disabled={disabled}
              onClick={() => {
                inputRef.current?.click();
              }}
            >
              {shown === undefined ? 'Choose a logo' : 'Replace'}
            </Button>

            {value === undefined && currentSrc === undefined ? null : (
              <Button type="button" tone="ghost" size="sm" disabled={disabled} onClick={clear}>
                <DeleteIcon className={ICON_SIZE.inline} aria-hidden />
                Remove
              </Button>
            )}
          </div>

          <p className="mt-1.5 text-xs text-muted-foreground">
            {hint ?? `PNG, JPEG or WebP, up to ${describeSize(MAX_LOGO_BYTES)}.`}
          </p>
        </div>
      </div>

      <input
        ref={inputRef}
        type="file"
        accept={ACCEPT}
        className="sr-only"
        // The visible control is the button above; this input exists only to
        // open the file dialog, so it is out of the tab order rather than a
        // second stop that looks like nothing.
        tabIndex={-1}
        aria-hidden="true"
        onChange={(event) => {
          void choose(event);
        }}
      />

      {error === undefined ? null : (
        <p role="alert" className="mt-2 text-sm text-danger">
          {error}
        </p>
      )}
    </div>
  );
}

/**
 * ArrayBuffer to base64, in chunks.
 *
 * `String.fromCharCode(...bytes)` is the one-liner and it throws on anything
 * large: every byte becomes an argument, and half a megabyte overflows the
 * call stack. Chunking keeps each call to a few thousand arguments.
 */
function toBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  const chunkSize = 8192;
  let binary = '';
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
  }
  return btoa(binary);
}

function describeSize(bytes: number): string {
  return `${String(Math.trunc((bytes + 512) / 1024))} KB`;
}
