import { describe, expect, it } from 'vitest';

import { loadEnv } from './env';

/**
 * The environment, and what it refuses to start on.
 *
 * docs/03 §8: the process refuses to start on an invalid environment, because a
 * misconfigured production start is worse than a failed one. These tests cover
 * the storage half of that (ADR-0013), where the failure mode is particular: a
 * deployment that names a driver it cannot reach accepts uploads happily until
 * the first one, which is a term's worth of traffic later and somebody else's
 * afternoon.
 */

/** Everything the schema requires, so a case can vary one thing. */
const BASE = {
  DATABASE_URL: 'postgresql://app@localhost:5432/ilm',
  DATABASE_ADMIN_URL: 'postgresql://postgres@localhost:5432/ilm',
  JWT_ACCESS_SECRET: 'x'.repeat(32),
} satisfies NodeJS.ProcessEnv;

describe('storage configuration', () => {
  it('defaults to the database driver, so nothing needs an account', () => {
    // Local development and CI. An upload must work with no secret configured,
    // rather than failing with "storage not configured".
    expect(loadEnv({ ...BASE }).STORAGE_DRIVER).toBe('database');
  });

  it('refuses to start on `cloudinary` with no credentials', () => {
    expect(() => loadEnv({ ...BASE, STORAGE_DRIVER: 'cloudinary' })).toThrow(/CLOUDINARY_/);
  });

  it('names every missing credential at once, not one per restart', () => {
    try {
      loadEnv({ ...BASE, STORAGE_DRIVER: 'cloudinary', CLOUDINARY_CLOUD_NAME: 'demo' });
      expect.unreachable('should have refused');
    } catch (error) {
      const message = (error as Error).message;
      expect(message).toContain('CLOUDINARY_API_KEY');
      expect(message).toContain('CLOUDINARY_API_SECRET');
      // The one that was supplied is not complained about.
      expect(message).not.toContain('CLOUDINARY_CLOUD_NAME');
    }
  });

  it('accepts a complete Cloudinary configuration', () => {
    const env = loadEnv({
      ...BASE,
      STORAGE_DRIVER: 'cloudinary',
      CLOUDINARY_CLOUD_NAME: 'demo',
      CLOUDINARY_API_KEY: '123456789012345',
      CLOUDINARY_API_SECRET: 'secret',
      CLOUDINARY_FOLDER: 'production',
    });

    expect(env.STORAGE_DRIVER).toBe('cloudinary');
    expect(env.CLOUDINARY_FOLDER).toBe('production');
    expect(env.CLOUDINARY_TIMEOUT_MS).toBe(15_000);
  });

  it('ignores stray Cloudinary credentials while the driver is `database`', () => {
    // A deployment that set the keys up but has not switched over yet. Nothing
    // should reach Cloudinary, and nothing should complain.
    const env = loadEnv({ ...BASE, CLOUDINARY_CLOUD_NAME: 'demo' });
    expect(env.STORAGE_DRIVER).toBe('database');
  });

  it('refuses a timeout long enough to hold a request open', () => {
    // This sits on the path of a person pressing Save.
    expect(() => loadEnv({ ...BASE, CLOUDINARY_TIMEOUT_MS: '600000' })).toThrow();
    expect(() => loadEnv({ ...BASE, CLOUDINARY_TIMEOUT_MS: '10' })).toThrow();
  });
});
