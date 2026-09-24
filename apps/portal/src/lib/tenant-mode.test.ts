import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The module reads `NEXT_PUBLIC_PORTAL_TENANT_MODE` at import time — deliberately,
 * so the mode cannot change under a running process — which means each test has
 * to set the variable and then re-import it.
 */
async function load(mode: string | undefined) {
  vi.resetModules();
  if (mode === undefined) {
    delete process.env['NEXT_PUBLIC_PORTAL_TENANT_MODE'];
  } else {
    process.env['NEXT_PUBLIC_PORTAL_TENANT_MODE'] = mode;
  }
  return import('./tenant-mode');
}

const original = process.env['NEXT_PUBLIC_PORTAL_TENANT_MODE'];

beforeEach(() => {
  delete process.env['NEXT_PUBLIC_PORTAL_TENANT_MODE'];
});

afterEach(() => {
  if (original === undefined) {
    delete process.env['NEXT_PUBLIC_PORTAL_TENANT_MODE'];
  } else {
    process.env['NEXT_PUBLIC_PORTAL_TENANT_MODE'] = original;
  }
});

describe('the mode itself', () => {
  it('is subdomain when nothing is set', async () => {
    const { TENANT_MODE } = await load(undefined);

    expect(TENANT_MODE).toBe('subdomain');
  });

  it('is path only for the exact literal', async () => {
    expect((await load('path')).TENANT_MODE).toBe('path');
  });

  it('falls back to subdomain on anything else, including near misses', async () => {
    // A typo must fail toward the mode with the stronger isolation. `Path`,
    // `paths` and `true` are all somebody meaning well and getting it wrong.
    for (const value of ['Path', 'paths', 'PATH', 'true', '1', 'subdomain', '']) {
      expect((await load(value)).TENANT_MODE, value).toBe('subdomain');
    }
  });
});

describe('subdomain mode leaves everything alone', () => {
  it('finds no slug in any path', async () => {
    const { tenantSlugFromPathname } = await load('subdomain');

    expect(tenantSlugFromPathname('/beacon/students')).toBeUndefined();
    expect(tenantSlugFromPathname('/students')).toBeUndefined();
  });

  it('strips nothing', async () => {
    const { withoutTenantPrefix } = await load('subdomain');

    // The important one: in subdomain mode a school genuinely could have a
    // route-shaped first segment and it must survive untouched.
    expect(withoutTenantPrefix('/beacon/students')).toBe('/beacon/students');
    expect(withoutTenantPrefix('/students')).toBe('/students');
  });

  it('prefixes nothing, even when handed a slug', async () => {
    const { withTenantPrefix } = await load('subdomain');

    expect(withTenantPrefix('/students', 'beacon')).toBe('/students');
    expect(withTenantPrefix('/', 'beacon')).toBe('/');
  });
});

describe('reading the school out of a path', () => {
  it('takes the first segment', async () => {
    const { tenantSlugFromPathname } = await load('path');

    expect(tenantSlugFromPathname('/beacon')).toBe('beacon');
    expect(tenantSlugFromPathname('/beacon/students')).toBe('beacon');
    expect(tenantSlugFromPathname('/beacon/students/abc-123')).toBe('beacon');
  });

  it('accepts hyphens and digits, which real slugs have', async () => {
    const { tenantSlugFromPathname } = await load('path');

    expect(tenantSlugFromPathname('/city-grammar-2/students')).toBe('city-grammar-2');
  });

  it('does not mistake one of our own routes for a school', async () => {
    // The bug this prevents: `/students` read as a school called "students",
    // which would send the register to a tenant that does not exist.
    const { tenantSlugFromPathname } = await load('path');

    for (const route of [
      '/students',
      '/fees/vouchers',
      '/attendance/mark/students',
      '/academics',
      '/classes',
      '/staff',
      '/finance/expenses',
      '/settings/fees',
      '/requests',
      '/login',
      '/signup',
      '/forgot-password',
      '/otp-verification',
      '/new-password',
      '/welcome',
      '/auth/continue',
      '/verify-email',
      '/api/v1/auth/login',
    ]) {
      expect(tenantSlugFromPathname(route), route).toBeUndefined();
    }
  });

  it('rejects anything that is not slug-shaped', async () => {
    const { tenantSlugFromPathname } = await load('path');

    expect(tenantSlugFromPathname('/')).toBeUndefined();
    expect(tenantSlugFromPathname('')).toBeUndefined();
    expect(tenantSlugFromPathname('/Beacon')).toBeUndefined();
    expect(tenantSlugFromPathname('/-beacon')).toBeUndefined();
    expect(tenantSlugFromPathname('/bea con')).toBeUndefined();
    expect(tenantSlugFromPathname('/bea.con')).toBeUndefined();
    expect(tenantSlugFromPathname('/..')).toBeUndefined();
  });
});

