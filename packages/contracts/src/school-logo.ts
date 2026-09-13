import { z } from 'zod';

/**
 * A school's own mark, on its challans and in its portal.
 *
 * ## Uploaded as base64, not multipart
 *
 * The whole payload is a single small image and the rest of this API is JSON.
 * Multipart would mean a parser, a second body-handling path, and a second set
 * of validation rules for the sake of saving a third of the bytes on a file
 * that is measured in tens of kilobytes.
 *
 * ## Why the limits are here rather than only in the UI
 *
 * A logo is served back to every user of the school and printed on every
 * challan, so what may be stored is a question about what the server will
 * return, not about what a form will accept. The database repeats both checks
 * as constraints — a cap enforced only in a zod schema is a cap that a second
 * endpoint written next year will not have.
 */

/**
 * 512 KB, before base64.
 *
 * A logo is displayed at perhaps 160 pixels across. This is large enough for a
 * crisp one on a high-density screen and a printed challan, and small enough
 * that it is never the reason a page is slow.
 */
export const MAX_LOGO_BYTES = 512 * 1024;

/**
 * PNG, JPEG and WebP.
 *
 * **No SVG, deliberately.** An SVG is a document that can carry script and
 * external references, and this file is served back to every person who opens
 * the school's portal. Rasterising it safely is a larger problem than a logo
 * upload deserves, so the format is simply not accepted — and the message says
 * so rather than failing silently.
 */
export const LOGO_MIME_TYPES = ['image/png', 'image/jpeg', 'image/webp'] as const;

export const logoMimeTypeSchema = z.enum(LOGO_MIME_TYPES);
export type LogoMimeType = z.infer<typeof logoMimeTypeSchema>;

export const uploadSchoolLogoSchema = z
  .object({
    mimeType: logoMimeTypeSchema,
    /**
     * The image, base64-encoded, without a `data:` prefix.
     *
     * The ceiling is on the *encoded* length because that is what the server
     * receives and can refuse before decoding: base64 is 4 bytes per 3, so this
     * is `MAX_LOGO_BYTES` rounded up plus padding. The decoded size is checked
     * again afterwards, since the ratio is a bound rather than a guarantee.
     */
    dataBase64: z
      .string()
      .min(1, 'Choose an image.')
      .max(Math.ceil((MAX_LOGO_BYTES * 4) / 3) + 4, 'That image is too large.'),
  })
  .strict();

export type UploadSchoolLogo = z.infer<typeof uploadSchoolLogoSchema>;

/** What the portal knows about a school's logo without fetching the bytes. */
export const schoolLogoInfoSchema = z.object({
  /** False when the school has never uploaded one, which is the normal case. */
  present: z.boolean(),
  mimeType: logoMimeTypeSchema.nullable(),
  byteSize: z.int().min(0).nullable(),
  /**
   * Changes on every upload, and is appended to the image URL as a query
   * parameter.
   *
   * Without it a school that replaces its logo keeps seeing the old one until
   * the browser cache expires — and the first thing they do after uploading is
   * look at whether it worked.
   */
  version: z.string().nullable(),
});

export type SchoolLogoInfo = z.infer<typeof schoolLogoInfoSchema>;
