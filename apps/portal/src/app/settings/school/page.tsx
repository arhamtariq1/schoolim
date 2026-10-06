import { redirect } from 'next/navigation';

import { tenantHref } from '@/lib/tenant-server';

/** School settings now live under Profile. */
export default async function SchoolSettingsRedirectPage() {
  redirect(await tenantHref('/profile/edit'));
}
