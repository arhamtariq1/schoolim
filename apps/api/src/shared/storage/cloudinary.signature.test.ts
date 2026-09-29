import { createHash } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import { cloudinaryTimestamp, signCloudinaryParams } from './cloudinary.signature';

/**
 * The signature.
 *
 * This is the one piece of the storage layer that cannot be checked by reading
 * it: a wrong signature is accepted by every type in the codebase and rejected
 * by Cloudinary, at runtime, with `401 Invalid Signature` and no indication of
 * which rule was broken. So the rule is pinned here, clause by clause, against
 * hashes computed independently of the implementation.
 */

const SECRET = 'abcdefghijklmnopqrstuvwxyz123456';

/** The rule, written out longhand, so the test does not repeat the code. */
function expectedSignature(pairs: string, secret = SECRET): string {
  return createHash('sha1').update(`${pairs}${secret}`).digest('hex');
}

describe('signing a Cloudinary request', () => {
  it('signs sorted `k=v` pairs with the secret appended', () => {
    const signature = signCloudinaryParams(
      { timestamp: 1_700_000_000, public_id: 'schools/abc/logo' },
      SECRET,
    );

    expect(signature).toBe(
      expectedSignature('public_id=schools/abc/logo&timestamp=1700000000'),
    );
  });

  it('sorts by parameter name, not by insertion order', () => {
    // Two objects with the same parameters in a different order must produce
    // the same signature, or the same request signs differently depending on
    // how the object literal happened to be written.
    const one = signCloudinaryParams({ timestamp: 1, overwrite: true, public_id: 'a' }, SECRET);
    const other = signCloudinaryParams({ public_id: 'a', timestamp: 1, overwrite: true }, SECRET);

    expect(one).toBe(other);
    expect(one).toBe(expectedSignature('overwrite=true&public_id=a&timestamp=1'));
  });

  it('never signs the file, the key, the cloud or the resource type', () => {
    // These four travel with the request but outside the signature. Including
    // any of them is a 401 that looks like a wrong secret.
    const withExtras = signCloudinaryParams(
      {
        timestamp: 1,
        public_id: 'a',
        file: 'data:image/png;base64,AAAA',
        api_key: '123456789',
        cloud_name: 'demo',
        resource_type: 'image',
      },
      SECRET,
    );

    expect(withExtras).toBe(signCloudinaryParams({ timestamp: 1, public_id: 'a' }, SECRET));
  });

  it('drops empty values, because Cloudinary does', () => {
    // A signed `public_id=` against an omitted one is a mismatch, and the empty
    // string is what an optional field looks like when it is not set.
    const withEmpty = signCloudinaryParams({ timestamp: 1, public_id: '', folder: undefined }, SECRET);

    expect(withEmpty).toBe(expectedSignature('timestamp=1'));
  });

  it('keeps `false` and `0`, which are values rather than absences', () => {
    // `invalidate=false` is a real instruction. Filtering falsy rather than
    // empty would silently drop it and sign a different request than the one
    // sent.
    expect(signCloudinaryParams({ timestamp: 0, invalidate: false }, SECRET)).toBe(
      expectedSignature('invalidate=false&timestamp=0'),
    );
  });

  it('changes with the secret', () => {
    const params = { timestamp: 1, public_id: 'a' };
    expect(signCloudinaryParams(params, SECRET)).not.toBe(
      signCloudinaryParams(params, `${SECRET}-other`),
    );
  });
});

describe('the timestamp', () => {
  it('is whole seconds since the epoch', () => {
    // Cloudinary rejects a float. It also accepts a signed request only within
    // about an hour of its timestamp, which is the replay window.
    expect(cloudinaryTimestamp(new Date('2026-09-30T12:00:00.750Z'))).toBe(1_790_769_600);
  });

  it('truncates rather than rounds, so it never sits in the future', () => {
    const at = new Date('2026-09-30T12:00:00.999Z');
    expect(cloudinaryTimestamp(at)).toBe(Math.floor(at.getTime() / 1000));
  });
});
