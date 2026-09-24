import { createHash } from 'node:crypto';

import {
  LOGO_MIME_TYPES,
  MAX_LOGO_BYTES,
  type SchoolLogoInfo,
  type UploadSchoolLogo,
} from '@ilm/contracts';
import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../prisma/prisma.service';
import { BusinessRuleError, NotFoundError } from '../../shared/errors/domain-error';
import { TenantContextService } from '../../shared/tenancy/tenant-context.service';

/**
 * Storing and serving a school's logo.
 *
 * ## This is the seam
 *
 * Object storage has not been chosen. Everything vendor-specific about a logo
 * lives in this one class, and the rest of the product refers to the image by
 * an endpoint — `/api/v1/schools/logo` — rather than by a storage URL. Moving
 * the bytes to S3, R2 or anything else is a rewrite of `read` and `replace` and
 * nothing else: no markup, no PDF and no email has a bucket's hostname in it.
 *
 * Until then the bytes live in Postgres, in a table of their own, capped. A
 * school logo is tens of kilobytes and there is one per tenant, which is not a
 * workload — and an upload button that does nothing until a vendor is picked is
 * worse than no upload button.
 *
 * ## What is checked, and where
 *
 * The declared type is checked against the *actual bytes*, not trusted. A file
 * named `.png` that begins with `<?xml` is an SVG, and an SVG served back to
 * every user of a school is a script served back to every user of a school —
 * so the magic number has to agree with the claim before anything is stored.
 */
@Injectable()
export class SchoolLogoService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly context: TenantContextService,
  ) {}

  /** What the portal needs to decide whether to render an `<img>` at all. */
  async info(): Promise<SchoolLogoInfo> {
    return this.prisma.tenant(async (tx) => {
      const logo = await tx.schoolLogo.findFirst({
        // Deliberately not selecting `bytes`: this is called on page loads and
        // the whole point of the separate table is that the image does not ride
        // along with questions about it.
        select: { mimeType: true, byteSize: true, etag: true },
      });

      if (logo === null) {
        return { present: false, mimeType: null, byteSize: null, version: null };
      }

      return {
        present: true,
        mimeType: logo.mimeType as SchoolLogoInfo['mimeType'],
        byteSize: logo.byteSize,
        version: logo.etag,
      };
    });
  }

  /** The image itself, for the endpoint that streams it back. */
  async read(): Promise<{ bytes: Buffer; mimeType: string; etag: string }> {
    return this.prisma.tenant(async (tx) => {
      const logo = await tx.schoolLogo.findFirst({
        select: { bytes: true, mimeType: true, etag: true },
      });
      if (logo === null) {
        throw new NotFoundError('logo');
      }
      return { bytes: Buffer.from(logo.bytes), mimeType: logo.mimeType, etag: logo.etag };
    });
  }

  /**
   * Upload, or replace what is there.
   *
   * An upsert rather than a create: a school has one logo, uploading a second
   * one means "use this instead", and a table of every logo a school has ever
   * tried is not something anybody wants to look through.
   */
  async replace(input: UploadSchoolLogo): Promise<SchoolLogoInfo> {
    const { bytes, etag } = decodeAndVerify(input);
    // Prisma's `Bytes` is a `Uint8Array` over a plain `ArrayBuffer`, and a
    // Node `Buffer` may sit on a `SharedArrayBuffer`. The copy is a few tens
    // of kilobytes once per upload.
    const stored = new Uint8Array(bytes);
    const actorId = this.context.userId;

    await this.prisma.tenant(async (tx) => {
      const existing = await tx.schoolLogo.findFirst({ select: { id: true } });

      if (existing === null) {
        await tx.schoolLogo.create({
          data: {
            bytes: stored,
            mimeType: input.mimeType,
            etag,
            byteSize: stored.byteLength,
            ...(actorId === undefined ? {} : { createdBy: actorId }),
          } as never,
        });
        return;
      }

      await tx.schoolLogo.update({
        where: { id: existing.id },
        data: { bytes: stored, mimeType: input.mimeType, etag, byteSize: stored.byteLength },
      });
    });

    return this.info();
  }

  async remove(): Promise<void> {
    await this.prisma.tenant(async (tx) => {
      // `deleteMany`, so removing a logo a school does not have is not an
      // error. "Make sure there is no logo" is the request, and it succeeds.
      await tx.schoolLogo.deleteMany({});
    });
  }
}

/**
 * Turn the request into bytes, having satisfied ourselves about what they are.
 *
 * Exported because signup writes a logo through a different path — it has no
 * session and no tenant context yet — and both have to apply the same rules.
 * A second copy of this is a second opinion about what an image is.
 */
export function decodeAndVerify(input: UploadSchoolLogo): { bytes: Buffer; etag: string } {
  const bytes = Buffer.from(input.dataBase64, 'base64');

  // Base64 does not throw on rubbish; it decodes what it can and drops the
  // rest. So an empty result means the input was not base64 at all.
  if (bytes.byteLength === 0) {
    throw new BusinessRuleError('VALIDATION_FAILED', 'That file could not be read as an image.');
  }

  // Checked again here, not only in the schema: the encoded ceiling is a bound
  // on the decoded size, not a statement of it.
  if (bytes.byteLength > MAX_LOGO_BYTES) {
    throw new BusinessRuleError(
      'VALIDATION_FAILED',
      `That image is ${describeSize(bytes.byteLength)}. The limit is ${describeSize(MAX_LOGO_BYTES)}.`,
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
    // Renaming a file does not change what it is, and the thing being guarded
    // against is not a mistake — it is an SVG or an HTML document wearing a
    // .png extension, which would then be served back with a content type that
    // makes a browser execute it.
    throw new BusinessRuleError(
      'VALIDATION_FAILED',
      `That file is a ${label(actual)}, not a ${label(input.mimeType)}. Choose the file again.`,
    );
  }

  return {
    bytes,
    // Content-addressed, so replacing a logo with the identical file does not
    // invalidate every cached copy for no reason.
    etag: createHash('sha256').update(bytes).digest('hex').slice(0, 16),
  };
}

/**
 * What these bytes actually are, from their first few.
 *
 * Only the three formats the contract permits are recognised; everything else —
 * SVG, GIF, HTML, a PDF, a renamed zip — returns undefined and is refused.
 */
function sniff(bytes: Buffer): (typeof LOGO_MIME_TYPES)[number] | undefined {
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

/**
 * Sizes in a message a person reads, not in bytes.
 *
 * Integer arithmetic rather than `Math.round`, which ADR-0007 bans outright so
 * that no rounding decision anywhere can quietly be applied to money. Adding
 * half a kilobyte before truncating rounds to nearest, which is all that was
 * wanted.
 */
function describeSize(bytes: number): string {
  return `${String(Math.trunc((bytes + 512) / 1024))} KB`;
}
