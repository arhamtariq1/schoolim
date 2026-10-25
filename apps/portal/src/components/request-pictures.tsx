'use client';

import {
  REQUEST_ATTACHMENTS_PER_EVENT,
  ROUTES,
  type RequestAttachment,
  type UploadRequestAttachment,
} from '@ilm/contracts';
import { Button, cn } from '@ilm/ui';
import { CloseIcon, ICON_SIZE, ImageIcon } from '@ilm/ui/icons';
import { useRef, useState, type ChangeEvent } from 'react';

import { mutate } from '@/lib/mutate';
import { preparePicture } from '@/lib/request-ui';

/** A picture chosen but not yet sent. */
export interface PendingPicture {
  readonly key: string;
  readonly upload: UploadRequestAttachment;
  readonly previewUrl: string;
}

const ACCEPT = 'image/png,image/jpeg,image/webp';

/**
 * Choose up to three pictures to go with a request or a reply.
 *
 * They are only held here. They are sent after the text, one at a time, once
 * the request or reply exists — so a picture that fails never costs somebody the
 * words they wrote.
 */
export function PicturePicker({
  pictures,
  onChange,
  disabled = false,
}: {
  readonly pictures: readonly PendingPicture[];
  readonly onChange: (next: readonly PendingPicture[]) => void;
  readonly disabled?: boolean;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | undefined>(undefined);
  const [isPreparing, setIsPreparing] = useState(false);
  const room = REQUEST_ATTACHMENTS_PER_EVENT - pictures.length;

  async function choose(event: ChangeEvent<HTMLInputElement>): Promise<void> {
    const files = [...(event.target.files ?? [])].slice(0, room);
    // Reset, so choosing the same file again after an error still fires.
    event.target.value = '';
    if (files.length === 0) {
      return;
    }

    setError(undefined);
    setIsPreparing(true);
    const added: PendingPicture[] = [];
    for (const file of files) {
      const prepared = await preparePicture(file);
      if (!prepared.ok) {
        setError(prepared.error);
        continue;
      }
      added.push({ key: crypto.randomUUID(), upload: prepared.upload, previewUrl: prepared.previewUrl });
    }
    setIsPreparing(false);
    onChange([...pictures, ...added]);
  }

  function remove(key: string): void {
    const gone = pictures.find((picture) => picture.key === key);
    if (gone !== undefined) {
      // Revoked, or every picture chosen and dropped leaks a blob for the life of the tab.
      URL.revokeObjectURL(gone.previewUrl);
    }
    onChange(pictures.filter((picture) => picture.key !== key));
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        {pictures.map((picture, index) => (
          <span
            key={picture.key}
            className="relative size-16 shrink-0 overflow-hidden rounded-lg border border-border bg-muted"
          >
            <img
              src={picture.previewUrl}
              alt={`Picture ${String(index + 1)}`}
              className="size-full object-cover"
            />
            <button
              type="button"
              aria-label={`Remove picture ${String(index + 1)}`}
              disabled={disabled}
              onClick={() => {
                remove(picture.key);
              }}
              className="absolute end-0.5 top-0.5 flex size-5 items-center justify-center rounded-full bg-foreground/70 text-background hover:bg-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
            >
              <CloseIcon className="size-3" aria-hidden />
            </button>
          </span>
        ))}

        {room > 0 ? (
          <Button
            type="button"
            tone="outline"
            size="sm"
            disabled={disabled}
            isPending={isPreparing}
            onClick={() => input.current?.click()}
          >
            <ImageIcon className={ICON_SIZE.inline} aria-hidden />
            {pictures.length === 0 ? 'Add pictures' : 'Add another'}
          </Button>
        ) : null}
      </div>

      <p className="text-xs text-muted-foreground">
        Optional. Up to {REQUEST_ATTACHMENTS_PER_EVENT} pictures — PNG, JPEG or WebP. Large photos are
        shrunk for you.
      </p>
      {error === undefined ? null : (
        <p role="alert" className="text-xs text-danger">
          {error}
        </p>
      )}

      <input
        ref={input}
        type="file"
        accept={ACCEPT}
        multiple
        className="sr-only"
        tabIndex={-1}
        aria-hidden
        onChange={(event) => void choose(event)}
      />
    </div>
  );
}

/**
 * Send the chosen pictures to a request event, one at a time.
 *
 * Returns the names of any that did not go, so the caller can say so rather
 * than let somebody believe a picture arrived that did not.
 */
export async function sendPictures(
  requestId: string,
  eventId: string,
  pictures: readonly PendingPicture[],
): Promise<string[]> {
  const failed: string[] = [];
  for (const picture of pictures) {
    const result = await mutate<RequestAttachment>(
      ROUTES.requests.eventAttachments(requestId, eventId),
      'POST',
      picture.upload,
    );
    if (!result.ok) {
      failed.push(picture.upload.fileName);
    }
  }
  return failed;
}

/** The pictures on one message, as links that open the full image. */
export function PictureGallery({
  pictures,
  className,
}: {
  readonly pictures: readonly RequestAttachment[];
  readonly className?: string;
}) {
  if (pictures.length === 0) {
    return null;
  }

  return (
    <ul className={cn('flex flex-wrap gap-2', className)} aria-label="Attached pictures">
      {pictures.map((picture) => (
        <li key={picture.id}>
          <a
            href={ROUTES.requests.attachment(picture.id)}
            target="_blank"
            rel="noopener noreferrer"
            className="block size-24 overflow-hidden rounded-lg border border-border bg-muted transition-opacity hover:opacity-90 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          >
            <img
              src={ROUTES.requests.attachment(picture.id)}
              alt={picture.fileName}
              loading="lazy"
              className="size-full object-cover"
            />
          </a>
        </li>
      ))}
    </ul>
  );
}
