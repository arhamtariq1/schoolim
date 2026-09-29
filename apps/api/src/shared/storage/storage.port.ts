import { type AssetKind, type AssetVisibility } from '@ilm/contracts';

/**
 * The one interface every uploaded file goes through.
 *
 * Same reasoning as `MailPort` (ADR-0011), applied to bytes: the provider is a
 * configuration decision, this shape is the architectural one, and it is what
 * stops a vendor's SDK types leaking into services that only want to keep a
 * file somewhere. ADR-0013 records the choice of Cloudinary behind it.
 *
 * ## Nothing above this line knows where the bytes are
 *
 * A caller hands over verified bytes and gets back a `StoredAsset` — a key it
 * stores and later gives back. It never builds a URL, never sees a bucket, and
 * never branches on a driver. That is what makes the product's own endpoints
 * (`/api/v1/schools/logo`) the only address of an image anywhere in the
 * codebase: no markup, no PDF and no email carries a vendor's hostname, so
 * changing provider does not invalidate anything already sent.
 *
 * ## Why `locate` and not `read`
 *
 * A driver that holds the bytes locally hands them back; a driver that put them
 * on a CDN hands back a URL for the browser to follow instead. Forcing the
 * second to behave like the first would mean every logo on every page was
 * proxied through this API — paying for the bandwidth twice and throwing away
 * the only reason to use a CDN. The discriminated union is what lets the
 * endpoint do the right thing for either without asking which driver is live.
 */

export interface PutAssetInput {
  readonly kind: AssetKind;
  /** The tenant. Every key is scoped by it, so paths cannot collide or be guessed across schools. */
  readonly schoolId: string;
  readonly bytes: Buffer;
  readonly mimeType: string;
  /**
   * Content hash of the bytes, computed by the caller that verified them.
   *
   * Passed in rather than recomputed so there is one hash per upload and one
   * definition of it — this value is the HTTP ETag, the cache-busting version
   * in the URL, and the thing that makes replacing a logo with the identical
   * file a no-op for every browser that already has it.
   */
  readonly etag: string;
}

export interface StoredAsset {
  /**
   * The driver's own address for these bytes. Opaque above this line; the only
   * thing a caller does with it is store it and hand it back.
   */
  readonly key: string;
  /**
   * A delivery URL, when the driver has one. Stored so that serving does not
   * cost a round trip to the provider on every page view.
   */
  readonly url: string | undefined;
  /** Which driver holds it, so a row written under one still reads under another. */
  readonly provider: string;
  readonly byteSize: number;
}

/**
 * Where to find an asset now.
 *
 * `bytes` — the driver has them and the endpoint streams them.
 * `redirect` — they are on a CDN and the browser should go there instead.
 */
export type AssetLocation =
  | { readonly kind: 'bytes'; readonly bytes: Buffer }
  | { readonly kind: 'redirect'; readonly url: string };

export interface StoredAssetRef {
  readonly key: string;
  readonly url: string | null;
  readonly provider: string;
}

export interface StoragePort {
  put(input: PutAssetInput): Promise<StoredAsset>;
  /**
   * Resolve a stored reference to something servable.
   *
   * Takes the whole reference, including which provider wrote it, because a
   * deployment that switches drivers still has rows from the old one. Anything
   * else would mean a school's logo vanishing on the day storage was
   * reconfigured.
   */
  locate(ref: StoredAssetRef): Promise<AssetLocation>;
  /**
   * Delete. Succeeds when there was nothing there — "make sure this is gone"
   * is the request, and it is satisfied by an object that never existed.
   */
  remove(ref: StoredAssetRef): Promise<void>;
  /** Which driver is active, for the boot log and the health endpoint. */
  readonly driver: string;
  /** Whether this driver may hold assets of a given visibility. */
  accepts(visibility: AssetVisibility): boolean;
}

/** DI token. `StoragePort` is an interface, so it cannot be a Nest provider token. */
export const STORAGE = 'STORAGE';

/**
 * The name a driver records on every row it writes.
 *
 * Stored in the database, so these strings are a migration concern: renaming
 * one orphans every asset written under the old name.
 */
export const STORAGE_PROVIDERS = {
  database: 'database',
  cloudinary: 'cloudinary',
} as const;

export type StorageProvider = (typeof STORAGE_PROVIDERS)[keyof typeof STORAGE_PROVIDERS];

/** Thrown when a driver is asked for something it cannot safely do. */
export class StorageError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'StorageError';
  }
}
