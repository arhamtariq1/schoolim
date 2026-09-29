import { type AssetVisibility } from '@ilm/contracts';

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
 * Bytes in Postgres.
 *
 * ## Not a stub
 *
 * This is the default driver and it is a real one. A deployment with no
 * Cloudinary credentials stores logos exactly as this product did before there
 * was a storage layer at all, which means local development needs no account,
 * CI needs no secret, and a school that has already uploaded a logo keeps it
 * when a deployment switches drivers — `locate` is dispatched on the provider
 * recorded per row, not on whichever driver happens to be configured now.
 *
 * ## Where it is the *right* answer, not the fallback
 *
 * Anything `private`. A file in this table is behind row-level security, scoped
 * to a school by the same policy as every other row, and cannot be reached by
 * URL at all. A CDN cannot say that. So the router sends private assets here
 * whatever the configured driver is, and this driver accepts both
 * visibilities — see `accepts`.
 *
 * The cost is that the bytes travel with the database: backups, replicas and
 * the connection pool. At half a megabyte per school that is not a workload.
 * At a student photograph per child it would be, which is why the public path
 * exists.
 */
export class DatabaseStore implements StoragePort {
  readonly driver = STORAGE_PROVIDERS.database;

  /** Bytes under RLS can hold anything; a CDN cannot hold what is private. */
  accepts(_visibility: AssetVisibility): boolean {
    return true;
  }

  /**
   * The row is written by the caller, which owns the table.
   *
   * This driver has nowhere else to put the bytes, so `put` hands them back
   * inside the key rather than performing any I/O of its own. The key is the
   * caller's own row identity — it has one already — so there is nothing here
   * to leak, expire or orphan.
   */
  put(input: PutAssetInput): Promise<StoredAsset> {
    return Promise.resolve({
      key: localKey(input.schoolId, input.kind),
      url: undefined,
      provider: this.driver,
      byteSize: input.bytes.byteLength,
    });
  }

  locate(_ref: StoredAssetRef): Promise<AssetLocation> {
    // The bytes live in the same row as the reference, so the caller already
    // has them and never asks this driver for them. Reaching here means a row
    // recorded `database` but the caller took the remote path, which is a bug
    // worth a loud failure rather than a blank image.
    return Promise.reject(
      new StorageError('A database-backed asset is read from its own row, not through locate().'),
    );
  }

  remove(_ref: StoredAssetRef): Promise<void> {
    // Deleting the row deletes the bytes. Nothing outlives it.
    return Promise.resolve();
  }
}

/**
 * A stable name for a locally-stored asset.
 *
 * It addresses nothing — the bytes are found by the row — but it keeps the
 * `storage_key` column non-null for every provider, so "which asset is this"
 * has one answer in the table regardless of where the bytes went.
 */
export function localKey(schoolId: string, kind: string): string {
  return `db:${schoolId}:${kind}`;
}
