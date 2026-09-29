import { createHash } from 'node:crypto';

/**
 * Signing a Cloudinary request.
 *
 * Every call that changes something — upload, destroy — carries a signature
 * proving it came from someone holding the API secret. The secret itself never
 * leaves this process: it is not in the browser, not in an env var the portal
 * can read, and not in the signed payload.
 *
 * ## The rule, exactly
 *
 * Take every parameter **except** `file`, `cloud_name`, `resource_type` and
 * `api_key`; drop the empty ones; sort by name; join as `k=v` with `&`; append
 * the API secret; SHA-1; hex.
 *
 * Each of those exclusions is a real failure if missed. `file` is the payload
 * and is never signed. `api_key` travels beside the signature rather than
 * inside it. `cloud_name` and `resource_type` are in the URL, not the body.
 * Getting any of it wrong produces exactly one symptom — `401 Invalid
 * Signature` — which says nothing about which rule was broken, so the rule is
 * implemented once, here, and tested against the vectors in `.test.ts`.
 */
export function signCloudinaryParams(
  params: Readonly<Record<string, string | number | boolean | undefined>>,
  apiSecret: string,
): string {
  const signable = Object.entries(params)
    .filter(([name]) => !UNSIGNED.has(name))
    // Cloudinary omits empty values from the signature, so we must too — a
    // signed `public_id=` against an omitted one is a mismatch.
    .filter(([, value]) => value !== undefined && value !== '')
    .map(([name, value]) => [name, String(value)] as const)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([name, value]) => `${name}=${value}`)
    .join('&');

  return createHash('sha1')
    .update(`${signable}${apiSecret}`)
    .digest('hex');
}

/**
 * Parameters that are part of the request but never part of the signature.
 *
 * A `Set`, so adding one is a one-line change rather than a longer boolean.
 */
const UNSIGNED = new Set(['file', 'cloud_name', 'resource_type', 'api_key']);

/**
 * Seconds since the epoch, which is what Cloudinary's `timestamp` is.
 *
 * A signed request is accepted within about an hour of its timestamp, so this
 * is also the replay window. Taken from the injected clock rather than
 * `Date.now()` so that a test can pin it — `new Date()` is banned in this
 * codebase for exactly this reason.
 */
export function cloudinaryTimestamp(now: Date): number {
  return Math.trunc(now.getTime() / 1000);
}
