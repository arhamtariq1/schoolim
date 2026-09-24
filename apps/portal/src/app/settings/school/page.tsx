import { ROUTES, type SchoolLogoInfo, type SchoolSettings } from '@ilm/contracts';

import { AppShell } from '@/components/app-shell';
import { SchoolLogoCard } from '@/components/school-logo-card';
import { SchoolSettingsForm } from '@/components/school-settings-form';
import { apiFetch } from '@/lib/api';
import { getSession } from '@/lib/session';

/**
 * Settings › School — the school's own record.
 *
 * Both reads go out together rather than one after the other: they are
 * independent, and awaiting them in sequence would make the page take the sum
 * of two round trips to render something neither half depends on.
 *
 * Fetched on the server so the first paint carries the real values. A settings
 * form that opens empty and then fills in is a form somebody starts typing into
 * before it is ready, and loses what they typed (docs/16 §7).
 */
export default async function SchoolSettingsPage() {
  const [session, settingsResult, logoResult] = await Promise.all([
    getSession(),
    apiFetch<{ data: SchoolSettings }>(ROUTES.school.settings),
    apiFetch<{ data: SchoolLogoInfo }>(ROUTES.schoolLogo.info),
  ]);

  const permissions = session?.permissions ?? [];
  const canConfigure = permissions.includes('settings.school.configure');

  // The session already carries the school's name, so a failed read still
  // renders a form with the one field everybody recognises filled in, and the
  // reason above it — rather than an error page with nothing on it.
  const settings: SchoolSettings = settingsResult.ok
    ? settingsResult.data.data
    : {
        name: session?.school.name ?? '',
        legalName: null,
        slug: session?.school.slug ?? '',
        address: null,
        city: null,
        phone: null,
        email: null,
        timezone: session?.school.timezone ?? 'Asia/Karachi',
        locale: session?.school.locale ?? 'en',
        currency: 'PKR',
        country: 'PK',
      };

  return (
    <AppShell
      user={{
        name: session?.name ?? '',
        email: session?.email ?? '',
        roleLabel: session?.roles.join(', ') ?? '',
      }}
      school={{ name: session?.school.name ?? '' }}
      permissions={permissions}
      profileCompleted={session?.profileCompleted ?? true}
      unverifiedEmail={session === undefined || session.emailVerified ? undefined : session.email}
    >
      <div className="max-w-3xl space-y-6">
        <div>
          <h1 className="text-xl font-semibold text-foreground">School</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Your school’s name, address and mark — everything printed on a challan or a receipt.
          </p>
        </div>

        <SchoolSettingsForm
          settings={settings}
          canConfigure={canConfigure}
          error={settingsResult.ok ? undefined : settingsResult.message}
        />

        <SchoolLogoCard
          info={
            logoResult.ok
              ? logoResult.data.data
              : { present: false, mimeType: null, byteSize: null, version: null }
          }
          canConfigure={canConfigure}
          error={logoResult.ok ? undefined : logoResult.message}
        />
      </div>
    </AppShell>
  );
}
