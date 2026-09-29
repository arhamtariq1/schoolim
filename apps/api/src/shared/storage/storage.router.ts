import { assetRules, type AssetVisibility } from '@ilm/contracts';

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
 * Which driver holds which file.
 *
 * ## Two rules, and neither is a deployment setting
 *
 * **Writing** is decided by the asset's own declared visibility. A `public`
 * asset goes to the remote driver when one is configured; a `private` one goes
 * to the database, always, whatever is configured. That is the whole reason
 * this class exists: it makes "a student photograph ends up on a public CDN"
 * impossible to express, rather than something a future screen has to remember
 * not to do. The declaration is in the catalogue, next to the size limit, where
 * whoever adds the next kind is already looking.
 *
 * **Reading** is decided by the row. Each asset records the provider that
 * wrote it, so a deployment that turns Cloudinary on keeps serving everything
 * uploaded before it — and one that turns it off keeps serving everything
 * uploaded during. Dispatching on the configured driver instead would mean
 * every school's logo disappearing on the day storage was reconfigured, which
 * is the kind of outage that arrives a week later when somebody notices.
 */
export class StorageRouter implements StoragePort {
  constructor(
    private readonly local: StoragePort,
    /** Absent when nothing is configured, which is a valid deployment. */
    private readonly remote: StoragePort | undefined,
  ) {}

  get driver(): string {
    return this.remote?.driver ?? this.local.driver;
  }

  accepts(_visibility: AssetVisibility): boolean {
    // Between them the two drivers cover both visibilities; the local one
    // accepts anything.
    return true;
  }

  put(input: PutAssetInput): Promise<StoredAsset> {
    return this.forWriting(assetRules(input.kind).visibility).put(input);
  }

  // `async`, so that an unconfigured provider comes back as a rejected promise
  // rather than a synchronous throw. A method that returns a Promise must fail
  // as one: a caller reaching for `.catch()` would never see the other kind.
  async locate(ref: StoredAssetRef): Promise<AssetLocation> {
    return this.forReading(ref).locate(ref);
  }

  async remove(ref: StoredAssetRef): Promise<void> {
    return this.forReading(ref).remove(ref);
  }

  /** The driver that may hold a new asset of this visibility. */
  private forWriting(visibility: AssetVisibility): StoragePort {
    if (this.remote !== undefined && this.remote.accepts(visibility)) {
      return this.remote;
    }
    return this.local;
  }

  /**
   * The driver that wrote a given row.
   *
   * A row naming a provider this deployment no longer has configured is a real
   * situation — credentials removed, or an environment restored from another's
   * backup — and it has to fail as something a log can explain rather than as a
   * broken image with no cause.
   */
  private forReading(ref: StoredAssetRef): StoragePort {
    if (ref.provider === STORAGE_PROVIDERS.database) {
      return this.local;
    }

    if (this.remote?.driver === ref.provider) {
      return this.remote;
    }

    throw new StorageError(
      `Asset "${ref.key}" was stored by "${ref.provider}", which is not configured on this deployment.`,
    );
  }
}
