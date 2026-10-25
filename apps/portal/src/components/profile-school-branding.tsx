import { BrandColourCard } from '@/components/brand-colour-card';
import { SchoolLogoCard } from '@/components/school-logo-card';
import type { ProfileSchoolWorkspace } from '@/lib/profile-school-workspace';

/** Portal colour and school logo — stacked full-width cards. */
export function ProfileSchoolBranding({ workspace }: { workspace: ProfileSchoolWorkspace }) {
  return (
    <section aria-label="Portal appearance" className="flex w-full flex-col gap-4">
      <BrandColourCard
        appearance={{ primaryColor: workspace.settings.primaryColor }}
        canConfigure={workspace.canConfigure}
      />
      <SchoolLogoCard
        info={workspace.logo}
        canConfigure={workspace.canConfigure}
        error={workspace.logoError}
      />
    </section>
  );
}
