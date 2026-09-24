import { redirect } from 'next/navigation';

import { tenantHref } from '@/lib/tenant-server';

/**
 * Academics has no landing page of its own — the sidebar expands to Classes,
 * Sessions and Calendar. Bookmarks to `/academics` land on Classes.
 */
export default async function AcademicsIndexPage() {
  redirect(await tenantHref('/classes'));
}
