import { describe, expect, it } from 'vitest';

import { schoolOrigin } from './school-origin';

/**
 * Every absolute link the API mails or hands to a browser comes from here: the
 * sign-in handoff, the email-confirmation link, and the login URL the platform
 * console shows after creating a school. Getting it wrong does not throw — it
 * sends somebody to an address that does not exist, which they discover from an
 * email, later, with no way to tell what went wrong.
 */
describe('subdomain mode — the default', () => {
  it('is https on the school subdomain', () => {
    expect(schoolOrigin('beacon', 'example.pk')).toBe('https://beacon.example.pk');
  });

  it('stays on subdomains when the mode is not passed at all', () => {
    // Every existing call site relied on the three-argument form. The default
    // has to keep them exactly where they were.
    expect(schoolOrigin('beacon', 'example.pk', 'https://example.pk')).toBe(
      'https://beacon.example.pk',
    );
  });

  it('is http with the portal port on localhost', () => {
    expect(schoolOrigin('demo', 'localhost', 'http://localhost:3000')).toBe(
      'http://demo.localhost:3000',
    );
  });

  it('reads the port from WEB_URL rather than assuming 3000', () => {
    expect(schoolOrigin('demo', 'localhost', 'http://localhost:4321')).toBe(
      'http://demo.localhost:4321',
    );
  });

  it('survives a malformed WEB_URL instead of taking sign-in down', () => {
    expect(schoolOrigin('demo', 'localhost', 'not a url')).toBe('http://demo.localhost:3000');
  });
});

describe('path mode — the temporary single-host deployment', () => {
  it('puts the school on the end of the portal URL', () => {
    expect(
      schoolOrigin('beacon', 'example.pk', 'https://schoolim-portal.vercel.app', 'path'),
    ).toBe('https://schoolim-portal.vercel.app/beacon');
  });

  it('ignores APP_DOMAIN entirely, because there is no subdomain to build', () => {
    // The bug this catches: leaving APP_DOMAIN at `localhost` on a deployed
    // host produced `http://beacon.localhost:3000` in a production email.
    expect(schoolOrigin('beacon', 'localhost', 'https://portal.example.app', 'path')).toBe(
      'https://portal.example.app/beacon',
    );
  });

  it('does not double the slash when WEB_URL has a trailing one', () => {
    expect(schoolOrigin('beacon', 'example.pk', 'https://portal.example.app/', 'path')).toBe(
      'https://portal.example.app/beacon',
    );
  });

  it('falls back to the local portal when WEB_URL is missing', () => {
    expect(schoolOrigin('beacon', 'example.pk', undefined, 'path')).toBe(
      'http://localhost:3000/beacon',
    );
  });

  it('produces a link the portal can actually route', () => {
    // What the handoff appends. `/beacon/auth/continue` is exactly what
    // `tenantSlugFromPathname` reads a school out of on the portal side.
    const origin = schoolOrigin('beacon', 'example.pk', 'https://portal.example.app', 'path');

    expect(`${origin}/auth/continue?t=abc`).toBe(
      'https://portal.example.app/beacon/auth/continue?t=abc',
    );
    expect(`${origin}/verify-email?t=abc`).toBe(
      'https://portal.example.app/beacon/verify-email?t=abc',
    );
  });
});
