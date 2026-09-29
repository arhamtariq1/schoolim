import { z } from 'zod';

/**
 * Every file a school can put into this product, and the rules for each.
 *
 * ## Why a catalogue rather than a limit per feature
 *
 * Today it is two logos. It will be student photographs, scanned B-forms, fee
 * receipts and whatever the next module needs, and each of those arrives with
 * the same four questions: how big may it be, what may it be, who may see it,
 * and where does it live. Answering them once per feature is how a product ends
 * up accepting a 40MB bitmap on one screen and refusing a 600KB photo on
 * another — and how a private document ends up on a public CDN because the
 * screen that uploaded it never had to say it was private.
 *
 * So each kind is declared here, once, and both sides read it: the browser to
 * tell somebody what it will accept before they wait for an upload, and the
 * server to enforce it after they have.
 *
 * ## Visibility is part of the declaration, not a deployment detail
 *
 * `public` means the bytes may sit on a CDN behind an unguessable but
 * unauthenticated URL — a school's logo, which is on its letterhead and its
 * website. `private` means they may not, ever, and the storage layer routes
 * those somewhere access-controlled rather than asking. Getting this wrong for
 * a student's photograph is not a bug that can be fixed later; the file is
 * already public by then.
 */

/**
 * PNG, JPEG and WebP.
 *
 * **No SVG, deliberately.** An SVG is a document that can carry script and
 * external references, and these files are served back to people who opened a
 * school's portal. Rasterising one safely is a larger problem than an upload
 * deserves, so the format is simply not accepted.
 */
export const IMAGE_MIME_TYPES = ['image/png', 'image/jpeg', 'image/webp'] as const;

export const imageMimeTypeSchema = z.enum(IMAGE_MIME_TYPES);
export type ImageMimeType = z.infer<typeof imageMimeTypeSchema>;

export type AssetVisibility = 'public' | 'private';

export interface AssetRules {
  /** Ceiling on the **decoded** bytes. Base64 inflates by a third. */
  readonly maxBytes: number;
  readonly mimeTypes: readonly ImageMimeType[];
  readonly visibility: AssetVisibility;
  /**
   * The folder within a school's own prefix. Never a tenant identifier — the
   * storage layer puts the school id in the path itself, so that one tenant's
   * files cannot be addressed by guessing another's folder name.
   */
  readonly folder: string;
  /** For the message a person reads when they pick the wrong thing. */
  readonly label: string;
}

/**
 * 512 KB for a logo.
 *
 * A logo is displayed at perhaps 160 pixels across. This is large enough for a
 * crisp one on a high-density screen and on a printed challan, and small enough
 * that it is never the reason a page is slow.
 */
const LOGO_MAX_BYTES = 512 * 1024;

export const ASSET_KINDS = {
  SCHOOL_LOGO: {
    maxBytes: LOGO_MAX_BYTES,
    mimeTypes: IMAGE_MIME_TYPES,
    // On the letterhead, the challan and the school's own website. Making it
    // private would mean an emailed receipt could not render it, because an
    // email client carries no session.
    visibility: 'public',
    folder: 'logo',
    label: 'school logo',
  },
  BANK_LOGO: {
    maxBytes: LOGO_MAX_BYTES,
    mimeTypes: IMAGE_MIME_TYPES,
    visibility: 'public',
    folder: 'bank-logo',
    label: 'bank logo',
  },
} as const satisfies Record<string, AssetRules>;

export type AssetKind = keyof typeof ASSET_KINDS;

export const assetKindSchema = z.enum(
  Object.keys(ASSET_KINDS) as [AssetKind, ...AssetKind[]],
);

export function assetRules(kind: AssetKind): AssetRules {
  return ASSET_KINDS[kind];
}

/**
 * What an upload request carries.
 *
 * Base64 rather than multipart: these are half-megabyte images arriving one at
 * a time on a JSON API, and a JSON body is one code path through the same
 * validation, logging and error envelope as every other request. The ceiling
 * below is on the *encoded* length, which is a bound on the decoded size rather
 * than a statement of it — the real check happens once the bytes exist.
 */
export function uploadAssetSchema(kind: AssetKind) {
  const rules = assetRules(kind);

  return z
    .object({
      mimeType: z.enum(rules.mimeTypes as unknown as [ImageMimeType, ...ImageMimeType[]]),
      dataBase64: z
        .string()
        .min(1, 'Choose a file.')
        .max(encodedCeiling(rules.maxBytes), 'That image is too large.'),
    })
    .strict();
}

/** The longest base64 that could decode to `bytes`, plus its padding. */
export function encodedCeiling(bytes: number): number {
  return Math.ceil((bytes * 4) / 3) + 4;
}

/** Sizes in a message a person reads, not in bytes. */
export function describeSize(bytes: number): string {
  // Integer arithmetic rather than `Math.round`, which ADR-0007 bans outright
  // so that no rounding decision anywhere can quietly be applied to money.
  // Adding half a kilobyte before truncating rounds to nearest, which is all
  // that was wanted.
  return `${String(Math.trunc((bytes + 512) / 1024))} KB`;
}
