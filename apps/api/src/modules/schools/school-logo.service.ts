import { type AssetKind, type SchoolLogoInfo, type UploadSchoolLogo } from '@ilm/contracts';
import { Inject, Injectable } from '@nestjs/common';

import { PrismaService } from '../../prisma/prisma.service';
import { NotFoundError } from '../../shared/errors/domain-error';
import { verifyImage } from '../../shared/storage/image-bytes';
import {
  STORAGE,
  STORAGE_PROVIDERS,
  type AssetLocation,
  type StoragePort,
} from '../../shared/storage/storage.port';
import { TenantContextService } from '../../shared/tenancy/tenant-context.service';

/**
 * A school's images: its own mark, and its bank's.
 *
 * ## The bytes are not this service's problem any more
 *
 * They go through `StoragePort` (ADR-0013), so nothing here knows whether they
 * landed in Postgres or on a CDN. What this service owns is the *record* — one
 * row per school per kind, carrying the type, the size, the content hash and
 * the storage reference — because that is the tenant-scoped, audited,
 * RLS-protected part, and it stays in the database whichever driver is live.
 *
 * ## The product's URL never changes
 *
 * Everything that shows an image points at `/api/v1/schools/logo`, not at a
 * bucket. A challan printed last term, an email sent last week and a PDF in
 * somebody's downloads all keep working when storage is reconfigured, because
 * none of them ever carried a vendor's hostname. The redirect that a CDN-backed
 * asset needs happens inside the controller, behind that stable address.
 *
 * ## Replacing is an upsert, and cannot orphan
 *
 * A school has one mark. Uploading a second means "use this instead", not "keep
 * both" — so there is one row, and the remote key is derived from the school
 * and the kind rather than generated, which means the old object is overwritten
 * rather than left behind for a sweeper nobody has written.
 */
@Injectable()
export class SchoolLogoService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly context: TenantContextService,
    @Inject(STORAGE) private readonly storage: StoragePort,
  ) {}

  /** What the portal needs to decide whether to render an `<img>` at all. */
  async info(kind: AssetKind): Promise<SchoolLogoInfo> {
    return this.prisma.tenant(async (tx) => {
      const logo = await tx.schoolLogo.findFirst({
        where: { kind: toColumn(kind) },
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

  /**
   * Where the image is, for the endpoint that serves it.
   *
   * Returns bytes or a redirect, depending on what wrote the row — never on
   * what is configured now. A deployment that turned Cloudinary on last week
   * still serves everything uploaded before it.
   */
  async locate(kind: AssetKind): Promise<AssetLocation & { mimeType: string; etag: string }> {
    const row = await this.prisma.tenant(async (tx) =>
      tx.schoolLogo.findFirst({
        where: { kind: toColumn(kind) },
        select: {
          bytes: true,
          mimeType: true,
          etag: true,
          storageProvider: true,
          storageKey: true,
          storageUrl: true,
        },
      }),
    );

    if (row === null) {
      throw new NotFoundError('logo');
    }

    if (row.storageProvider === STORAGE_PROVIDERS.database) {
      if (row.bytes === null) {
        // The check constraint forbids this, so reaching it means the row was
        // written around the application. A loud failure beats a blank image.
        throw new NotFoundError('logo');
      }
      return {
        kind: 'bytes',
        bytes: Buffer.from(row.bytes),
        mimeType: row.mimeType,
        etag: row.etag,
      };
    }

    const located = await this.storage.locate({
      key: row.storageKey,
      url: row.storageUrl,
      provider: row.storageProvider,
    });

    return { ...located, mimeType: row.mimeType, etag: row.etag };
  }

  /** Upload, or replace what is there. */
  async replace(kind: AssetKind, input: UploadSchoolLogo): Promise<SchoolLogoInfo> {
    const image = verifyImage(kind, input);
    const schoolId = this.context.schoolId;

    // Stored **before** the row is written, deliberately. The other order can
    // leave a row pointing at an object that was never created, which renders
    // as a broken image with no way to tell it from a deleted one. This order
    // can leave an uploaded object with no row — which is invisible, costs a
    // few kilobytes, and is overwritten by the next attempt because the key is
    // derived rather than generated.
    const stored = await this.storage.put({
      kind,
      schoolId,
      bytes: image.bytes,
      mimeType: image.mimeType,
      etag: image.etag,
    });

    // Prisma's `Bytes` is a `Uint8Array` over a plain `ArrayBuffer`, and a Node
    // `Buffer` may sit on a `SharedArrayBuffer`. The copy is a few tens of
    // kilobytes, once per upload — and only when the bytes stay here at all.
    const local = stored.provider === STORAGE_PROVIDERS.database;

    const data = {
      bytes: local ? new Uint8Array(image.bytes) : null,
      mimeType: image.mimeType,
      etag: image.etag,
      byteSize: stored.byteSize,
      storageProvider: stored.provider,
      storageKey: stored.key,
      storageUrl: stored.url ?? null,
    };

    const actorId = this.context.userId;

    await this.prisma.tenant(async (tx) => {
      await tx.schoolLogo.upsert({
        where: { schoolId_kind: { schoolId, kind: toColumn(kind) } },
        create: {
          schoolId,
          kind: toColumn(kind),
          ...data,
          ...(actorId === undefined ? {} : { createdBy: actorId }),
        } as never,
        update: data,
      });
    });

    return this.info(kind);
  }

  async remove(kind: AssetKind): Promise<void> {
    const row = await this.prisma.tenant(async (tx) =>
      tx.schoolLogo.findFirst({
        where: { kind: toColumn(kind) },
        select: { storageProvider: true, storageKey: true, storageUrl: true },
      }),
    );

    if (row === null) {
      // "Make sure there is no logo" is the request, and it is satisfied.
      return;
    }

    // The remote object goes first. The other order can delete the row and then
    // fail, leaving a file nobody has a reference to — unreachable, unbilled
    // for by anyone watching, and impossible to find later. Failing here leaves
    // the row, so the next attempt can try again.
    if (row.storageProvider !== STORAGE_PROVIDERS.database) {
      await this.storage.remove({
        key: row.storageKey,
        url: row.storageUrl,
        provider: row.storageProvider,
      });
    }

    await this.prisma.tenant(async (tx) => {
      // `deleteMany`, so removing a logo a school does not have is not an
      // error — and so a row that vanished between the read and now is fine.
      await tx.schoolLogo.deleteMany({ where: { kind: toColumn(kind) } });
    });
  }
}

/**
 * The catalogue's name for an asset, as the `school_image_kind` column spells it.
 *
 * Two vocabularies meet here: the catalogue names a *kind of file* the product
 * accepts, and the column names *which image a row holds*. They are not the
 * same list — the catalogue will grow entries that are not logos at all — so
 * the mapping is explicit rather than a cast that happens to work today.
 */
function toColumn(kind: AssetKind): 'SCHOOL' | 'BANK' {
  return kind === 'BANK_LOGO' ? 'BANK' : 'SCHOOL';
}
