import { ROUTES, type SchoolLogoInfo } from '@ilm/contracts';

export const ABSENT_SCHOOL_LOGO: SchoolLogoInfo = {
  present: false,
  mimeType: null,
  byteSize: null,
  version: null,
};

export const SCHOOL_LOGO_UPDATED_EVENT = 'ilm:school-logo-updated';

export function notifySchoolLogoUpdated(info: SchoolLogoInfo): void {
  if (typeof window === 'undefined') {
    return;
  }
  window.dispatchEvent(new CustomEvent(SCHOOL_LOGO_UPDATED_EVENT, { detail: info }));
}

export function schoolLogoImageSrc(version: string | null | undefined): string {
  return `${ROUTES.schoolLogo.image}?v=${version ?? ''}`;
}
