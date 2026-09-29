import { describe, expect, it } from 'vitest';

import { DatabaseStore } from './database.store';
import {
  STORAGE_PROVIDERS,
  StorageError,
  type AssetLocation,
  type PutAssetInput,
  type StoragePort,
  type StoredAsset,
  type StoredAssetRef,
} from './storage.port';
import { StorageRouter } from './storage.router';

/**
 * Which driver holds which file.
 *
 * Two rules are being pinned, and only one of them is about convenience.
 *
 * The first is that a **private** asset never reaches a CDN. That is not a
 * preference — a file on a public delivery URL is fetchable by anyone who
 * learns the URL, and "we will remember to mark it private" is not a control.
 * The catalogue declares visibility and the router obeys it, so the mistake is
 * not expressible rather than merely discouraged.
 *
 * The second is that **reading follows the row, not the configuration**. A
 * deployment that turns object storage on still holds everything uploaded
 * before it. If reads dispatched on the configured driver, that switch would
 * blank every school's letterhead at once — silently, because a missing image
 * raises nothing.
 */

/** A remote driver that records what it was asked to do, and touches no network. */
class FakeRemote implements StoragePort {
  readonly driver = STORAGE_PROVIDERS.cloudinary;
  readonly puts: PutAssetInput[] = [];
  readonly removals: StoredAssetRef[] = [];

  accepts(visibility: 'public' | 'private'): boolean {
    return visibility === 'public';
  }

  put(input: PutAssetInput): Promise<StoredAsset> {
    this.puts.push(input);
    return Promise.resolve({
      key: `remote/${input.schoolId}/${input.kind}`,
      url: 'https://cdn.example/test.png',
      provider: this.driver,
      byteSize: input.bytes.byteLength,
    });
  }

  locate(ref: StoredAssetRef): Promise<AssetLocation> {
    return Promise.resolve({ kind: 'redirect', url: ref.url ?? '' });
  }

  remove(ref: StoredAssetRef): Promise<void> {
    this.removals.push(ref);
    return Promise.resolve();
  }
}

const SCHOOL = '33333333-3333-4333-8333-333333333333';

function put(kind: 'SCHOOL_LOGO' | 'BANK_LOGO'): PutAssetInput {
  return {
    kind,
    schoolId: SCHOOL,
    bytes: Buffer.from([0x89, 0x50, 0x4e, 0x47]),
    mimeType: 'image/png',
    etag: 'abc123',
  };
}

describe('choosing where a new file goes', () => {
  it('sends a public asset to the remote driver when one is configured', async () => {
    const remote = new FakeRemote();
    const router = new StorageRouter(new DatabaseStore(), remote);

    const stored = await router.put(put('SCHOOL_LOGO'));

    expect(stored.provider).toBe(STORAGE_PROVIDERS.cloudinary);
    expect(remote.puts).toHaveLength(1);
  });

  it('keeps everything local when no remote driver is configured', async () => {
    // The default deployment, and the one CI runs. An upload must work with no
    // account and no secret, not fail with "storage not configured".
    const router = new StorageRouter(new DatabaseStore(), undefined);

    const stored = await router.put(put('SCHOOL_LOGO'));

    expect(stored.provider).toBe(STORAGE_PROVIDERS.database);
  });

  it('keeps a private asset local even with a remote driver configured', async () => {
    // Both catalogue entries are public today, so this drives the rule through
    // a driver that refuses everything — which is what a future `private` kind
    // will look like to the router.
    class RefusesEverything extends FakeRemote {
      override accepts(): boolean {
        return false;
      }
    }

    const router = new StorageRouter(new DatabaseStore(), new RefusesEverything());

    const stored = await router.put(put('SCHOOL_LOGO'));

    expect(stored.provider).toBe(STORAGE_PROVIDERS.database);
  });
});

describe('finding a file again', () => {
  const remoteRef: StoredAssetRef = {
    key: 'remote/a',
    url: 'https://cdn.example/a.png',
    provider: STORAGE_PROVIDERS.cloudinary,
  };

  it('reads a row by the provider that wrote it, not the one configured now', async () => {
    const router = new StorageRouter(new DatabaseStore(), new FakeRemote());

    const located = await router.locate(remoteRef);

    expect(located).toEqual({ kind: 'redirect', url: 'https://cdn.example/a.png' });
  });

  it('refuses, loudly, a row whose provider is no longer configured', async () => {
    // Credentials removed, or an environment restored from another's backup.
    // A named failure is something a log can explain; a broken image is not.
    const router = new StorageRouter(new DatabaseStore(), undefined);

    await expect(router.locate(remoteRef)).rejects.toBeInstanceOf(StorageError);
    await expect(router.locate(remoteRef)).rejects.toThrow(/not configured/);
  });

  it('deletes a remote object through the driver that wrote it', async () => {
    const remote = new FakeRemote();
    const router = new StorageRouter(new DatabaseStore(), remote);

    await router.remove(remoteRef);

    expect(remote.removals).toEqual([remoteRef]);
  });

  it('deletes a local row without calling the remote driver at all', async () => {
    const remote = new FakeRemote();
    const router = new StorageRouter(new DatabaseStore(), remote);

    await router.remove({ key: 'db:x', url: null, provider: STORAGE_PROVIDERS.database });

    expect(remote.removals).toEqual([]);
  });
});

describe('what the router reports', () => {
  it('names the remote driver when there is one, and the local one otherwise', () => {
    expect(new StorageRouter(new DatabaseStore(), new FakeRemote()).driver).toBe('cloudinary');
    expect(new StorageRouter(new DatabaseStore(), undefined).driver).toBe('database');
  });
});
