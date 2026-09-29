import { describe, expect, it } from 'vitest';

import { signCloudinaryParams } from './cloudinary.signature';
import { CloudinaryStore, type CloudinaryConfig } from './cloudinary.store';
import { StorageError, type PutAssetInput } from './storage.port';

/**
 * The Cloudinary driver, without Cloudinary.
 *
 * `fetch` is injected, so everything this file asserts is what would go over
 * the wire: the tenant-scoped public id, the flags that make a replacement
 * overwrite rather than orphan, the signature travelling beside the key rather
 * than inside it, and the failure handling.
 *
 * None of it can be checked by reading the code — a request that is wrong in
 * any of these ways compiles, types, and fails only against a live account,
 * usually as `401 Invalid Signature`, which says nothing about which part was
 * wrong.
 */

const CONFIG: CloudinaryConfig = {
  cloudName: 'demo-cloud',
  apiKey: '123456789012345',
  apiSecret: 'abcdefghijklmnopqrstuvwxyz123456',
  prefix: 'production',
  timeoutMs: 5_000,
};

const NOW = new Date('2026-09-30T12:00:00.000Z');
const clock = { now: () => NOW };

const SCHOOL = '33333333-3333-4333-8333-333333333333';

const PUT: PutAssetInput = {
  kind: 'SCHOOL_LOGO',
  schoolId: SCHOOL,
  bytes: Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  mimeType: 'image/png',
  etag: 'deadbeefdeadbeef',
};

/** Captures the one request the driver makes, and answers with `body`. */
function capturing(body: unknown, init: ResponseInit = { status: 200 }) {
  const seen: { url?: string; form?: FormData } = {};

  const fetchImpl: typeof fetch = (url, options) => {
    // The driver only ever calls it with a string URL and a FormData body.
    seen.url = url as string;
    seen.form = options?.body as FormData;

    return Promise.resolve(
      new Response(JSON.stringify(body), {
        ...init,
        headers: { 'content-type': 'application/json' },
      }),
    );
  };

  return { seen, fetchImpl };
}

const UPLOADED = {
  secure_url: 'https://res.cloudinary.com/demo-cloud/image/upload/v17/production/x.png',
  public_id: 'production/schools/x/logo',
  bytes: 8,
  version: 17,
};

