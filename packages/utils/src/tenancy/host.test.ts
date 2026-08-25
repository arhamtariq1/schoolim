import { describe, expect, it } from 'vitest';

import { schoolSlugFromHost } from './host';

const DOMAIN = 'example.pk';

describe('schoolSlugFromHost', () => {
  it('reads the slug from a subdomain', () => {
    expect(schoolSlugFromHost('beacon.example.pk', DOMAIN)).toBe('beacon');
    expect(schoolSlugFromHost('beacon.example.pk:443', DOMAIN)).toBe('beacon');
    expect(schoolSlugFromHost('BEACON.EXAMPLE.PK', DOMAIN)).toBe('beacon');
  });

  it('returns nothing for the apex domain', () => {
    expect(schoolSlugFromHost('example.pk', DOMAIN)).toBeUndefined();
  });

  it('returns nothing for a reserved subdomain', () => {
    // `admin` is the platform console, not a school called "admin".
    for (const reserved of ['www', 'api', 'admin', 'status']) {
      expect(schoolSlugFromHost(`${reserved}.example.pk`, DOMAIN)).toBeUndefined();
    }
  });

  it('refuses a nested label rather than taking the first one', () => {
    // Treating `a.b.example.pk` as school `a` would let anyone holding a wildcard
    // certificate select any school by prefixing labels.
    expect(schoolSlugFromHost('a.b.example.pk', DOMAIN)).toBeUndefined();
  });

  it('refuses a host outside the configured domain', () => {
    expect(schoolSlugFromHost('beacon.evil.test', DOMAIN)).toBeUndefined();
    // A suffix match must not be a substring match.
    expect(schoolSlugFromHost('beacon.notexample.pk', DOMAIN)).toBeUndefined();
    expect(schoolSlugFromHost('example.pk.evil.test', DOMAIN)).toBeUndefined();
  });

  it('handles a missing or empty host', () => {
    expect(schoolSlugFromHost(undefined, DOMAIN)).toBeUndefined();
    expect(schoolSlugFromHost('', DOMAIN)).toBeUndefined();
    expect(schoolSlugFromHost('.example.pk', DOMAIN)).toBeUndefined();
  });

  it('works against a localhost domain in development', () => {
    expect(schoolSlugFromHost('beacon.localhost:3000', 'localhost')).toBe('beacon');
    expect(schoolSlugFromHost('localhost:3000', 'localhost')).toBeUndefined();
  });
});
