'use client';

import { type SchoolLogoInfo } from '@ilm/contracts';
import { cn } from '@ilm/ui';
import { BRAND } from '@ilm/utils';
import Image from 'next/image';

import lemmaLogo from '../../public/auth/lemma-logo.png';

import { schoolLogoImageSrc } from '@/lib/school-logo-shell';

type SidebarBrandMarkProps = {
  schoolLogo: SchoolLogoInfo;
  /** False during first-login setup — always show the platform mark until then. */
  profileCompleted: boolean;
  className?: string;
};

/**
 * Sidebar header mark: Lemma by default, the school's logo after setup when one exists.
 */
export function SidebarBrandMark({
  schoolLogo,
  profileCompleted,
  className,
}: SidebarBrandMarkProps) {
  const showSchoolLogo = profileCompleted && schoolLogo.present;

  const frameClass = cn(
    'flex h-10 w-full max-w-[148px] items-center justify-center',
    className,
  );

  if (showSchoolLogo) {
    return (
      <span className={frameClass}>
        {/* eslint-disable-next-line @next/next/no-img-element -- versioned API URL; same pattern as challans. */}
        <img
          src={schoolLogoImageSrc(schoolLogo.version)}
          alt=""
          className="max-h-10 max-w-full object-contain object-center"
        />
      </span>
    );
  }

  return (
    <span className={frameClass}>
      <Image
        src={lemmaLogo}
        alt={BRAND.name}
        className="max-h-9 w-auto max-w-full object-contain object-center"
        priority
      />
    </span>
  );
}