describe('stripping the prefix for the route tree', () => {
  it('turns a bare school into the dashboard', async () => {
    const { withoutTenantPrefix } = await load('path');

    expect(withoutTenantPrefix('/beacon')).toBe('/');
  });

  it('leaves the rest of the path exactly as it was', async () => {
    const { withoutTenantPrefix } = await load('path');

    expect(withoutTenantPrefix('/beacon/students')).toBe('/students');
    expect(withoutTenantPrefix('/beacon/attendance/mark/students')).toBe(
      '/attendance/mark/students',
    );
  });

  it('leaves an unprefixed path alone', async () => {
    const { withoutTenantPrefix } = await load('path');

    expect(withoutTenantPrefix('/login')).toBe('/login');
    expect(withoutTenantPrefix('/')).toBe('/');
  });
});

describe('prefixing a link', () => {
  it('sends the dashboard link to the school, not the landing page', async () => {
    // `/` is the marketing home on the apex and the school workspace inside a
    // school. Getting this wrong drops a signed-in person onto the sales page.
    const { withTenantPrefix } = await load('path');

    expect(withTenantPrefix('/', 'beacon')).toBe('/beacon');
  });

  it('prefixes ordinary app paths', async () => {
    const { withTenantPrefix } = await load('path');

    expect(withTenantPrefix('/students', 'beacon')).toBe('/beacon/students');
    expect(withTenantPrefix('/fees/vouchers', 'beacon')).toBe('/beacon/fees/vouchers');
  });

  it('never prefixes sign-in, signup or the marketing page', async () => {
    // Sign-in happens before a school is known — that is the whole premise of
    // the global sign-in. A prefixed /login would need the answer to find it.
    const { withTenantPrefix } = await load('path');

    expect(withTenantPrefix('/login', 'beacon')).toBe('/login');
    expect(withTenantPrefix('/signup', 'beacon')).toBe('/signup');
    expect(withTenantPrefix('/forgot-password', 'beacon')).toBe('/forgot-password');
    expect(withTenantPrefix('/otp-verification', 'beacon')).toBe('/otp-verification');
    expect(withTenantPrefix('/new-password', 'beacon')).toBe('/new-password');
    expect(withTenantPrefix('/welcome', 'beacon')).toBe('/welcome');
  });

  it('keeps the query string and the fragment', async () => {
    const { withTenantPrefix } = await load('path');

    expect(withTenantPrefix('/attendance/mark/students?date=2026-09-07', 'beacon')).toBe(
      '/beacon/attendance/mark/students?date=2026-09-07',
    );
    expect(withTenantPrefix('/students#top', 'beacon')).toBe('/beacon/students#top');
    expect(withTenantPrefix('/?verify=ok', 'beacon')).toBe('/beacon?verify=ok');
  });

  it('does not prefix twice', async () => {
    // A call site that prefixes, then hands the result to something that
    // prefixes again, would otherwise produce /beacon/beacon/students — a 404
    // rather than a visible mistake.
    const { withTenantPrefix } = await load('path');

    expect(withTenantPrefix(withTenantPrefix('/students', 'beacon'), 'beacon')).toBe(
      '/beacon/students',
    );
  });

  it('leaves anything that is not an internal path alone', async () => {
    const { withTenantPrefix } = await load('path');

    expect(withTenantPrefix('https://example.com/x', 'beacon')).toBe('https://example.com/x');
    expect(withTenantPrefix('mailto:a@b.test', 'beacon')).toBe('mailto:a@b.test');
    expect(withTenantPrefix('#section', 'beacon')).toBe('#section');
  });

  it('is a no-op when no school is known', async () => {
    const { withTenantPrefix } = await load('path');

    expect(withTenantPrefix('/students', undefined)).toBe('/students');
    expect(withTenantPrefix('/students', '')).toBe('/students');
  });

  it('round-trips with the stripper', async () => {
    const { withTenantPrefix, withoutTenantPrefix } = await load('path');

    for (const path of ['/', '/students', '/fees/vouchers', '/attendance/mark/students']) {
      expect(withoutTenantPrefix(withTenantPrefix(path, 'beacon')), path).toBe(path);
    }
  });
});
