import { assetRules, type AssetKind, type AssetVisibility } from '@ilm/contracts';

import { type Clock } from '../time/clock.provider';

import { cloudinaryTimestamp, signCloudinaryParams } from './cloudinary.signature';
import {
  STORAGE_PROVIDERS,
  StorageError,
  type AssetLocation,
  type PutAssetInput,
  type StoragePort,
  type StoredAsset,
  type StoredAssetRef,
} from './storage.port';

/**
 * Cloudinary, over its REST API.
 *
 * ## Why not the SDK
 *
 * `cloudinary` is a large dependency that exists mostly to build URLs and sign
 * three parameters. What this product needs of it is an upload, a delete and a
 * delivery URL — about eighty lines — and writing them means the signature rule
 * is tested here rather than trusted, the failure modes are ones this codebase
 * already has a shape for, and there is no second HTTP client in the process
 * with its own timeout and retry opinions. Swapping to the SDK later is a
 * change inside this file; nothing above the port would notice.
 *
 * ## Deterministic public ids
 *
 * The id is `{prefix}/schools/{schoolId}/{folder}`, with `overwrite` and
 * `invalidate` set. Three consequences, all wanted:
 *
 * - **Replacing a logo cannot orphan the old one.** There is no second object
 *   to forget about, so no sweeper job and no bill for files nobody can reach.
 * - **The tenant is in the path.** One school's assets cannot be addressed by
 *   guessing another's folder, and a leaked id names the school it belongs to
 *   rather than being an opaque handle that could be anyone's.
 * - **Retrying an upload is idempotent.** A request that timed out after the
 *   bytes landed leaves the same object as the retry that follows it.
 *
 * Cache-busting then comes from the version Cloudinary returns in the delivery
 * URL, which changes with the bytes — not from the id, which does not.
 *
 * ## Public only
 *
 * `accepts` refuses anything private. These URLs are unauthenticated: knowing
 * one is enough to fetch it, which is correct for a logo on a letterhead and
 * wrong for a child's photograph. Rather than reach for signed delivery URLs —
 * whose expiry is a guess about how long a page stays open — private assets go
 * to the database driver, behind row-level security. See ADR-0013.
 */
export interface CloudinaryConfig {
  readonly cloudName: string;
  readonly apiKey: string;
  readonly apiSecret: string;
  /**
   * The top-level folder, so one account can hold several deployments without
   * staging overwriting production.
   */
  readonly prefix: string;
  /** How long to wait for the API before giving up, in milliseconds. */
  readonly timeoutMs: number;
}

export class CloudinaryStore implements StoragePort {
  readonly driver = STORAGE_PROVIDERS.cloudinary;

  constructor(
    private readonly config: CloudinaryConfig,
    private readonly clock: Clock,
    /** Injected so a test can drive the driver without a network. */
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  accepts(visibility: AssetVisibility): boolean {
    return visibility === 'public';
  }

  async put(input: PutAssetInput): Promise<StoredAsset> {
    const rules = assetRules(input.kind);
    if (!this.accepts(rules.visibility)) {
      // A programming error, not a runtime condition: the router is supposed to
      // have sent this elsewhere. Failing loudly beats quietly publishing a
      // private file to a CDN.
      throw new StorageError(
        `Cloudinary cannot hold a ${rules.visibility} asset (${input.kind}).`,
      );
    }

    const publicId = this.publicId(input.schoolId, input.kind);
    const timestamp = cloudinaryTimestamp(this.clock.now());

    const signed = {
      public_id: publicId,
      timestamp,
      overwrite: true,
      // Purge the CDN edge for the old bytes. Without it the previous logo can
      // be served for hours after it was replaced, from caches nobody can see.
      invalidate: true,
    } as const;

    const form = new FormData();
    form.set('file', new Blob([new Uint8Array(input.bytes)], { type: input.mimeType }));
    form.set('api_key', this.config.apiKey);
    for (const [name, value] of Object.entries(signed)) {
      form.set(name, String(value));
    }
    form.set('signature', signCloudinaryParams(signed, this.config.apiSecret));

    const body = await this.call<UploadResponse>('upload', form);

    return {
      key: publicId,
      url: body.secure_url,
      provider: this.driver,
      // Cloudinary's own count, not ours. If it re-encoded, this is the size
      // that will actually be served.
      byteSize: body.bytes,
    };
  }

  locate(ref: StoredAssetRef): Promise<AssetLocation> {
    if (ref.url === null || ref.url === '') {
      // A row that names this provider but carries no URL cannot be served.
      // Better a 404 the logs explain than a redirect to nowhere.
      return Promise.reject(
        new StorageError(`Cloudinary asset "${ref.key}" has no delivery URL recorded.`),
      );
    }

    return Promise.resolve({ kind: 'redirect', url: ref.url });
  }

  async remove(ref: StoredAssetRef): Promise<void> {
    const timestamp = cloudinaryTimestamp(this.clock.now());
    const signed = { public_id: ref.key, timestamp, invalidate: true } as const;

    const form = new FormData();
    form.set('api_key', this.config.apiKey);
    for (const [name, value] of Object.entries(signed)) {
      form.set(name, String(value));
    }
    form.set('signature', signCloudinaryParams(signed, this.config.apiSecret));

    const body = await this.call<DestroyResponse>('destroy', form);

    // `not found` is success here: the request was "make sure this is gone",
    // and an object that never existed satisfies it. Anything else is a real
    // failure and must not be swallowed, or a school that removed its logo
    // keeps serving it.
    if (body.result !== 'ok' && body.result !== 'not found') {
      throw new StorageError(`Cloudinary refused to delete "${ref.key}": ${body.result}`);
    }
  }

  /** `{prefix}/schools/{schoolId}/{folder}` — tenant-scoped, deterministic. */
  private publicId(schoolId: string, kind: AssetKind): string {
    return `${this.config.prefix}/schools/${schoolId}/${assetRules(kind).folder}`;
  }

  /**
   * One HTTP call, with the failure handling every call needs.
   *
   * A storage provider is a network dependency on the path of a person pressing
   * Save, so it gets a timeout — without one, a provider that stops answering
   * turns into held connections and a request that never returns.
   */
  private async call<T>(action: 'upload' | 'destroy', form: FormData): Promise<T> {
    const url = `https://api.cloudinary.com/v1_1/${this.config.cloudName}/image/${action}`;

    let response: Response;
    try {
      response = await this.fetchImpl(url, {
        method: 'POST',
        body: form,
        signal: AbortSignal.timeout(this.config.timeoutMs),
      });
    } catch (cause) {
      throw new StorageError(`Could not reach Cloudinary to ${action} the image.`, { cause });
    }

    if (!response.ok) {
      // Cloudinary puts a sentence in `error.message`. It is for the log: it
      // can name the public id, and a public id names a school.
      const detail = await response
        .json()
        .then((payload) => (payload as ErrorResponse).error?.message ?? response.statusText)
        .catch(() => response.statusText);

      throw new StorageError(`Cloudinary ${action} failed (${String(response.status)}): ${detail}`);
    }

    return (await response.json()) as T;
  }
}

interface UploadResponse {
  readonly secure_url: string;
  readonly public_id: string;
  readonly bytes: number;
  readonly version: number;
}

interface DestroyResponse {
  readonly result: string;
}

interface ErrorResponse {
  readonly error?: { readonly message?: string };
}
