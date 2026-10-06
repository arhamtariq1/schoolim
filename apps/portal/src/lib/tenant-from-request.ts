import { COOKIES } from '@ilm/contracts';
import { schoolSlugFromHost } from '@ilm/utils';
import { cookies, headers } from 'next/headers';

import { TENANT_MODE } from '@/lib/tenant-mode';

/** School slug for building tenant-prefixed links in server components. */
export async function tenantSlugFromHeaders(): Promise<string | undefined> {
  const [jar, incoming] = await Promise.all([cookies(), headers()]);
  if (TENANT_MODE === 'path') {
    return jar.get(COOKIES.school)?.value;
  }
  const appDomain = process.env['APP_DOMAIN'] ?? 'localhost';
  return schoolSlugFromHost(incoming.get('host') ?? undefined, appDomain);
}
