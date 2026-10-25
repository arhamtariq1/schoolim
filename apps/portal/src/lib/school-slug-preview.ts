import { TENANT_MODE } from '@/lib/tenant-mode';

/**
 * Human-readable platform host for slug previews — never `slug.localhost`.
 *
 * Set `NEXT_PUBLIC_PORTAL_DOMAIN` in production (e.g. `schoolim.app`). In local
 * dev, a neutral placeholder is shown instead of the machine hostname.
 */
export function platformPortalDomain(): string {
  const configured = process.env['NEXT_PUBLIC_PORTAL_DOMAIN'];
  if (configured !== undefined && configured.trim() !== '') {
    return configured.trim();
  }
  const appDomain = process.env['NEXT_PUBLIC_APP_DOMAIN'] ?? 'localhost';
  if (appDomain !== 'localhost') {
    return appDomain;
  }
  return 'yourplatform.com';
}

/** Prefix/suffix around the editable slug segment (subdomain vs path mode). */
export function schoolSlugAffixes(): { prefix: string; suffix: string } {
  const domain = platformPortalDomain();
  if (TENANT_MODE === 'path') {
    return { prefix: `${domain}/`, suffix: '' };
  }
  return { prefix: '', suffix: `.${domain}` };
}
