import {
  assetRules,
  describeSize,
  IMAGE_MIME_TYPES,
  type ImageMimeType,
  type RequestPriority,
  type RequestStatus,
  type UploadRequestAttachment,
} from '@ilm/contracts';
import { type StatusTone } from '@ilm/ui';

import { toBase64 } from '@/components/logo-picker';

/**
 * How requests look. Status and priority are always a colour **and** a word —
 * this is printed in black and white as often as not, and a status that is only
 * a hue is no status at all (docs/16 §6).
 */
export const REQUEST_STATUS_TONES: Readonly<Record<RequestStatus, StatusTone>> = {
  PENDING: 'warning',
  IN_PROGRESS: 'info',
  RESOLVED: 'success',
  REJECTED: 'danger',
  REOPENED: 'orange',
};

export const REQUEST_PRIORITY_TONES: Readonly<Record<RequestPriority, StatusTone>> = {
  LOW: 'slate',
  NORMAL: 'neutral',
  HIGH: 'orange',
  URGENT: 'danger',
};

const PICTURE_RULES = assetRules('REQUEST_ATTACHMENT');
/** The longest side a picture is shrunk to. Enough to read a voucher, not a billboard. */
const MAX_SIDE_PX = 1600;

export type PreparedPicture =
  | { readonly ok: true; readonly upload: UploadRequestAttachment; readonly previewUrl: string }
  | { readonly ok: false; readonly error: string };

/**
 * A picked file as an upload — shrunk first if it needs to be.
 *
 * A phone photograph is several megabytes and the server holds a picture to
 * half a megabyte, so the browser does the shrinking: the biggest side down to
 * 1600 pixels and the quality stepped down until it fits. A small picture goes
 * as it is. What the server then checks is what the bytes really are; this only
 * saves a parent from being told "too large" about a photo they just took.
 */
export async function preparePicture(file: File): Promise<PreparedPicture> {
  if (!(IMAGE_MIME_TYPES as readonly string[]).includes(file.type)) {
    return { ok: false, error: 'Choose a PNG, JPEG or WebP picture.' };
  }

  const fits = file.size <= PICTURE_RULES.maxBytes;
  if (fits) {
    return {
      ok: true,
      upload: {
        mimeType: file.type as ImageMimeType,
        dataBase64: toBase64(await file.arrayBuffer()),
        fileName: file.name,
      },
      previewUrl: URL.createObjectURL(file),
    };
  }

  const shrunk = await shrink(file);
  if (shrunk === undefined) {
    return {
      ok: false,
      error: `That picture is ${describeSize(file.size)} and could not be made smaller than ${describeSize(PICTURE_RULES.maxBytes)}.`,
    };
  }
  return {
    ok: true,
    upload: {
      mimeType: 'image/jpeg',
      dataBase64: toBase64(await shrunk.arrayBuffer()),
      fileName: `${file.name.replace(/\.[^.]+$/, '')}.jpg`,
    },
    previewUrl: URL.createObjectURL(shrunk),
  };
}

async function shrink(file: File): Promise<Blob | undefined> {
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    return undefined;
  }

  const scale = Math.min(1, MAX_SIDE_PX / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.trunc(bitmap.width * scale));
  canvas.height = Math.max(1, Math.trunc(bitmap.height * scale));
  const context = canvas.getContext('2d');
  if (context === null) {
    return undefined;
  }
  // JPEG has no transparency; a transparent PNG would turn black without this.
  context.fillStyle = 'white';
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();

  for (const quality of [0.85, 0.75, 0.65, 0.5, 0.4]) {
    const blob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob(resolve, 'image/jpeg', quality);
    });
    if (blob !== null && blob.size <= PICTURE_RULES.maxBytes) {
      return blob;
    }
  }
  return undefined;
}
