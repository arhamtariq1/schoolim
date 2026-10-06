import {
  DEFAULT_VOUCHER_SETTINGS,
  ROUTES,
  type SchoolLogoInfo,
  type SchoolSettings,
  type VoucherSettings,
} from '@ilm/contracts';

import { SchoolLogoCard } from '@/components/school-logo-card';
import { VoucherSettingsForm } from '@/components/voucher-settings-form';
import { apiFetch } from '@/lib/api';
import { getSession } from '@/lib/session';

/**
 * Settings › Fee challan.
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
  const [session, voucherResult, schoolResult, logoResult, bankLogoResult] = await Promise.all([
    getSession(),
    apiFetch<{ data: VoucherSettings }>(ROUTES.school.voucherSettings),
    apiFetch<{ data: SchoolSettings }>(ROUTES.school.settings),
    apiFetch<{ data: SchoolLogoInfo }>(ROUTES.schoolLogo.info),
    apiFetch<{ data: SchoolLogoInfo }>(ROUTES.bankLogo.info),
  ]);

  const permissions = session?.permissions ?? [];
  const canConfigure = permissions.includes('settings.school.configure');

  const settings: VoucherSettings = voucherResult.ok
    ? voucherResult.data.data
    : DEFAULT_VOUCHER_SETTINGS;

  const school = schoolResult.ok ? schoolResult.data.data : undefined;
  const logoVersion = logoResult.ok ? logoResult.data.data.version : null;
  const bankLogo: SchoolLogoInfo = bankLogoResult.ok
    ? bankLogoResult.data.data
    : { present: false, mimeType: null, byteSize: null, version: null };

  return (
    <div className="space-y-6">
        <div className="max-w-2xl">
          <h1 className="text-xl font-semibold text-foreground">Fee challan</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            What every printed challan says, and how a parent pays it. Changes apply to challans
            printed from now on — one already in a parent’s hand is unaffected.
          </p>
        </div>

        <VoucherSettingsForm
          settings={settings}
          school={{
            // The session name is the fallback: a failed settings read should
            // not leave the preview headed by a blank school.
            name: school?.name ?? session?.school.name ?? '',
            address: school?.address ?? undefined,
            phone: school?.phone ?? undefined,
            logoVersion: logoVersion ?? undefined,
            bankLogoVersion: bankLogo.version ?? undefined,
            // The challan is inked in the school's own colour, the same one the
            // portal is painted in.
            accentColor:
              school?.primaryColor ?? session?.school.primaryColor ?? undefined,
          }}
          canConfigure={canConfigure}
          error={voucherResult.ok ? undefined : voucherResult.message}
        />

        <div className="max-w-2xl">
          <SchoolLogoCard
            info={bankLogo}
            canConfigure={canConfigure}
            imageRoute={ROUTES.bankLogo.image}
            title="Bank logo"
            description="Printed at the foot of every copy, beside the bank’s name. Optional — a school that collects at its own office needs neither."
            noun="Bank logo"
            error={bankLogoResult.ok ? undefined : bankLogoResult.message}
          />
        </div>
      </div>
  );
}