describe('uploading', () => {
  it('addresses the account named in configuration', async () => {
    const { seen, fetchImpl } = capturing(UPLOADED);
    await new CloudinaryStore(CONFIG, clock, fetchImpl).put(PUT);

    expect(seen.url).toBe('https://api.cloudinary.com/v1_1/demo-cloud/image/upload');
  });

  it('puts the school in the public id, so one tenant cannot address another', async () => {
    const { seen, fetchImpl } = capturing(UPLOADED);
    const stored = await new CloudinaryStore(CONFIG, clock, fetchImpl).put(PUT);

    expect(seen.form?.get('public_id')).toBe(`production/schools/${SCHOOL}/logo`);
    expect(stored.key).toBe(`production/schools/${SCHOOL}/logo`);
  });

  it('separates environments by prefix', async () => {
    // Two deployments sharing an account and a prefix means a staging upload
    // silently overwrites the production object with the same deterministic id.
    const { seen, fetchImpl } = capturing(UPLOADED);
    await new CloudinaryStore({ ...CONFIG, prefix: 'staging' }, clock, fetchImpl).put(PUT);

    expect(seen.form?.get('public_id')).toBe(`staging/schools/${SCHOOL}/logo`);
  });

  it('overwrites and invalidates, so a replacement cannot orphan or linger', async () => {
    const { seen, fetchImpl } = capturing(UPLOADED);
    await new CloudinaryStore(CONFIG, clock, fetchImpl).put(PUT);

    // Without `overwrite` the upload is rejected; without `invalidate` the old
    // bytes are served from CDN edges for hours after the logo changed.
    expect(seen.form?.get('overwrite')).toBe('true');
    expect(seen.form?.get('invalidate')).toBe('true');
  });

  it('sends the key beside the signature, and signs what it sent', async () => {
    const { seen, fetchImpl } = capturing(UPLOADED);
    await new CloudinaryStore(CONFIG, clock, fetchImpl).put(PUT);

    expect(seen.form?.get('api_key')).toBe(CONFIG.apiKey);
    expect(seen.form?.get('signature')).toBe(
      signCloudinaryParams(
        {
          public_id: `production/schools/${SCHOOL}/logo`,
          timestamp: 1_790_769_600,
          overwrite: true,
          invalidate: true,
        },
        CONFIG.apiSecret,
      ),
    );
  });

  it('never sends the API secret', async () => {
    // Anyone holding it can write to and delete from the account.
    const { seen, fetchImpl } = capturing(UPLOADED);
    await new CloudinaryStore(CONFIG, clock, fetchImpl).put(PUT);

    for (const [, value] of seen.form?.entries() ?? []) {
      expect(typeof value === 'string' ? value : value.name).not.toContain(CONFIG.apiSecret);
    }
  });

  it('records the provider’s own byte count, not ours', async () => {
    // Cloudinary may re-encode. The size that will actually be served is the
    // one worth storing.
    const { fetchImpl } = capturing({ ...UPLOADED, bytes: 4_096 });
    const stored = await new CloudinaryStore(CONFIG, clock, fetchImpl).put(PUT);

    expect(stored.byteSize).toBe(4_096);
    expect(stored.url).toBe(UPLOADED.secure_url);
    expect(stored.provider).toBe('cloudinary');
  });

  it('reports a refusal as a StorageError carrying the provider’s reason', async () => {
    const { fetchImpl } = capturing(
      { error: { message: 'Invalid Signature' } },
      { status: 401 },
    );

    await expect(new CloudinaryStore(CONFIG, clock, fetchImpl).put(PUT)).rejects.toThrow(
      /Invalid Signature/,
    );
  });

  it('reports an unreachable provider rather than hanging', async () => {
    const failing = (() => Promise.reject(new Error('ECONNREFUSED'))) as unknown as typeof fetch;

    await expect(new CloudinaryStore(CONFIG, clock, failing).put(PUT)).rejects.toBeInstanceOf(
      StorageError,
    );
  });
});

describe('deleting', () => {
  const ref = { key: 'production/schools/x/logo', url: 'https://cdn/x.png', provider: 'cloudinary' };

  it('signs the destroy and asks for the edges to be purged', async () => {
    const { seen, fetchImpl } = capturing({ result: 'ok' });
    await new CloudinaryStore(CONFIG, clock, fetchImpl).remove(ref);

    expect(seen.url).toBe('https://api.cloudinary.com/v1_1/demo-cloud/image/destroy');
    expect(seen.form?.get('public_id')).toBe(ref.key);
    expect(seen.form?.get('invalidate')).toBe('true');
  });

  it('treats "not found" as done, because the request was "make sure it is gone"', async () => {
    const { fetchImpl } = capturing({ result: 'not found' });
    await expect(new CloudinaryStore(CONFIG, clock, fetchImpl).remove(ref)).resolves.toBeUndefined();
  });

  it('does not swallow any other result', async () => {
    // A school that removed its logo and kept serving it is worse than an error.
    const { fetchImpl } = capturing({ result: 'error' });
    await expect(new CloudinaryStore(CONFIG, clock, fetchImpl).remove(ref)).rejects.toThrow(
      /refused to delete/,
    );
  });
});

describe('locating', () => {
  const store = new CloudinaryStore(CONFIG, clock);

  it('sends the browser to the recorded delivery URL', async () => {
    await expect(
      store.locate({ key: 'k', url: 'https://cdn/x.png', provider: 'cloudinary' }),
    ).resolves.toEqual({ kind: 'redirect', url: 'https://cdn/x.png' });
  });

  it('refuses a row with no URL rather than redirecting to nowhere', async () => {
    await expect(
      store.locate({ key: 'k', url: null, provider: 'cloudinary' }),
    ).rejects.toBeInstanceOf(StorageError);
  });
});

describe('what it will not hold', () => {
  it('accepts public assets only', () => {
    // These URLs are unauthenticated: knowing one is enough to fetch it. The
    // router is what keeps private assets away, and this is the second lock.
    const store = new CloudinaryStore(CONFIG, clock);

    expect(store.accepts('public')).toBe(true);
    expect(store.accepts('private')).toBe(false);
  });
});
