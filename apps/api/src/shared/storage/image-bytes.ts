import { createHash } from 'node:crypto';

import { assetRules, describeSize, type AssetKind, type ImageMimeType } from '@ilm/contracts';

import { BusinessRuleError } from '../errors/domain-error';

/**
 * Turning an upload into bytes, having satisfied ourselves about what they are.
 *
 * Deliberately separate from any driver. What an image is does not depend on
 * where it is going to be kept, and a second copy of these rules — one for the
 * database path and one for the CDN path — is a second opinion about what a
 * PNG is. Everything that accepts a file goes through here first, including
 * signup, which has no session and no tenant context yet.
 *
 * ## The declared type is checked against the actual bytes
 *
 * A file named `.png` that begins with `<?xml` is an SVG, and an SVG served
 * back to every user of a school is a script served back to every user of a
 * school. Renaming a file does not change what it is, so the magic number has
 * to agree with the claim before anything is stored — and it matters more now
 * that the bytes may end up on a CDN, where they are fetched without a session
 * and outside this application's control.
 */
export interface VerifiedImage {
  readonly bytes: Buffer;
  readonly mimeType: ImageMimeType;
  /**
   * Content hash. The HTTP ETag, the cache-busting version, and what makes
   * replacing an image with the identical file a no-op for every browser that
   * already has it.
   */
  readonly etag: string;
}

export function verifyImage(
  kind: AssetKind,
  input: { readonly dataBase64: string; readonly mimeType: string },
): VerifiedImage {
  const rules = assetRules(kind);
  const bytes = Buffer.from(input.dataBase64, 'base64');

  // Base64 does not throw on rubbish; it decodes what it can and drops the
  // rest. So an empty result means the input was not base64 at all.
  if (bytes.byteLength === 0) {
    throw new BusinessRuleError('VALIDATION_FAILED', 'That file could not be read as an image.');
  }

  // Checked here and not only in the schema: the encoded ceiling is a bound on
  // the decoded size, not a statement of it.
  if (bytes.byteLength > rules.maxBytes) {
    throw new BusinessRuleError(
      'VALIDATION_FAILED',
      `That image is ${describeSize(bytes.byteLength)}. The limit for a ${rules.label} is ${describeSize(rules.maxBytes)}.`,
    );
  }

  const actual = sniff(bytes);
  if (actual === undefined) {
    throw new BusinessRuleError(
      'VALIDATION_FAILED',
      'That file is not a PNG, JPEG or WebP image. SVG files are not accepted.',
    );
  }

  if (actual !== input.mimeType) {
    throw new BusinessRuleError(
      'VALIDATION_FAILED',
      `That file is a ${label(actual)}, not a ${label(input.mimeType)}. Choose the file again.`,
    );
  }

  if (!rules.mimeTypes.includes(actual)) {
    throw new BusinessRuleError(
      'VALIDATION_FAILED',
      `A ${rules.label} cannot be a ${label(actual)}.`,
    );
  }

  return {
    bytes,
    mimeType: actual,
    // Content-addressed, so replacing an image with the identical file does not
    // invalidate every cached copy for no reason.
    etag: createHash('sha256').update(bytes).digest('hex').slice(0, 16),
  };
}

/**
 * What these bytes actually are, from their first few.
 *
 * Only the three formats the catalogue permits are recognised; everything else
 * — SVG, GIF, HTML, a PDF, a renamed zip — returns undefined and is refused.
 */
function sniff(bytes: Buffer): ImageMimeType | undefined {
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  ) {
    return 'image/png';
  }

  // JPEG: SOI marker. The format has many flavours and they all start here.
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return 'image/jpeg';
  }

  // WebP is a RIFF container: "RIFF" .... "WEBP".
  if (
    bytes.length >= 12 &&
    bytes.toString('ascii', 0, 4) === 'RIFF' &&
    bytes.toString('ascii', 8, 12) === 'WEBP'
  ) {
    return 'image/webp';
  }

  return undefined;
}

function label(mimeType: string): string {
  return mimeType === 'image/png' ? 'PNG' : mimeType === 'image/jpeg' ? 'JPEG' : 'WebP';
}
