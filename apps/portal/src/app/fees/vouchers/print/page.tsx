import {
  DEFAULT_VOUCHER_SETTINGS,
  ROUTES,
  type SchoolLogoInfo,
  type SchoolSettings,
  type VoucherSettings,
} from '@ilm/contracts';
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

  // Three independent reads, so the page costs one round trip's worth of
  // waiting rather than three. All of them are the same for every challan in
  // the stack, which is why they are fetched with the page and not per row.
  const [schoolResult, voucherResult, logoResult, bankLogoResult] = await Promise.all([
    apiFetch<{ data: SchoolSettings }>(ROUTES.school.settings),
    apiFetch<{ data: VoucherSettings }>(ROUTES.school.voucherSettings),
    apiFetch<{ data: SchoolLogoInfo }>(ROUTES.schoolLogo.info),
    apiFetch<{ data: SchoolLogoInfo }>(ROUTES.bankLogo.info),
  ]);

  const school = schoolResult.ok ? schoolResult.data.data : undefined;
  const settings: VoucherSettings = voucherResult.ok
    ? voucherResult.data.data
    : DEFAULT_VOUCHER_SETTINGS;
  const logo = logoResult.ok ? logoResult.data.data : undefined;
  const bankLogo = bankLogoResult.ok ? bankLogoResult.data.data : undefined;

  return (
    <ChallanPrintView
      school={{
        name: school?.name ?? '',
        address: school?.address ?? undefined,
        phone: school?.phone ?? undefined,
        // Undefined when the school has never uploaded one, which is what
        // makes the challan leave the space out rather than print a gap.
        logoVersion: logo?.present === true ? (logo.version ?? '') : undefined,
        bankLogoVersion: bankLogo?.present === true ? (bankLogo.version ?? '') : undefined,
        accentColor: school?.primaryColor ?? undefined,
      }}
      settings={settings}
    />
  );
}
