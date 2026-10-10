import { ROUTES, type SchoolLogoInfo, type SchoolSettings } from '@ilm/contracts';

import { apiFetch } from '@/lib/api';
import { getSession } from '@/lib/session';

export interface ProfileSchoolWorkspace {
  readonly canConfigure: boolean;
  readonly settings: SchoolSettings;
  readonly settingsError: string | undefined;
  readonly logo: SchoolLogoInfo;
  readonly logoError: string | undefined;
}

/** School settings + logo for profile and setup screens (formerly Settings › School). */
export async function loadProfileSchoolWorkspace(): Promise<ProfileSchoolWorkspace> {
  const [session, settingsResult, logoResult] = await Promise.all([
    getSession(),
    apiFetch<{ data: SchoolSettings }>(ROUTES.school.settings),
    apiFetch<{ data: SchoolLogoInfo }>(ROUTES.schoolLogo.info),
  ]);

  const permissions = session?.permissions ?? [];
  const canConfigure = permissions.includes('settings.school.configure');

  const settings: SchoolSettings = settingsResult.ok
    ? settingsResult.data.data
    : {
        name: session?.school.name ?? '',
        legalName: null,
        slug: session?.school.slug ?? '',
        address: null,
        city: null,
        schoolLevels: [],
        oLevelClassNames: [],
        aLevelClassNames: [],
        phone: null,
        email: null,
        timezone: session?.school.timezone ?? 'Asia/Karachi',
        locale: session?.school.locale ?? 'en',
        currency: 'PKR',
        country: 'PK',
        primaryColor: session?.school.primaryColor ?? null,
      };

  return {
    canConfigure,
    settings,
    settingsError: settingsResult.ok ? undefined : settingsResult.message,
    logo: logoResult.ok
      ? logoResult.data.data
      : { present: false, mimeType: null, byteSize: null, version: null },
    logoError: logoResult.ok ? undefined : logoResult.message,
  };
}
