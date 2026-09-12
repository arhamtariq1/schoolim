import { redirect } from 'next/navigation';

import { tenantHref } from '@/lib/tenant-server';

/**
 * Fees has no landing page of its own.
 *
 * The section is five screens and none of them is a summary, so an index
 * listing the same five links the sidebar already shows would be a page whose
 * only purpose is to be clicked through. The voucher list is where anyone
 * opening "Fees" actually means to go — what has been billed, and what is owed
 * — so they go straight there.
 */
export default async function FeesPage() {
  redirect(await tenantHref('/fees/vouchers'));
}
