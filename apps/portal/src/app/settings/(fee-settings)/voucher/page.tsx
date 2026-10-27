import {
  DEFAULT_VOUCHER_SETTINGS,
  ROUTES,
  type BankLogo,
  type VoucherNumberSettings,
  type SchoolLogoInfo,
  type SchoolSettings,
  type VoucherSettings,
} from '@ilm/contracts';

import { BankLogosCard } from '@/components/bank-logos-card';
import { VoucherSettingsForm } from '@/components/voucher-settings-form';
import { WorkspacePageHeader } from '@/components/workspace-page-header';
import { apiFetch } from '@/lib/api';
import { getSession } from '@/lib/session';

/**
 * Settings › Voucher Settings.
 *
 * Three independent reads, together: the challan settings, the school's own
 * details that go on the letterhead, and whether there is a logo to print.
 * Awaiting them in sequence would make the page cost three round trips to
 * render something none of them depends on.
 *
 * A failed read is not an error page. The settings fall back to the product's
 * defaults, which is exactly what a school that has never opened this screen is
 * already printing, so the form and its preview still show the truth.
 */
export default async function VoucherSettingsPage() {
  const [session, voucherResult, schoolResult, logoResult, bankLogoResult, numberResult] =
    await Promise.all([
      getSession(),
      apiFetch<{ data: VoucherSettings }>(ROUTES.school.voucherSettings),
      apiFetch<{ data: SchoolSettings }>(ROUTES.school.settings),
      apiFetch<{ data: SchoolLogoInfo }>(ROUTES.schoolLogo.info),
      apiFetch<{ data: BankLogo[] }>(ROUTES.bankLogo.list),
      apiFetch<{ data: VoucherNumberSettings }>(ROUTES.school.voucherNumber),
    ]);

  const permissions = session?.permissions ?? [];
  const canConfigure = permissions.includes('settings.school.configure');

  const settings: VoucherSettings = voucherResult.ok
    ? voucherResult.data.data
    : DEFAULT_VOUCHER_SETTINGS;

  const school = schoolResult.ok ? schoolResult.data.data : undefined;
  const logoVersion = logoResult.ok ? logoResult.data.data.version : null;
  const bankLogos: BankLogo[] = bankLogoResult.ok ? bankLogoResult.data.data : [];
  return (
    <>
      <WorkspacePageHeader
        title="Voucher Settings"
        description="Where voucher numbering starts and what every printed voucher says. Layout changes apply to vouchers printed from now on — one already in a parent’s hand is unaffected."
      />

      <VoucherSettingsForm
        settings={settings}
        school={{
          // The session name is the fallback: a failed settings read should
          // not leave the preview headed by a blank school.
          name: school?.name ?? session?.school.name ?? '',
          address: school?.address ?? undefined,
          phone: school?.phone ?? undefined,
          logoVersion: logoVersion ?? undefined,
          bankLogos,
          // The challan is inked in the school's own colour, the same one the
          // portal is painted in.
          accentColor: school?.primaryColor ?? session?.school.primaryColor ?? undefined,
        }}
        canConfigure={canConfigure}
        error={voucherResult.ok ? undefined : voucherResult.message}
        bankLogoSlot={
          <BankLogosCard
            logos={bankLogos}
            canConfigure={canConfigure}
            error={bankLogoResult.ok ? undefined : bankLogoResult.message}
          />
        }
        // Numbering is edited here only by someone who may change it; a viewer
        // sees the challan settings without a counter they cannot touch.
        numbering={
          canConfigure && numberResult.ok
            ? {
                configured: numberResult.data.data.configured,
                next: numberResult.data.data.nextVoucherNo,
                highestIssued: numberResult.data.data.highestIssued,
              }
            : canConfigure
              ? { configured: false, next: null, highestIssued: null }
              : undefined
        }
        numberingError={canConfigure && !numberResult.ok ? numberResult.message : undefined}
      />
    </>
  );
}
