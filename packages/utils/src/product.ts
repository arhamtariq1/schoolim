/**
 * Product identity.
 *
 * The product name is decision D4 and is still open (docs/15 Part C). The
 * placeholder `ilm` is permitted ONLY in the npm scope, the cookie prefix, the
 * and the local database name. Every user-visible string —
 * UI copy, emails, PDFs, seeded message templates — reads from here, so
 * renaming the product is one edit rather than a find-and-replace across the
 * repository. CI greps for violations.
 */
export const BRAND = {
  /** Display name, used in UI copy, emails and PDF headers. */
  name: 'Ilm',
  /** Legal entity name, used on invoices. Set when the company is registered (docs/19). */
  legalName: 'Ilm',
  /** Apex domain. Set when D4 is decided. */
  domain: 'example.invalid',
  supportEmail: 'support@example.invalid',
} as const;

export type BrandConfig = typeof BRAND;
