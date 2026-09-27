import { ROUTES, type SchoolSettings } from '@ilm/contracts';
import { BRAND } from '@ilm/utils';
import type { Metadata } from 'next';

import { ChallanPrintView } from '@/components/challan-print-view';
import { apiFetch } from '@/lib/api';
import { requireSchoolSession } from '@/lib/require-session';

export const metadata: Metadata = { title: `Print challans — ${BRAND.name}` };

/**
 * The print view for a stack of challans.
 *
 * Deliberately **not** inside `AppShell`. The shell is a fixed viewport frame
 * with its own scrollport, which is exactly wrong for a document that is meant
 * to flow down a page and break across sheets — and the sidebar has no business
 * being in the print layout at all.
 *
 * The school's letterhead is fetched here, once, on the server. It is the same
 * three fields on every one of the challans below, so sending it down with the
 * page beats repeating it on five hundred rows of the response.
 */
export default async function PrintVouchersPage() {
  await requireSchoolSession();

  const result = await apiFetch<{ data: SchoolSettings }>(ROUTES.school.settings);
  const settings = result.ok ? result.data.data : undefined;

  return (
    <ChallanPrintView
      school={{
        name: settings?.name ?? '',
        address: settings?.address ?? undefined,
        phone: settings?.phone ?? undefined,
      }}
    />
  );
}
