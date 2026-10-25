import { describe, expect, it } from 'vitest';

import { parseServiceAccount } from './fcm.pusher';

/**
 * Reading the Firebase credential out of the environment.
 *
 * This is the one piece of the push driver that cannot be checked by looking at
 * it. A malformed private key type-checks, boots, and fails at the first push
 * with a `crypto` error that names neither the variable it came from nor the
 * file it was pasted into — so the parsing rules are pinned here instead.
 */

/** A PEM shape, short enough to read in a failure message. */
const PEM = '-----BEGIN PRIVATE KEY-----\nMIIEvQ==\n-----END PRIVATE KEY-----\n';

function credential(privateKey: string): string {
  return JSON.stringify({
    project_id: 'demo-school',
    client_email: 'push@demo-school.iam.gserviceaccount.com',
    private_key: privateKey,
  });
}

describe('the service-account key', () => {
  it('keeps a correctly escaped key exactly as it is', () => {
    // `JSON.parse` has already turned `\n` into real newlines by this point.
    expect(parseServiceAccount(credential(PEM)).private_key).toBe(PEM);
  });

  it('repairs a key that was double-escaped on its way into .env', () => {
    // The common paste mistake: `\\n` in the file survives parsing as a literal
    // backslash and an `n`, which `crypto` cannot read as a PEM.
    //
    // This is the case the driver always claimed to handle and did not: the
    // replacement matched a newline and put a newline back, so the key reached
    // Firebase still broken.
    const doubleEscaped = PEM.replace(/\n/g, String.raw`\n`);
    expect(doubleEscaped).toContain(String.raw`\n`);

    expect(parseServiceAccount(credential(doubleEscaped)).private_key).toBe(PEM);
  });

  it('refuses a credential missing any field it signs with', () => {
    // At boot, where it can be acted on — not at the first push, weeks later.
    for (const incomplete of [
      { project_id: 'x', client_email: 'y' },
      { project_id: 'x', private_key: PEM },
      { client_email: 'y', private_key: PEM },
      {},
    ]) {
      expect(() => parseServiceAccount(JSON.stringify(incomplete))).toThrow(
        /project_id, client_email and private_key/,
      );
    }
  });

  it('refuses something that is not an object at all', () => {
    for (const bad of ['null', '"a string"', '42', '[]']) {
      expect(() => parseServiceAccount(bad)).toThrow();
    }
  });

  it('refuses text that is not JSON, rather than booting half-configured', () => {
    expect(() => parseServiceAccount('not json at all')).toThrow();
  });
});
